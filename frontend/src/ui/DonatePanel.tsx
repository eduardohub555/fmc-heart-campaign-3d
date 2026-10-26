import { useEffect, useState } from "react";
import { api, mxn, tokens, visitId, type Lang, type User } from "../api";
import { tr, type Strings } from "../i18n";

type Step = "impact" | "account" | "details" | "done";
type Freq = "one_time" | "monthly";
type DonorType = "individual" | "legal_entity";

interface DonationResult {
  donation_id: number;
  patient: {
    alias: string; age: number; city: string; procedure: string;
    procedure_info?: { title_en: string; title_es: string; en: string; es: string; source: string } | null;
  };
}

const PRESETS = [100, 200, 500, 1000, 5000, 20000];
const SURGERY = 200_000;
const MAX_LOGO_BYTES = 300 * 1024;

/** A warm message for any amount; never a percentage. */
export function impactMessage(yearly: number, t: Strings) {
  if (yearly >= SURGERY) {
    const n = Math.round((yearly / SURGERY) * 10) / 10;
    return n === 1 ? t.impactOne : t.impactBig.replace("{n}", String(n));
  }
  if (yearly < 1000) return t.impactSmall;
  if (yearly < 20000) return t.impactMedium;
  return t.impactLarge;
}

export function DonatePanel({ lang, onDonated, onDecline }: { lang: Lang; onDonated: () => void; onDecline: () => void }) {
  const t = tr(lang);
  const [step, setStep] = useState<Step>("impact");
  const [freq, setFreq] = useState<Freq>("one_time");
  const [amount, setAmount] = useState(500);
  const [user, setUser] = useState<User | null>(null);
  const [donorType, setDonorType] = useState<DonorType>("individual");
  const [legalName, setLegalName] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [wallText, setWallText] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [taxId, setTaxId] = useState("");
  const [companyTaxId, setCompanyTaxId] = useState("");
  const [result, setResult] = useState<DonationResult | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [showProc, setShowProc] = useState(false);
  const yearly = freq === "monthly" ? amount * 12 : amount;

  useEffect(() => {
    const tok = tokens.donor();
    if (tok) api<User>("/auth/me", { token: tok }).then(setUser).catch(() => tokens.setDonor(null));
  }, []);

  // Prefill the wall details from the account.
  useEffect(() => {
    if (!user) return;
    setLegalName((v) => v || user.company || "");
    setAnonymous(!!user.wall_anonymous);
    setWallText(user.wall_name || "");
    setTaxId((v) => v || user.tax_id || "");
  }, [user]);

  function signOut() {
    api("/auth/logout", { method: "POST", token: tokens.donor() }).catch(() => {});
    tokens.setDonor(null);
    setUser(null);
    setTaxId(""); setCompanyTaxId(""); setWallText(""); setLegalName(""); setAnonymous(false);
    setStep("impact");
  }

  function pickLogo(file: File | undefined) {
    setErr("");
    if (!file) return setLogo(null);
    if (file.size > MAX_LOGO_BYTES) { setErr(t.logoTooBig); return; }
    const reader = new FileReader();
    reader.onload = () => setLogo(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function confirm() {
    setBusy(true);
    setErr("");
    try {
      const r = await api<DonationResult>("/donations", {
        token: tokens.donor(),
        body: {
          amount_mxn: amount, frequency: freq, donor_type: donorType, anonymous,
          legal_name: donorType === "legal_entity" ? legalName : null,
          logo: donorType === "legal_entity" ? logo : null,
          wall_text: wallText || null, visit_id: visitId(),
          tax_id: (donorType === "legal_entity" ? companyTaxId : taxId).trim() || null,
        },
      });
      setResult(r);
      setStep("done");
      onDonated();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const defaultWallName = donorType === "legal_entity" ? legalName : user ? `${user.first_name} ${user.last_name}` : "";

  return (
    <aside className="panel donate">
      {step === "impact" && (
        <>
          <h2>{user ? t.thanksTitleName.replace("{name}", user.first_name) : t.thanksTitle}</h2>
          <p>{t.thanksBody}</p>
          <div className="toggle">
            <button className={freq === "one_time" ? "on" : ""} onClick={() => setFreq("one_time")}>{t.oneTime}</button>
            <button className={freq === "monthly" ? "on" : ""} onClick={() => setFreq("monthly")}>{t.monthly}</button>
          </div>
          <div className="presets">
            {PRESETS.map((p) => (
              <button key={p} className={amount === p ? "on" : ""} onClick={() => setAmount(p)}>{mxn(p)}</button>
            ))}
          </div>
          <label>{t.amount}
            <input type="number" min={50} step={50} value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} />
          </label>
          {amount >= 50 && (
            <div className="impact">
              <p className="impact-msg">{impactMessage(yearly, t)}</p>
              {freq === "monthly" && <p className="muted">{t.perYearIs.replace("{amount}", mxn(yearly))}</p>}
            </div>
          )}
          <p className="note">💌 {t.letterNote}</p>
          <div className="row">
            {user && <button className="ghost" onClick={signOut}>{t.signOut}</button>}
            <button className="ghost" onClick={onDecline}>{t.notNow}</button>
            <button disabled={!(amount >= 50)} onClick={() => setStep(user ? "details" : "account")}>{t.continue}</button>
          </div>
          {user && <p className="muted signed-in">{t.signedInAs} <b>{user.first_name} {user.last_name}</b> · {user.email}</p>}
        </>
      )}

      {step === "account" && (
        <AuthForm lang={lang} onAuthed={(u) => { setUser(u); setStep("details"); }} onBack={() => setStep("impact")} />
      )}

      {step === "details" && user && (
        <>
          <p className="muted">{t.signedInAs} <b>{user.first_name} {user.last_name}</b> · {user.email}{" "}
            <button className="link" onClick={signOut}>{t.signOut}</button>
          </p>
          <h3>{t.whoDonating}</h3>
          <div className="toggle">
            <button className={donorType === "individual" ? "on" : ""} onClick={() => setDonorType("individual")}>{t.individual}</button>
            <button className={donorType === "legal_entity" ? "on" : ""} onClick={() => setDonorType("legal_entity")}>{t.legalEntity}</button>
          </div>
          {donorType === "legal_entity" && (
            <div className="entity">
              <label>{t.legalName}
                <input value={legalName} onChange={(e) => setLegalName(e.target.value)} maxLength={120} required />
              </label>
              <label>{t.logo}
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => pickLogo(e.target.files?.[0])} />
              </label>
              {logo && <img className="logo-preview" src={logo} alt="logo" />}
              <label>{t.taxIdCompany}
                <input value={companyTaxId} onChange={(e) => setCompanyTaxId(e.target.value.toUpperCase())} maxLength={20} placeholder="ABC010203XY1" />
              </label>
            </div>
          )}
          {donorType === "individual" && (
            <label>{t.taxIdPerson}
              <input value={taxId} onChange={(e) => setTaxId(e.target.value.toUpperCase())} maxLength={20} placeholder="GODE561231GR8" />
            </label>
          )}
          <label>{t.wallText}
            <input value={wallText} onChange={(e) => setWallText(e.target.value)} maxLength={60}
              placeholder={defaultWallName || t.wallTextHint} disabled={anonymous} />
          </label>
          <label className="check">
            <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} /> {t.donateAnon}
          </label>
          <div className="summary">{mxn(amount)} · {freq === "monthly" ? t.monthly : t.oneTime}</div>
          {err && <p className="err">{err}</p>}
          <div className="row">
            <button className="ghost" onClick={() => setStep("impact")}>{t.back}</button>
            <button disabled={busy || (donorType === "legal_entity" && !legalName.trim())} onClick={confirm}>{t.confirm}</button>
          </div>
        </>
      )}

      {step === "done" && result && (
        <>
          <h2>💙 {t.successTitle}</h2>
          <div className="impact">
            <p className="impact-msg">{impactMessage(yearly, t)}</p>
            <p>{t.successPatient}: <b>{result.patient.alias}</b> ({result.patient.age}) · {result.patient.city}</p>
            {result.patient.procedure_info ? (
              <>
                <button className="link proc" onClick={() => setShowProc((v) => !v)}>
                  {lang === "es" ? result.patient.procedure_info.title_es : result.patient.procedure_info.title_en}
                  {" "}{showProc ? "▴" : "▾"}
                </button>
                {showProc && (
                  <div className="proc-info">
                    <p>{lang === "es" ? result.patient.procedure_info.es : result.patient.procedure_info.en}</p>
                    <small>{t.sourceLabel}: {result.patient.procedure_info.source}</small>
                  </div>
                )}
              </>
            ) : <p>{result.patient.procedure}</p>}
          </div>
          <p className="note">💌 {t.letterNote}</p>
          <p className="note">🧾 {t.receiptNote}{" "}
            {(() => {
              const rfc = (donorType === "legal_entity" ? companyTaxId : taxId).trim();
              const name = donorType === "legal_entity" ? legalName : user ? `${user.first_name} ${user.last_name}` : "";
              return rfc ? t.receiptWithRfc.replace("{name}", name).replace("{rfc}", rfc) : t.receiptNoRfc;
            })()}
          </p>
          <div className="row"><button onClick={onDecline}>{t.backGarden}</button></div>
        </>
      )}
    </aside>
  );
}

function AuthForm({ lang, onAuthed, onBack }: { lang: Lang; onAuthed: (u: User) => void; onBack: () => void }) {
  const t = tr(lang);
  const [mode, setMode] = useState<"in" | "up">("up");
  const [f, setF] = useState({ first_name: "", last_name: "", company: "", email: "", password: "", wall_name: "", tax_id: "" });
  const [wallAnon, setWallAnon] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const body = mode === "up"
        ? { ...f, company: f.company || null, wall_name: wallAnon ? null : f.wall_name || null, wall_anonymous: wallAnon,
            tax_id: f.tax_id.trim().toUpperCase() || null }
        : { email: f.email, password: f.password };
      const r = await api<{ token: string; user: User }>(mode === "up" ? "/auth/signup" : "/auth/login", { body });
      tokens.setDonor(r.token);
      onAuthed(r.user);
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth" onSubmit={submit}>
      <div className="toggle">
        <button type="button" className={mode === "up" ? "on" : ""} onClick={() => setMode("up")}>{t.signUp}</button>
        <button type="button" className={mode === "in" ? "on" : ""} onClick={() => setMode("in")}>{t.signIn}</button>
      </div>
      <p className="note">{t.accountWhy}</p>
      {mode === "up" && (
        <>
          <input placeholder={t.firstName} value={f.first_name} onChange={set("first_name")} required maxLength={60} />
          <input placeholder={t.lastName} value={f.last_name} onChange={set("last_name")} required maxLength={60} />
          <input placeholder={t.company} value={f.company} onChange={set("company")} maxLength={120} />
        </>
      )}
      <input type="email" placeholder={t.email} value={f.email} onChange={set("email")} required autoComplete="email" />
      <input type="password" placeholder={t.password} value={f.password} onChange={set("password")} required
        minLength={mode === "up" ? 8 : 1} autoComplete={mode === "up" ? "new-password" : "current-password"} />
      {mode === "up" && (
        <>
          <label className="field">{t.taxIdPerson}
            <input placeholder="GODE561231GR8" value={f.tax_id} onChange={set("tax_id")} maxLength={20} />
          </label>
          <label className="field">{t.wallText}
            <input placeholder={t.wallTextHint} value={f.wall_name} onChange={set("wall_name")} maxLength={60} disabled={wallAnon} />
          </label>
          <label className="check">
            <input type="checkbox" checked={wallAnon} onChange={(e) => setWallAnon(e.target.checked)} /> {t.donateAnon}
          </label>
        </>
      )}
      {err && <p className="err">{err}</p>}
      <div className="row">
        <button type="button" className="ghost" onClick={onBack}>{t.back}</button>
        <button type="submit" disabled={busy}>{mode === "up" ? t.signUp : t.signIn}</button>
      </div>
    </form>
  );
}
