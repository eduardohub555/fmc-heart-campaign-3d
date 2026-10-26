import { useEffect, useRef, useState } from "react";
import { api, visitId, type ChatReply, type Lang, type Persona } from "../api";
import { tr } from "../i18n";

interface Msg { from: "npc" | "me"; text: string; error?: boolean; referTo?: string; question?: string }

export function ChatPanel({ npcId, persona, personas, lang, initialQuestion, referredBy, onClose, onRefer }: {
  npcId: string; persona: Persona; personas: Record<string, Persona>; lang: Lang; initialQuestion?: string;
  referredBy?: string; onClose: (asked: number) => void; onRefer: (toId: string, question: string) => void;
}) {
  const t = tr(lang);
  const opening = referredBy && personas[referredBy]
    ? t.handoff.replace("{name}", persona.name).replace("{from}", personas[referredBy].name)
    : lang === "es" ? persona.story_es : persona.story_en;
  const [msgs, setMsgs] = useState<Msg[]>([{ from: "npc", text: opening }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [followups, setFollowups] = useState<string[]>([]);
  const asked = useRef(0);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);
  useEffect(() => { if (initialQuestion) send(initialQuestion); /* eslint-disable-next-line */ }, []);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    setFollowups([]);
    setMsgs((m) => [...m, { from: "me", text: q }]);
    setBusy(true);
    try {
      const r = await api<ChatReply>("/chat", { body: { visit_id: visitId(), npc_id: npcId, message: q, lang } });
      asked.current += 1;
      setMsgs((m) => [...m, { from: "npc", text: r.answer, referTo: r.refer_to ?? undefined, question: q }]);
      setFollowups(r.followups);
    } catch (e) {
      setMsgs((m) => [...m, { from: "npc", text: (e as Error).message, error: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="panel chat">
      <header>
        <div>
          <h3>{persona.name}</h3>
          <small className="age">{persona.age} {t.yearsOld}</small>
          <small>{lang === "es" ? persona.role_es : persona.role_en}</small>
        </div>
        <button className="ghost" onClick={() => onClose(asked.current)} aria-label="close">✕</button>
      </header>
      <div className="msgs">
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.from} ${m.error ? "error" : ""}`}>
            <p>{m.text}</p>
            {m.referTo && personas[m.referTo] && i === msgs.length - 1 && !busy && (
              <button className="refer" onClick={() => onRefer(m.referTo!, m.question ?? "")}>
                {t.talkTo} {personas[m.referTo].name} →
              </button>
            )}
          </div>
        ))}
        {busy && <div className="msg npc thinking"><span className="dots"><i /><i /><i /></span> {t.thinking}</div>}
        <div ref={end} />
      </div>
      {!!followups.length && (
        <div className="chips">
          {followups.map((f) => <button key={f} className="chip" onClick={() => send(f)}>{f}</button>)}
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t.ask} maxLength={600} disabled={busy} autoFocus />
        <button type="submit" disabled={busy || !input.trim()}>{t.send}</button>
      </form>
      <footer>
        <small>{t.limitNote}<span className="disclaimer">{t.chatDisclaimer}</span></small>
        <button className="link" onClick={() => onClose(asked.current)}>{t.endChat}</button>
      </footer>
    </aside>
  );
}
