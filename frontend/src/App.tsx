import { Suspense, useCallback, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { api, visitId, type Lang, type Persona } from "./api";
import { tr } from "./i18n";
import { Garden } from "./scene/Garden";
import { WaitingRoom } from "./scene/WaitingRoom";
import { ChatPanel } from "./ui/ChatPanel";
import { DonatePanel } from "./ui/DonatePanel";
import { Confetti } from "./ui/Confetti";
import { StaffDashboard } from "./ui/StaffDashboard";

type Scene = "garden" | "hospital";
type Overlay = null | { kind: "invite"; npcId: string; tip?: string } | { kind: "learn"; suggestions: string[] };

export default function App() {
  const [route, setRoute] = useState(location.hash);
  const [lang, setLang] = useState<Lang>("en");
  const [scene, setScene] = useState<Scene>("garden");
  const [personas, setPersonas] = useState<Record<string, Persona>>({});
  const [chat, setChat] = useState<{ npcId: string; q?: string; from?: string } | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [intro, setIntro] = useState(true);
  const [wallRefresh, setWallRefresh] = useState(0);
  const [confetti, setConfetti] = useState(false);
  const stopConfetti = useCallback(() => setConfetti(false), []);
  const t = tr(lang);

  useEffect(() => {
    const h = () => setRoute(location.hash);
    window.addEventListener("hashchange", h);
    let retry: ReturnType<typeof setTimeout>;
    const load = () => api<Record<string, Persona>>("/npcs").then(setPersonas).catch(() => { retry = setTimeout(load, 2000); });
    load();
    return () => { window.removeEventListener("hashchange", h); clearTimeout(retry); };
  }, []);

  if (route === "#/staff") return <StaffDashboard onExit={() => { location.hash = ""; }} />;

  async function closeChat(npcId: string) {
    setChat(null);
    // Teacher hands the conversation report to the Accountant, leaves a health
    // reminder that fits what was discussed, then gently invites.
    const r = await api<{ tip?: string }>("/conversation/end", { body: { visit_id: visitId(), npc_id: npcId, lang } })
      .catch(() => ({ tip: undefined }));
    setOverlay({ kind: "invite", npcId, tip: r.tip });
  }

  async function keepLearning() {
    const r = await api<{ suggestions: string[] }>(`/learn-more?visit_id=${visitId()}&lang=${lang}`).catch(() => ({ suggestions: [] }));
    setOverlay({ kind: "learn", suggestions: r.suggestions });
  }

  function enterHospital() {
    setChat(null);
    setOverlay(null);
    setScene("hospital");
  }

  return (
    <div className="app">
      <Canvas
        key={scene}
        shadows
        dpr={[1, 1.75]}
        camera={scene === "garden" ? { position: [0, 9, 44], fov: 55 } : { position: [5.5, 2.6, 5.8], fov: 62 }}
      >
        <Suspense fallback={null}>
          {scene === "garden" ? (
            <Garden lang={lang} personas={personas} activeNpc={chat?.npcId ?? null}
              onTalk={(id) => { setOverlay(null); setChat({ npcId: id }); }} onEnter={enterHospital} wallRefresh={wallRefresh} />
          ) : (
            <WaitingRoom lang={lang} wallRefresh={wallRefresh} />
          )}
        </Suspense>
      </Canvas>

      <header className="topbar">
        <div className="brand"><span className="heart">💙</span><b>{t.brand}</b></div>
        <div className="actions">
          {scene === "garden"
            ? <button onClick={enterHospital}>🏥 {t.enterHospital}</button>
            : <button onClick={() => setScene("garden")}>🌳 {t.backGarden}</button>}
          <button className="ghost translate" onClick={() => setLang(lang === "en" ? "es" : "en")}>
            {lang === "en" ? "🇲🇽 Traducción al Español" : "🇺🇸 English"}
          </button>
          <a className="staff-link" href="#/staff">{t.staff}</a>
        </div>
      </header>

      {intro && (
        <div className="modal-bg">
          <div className="panel modal">
            <h1 className="welcome">{t.introTitle}</h1>
            <p className="lead">
              {t.introLeadBefore}<mark className="stat">{t.introStat}</mark>{t.introLeadAfter}
            </p>
            <p className="lead">{t.introInvite} <b>{t.introOptional}</b></p>
            <p className="note">🖱️ {t.introControls}</p>
            <p className="disclaimer">ℹ️ {t.introNote}</p>
            <div className="row">
              <button className="ghost translate" onClick={() => setLang(lang === "en" ? "es" : "en")}>
                {lang === "en" ? "🇲🇽 Traducción al Español" : "🇺🇸 English"}
              </button>
              <button onClick={() => setIntro(false)}>{t.start}</button>
            </div>
          </div>
        </div>
      )}

      {scene === "garden" && chat && personas[chat.npcId] && (
        <ChatPanel key={`${chat.npcId}-${chat.q ?? ""}`} npcId={chat.npcId} persona={personas[chat.npcId]} personas={personas}
          lang={lang} initialQuestion={chat.q} referredBy={chat.from} onClose={() => closeChat(chat.npcId)}
          onRefer={(toId, question) => {
            // Hand the visitor to the other character; the backend passes them the conversation.
            api("/conversation/end", { body: { visit_id: visitId(), npc_id: chat.npcId, show_tip: false } }).catch(() => {});
            setChat({ npcId: toId, q: question, from: chat.npcId });
          }} />
      )}

      {scene === "garden" && overlay?.kind === "invite" && (
        <div className="panel toast">
          {(() => {
            const p = personas[overlay.npcId];
            const bye = p && (lang === "es" ? p.goodbye_es : p.goodbye_en);
            return bye ? (
              <blockquote className={`goodbye ${p.kind === "kid" ? "kid" : ""}`}>
                <p>“{bye}”</p>
                <cite>— {p.name}</cite>
              </blockquote>
            ) : <h3>{t.inviteTitle}</h3>;
          })()}
          {overlay.tip && <p className="tip">❤️ {overlay.tip}</p>}
          <p>{t.inviteBody}</p>
          <div className="row">
            <button onClick={enterHospital}>{t.inviteDonate}</button>
            <button className="ghost" onClick={keepLearning}>{t.inviteLearn}</button>
            <button className="ghost" onClick={() => setOverlay(null)}>{t.inviteWalk}</button>
          </div>
        </div>
      )}

      {scene === "garden" && overlay?.kind === "learn" && (
        <div className="panel toast">
          <h3>📚 {t.learnTitle}</h3>
          <div className="chips col">
            {overlay.suggestions.map((s) => (
              <button key={s} className="chip" onClick={() => { setOverlay(null); setChat({ npcId: "dra-herrera", q: s }); }}>{s}</button>
            ))}
          </div>
          <div className="row"><button className="ghost" onClick={() => setOverlay(null)}>{t.inviteWalk}</button></div>
        </div>
      )}

      {scene === "hospital" && (
        <DonatePanel lang={lang} onDonated={() => { setWallRefresh((n) => n + 1); setConfetti(true); }}
          onDecline={() => { setScene("garden"); keepLearning(); }} />
      )}
      {confetti && <Confetti onDone={stopConfetti} />}
    </div>
  );
}
