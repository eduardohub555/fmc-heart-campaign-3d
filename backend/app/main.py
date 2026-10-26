"""FastAPI backend for the INC heart-surgery campaign virtual garden.

Run:  .venv/bin/uvicorn app.main:app --port 8000   (from Final Project/backend)
"""

from __future__ import annotations

import json
import re
import sqlite3
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field

from . import agents, audit, config, db, reports, security
from .knowledge import GENERAL_TIPS, HEALTH_TIPS, PROCEDURE_INFO, SOURCES, TOPIC_TIPS, TOPICS
from .personas import PERSONAS

app = FastAPI(title="Corazón INC — virtual campaign")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
db.init()

Lang = Literal["es", "en"]


@app.get("/api/health")
def health():
    return {"ok": True, "model": config.MODEL_NAME}


@app.get("/api/npcs")
def npcs():
    return {k: {kk: vv for kk, vv in v.items() if kk != "voice"} for k, v in PERSONAS.items()}


# ------------------------------------------------------------------ chat (#1)
class ChatIn(BaseModel):
    visit_id: str = Field(min_length=8, max_length=64)
    npc_id: str
    message: str = Field(min_length=1, max_length=config.MAX_MESSAGE_CHARS)
    lang: Lang = "en"


@app.post("/api/chat")
async def chat(body: ChatIn):
    persona = PERSONAS.get(body.npc_id)
    if not persona:
        raise HTTPException(404, "Unknown character.")
    count = db.one("SELECT COUNT(*) AS n FROM chat_messages WHERE visit_id = ?", (body.visit_id,))["n"]
    if count >= config.MAX_MESSAGES_PER_VISIT:
        raise HTTPException(429, "You've reached the question limit for this visit. Thank you for learning with us!")
    history = db.rows(
        "SELECT question, answer FROM chat_messages WHERE visit_id = ? AND npc_id = ? ORDER BY id DESC LIMIT ?",
        (body.visit_id, body.npc_id, config.HISTORY_TURNS),
    )[::-1]
    try:
        reply = await agents.teach(body.visit_id, body.npc_id, body.message.strip(), history, body.lang)
    except Exception as exc:
        if "content_filter" in str(exc):  # provider safety filter blocked the prompt
            return {
                "answer": "Solo puedo compartir educación confiable sobre la salud del corazón y explicar cómo "
                          "funcionan los donativos; no puedo ayudar con esa solicitud." if body.lang == "es" else
                          "I can only share reliable heart-health education and explain how donations work; "
                          "I can't help with that request.",
                "topics": ["other"], "sources": [], "followups": [],
            }
        raise HTTPException(503, "The teacher could not answer right now. Please try again in a moment.")
    db.execute(
        "INSERT INTO chat_messages (visit_id, npc_id, question, answer, topics, sources, refer_to, created_at) VALUES (?,?,?,?,?,?,?,?)",
        (body.visit_id, body.npc_id, body.message.strip(), reply.answer, json.dumps(reply.topics),
         json.dumps(reply.source_ids), reply.refer_to, db.now()),
    )
    if reply.refer_to:
        audit.log("teacher", "refer_visitor", {"from": body.npc_id, "to": reply.refer_to}, visit_id=body.visit_id)
    return {
        "answer": reply.answer,
        "topics": reply.topics,
        "sources": [{"id": s, **SOURCES[s]} for s in reply.source_ids],
        "followups": reply.followups,
        "refer_to": reply.refer_to,
    }


class EndIn(BaseModel):
    visit_id: str
    npc_id: str
    lang: Lang = "en"
    show_tip: bool = True  # False when handing the visitor to another character


def _pick_tip(visit_id: str, topics: list[str]) -> str:
    """A reminder that fits what was discussed, not repeated within the visit."""
    shown = {json.loads(r["detail"]).get("tip") for r in db.rows(
        "SELECT detail FROM audit_log WHERE visit_id = ? AND action = 'closing_health_tip'", (visit_id,))}
    candidates = [k for t in topics for k in TOPIC_TIPS.get(t, [])] + GENERAL_TIPS
    fresh = [k for k in dict.fromkeys(candidates) if k not in shown]
    return (fresh or GENERAL_TIPS)[0]


@app.post("/api/conversation/end")
def end_conversation(body: EndIn):
    """Teacher hands a report of the conversation to the Accountant (no model call)."""
    qa = db.rows(
        "SELECT question, answer, topics FROM chat_messages WHERE visit_id = ? AND npc_id = ? ORDER BY id",
        (body.visit_id, body.npc_id),
    )
    report = {
        "npc_id": body.npc_id,
        "questions": len(qa),
        "topics": sorted({t for m in qa for t in json.loads(m["topics"])}),
        "qa": [{"q": m["question"], "a": m["answer"][:300]} for m in qa],
    }
    db.handoff("teacher", "accountant", report, visit_id=body.visit_id)
    audit.log("teacher", "conversation_report_to_accountant",
              {"npc_id": body.npc_id, "questions": len(qa), "topics": report["topics"]}, visit_id=body.visit_id)
    if not body.show_tip:
        return {"ok": True, "questions": len(qa)}
    tip = _pick_tip(body.visit_id, report["topics"])
    audit.log("teacher", "closing_health_tip", {"tip": tip, "npc_id": body.npc_id}, visit_id=body.visit_id)
    return {"ok": True, "questions": len(qa), "tip": HEALTH_TIPS[tip][body.lang],
            "tip_source": SOURCES[HEALTH_TIPS[tip]["source"]]["publisher"]}


LEARN_MORE = {
    "es": {
        "risk_factors": "¿Cuáles son los principales factores de riesgo del corazón?",
        "heart_attack_signs": "¿Cómo reconozco un infarto?",
        "cpr_emergency": "¿Cómo se hace RCP solo con las manos?",
        "prevention": "¿Cuánta sal y ejercicio recomienda la OMS?",
        "congenital_heart_disease": "¿Qué es una cardiopatía congénita?",
        "valve_disease": "¿Cómo se daña una válvula del corazón?",
        "heart_surgery": "¿Qué tipos de cirugía de corazón existen?",
        "institute_history": "¿Cuál es la historia del Instituto Nacional de Cardiología?",
    },
    "en": {
        "risk_factors": "What are the main heart risk factors?",
        "heart_attack_signs": "How do I recognise a heart attack?",
        "cpr_emergency": "How do I do Hands-Only CPR?",
        "prevention": "How much salt and exercise does WHO recommend?",
        "congenital_heart_disease": "What is congenital heart disease?",
        "valve_disease": "How does a heart valve get damaged?",
        "heart_surgery": "What kinds of heart surgery exist?",
        "institute_history": "What is the history of the National Institute of Cardiology?",
    },
}


@app.get("/api/learn-more")
def learn_more(visit_id: str, lang: Lang = "en"):
    """Teacher proactively suggests topics the visitor hasn't explored yet."""
    seen = {t for m in db.rows("SELECT topics FROM chat_messages WHERE visit_id = ?", (visit_id,))
            for t in json.loads(m["topics"])}
    picks = [q for t, q in LEARN_MORE[lang].items() if t not in seen][:4] or list(LEARN_MORE[lang].values())[:4]
    audit.log("teacher", "proactive_learn_more_invitation", {"suggestions": picks}, visit_id=visit_id)
    return {"suggestions": picks}


# ------------------------------------------------------------------- donating
@app.get("/api/impact")
def impact(amount: float = Query(gt=0), frequency: Literal["one_time", "monthly"] = "one_time"):
    return reports.impact(amount, frequency)


class SignupIn(BaseModel):
    first_name: str = Field(min_length=1, max_length=60)
    last_name: str = Field(min_length=1, max_length=60)
    company: str | None = Field(default=None, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    wall_name: str | None = Field(default=None, max_length=60)
    wall_anonymous: bool = False
    tax_id: str | None = Field(default=None, max_length=20)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)


def _user_out(token: str, user_id: int):
    u = db.one("SELECT id, first_name, last_name, company, email, wall_name, wall_anonymous, tax_id FROM users WHERE id = ?",
               (user_id,))
    return {"token": token, "user": u}


@app.post("/api/auth/signup")
def signup(body: SignupIn):
    tax_id = clean_tax_id(body.tax_id, "individual")
    try:
        uid = db.execute(
            """INSERT INTO users (first_name, last_name, company, email, password_hash, wall_name, wall_anonymous,
                                  tax_id, created_at)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (body.first_name.strip(), body.last_name.strip(), (body.company or "").strip() or None,
             body.email.lower(), security.hash_password(body.password), (body.wall_name or "").strip() or None,
             int(body.wall_anonymous), tax_id, db.now()),
        )
    except sqlite3.IntegrityError:
        raise HTTPException(409, "An account with this email already exists. Please sign in.")
    return _user_out(security.create_session(uid, "donor"), uid)


@app.post("/api/auth/login")
def login(body: LoginIn):
    u = db.one("SELECT id, password_hash FROM users WHERE email = ?", (body.email.lower(),))
    if not u or not security.verify_password(body.password, u["password_hash"]):
        raise HTTPException(401, "Email or password is incorrect.")
    return _user_out(security.create_session(u["id"], "donor"), u["id"])


@app.post("/api/auth/logout")
def logout(authorization: str | None = Header(default=None)):
    if authorization and authorization.startswith("Bearer "):
        security.drop_session(authorization[7:])
    return {"ok": True}


@app.get("/api/auth/me")
def me(user: dict = Depends(security.current_donor)):
    return user


# Mexican RFC: 4 letters (people, 13 chars) or 3 letters (companies, 12 chars) + YYMMDD + 3 chars.
RFC_RE = {"individual": re.compile(r"^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$"), "legal_entity": re.compile(r"^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$")}


def clean_tax_id(value: str | None, donor_type: str) -> str | None:
    tid = re.sub(r"[\s-]", "", (value or "")).upper() or None
    if tid and not RFC_RE[donor_type].match(tid):
        kind = "13 characters for a person" if donor_type == "individual" else "12 characters for a company"
        raise HTTPException(400, f"That tax ID (RFC) doesn't look right: it should have {kind}, e.g. "
                                 f"{'GODE561231GR8' if donor_type == 'individual' else 'ABC010203XY1'}.")
    return tid


LOGO_RE = re.compile(r"^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$")
MAX_LOGO_CHARS = 400_000  # ~300 KB image


class DonationIn(BaseModel):
    amount_mxn: float = Field(ge=50, le=10_000_000)
    frequency: Literal["one_time", "monthly"]
    donor_type: Literal["individual", "legal_entity"] = "individual"
    legal_name: str | None = Field(default=None, max_length=120)
    logo: str | None = Field(default=None, max_length=MAX_LOGO_CHARS)
    anonymous: bool = False
    wall_text: str | None = Field(default=None, max_length=60)
    tax_id: str | None = Field(default=None, max_length=20)
    visit_id: str | None = None


@app.post("/api/donations")
def donate(body: DonationIn, user: dict = Depends(security.current_donor)):
    legal_name = (body.legal_name or "").strip() or None
    if body.donor_type == "legal_entity" and not legal_name:
        raise HTTPException(400, "Please add the legal entity's name.")
    logo = body.logo if body.donor_type == "legal_entity" else None
    if logo and not LOGO_RE.match(logo):
        raise HTTPException(400, "The logo must be a PNG, JPG or WEBP image.")
    tax_id = clean_tax_id(body.tax_id, body.donor_type)
    if body.donor_type == "individual" and not tax_id:
        tax_id = user["tax_id"]
    elif body.donor_type == "individual" and tax_id != user["tax_id"]:
        db.execute("UPDATE users SET tax_id = ? WHERE id = ?", (tax_id, user["id"]))
    default_name = legal_name if body.donor_type == "legal_entity" else f"{user['first_name']} {user['last_name']}"
    display = None if body.anonymous else ((body.wall_text or "").strip() or default_name)
    patient = (db.one("SELECT * FROM patients WHERE status = 'active' ORDER BY raised_mxn ASC, id ASC LIMIT 1")
               or db.one("SELECT * FROM patients ORDER BY raised_mxn ASC, id ASC LIMIT 1"))
    did = db.execute(
        """INSERT INTO donations (user_id, visit_id, amount_mxn, frequency, display_mode, display_name, patient_id,
                                  donor_type, legal_name, logo, tax_id, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
        (user["id"], body.visit_id, body.amount_mxn, body.frequency, "anonymous" if body.anonymous else "named",
         display, patient["id"], body.donor_type, legal_name, logo, tax_id, db.now()),
    )
    db.execute("UPDATE patients SET raised_mxn = raised_mxn + ? WHERE id = ?", (body.amount_mxn, patient["id"]))
    audit.log("accountant", "record_donation",
              {"donation_id": did, "amount_mxn": body.amount_mxn, "frequency": body.frequency,
               "donor_type": body.donor_type, "patient_id": patient["id"]},
              visit_id=body.visit_id)
    return {
        "donation_id": did,
        "patient": {"alias": patient["alias"], "age": patient["age"], "city": patient["city"],
                    "procedure": patient["procedure"], "procedure_info": PROCEDURE_INFO.get(patient["procedure"])},
        "impact": reports.impact(body.amount_mxn, body.frequency),
    }


@app.get("/api/wall")
def wall():
    """Every donation gets its own place on the wall (never merged, never dropped)."""
    rows = db.rows(
        """SELECT display_name, display_mode, logo,
                  amount_mxn * CASE frequency WHEN 'monthly' THEN 12 ELSE 1 END AS yearly
           FROM donations ORDER BY yearly DESC, id ASC"""
    )
    return [
        {"name": r["display_name"] or "", "anonymous": r["display_mode"] == "anonymous",
         "weight": r["yearly"], "logo": None if r["display_mode"] == "anonymous" else r["logo"]}
        for r in rows
    ]


# --------------------------------------------------------- staff / management
class StaffLoginIn(BaseModel):
    email: str = Field(max_length=120)  # a manager's email (or the legacy admin username)
    password: str = Field(max_length=128)


class StaffSignupIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


@app.post("/api/staff/signup")
def staff_signup(body: StaffSignupIn):
    try:
        mid = db.execute(
            "INSERT INTO managers (name, email, password_hash, created_at) VALUES (?,?,?,?)",
            (body.name.strip(), body.email.lower(), security.hash_password(body.password), db.now()),
        )
    except sqlite3.IntegrityError:
        raise HTTPException(409, "A manager with this email already exists. Please sign in.")
    audit.log("management", "manager_signup", {"manager_id": mid})
    return {"token": security.create_session(mid, "staff"), "name": body.name.strip()}


@app.post("/api/staff/login")
def staff_login(body: StaffLoginIn):
    m = db.one("SELECT id, name, password_hash FROM managers WHERE email = ?", (body.email.lower(),))
    if m and security.verify_password(body.password, m["password_hash"]):
        return {"token": security.create_session(m["id"], "staff"), "name": m["name"]}
    if security.check_staff_login(body.email, body.password):
        return {"token": security.create_session(None, "staff"), "name": "Admin"}
    raise HTTPException(401, "Email or password is incorrect.")


@app.get("/api/staff/dashboard", dependencies=[Depends(security.current_staff)])
def staff_dashboard():
    """Everything the live management dashboard shows, in one call."""
    budget = reports.budget()
    spent_by_month: dict[str, float] = {}
    for e in db.rows("SELECT amount_mxn, created_at FROM expenses"):
        spent_by_month[e["created_at"][:7]] = spent_by_month.get(e["created_at"][:7], 0) + e["amount_mxn"]
    spent_cum = 0.0
    months = sorted({m["month"] for m in budget["monthly"]} | set(spent_by_month))
    by_month = {m["month"]: m for m in budget["monthly"]}
    monthly = []
    raised_cum = 0.0
    for mo in months:
        row = by_month.get(mo, {"one_time_mxn": 0, "recurring_mxn": 0, "total_mxn": 0})
        raised_cum += row["total_mxn"]
        spent_cum += spent_by_month.get(mo, 0)
        monthly.append({"month": mo, "one_time": row["one_time_mxn"], "recurring": row["recurring_mxn"],
                        "spent": spent_by_month.get(mo, 0), "raised_cum": raised_cum, "available": raised_cum - spent_cum})
    donations = db.rows(
        """SELECT d.id, d.amount_mxn, d.frequency, d.donor_type, d.legal_name, d.display_mode, d.display_name AS wall_text,
                  d.created_at, u.first_name, u.last_name, u.email, p.alias AS patient, d.tax_id,
                  l.id AS letter_id, l.status AS letter_status, i.folio AS invoice_folio
           FROM donations d JOIN users u ON u.id = d.user_id JOIN patients p ON p.id = d.patient_id
           LEFT JOIN letters l ON l.id = (SELECT MAX(id) FROM letters WHERE donation_id = d.id)
           LEFT JOIN invoices i ON i.donation_id = d.id
           ORDER BY d.created_at DESC, d.id DESC"""
    )
    expenses = db.rows(
        "SELECT e.*, p.alias AS patient FROM expenses e LEFT JOIN patients p ON p.id = e.patient_id ORDER BY e.id DESC")
    return {"budget": budget, "monthly": monthly, "donations": donations, "expenses": expenses,
            "patients": db.rows(
                """SELECT p.id, p.alias, p.procedure, p.raised_mxn, p.status,
                          COALESCE((SELECT SUM(amount_mxn) FROM expenses e WHERE e.patient_id = p.id), 0) AS paid_mxn
                   FROM patients p ORDER BY p.id""")}


class SpendIn(BaseModel):
    amount_mxn: float = Field(gt=0, le=10_000_000)  # any amount: 200,000 MXN is only an estimate
    patient_id: int
    note: str | None = Field(default=None, max_length=200)
    surgery_fully_paid: bool = False  # tick box: close this patient's campaign


@app.post("/api/staff/spend")
def staff_spend(body: SpendIn, staff: dict = Depends(security.current_staff)):
    """Management pays for surgeries; this reduces the money available."""
    available = reports.budget()["available_mxn"]
    if body.amount_mxn > available + 0.01:
        raise HTTPException(400, f"Only {available:,.0f} MXN is available.")
    patient = db.one("SELECT id, alias, status FROM patients WHERE id = ?", (body.patient_id,))
    if not patient:
        raise HTTPException(400, "Please choose the patient this payment is for.")
    if patient["status"] != "active":
        raise HTTPException(400, f"{patient['alias']}'s surgery is already marked as fully paid.")
    who = db.one("SELECT name FROM managers WHERE id = ?", (staff["user_id"],)) if staff["user_id"] else None
    eid = db.execute(
        "INSERT INTO expenses (amount_mxn, patient_id, note, manager, created_at) VALUES (?,?,?,?,?)",
        (body.amount_mxn, body.patient_id, (body.note or "").strip() or None, who["name"] if who else "Admin", db.now()),
    )
    if body.surgery_fully_paid:
        db.execute("UPDATE patients SET status = 'surgery_paid', closed_at = ? WHERE id = ?", (db.now(), body.patient_id))
    audit.log("accountant", "record_surgery_spending",
              {"expense_id": eid, "amount_mxn": body.amount_mxn, "patient_id": body.patient_id,
               "surgery_fully_paid": body.surgery_fully_paid})
    return {"id": eid, "available_mxn": available - body.amount_mxn, "patient_closed": body.surgery_fully_paid}


@app.get("/api/staff/budget", dependencies=[Depends(security.current_staff)])
def staff_budget():
    return reports.budget()


@app.post("/api/staff/budget/narrative", dependencies=[Depends(security.current_staff)])
async def staff_budget_narrative():
    b = reports.budget(log=True)
    try:
        n = await agents.accountant_narrative({k: v for k, v in b.items()})
    except Exception:
        raise HTTPException(503, "Accountant agent is unavailable right now.")
    db.execute("INSERT INTO guidance (kind, content, created_at) VALUES (?,?,?)",
               ("accountant_narrative", json.dumps(n.model_dump(), ensure_ascii=False), db.now()))
    return {"budget": b, "narrative": n.model_dump()}


@app.get("/api/staff/correlation", dependencies=[Depends(security.current_staff)])
def staff_correlation():
    return reports.correlation()


@app.post("/api/staff/coordinator/run", dependencies=[Depends(security.current_staff)])
async def staff_coordinate():
    corr = reports.correlation()
    letters = db.rows("SELECT subject, substr(body, 1, 200) AS excerpt FROM letters ORDER BY id DESC LIMIT 5")
    try:
        g = await agents.coordinate(corr, letters)
        replies = await agents.team_replies(g)
    except Exception:
        raise HTTPException(503, "Coordinator agent is unavailable right now.")
    thread = [
        {"from": "#3 Coordinator", "to": "#1 Teacher", "text": g.teaching_guidance},
        {"from": "#1 Teacher", "to": "#3 Coordinator", "text": replies["teacher"]},
        {"from": "#3 Coordinator", "to": "#4 Writer", "text": g.communication_guidance},
        {"from": "#4 Writer", "to": "#3 Coordinator", "text": replies["writer"]},
    ]
    # Check #2's numbers. Only if something is inconsistent does #3 write to #2, and only then #2 answers.
    b = reports.budget()
    last = db.one("SELECT content FROM guidance WHERE kind = 'accountant_narrative' ORDER BY id DESC LIMIT 1")
    narrative = json.loads(last["content"]) if last else None
    issues = reports.reconcile() + (reports.narrative_numbers_ok(narrative, b) if narrative else [])
    audit.log("coordinator", "check_accountant_numbers", {"inconsistencies": issues})
    accountant = {"checked": True, "inconsistencies": issues, "corrected": None}
    if issues:
        msg = "I found inconsistencies in the figures: " + "; ".join(issues) + ". Please correct them using only the ledger."
        thread.append({"from": "#3 Coordinator", "to": "#2 Accountant", "text": msg})
        db.handoff("coordinator", "accountant", {"inconsistencies": issues})
        try:
            fix = await agents.accountant_correct(issues, b, narrative)
        except Exception:
            raise HTTPException(503, "Accountant agent is unavailable right now.")
        fixed = {"summary": fix.summary, "watch_outs": fix.watch_outs}
        db.execute("INSERT INTO guidance (kind, content, created_at) VALUES (?,?,?)",
                   ("accountant_narrative", json.dumps(fixed, ensure_ascii=False), db.now()))
        db.handoff("accountant", "coordinator", {"reply": fix.message})
        remaining = reports.reconcile() + reports.narrative_numbers_ok(fixed, b)
        thread.append({"from": "#2 Accountant", "to": "#3 Coordinator", "text": fix.message})
        accountant.update(corrected=fixed, remaining_inconsistencies=remaining)
    return {"correlation": corr, "guidance": g.model_dump(), "thread": thread, "accountant_check": accountant}


@app.get("/api/staff/guidance", dependencies=[Depends(security.current_staff)])
def staff_guidance():
    return db.rows("SELECT * FROM guidance ORDER BY id DESC LIMIT 10")


@app.get("/api/staff/donations", dependencies=[Depends(security.current_staff)])
def staff_donations():
    return db.rows(
        """SELECT d.id, d.amount_mxn, d.frequency, d.donor_type, d.legal_name, d.display_mode, d.display_name AS wall_text,
                  d.created_at, u.first_name, u.last_name, u.email, p.alias AS patient, p.id AS patient_id
           FROM donations d JOIN users u ON u.id = d.user_id JOIN patients p ON p.id = d.patient_id
           ORDER BY d.id DESC"""
    )


@app.get("/api/staff/patients", dependencies=[Depends(security.current_staff)])
def staff_patients():
    return db.rows("SELECT * FROM patients ORDER BY id")


class LetterIn(BaseModel):
    donation_id: int
    language: Lang = "en"


def ensure_invoice(donation_id: int) -> dict:
    """Donation receipt for the contributor (#2 Accountant's record). Deterministic, no model call.
    Deductible only when the contributor gave a tax ID (RFC)."""
    inv = db.one("SELECT * FROM invoices WHERE donation_id = ?", (donation_id,))
    if inv:
        return inv
    d = db.one(
        """SELECT d.id, d.amount_mxn, d.frequency, d.donor_type, d.legal_name, d.tax_id, d.created_at,
                  u.first_name, u.last_name, u.email
           FROM donations d JOIN users u ON u.id = d.user_id WHERE d.id = ?""", (donation_id,))
    name = d["legal_name"] if d["donor_type"] == "legal_entity" and d["legal_name"] else f"{d['first_name']} {d['last_name']}"
    folio = f"FMC-{d['created_at'][:4]}-{d['id']:06d}"
    db.execute(
        """INSERT INTO invoices (donation_id, folio, issued_at, donor_name, donor_type, tax_id, email, amount_mxn,
                                 frequency, deductible) VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (d["id"], folio, db.now(), name, d["donor_type"], d["tax_id"], d["email"], d["amount_mxn"], d["frequency"],
         int(bool(d["tax_id"]))),
    )
    audit.log("accountant", "issue_donation_receipt", {"donation_id": d["id"], "folio": folio,
                                                       "deductible": bool(d["tax_id"])})
    return db.one("SELECT * FROM invoices WHERE donation_id = ?", (donation_id,))


def receipt_note(inv: dict, language: str) -> str:
    """Foundation postscript added to every letter (never written by the model, so the tax ID is exact)."""
    if language == "es":
        formal = inv["donor_type"] == "legal_entity"  # companies: "su"; people: "tu"
        su, desea, responda = ("su", "desean", "respondan") if formal else ("tu", "deseas", "responde")
        if inv["deductible"]:
            return (f"\n\n—\nFundación Mexicana del Corazón: adjuntamos {su} recibo de donativo deducible "
                    f"(folio {inv['folio']}) a nombre de {inv['donor_name']}, RFC {inv['tax_id']}.")
        return (f"\n\n—\nFundación Mexicana del Corazón: adjuntamos {su} recibo de donativo (folio {inv['folio']}). "
                f"Si {desea} que sea deducible de impuestos, {responda} a este correo con {su} RFC.")
    if inv["deductible"]:
        return (f"\n\n—\nFundación Mexicana del Corazón: your tax-deductible donation receipt is attached "
                f"(folio {inv['folio']}), issued to {inv['donor_name']}, tax ID (RFC) {inv['tax_id']}.")
    return (f"\n\n—\nFundación Mexicana del Corazón: your donation receipt is attached (folio {inv['folio']}). "
            "To make it tax-deductible, reply to this email with your tax ID (RFC).")


TRANSLATION_MARK = "\n\n— English translation —\n\n"


def compose_email(body_es: str | None, body_en: str | None, inv: dict) -> str:
    """Spanish letter + receipt note, then the English translation + receipt note."""
    if body_es is None:
        return (body_en or "") + receipt_note(inv, "en")
    return body_es + receipt_note(inv, "es") + TRANSLATION_MARK + (body_en or "") + receipt_note(inv, "en")


def split_email(letter: dict) -> tuple[str, str]:
    """Spanish and English letter texts (without receipt notes); handles letters saved before the split."""
    if letter.get("body_es") is not None or letter.get("body_en") is not None:
        return letter.get("body_es") or "", letter.get("body_en") or ""
    es, _, en = letter["body"].partition(TRANSLATION_MARK)
    return es.split("\n\n—\n")[0], en.split("\n\n—\n")[0]


SUBJECT_PREFIX = "Fundación Mexicana del Corazón - "


def with_prefix(subject: str) -> str:
    """Every email subject starts with the foundation's name."""
    rest = re.sub(r"^\s*Fundaci[oó]n Mexicana del Coraz[oó]n\s*[-–—:|]\s*", "", subject.strip(), flags=re.I)
    return SUBJECT_PREFIX + rest


@app.post("/api/staff/letters", dependencies=[Depends(security.current_staff)])
async def staff_letter(body: LetterIn):
    d = db.one(
        """SELECT d.id, d.frequency, d.patient_id, d.donor_type, d.legal_name, u.first_name
           FROM donations d JOIN users u ON u.id = d.user_id WHERE d.id = ?""", (body.donation_id,))
    if not d:
        raise HTTPException(404, "Donation not found.")
    p = db.one("SELECT alias, age, city, condition, procedure FROM patients WHERE id = ?", (d["patient_id"],))
    try:
        donor = d["legal_name"] if d["donor_type"] == "legal_entity" and d["legal_name"] else d["first_name"]
        letter = await agents.write_letter(p, donor, d["frequency"], body.language)
    except Exception:
        raise HTTPException(503, "Writer agent is unavailable right now.")
    inv = ensure_invoice(d["id"])
    es, en = (letter.body, letter.body_en) if body.language == "es" else (None, letter.body)
    full_body = compose_email(es, en, inv)
    subject = with_prefix(letter.subject)
    lid = db.execute(
        "INSERT INTO letters (donation_id, patient_id, subject, body, body_es, body_en, status, created_at) "
        "VALUES (?,?,?,?,?,?,?,?)",
        (d["id"], d["patient_id"], subject, full_body, es, en, "draft", db.now()),
    )
    db.handoff("writer", "coordinator", {"letter_id": lid, "subject": letter.subject, "frequency": d["frequency"]})
    return {"id": lid, "subject": subject, "body": full_body, "invoice": inv, "status": "draft — not sent"}


@app.get("/api/staff/invoices/{donation_id}", dependencies=[Depends(security.current_staff)])
def staff_invoice(donation_id: int):
    inv = ensure_invoice(donation_id)
    return {**inv, "foundation": "Fundación Mexicana del Corazón", "foundation_rfc": config.FOUNDATION_RFC or None}


class LetterEdit(BaseModel):
    subject: str = Field(min_length=1, max_length=200)
    status: Literal["draft", "sent_simulated"]


@app.get("/api/staff/letters/{letter_id}", dependencies=[Depends(security.current_staff)])
def staff_letter_get(letter_id: int):
    letter = db.one("SELECT * FROM letters WHERE id = ?", (letter_id,))
    if not letter:
        raise HTTPException(404, "Letter not found.")
    es, en = split_email(letter)
    return {**letter, "body_es": es, "body_en": en,
            "invoice": db.one("SELECT * FROM invoices WHERE donation_id = ?", (letter["donation_id"],))}


class LetterTranslateIn(BaseModel):
    subject: str = Field(min_length=1, max_length=200)
    body_es: str = Field(max_length=5000)
    body_en: str = Field(max_length=5000)
    changed: Literal["es", "en", "both", "none"]


@app.post("/api/staff/letters/{letter_id}/translate", dependencies=[Depends(security.current_staff)])
async def staff_letter_translate(letter_id: int, body: LetterTranslateIn):
    """'Confirm edition and translate': save the manager's edit, then the Writer translates the
    edited language into the other one so both versions always say the same thing."""
    letter = db.one("SELECT * FROM letters WHERE id = ?", (letter_id,))
    if not letter:
        raise HTTPException(404, "Letter not found.")
    if letter["status"] == "sent_simulated":
        raise HTTPException(409, "This email was already sent and can't be changed.")
    es, en = body.body_es.strip(), body.body_en.strip()
    try:
        if body.changed in ("es", "both"):  # Spanish is the main version
            en = await agents.translate_letter(es, "en")
        elif body.changed == "en":
            es = await agents.translate_letter(en, "es")
    except Exception:
        raise HTTPException(503, "The Writer could not translate right now. Please try again.")
    inv = ensure_invoice(letter["donation_id"])
    full = compose_email(es, en, inv)
    db.execute("UPDATE letters SET subject = ?, body = ?, body_es = ?, body_en = ?, status = 'draft', updated_at = ? "
               "WHERE id = ?", (with_prefix(body.subject), full, es, en, db.now(), letter_id))
    audit.log("management", "letter_edited_and_translated", {"letter_id": letter_id, "changed": body.changed})
    return {"subject": with_prefix(body.subject), "body_es": es, "body_en": en, "body": full}


@app.put("/api/staff/letters/{letter_id}", dependencies=[Depends(security.current_staff)])
def staff_letter_edit(letter_id: int, body: LetterEdit):
    """Edit / accept a Writer draft. 'sent_simulated' only marks it: no email is ever sent."""
    current = db.one("SELECT status FROM letters WHERE id = ?", (letter_id,))
    if not current:
        raise HTTPException(404, "Letter not found.")
    if current["status"] == "sent_simulated":
        raise HTTPException(409, "This email was already sent and can't be changed.")
    db.execute("UPDATE letters SET subject = ?, status = ?, updated_at = ? WHERE id = ?",
               (with_prefix(body.subject), body.status, db.now(), letter_id))
    audit.log("management", f"letter_{body.status}",
              {"letter_id": letter_id, "note": "prototype: no email sent" if body.status == "sent_simulated" else ""})
    return {"ok": True, "status": body.status}


@app.get("/api/staff/letters", dependencies=[Depends(security.current_staff)])
def staff_letters():
    return db.rows(
        """SELECT l.*, p.alias AS patient FROM letters l JOIN patients p ON p.id = l.patient_id ORDER BY l.id DESC LIMIT 30"""
    )


@app.get("/api/staff/audit", dependencies=[Depends(security.current_staff)])
def staff_audit(limit: int = 100):
    pin, pout = config.PRICE_INPUT_PER_1M, config.PRICE_OUTPUT_PER_1M
    cost = f"ROUND((COALESCE(input_tokens,0) * {pin} + COALESCE(output_tokens,0) * {pout}) / 1000000.0, 6)"
    log = db.rows(f"SELECT id, ts, agent, action, status, input_tokens, output_tokens, {cost} AS cost_usd, latency_ms, "
                  f"visit_id, substr(detail, 1, 300) AS detail FROM audit_log ORDER BY id DESC LIMIT ?", (min(limit, 500),))
    handoffs = db.rows("SELECT id, from_agent, to_agent, visit_id, substr(payload,1,300) AS payload, created_at FROM handoffs ORDER BY id DESC LIMIT 50")
    summary = lambda n: db.rows(  # noqa: E731
        f"SELECT substr(ts, 1, {n}) AS period, COUNT(*) AS model_calls, SUM(input_tokens) AS input_tokens, "
        f"SUM(output_tokens) AS output_tokens, ROUND(SUM({cost}), 4) AS cost_usd "
        f"FROM audit_log WHERE input_tokens IS NOT NULL GROUP BY period ORDER BY period DESC")
    totals = db.one(f"SELECT COUNT(*) AS calls, COALESCE(SUM(input_tokens),0) AS input_tokens, "
                    f"COALESCE(SUM(output_tokens),0) AS output_tokens, ROUND(COALESCE(SUM({cost}),0), 4) AS cost_usd "
                    f"FROM audit_log WHERE input_tokens IS NOT NULL")
    by_agent = db.rows(f"SELECT agent, COUNT(*) AS model_calls, SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens, "
                       f"ROUND(SUM({cost}), 4) AS cost_usd, ROUND(AVG({cost}), 6) AS avg_cost_per_call FROM audit_log "
                       f"WHERE input_tokens IS NOT NULL GROUP BY agent ORDER BY cost_usd DESC")
    return {"log": log, "handoffs": handoffs, "totals": totals, "per_day": summary(10), "per_month": summary(7),
            "by_agent": by_agent, "prices": {"model": config.MODEL_NAME, "input_per_1m_usd": pin, "output_per_1m_usd": pout}}


@app.get("/api/topics")
def topics():
    return TOPICS
