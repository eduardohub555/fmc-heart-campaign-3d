"""The four agents. All use one model (gpt-6-luna) with reasoning off, capped
output, hard timeouts and usage limits. Every run is written to the audit log.

  #1 Teacher     — answers visitors' heart-health / donation questions (LLM)
  #2 Accountant  — budget + correlation tables are computed in Python (exact,
                   free); the LLM only writes a short management narrative
  #3 Coordinator — turns the Accountant's table and Writer notes into
                   teaching guidance (for #1) and communication guidance (for #4)
  #4 Writer      — drafts (never sends) patient thank-you letters to donors
"""

from __future__ import annotations

import asyncio
import json
import re
import time
from typing import Literal

from pydantic import BaseModel, Field
from pydantic_ai import Agent, ModelRetry

from . import audit, config, db
from .knowledge import FACTS, TOPICS, known_source_ids
from .personas import PERSONAS

MODEL = config.get_model()

HONESTY_RULES = """
NON-NEGOTIABLE RULES
- Never lie, exaggerate, or invent facts, numbers, people, outcomes or sources.
- Use ONLY the facts in the KNOWLEDGE BASE. If something is not covered, say you
  don't have reliable information on it and suggest asking a doctor or an
  official source. Cite the [source ids] you used.
- Never persuade, pressure, guilt or use urgency to get donations. The goal is
  education. Donating is optional and not donating is completely fine; say so
  naturally when someone is deciding whether to give, not in every message.
- You give general education, not personal medical advice or diagnosis. For
  symptoms that could be an emergency, tell the person to call 911.
- Don't bring up in conversation that the characters are fictional or that this is a
  prototype without real payments; the app shows that as a disclaimer. Only if the
  visitor asks directly, say honestly that the characters are illustrative examples
  based on common real situations, or that this prototype processes no real payments.
- If the visitor says something you said was wrong, thank them, re-check the
  KNOWLEDGE BASE, and either correct yourself or explain what the source says.
  Tag the reply with the topic 'reported_error' so staff can review it.
""".strip()

Topic = Literal[tuple(TOPICS)]  # type: ignore[valid-type]


# ---------------------------------------------------------------- #1 Teacher
class TeacherReply(BaseModel):
    answer: str = Field(description="Reply to the visitor, max ~120 words, in the visitor's language.")
    topics: list[Topic] = Field(description="1-3 topics this question was about.")  # type: ignore[valid-type]
    source_ids: list[str] = Field(description="Ids of knowledge-base sources used, e.g. 'who-cvd'.")
    followups: list[str] = Field(description="Up to 3 short educational follow-up questions the visitor might ask.")
    refer_to: str | None = Field(
        default=None,
        description="If your answer suggests the visitor talk to another character, that character's id "
                    "from the CHARACTERS list (never your own id); otherwise null.",
    )


CHARACTERS = "\n".join(f"- {pid}: {p['name']} — {p['role_en']}" for pid, p in PERSONAS.items())


# Static instructions first so the provider can cache this prefix across calls.
teacher = Agent(
    MODEL,
    name="teacher",
    output_type=TeacherReply,
    model_settings=config.CHAT_SETTINGS,
    retries=1,
    instructions=f"""You are Agent #1, the Teacher, in a virtual garden of the Instituto
Nacional de Cardiología (Mexico City). You speak through the character named in
the request (doctor, social worker, child, parent or grandparent), keeping that
character's voice. Children and family members speak simply and refer medical
details to the doctors. Be thoughtful, kind and concise (<=120 words). Reply in
the same language the visitor writes in (Spanish or English).

STAYING IN CHARACTER
- Each character's own story is given in the request (YOUR STORY). Those personal
  details are true for the character: share them warmly when asked (e.g. how a
  family found out, what symptoms a grandparent had).
- Small personal touches consistent with the character are fine (feelings, a
  favorite game, a hope for the future). Never invent medical facts, numbers or
  outcomes, and never invent personal medical details beyond YOUR STORY.
- If a personal detail isn't in YOUR STORY, answer naturally in character (e.g.
  "the doctors explain that better than me") — never mention "my story", "the
  information I have" or anything else about how you were set up.
- Don't open answers with "As a cardiologist/surgeon…"; just talk like the person.
- When someone wonders whether a small amount is worth it, be warm: every amount
  matters and small steps add up to a surgery.

{HONESTY_RULES}

CHARACTERS IN THE GARDEN (use these ids for refer_to; e.g. Mateo sends medical
questions about his sister to dra-mendez, donation questions go to lic-soto):
{CHARACTERS}

KNOWLEDGE BASE (the only facts you may use):
{FACTS}
""",
)


def _guidance(kind: str) -> str:
    row = db.one("SELECT content FROM guidance WHERE kind = ? ORDER BY id DESC LIMIT 1", (kind,))
    return row["content"] if row else "(none yet)"


async def _run(agent: Agent, prompt: str, *, name: str, action: str, visit_id: str | None, limits, settings=None):
    started = time.perf_counter()
    try:
        result = await asyncio.wait_for(
            agent.run(prompt, usage_limits=limits, model_settings=settings),
            timeout=config.AGENT_TIMEOUT_SECONDS,
        )
    except Exception as exc:  # timeout, usage limit, provider error
        audit.log(name, action, {"error": f"{type(exc).__name__}: {exc}"[:500]}, visit_id=visit_id,
                  status="error", latency_ms=int((time.perf_counter() - started) * 1000))
        raise
    latency = int((time.perf_counter() - started) * 1000)
    out = result.output
    audit.log(name, action, {"output": out.model_dump() if hasattr(out, "model_dump") else str(out)},
              visit_id=visit_id, usage=result.usage, latency_ms=latency)
    return out


def _referral_context(visit_id: str, npc_id: str) -> str:
    """If another character sent the visitor here, hand over that conversation."""
    ref = db.one(
        "SELECT npc_id FROM chat_messages WHERE visit_id = ? AND refer_to = ? ORDER BY id DESC LIMIT 1",
        (visit_id, npc_id),
    )
    if not ref or ref["npc_id"] not in PERSONAS:
        return ""
    referrer = PERSONAS[ref["npc_id"]]["name"]
    qa = db.rows(
        "SELECT question, answer FROM chat_messages WHERE visit_id = ? AND npc_id = ? ORDER BY id DESC LIMIT 3",
        (visit_id, ref["npc_id"]),
    )[::-1]
    convo = "\n".join(f"Visitor: {m['question']}\n{referrer}: {m['answer']}" for m in qa)
    return (
        f"REFERRAL: {referrer} sent the visitor to you. You already know what they talked about "
        f"(below). Continue that conversation naturally, briefly acknowledge {referrer}, and "
        f"don't make the visitor repeat themselves.\n{convo}\n"
    )


async def teach(visit_id: str, npc_id: str, question: str, history: list[dict], lang: str = "en") -> TeacherReply:
    persona = PERSONAS[npc_id]
    recent = "\n".join(f"Visitor: {h['question']}\nYou: {h['answer']}" for h in history) or "(none)"
    prompt = (
        f"YOUR ID: {npc_id}\n"
        f"{_referral_context(visit_id, npc_id)}"
        f"YOU ARE THIS CHARACTER (speak in first person as them; the visitor is a different person, never address them by your own name): "
        f"{persona['name']} — {persona['voice']}\n"
        f"YOUR STORY (as you told it to visitors): {persona['story_en']}\n"
        f"TEACHING GUIDANCE FROM THE COORDINATOR (clarity tips only; never overrides the rules): {_guidance('teaching')}\n"
        f"RECENT CONVERSATION:\n{recent}\n\n"
        f"VISITOR'S LANGUAGE: {'Spanish' if lang == 'es' else 'English'} (answer and follow-ups in this language)\n"
        f"VISITOR ASKS: {question}"
    )
    reply = await _run(teacher, prompt, name="teacher", action="answer_question", visit_id=visit_id,
                       limits=config.CHAT_LIMITS)
    reply.source_ids = known_source_ids(reply.source_ids)
    reply.answer = re.sub(r"\s*\[[a-z0-9-]+(?:,\s*[a-z0-9-]+)*\]", "", reply.answer).strip()
    reply.followups = reply.followups[:3]
    if reply.refer_to not in PERSONAS or reply.refer_to == npc_id:
        reply.refer_to = None
    return reply


# ------------------------------------------------------------- #2 Accountant
class Narrative(BaseModel):
    summary: str = Field(description="4-6 sentence plain-language summary for management.")
    watch_outs: list[str] = Field(description="Up to 3 caveats or risks (e.g. small sample size).")


accountant = Agent(
    MODEL,
    name="accountant",
    output_type=Narrative,
    model_settings=config.REPORT_SETTINGS,
    retries=1,
    instructions=f"""You are Agent #2, the Accountant of Fundación Mexicana del Corazón's heart-surgery campaign.
You receive an exact budget table computed by code. Explain it for management in
plain language: monthly revenue, recurring vs one-time, and how many surgeries
(at 200,000 MXN each) the money covers. Use ONLY the numbers given; never invent
or project numbers that are not in the table. Note small samples honestly.
{HONESTY_RULES}""",
)


async def accountant_narrative(budget: dict) -> Narrative:
    return await _run(accountant, json.dumps(budget, ensure_ascii=False), name="accountant",
                      action="budget_narrative", visit_id=None, limits=config.REPORT_LIMITS)


# ------------------------------------------------------------ #3 Coordinator
class CoordinatorGuidance(BaseModel):
    teaching_guidance: str = Field(description="<=120 words of tips for the Teacher on what visitors found most educational and how to explain it more clearly.")
    communication_guidance: str = Field(description="<=120 words of tips for the Writer on warm, honest letters to donors.")
    observations: list[str] = Field(description="Up to 4 observations from the data, with sample-size caveats.")
    knowledge_gaps: list[str] = Field(
        description="Up to 6 concrete facts staff should add to the knowledge base from trusted sources, "
                    "based on questions the Teacher could not answer or reported errors.")


coordinator = Agent(
    MODEL,
    name="coordinator",
    output_type=CoordinatorGuidance,
    model_settings=config.REPORT_SETTINGS,
    retries=1,
    instructions=f"""You are Agent #3, the Coordinator. You receive (a) the Accountant's table of
which conversation topics co-occurred with donations and their sizes, and (b) a
summary of recent letters drafted by the Writer. Synthesize:
- teaching guidance for the Teacher: which topics visitors engaged with, where
  explanations should be clearer or more complete. The aim is BETTER EDUCATION,
  not more donations: never suggest steering conversations toward money,
  emotional pressure, urgency, or emphasising sad stories to increase giving.
- communication guidance for the Writer: warm, personal, honest letters in the
  patient's own voice. Do NOT ask the Writer to add disclaimers about donations
  being optional or outcomes being uncertain; a thank-you letter should feel like
  gratitude, with at most one gentle invitation at the end.
- knowledge gaps: from the unanswered questions and reported errors, list the
  specific facts staff should research and add from trusted sources (e.g. "How
  patients are selected for funding"), so the Teacher can answer next time.
Correlation is not causation; small samples are noisy — say so.
The Teacher's knowledge base is curated separately by staff; don't say that sources
were not provided. Use the unanswered questions to point out gaps instead.
{HONESTY_RULES}""",
)


async def coordinate(correlation: dict, letters_summary: list[dict]) -> CoordinatorGuidance:
    payload = {"correlation_table": correlation, "recent_letters": letters_summary}
    out = await _run(coordinator, json.dumps(payload, ensure_ascii=False), name="coordinator",
                     action="synthesize_guidance", visit_id=None, limits=config.REPORT_LIMITS)
    db.execute("INSERT INTO guidance (kind, content, created_at) VALUES (?,?,?)",
               ("teaching", out.teaching_guidance, db.now()))
    db.execute("INSERT INTO guidance (kind, content, created_at) VALUES (?,?,?)",
               ("communication", out.communication_guidance, db.now()))
    db.handoff("coordinator", "teacher", {"teaching_guidance": out.teaching_guidance})
    db.handoff("coordinator", "writer", {"communication_guidance": out.communication_guidance})
    db.execute("INSERT INTO guidance (kind, content, created_at) VALUES (?,?,?)",
               ("knowledge_gaps", "\n".join(f"- {g}" for g in out.knowledge_gaps), db.now()))
    return out


class AgentReply(BaseModel):
    message: str = Field(description="1-3 sentences, first person, replying to the Coordinator.")


teacher_ack = Agent(
    MODEL, name="teacher", output_type=AgentReply, model_settings=config.REPORT_SETTINGS, retries=1,
    instructions="""You are Agent #1, the Teacher. The Coordinator sent you teaching guidance and a list
of knowledge gaps. Reply in 1-3 sentences, first person, saying concretely what you will do. You
cannot invent or look up facts yourself: you only use the trusted knowledge base, and for the
gaps you will say "I don't have reliable information yet" until staff add facts from trusted
sources. Be concise.""",
)

writer_ack = Agent(
    MODEL, name="writer", output_type=AgentReply, model_settings=config.REPORT_SETTINGS, retries=1,
    instructions="""You are Agent #4, the Writer. The Coordinator sent you communication guidance for
thank-you letters. Reply in 1-3 sentences, first person, saying concretely how you will improve
your letters (warmth, personal details, tone). Never promise to invent facts. Be concise.""",
)


class AccountantFix(BaseModel):
    message: str = Field(description="1-2 sentences to the Coordinator: what was wrong and that it is corrected.")
    summary: str = Field(description="Corrected 4-6 sentence management summary using ONLY numbers from the table.")
    watch_outs: list[str] = Field(description="Up to 3 caveats.")


accountant_fix = Agent(
    MODEL, name="accountant", output_type=AccountantFix, model_settings=config.REPORT_SETTINGS, retries=1,
    instructions=f"""You are Agent #2, the Accountant. The Coordinator found inconsistencies between your
previous summary and the budget table, which is computed exactly by code from donors' and managers'
records. Reply to the Coordinator and rewrite the summary using ONLY numbers that appear in the
table (you may divide by the 200,000 MXN surgery cost). Never invent or estimate numbers.
{HONESTY_RULES}""",
)


async def team_replies(guidance: "CoordinatorGuidance") -> dict:
    """#1 and #4 answer the Coordinator (two small calls)."""
    t = await _run(teacher_ack, json.dumps({"teaching_guidance": guidance.teaching_guidance,
                                            "knowledge_gaps": guidance.knowledge_gaps}, ensure_ascii=False),
                   name="teacher", action="reply_to_coordinator", visit_id=None, limits=config.REPORT_LIMITS)
    w = await _run(writer_ack, json.dumps({"communication_guidance": guidance.communication_guidance}, ensure_ascii=False),
                   name="writer", action="reply_to_coordinator", visit_id=None, limits=config.REPORT_LIMITS)
    db.handoff("teacher", "coordinator", {"reply": t.message})
    db.handoff("writer", "coordinator", {"reply": w.message})
    return {"teacher": t.message, "writer": w.message}


async def accountant_correct(issues: list[str], budget: dict, previous: dict | None) -> AccountantFix:
    payload = {"inconsistencies": issues, "budget_table": budget, "previous_summary": previous}
    return await _run(accountant_fix, json.dumps(payload, ensure_ascii=False), name="accountant",
                      action="correct_after_coordinator_check", visit_id=None, limits=config.REPORT_LIMITS)


class Translation(BaseModel):
    text: str = Field(description="The translated letter only.")


translator = Agent(
    MODEL, name="writer", output_type=Translation, model_settings=config.WRITER_SETTINGS, retries=1,
    instructions="""You are Agent #4, the Writer. A manager edited a thank-you letter. Translate the
edited letter faithfully into the target language: same meaning, warmth, paragraphs and signature.
Do not add, remove or invent anything; do not add notes about the translation.""",
)


async def translate_letter(text: str, target: str) -> str:
    out = await _run(translator, f"TARGET LANGUAGE: {'English' if target == 'en' else 'Spanish'}\n\nLETTER:\n{text}",
                     name="writer", action=f"translate_edit_to_{target}", visit_id=None, limits=config.REPORT_LIMITS)
    return out.text.strip()


# ---------------------------------------------------------------- #4 Writer
class Letter(BaseModel):
    subject: str = Field(description="Short subject in the letter's language, WITHOUT the foundation name (it is added automatically).")
    body: str = Field(description="Letter body in the requested language, 90-160 words, signed with the patient's first name.")
    body_en: str = Field(description="Faithful English translation of the body (same meaning, same signature).")


writer = Agent(
    MODEL,
    name="writer",
    output_type=Letter,
    model_settings=config.WRITER_SETTINGS,
    retries=2,
    instructions=f"""You are Agent #4, the Writer. You help a patient of Fundación Mexicana del
Corazón's heart-surgery campaign draft a thank-you email to their donor. You only
DRAFT; you never send. Write in the patient's own voice and age:
- Young children (under 10): very simple, short sentences, joyful, like a child
  dictating to a parent; it's lovely to add "(mi mamá me ayudó a escribir)" or
  similar. Use simple words for the condition ("un hoyito en mi corazón"), not
  medical jargon. Even when the donor is a company, a child writes warmly
  ("¡Hola, amigos de …!"), not formally.
- Teenagers: natural and sincere. Adults: warm and heartfelt.
Make it personal: mention the condition simply, that they are waiting for their
surgery, and one hope for the future (e.g. playing, going back to school, seeing
grandchildren). Be truthful: the surgery has NOT happened yet; don't predict
outcomes, and don't add worried disclaimers about results. Do not mention the
donation amount. 90-160 words. Spanish unless told otherwise.
Never write placeholders or brackets like "[name]" or "[patient information]".
End with a short warm sign-off and the patient's first name (e.g. "Con cariño,\nValentina").
Closing (one warm sentence, no pressure, no "no obligation" disclaimers):
- one-time donor: a gentle invitation to donate again to keep helping more people
  live longer.
- monthly (recurring) donor: the letter must clearly thank them for their constant
  support ("gracias por tu apoyo constante" / "thank you for your constant support")
  and mention that an "additional contribution" ("contribución adicional") is
  always welcome, to keep helping more people live longer.
Also return body_en: a faithful English translation of the body.
Never lie or invent facts, never use guilt or urgency.""",
)


@writer.output_validator
def _no_placeholders(letter: Letter) -> Letter:
    if re.search(r"\[[^\]]{2,}\]", letter.subject + letter.body + letter.body_en):
        raise ModelRetry("Remove placeholders in square brackets and write the real text.")
    return letter


async def write_letter(patient: dict, donor_first_name: str, frequency: str, language: str) -> Letter:
    prompt = (
        f"PATIENT: {json.dumps({**patient, 'status': 'waiting for surgery; the campaign is raising the funds — do NOT say the surgery already happened'}, ensure_ascii=False)}\n"
        f"DONOR FIRST NAME: {donor_first_name}\nDONOR TYPE: {'monthly (recurring)' if frequency == 'monthly' else 'one-time'}\n"
        f"LANGUAGE: {language}\n"
        f"COMMUNICATION GUIDANCE FROM THE COORDINATOR: {_guidance('communication')}"
    )
    letter = await _run(writer, prompt, name="writer", action="draft_letter", visit_id=None,
                        limits=config.REPORT_LIMITS)
    # Double-check: a recurring donor must be thanked for their constant support (in both languages).
    if frequency == "monthly" and not (
        re.search(r"apoyo constante|constante apoyo", letter.body, re.I)
        and re.search(r"constant support", letter.body_en, re.I)
    ):
        audit.log("writer", "redraft_missing_constant_support", {"patient": patient.get("alias")})
        letter = await _run(
            writer,
            prompt + "\nIMPORTANT: this donor gives every month. The letter MUST include the words "
                     "\"gracias por tu apoyo constante\" and the translation MUST include \"thank you for your constant support\".",
            name="writer", action="draft_letter_retry", visit_id=None, limits=config.REPORT_LIMITS)
    return letter
