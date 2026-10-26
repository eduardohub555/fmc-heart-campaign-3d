import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { api, mxn, tokens } from "../api";

type Tab = "live" | "insights" | "audit";
type Row = Record<string, unknown>;

// Validated categorical slots (dataviz reference palette, light mode).
const C1 = "#2a78d6"; // blue
const C2 = "#eb6834"; // orange
const C3 = "#1baf7a"; // aqua
const INK2 = "#52514e";
const INK1 = "#1f1f1f"; // total raised (black)
const GRID = "#e6ecf4";

interface Donation {
  id: number; amount_mxn: number; frequency: string; donor_type: string; legal_name: string | null;
  display_mode: string; wall_text: string | null; created_at: string; first_name: string; last_name: string;
  email: string; patient: string; letter_id: number | null; letter_status: string | null;
  tax_id: string | null; invoice_folio: string | null;
}
interface Invoice {
  folio: string; issued_at: string; donor_name: string; donor_type: string; tax_id: string | null; email: string;
  amount_mxn: number; frequency: string; deductible: number; foundation?: string; foundation_rfc?: string | null;
}
interface Dashboard {
  budget: {
    total_raised_mxn: number; spent_on_surgeries_mxn: number; available_mxn: number;
    recurring_monthly_revenue_mxn: number; unique_donors: number; donations_count: number;
  };
  monthly: { month: string; one_time: number; recurring: number; spent: number; raised_cum: number; available: number }[];
  donations: Donation[];
  expenses: { id: number; amount_mxn: number; patient: string | null; note: string | null; manager: string; created_at: string }[];
  patients: { id: number; alias: string; procedure: string; status: string; paid_mxn: number }[];
}
type Filter = { kind: "month" | "type" | "size"; value: string; label: string } | null;

const SIZE_BUCKETS: [string, number, number][] = [
  ["< $500", 0, 500], ["$500–1k", 500, 1000], ["$1k–5k", 1000, 5000],
  ["$5k–20k", 5000, 20000], ["$20k–200k", 20000, 200000], ["≥ $200k", 200000, Infinity],
];
/** Money received from a donation so far this calendar year (monthly gifts count each month since they began). */
const ytd = (d: Donation) => {
  const now = new Date();
  const start = new Date(d.created_at);
  if (d.frequency !== "monthly") return start.getFullYear() === now.getFullYear() ? d.amount_mxn : 0;
  const fromMonth = start.getFullYear() === now.getFullYear() ? start.getMonth() : 0;
  return d.amount_mxn * Math.max(0, now.getMonth() - fromMonth + 1);
};
const sizeOf = (d: Donation) => SIZE_BUCKETS.find(([, lo, hi]) => ytd(d) >= lo && ytd(d) < hi)![0];
const short = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${n}`);
const donorName = (d: Donation) => (d.donor_type === "legal_entity" && d.legal_name ? d.legal_name : `${d.first_name} ${d.last_name}`);

export function StaffDashboard({ onExit }: { onExit: () => void }) {
  const [token, setToken] = useState(tokens.staff());
  const [tab, setTab] = useState<Tab>("live");
  const logout = useCallback(() => {
    api("/auth/logout", { method: "POST", token: tokens.staff() }).catch(() => {});
    tokens.setStaff(null);
    setToken(null);
  }, []);

  if (!token) return <StaffAuth onExit={onExit} onAuthed={(t) => { tokens.setStaff(t); setToken(t); }} />;

  return (
    <div className="staff">
      <header className="staff-head">
        <h2>💙 Fundación Mexicana del Corazón · Management dashboard</h2>
        <nav>
          {(["live", "insights", "audit"] as Tab[]).map((x) => (
            <button key={x} className={tab === x ? "on" : ""} onClick={() => setTab(x)}>
              {{ live: "Live dashboard", insights: "#3 Coordinator · Insights", audit: "Audit trail" }[x]}
            </button>
          ))}
        </nav>
        <div className="row tight">
          <button onClick={onExit}>🌳 Back to garden</button>
          <button className="ghost" onClick={logout}>Sign out</button>
        </div>
      </header>
      <main>
        {tab === "live" && <Live token={token} onAuthError={logout} />}
        {tab === "insights" && <Insights token={token} onAuthError={logout} />}
        {tab === "audit" && <Audit token={token} onAuthError={logout} />}
      </main>
    </div>
  );
}

/* ----------------------------------------------------------------- sign in / up */
function StaffAuth({ onExit, onAuthed }: { onExit: () => void; onAuthed: (token: string) => void }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ token: string }>(mode === "up" ? "/staff/signup" : "/staff/login", {
        body: mode === "up" ? f : { email: f.email, password: f.password },
      });
      onAuthed(r.token);
    } catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="staff">
      <div className="staff-auth-top"><button onClick={onExit}>🌳 Back to garden</button></div>
      <form className="panel login" onSubmit={submit}>
        <h2>Management dashboard</h2>
        <div className="toggle">
          <button type="button" className={mode === "in" ? "on" : ""} onClick={() => setMode("in")}>Sign in</button>
          <button type="button" className={mode === "up" ? "on" : ""} onClick={() => setMode("up")}>Sign up</button>
        </div>
        {mode === "up" && <input placeholder="Full name" value={f.name} onChange={set("name")} required maxLength={80} />}
        <input type="text" placeholder="Email" value={f.email} onChange={set("email")} required autoComplete="username" />
        <input type="password" placeholder={mode === "up" ? "Password (min. 8)" : "Password"} value={f.password}
          onChange={set("password")} required minLength={mode === "up" ? 8 : 1}
          autoComplete={mode === "up" ? "new-password" : "current-password"} />
        {err && <p className="err">{err}</p>}
        <div className="row"><button disabled={busy}>{mode === "up" ? "Create manager account" : "Sign in"}</button></div>
      </form>
    </div>
  );
}

function useLoad<T>(path: string, token: string, onAuthError: () => void, dep = 0) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<T>(path, { token }).then(setData).catch((e) => {
      if (/sign in|session|Staff/.test(e.message)) onAuthError();
      setErr(e.message);
    });
  }, [path, token, dep]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, err };
}

/* ---------------------------------------------------------------- live dashboard */
function Live({ token, onAuthError }: { token: string; onAuthError: () => void }) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [filter, setFilter] = useState<Filter>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [receipt, setReceipt] = useState<number | null>(null);
  const [drafting, setDrafting] = useState<number | null>(null);
  const [narr, setNarr] = useState<{ summary: string; watch_outs: string[] } | null>(null);
  const [busyNarr, setBusyNarr] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    api<Dashboard>("/staff/dashboard", { token })
      .then((d) => { setData(d); setUpdated(new Date()); setErr(""); })
      .catch((e) => { if (/sign in|session|Staff/.test(e.message)) onAuthError(); setErr(e.message); });
  }, [token, onAuthError]);
  useEffect(() => { load(); const id = setInterval(load, 10_000); return () => clearInterval(id); }, [load]);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.donations.filter((d) => {
      if (filter?.kind === "month" && d.created_at.slice(0, 7) !== filter.value) return false;
      if (filter?.kind === "type" && d.donor_type !== filter.value) return false;
      if (filter?.kind === "size" && sizeOf(d) !== filter.value) return false;
      if (q && !`${donorName(d)} ${d.email} ${d.wall_text ?? ""} ${d.patient}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, filter, search]);

  if (!data) return <p className="muted">{err || "Loading…"}</p>;
  const b = data.budget;
  const typeData = [
    { key: "individual", label: "Individuals", amount: 0, count: 0 },
    { key: "legal_entity", label: "Legal entities", amount: 0, count: 0 },
  ];
  data.donations.forEach((d) => { const t = typeData.find((x) => x.key === d.donor_type)!; t.amount += ytd(d); t.count += 1; });
  const sizeData = SIZE_BUCKETS.map(([label]) => ({ label, count: data.donations.filter((d) => sizeOf(d) === label).length }));
  const pick = (kind: "month" | "type" | "size", value?: string, label?: string) => {
    if (value) setFilter({ kind, value, label: label ?? value });
  };

  async function draftLetter(id: number) {
    setDrafting(id);
    setErr("");
    try {
      const r = await api<{ id: number }>("/staff/letters", { token, body: { donation_id: id, language: "es" } });
      load();
      setEditing(r.id);
    } catch (e) { setErr((e as Error).message); } finally { setDrafting(null); }
  }
  async function narrate() {
    setBusyNarr(true);
    try { setNarr((await api<{ narrative: typeof narr }>("/staff/budget/narrative", { method: "POST", token })).narrative); }
    catch (e) { setErr((e as Error).message); } finally { setBusyNarr(false); }
  }

  return (
    <>
      <div className="live-line"><span className="dot" /> Live · refreshes every 10 s{updated && ` · updated ${updated.toLocaleTimeString()}`}</div>
      <div className="kpis">
        <div><small>Total raised</small><b className="raised">{mxn(b.total_raised_mxn)}</b>
          <em>One-time gifts + monthly payments received so far</em></div>
        <div><small>Spent on surgeries</small><b>{mxn(b.spent_on_surgeries_mxn)}</b>
          <em>Payments recorded below</em></div>
        <div><small>Available now</small><b className="available">{mxn(b.available_mxn)}</b>
          <em>Total raised − spent on surgeries</em></div>
        <div><small>Donors · donations</small><b>{b.unique_donors} · {b.donations_count}</b></div>
      </div>

      <SpendForm token={token} patients={data.patients} available={b.available_mxn} onDone={load} />

      <div className="charts">
        <figure className="chart">
          <figcaption>Donations per month <small>click a month to filter the table</small></figcaption>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.monthly} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="month" tick={{ fill: INK2, fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={short} tick={{ fill: INK2, fontSize: 12 }} axisLine={false} tickLine={false} width={56} />
              <Tooltip formatter={(v) => mxn(Number(v))} cursor={{ fill: "rgba(42,120,214,0.08)" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar isAnimationActive={false} dataKey="one_time" name="One-time" stackId="a" fill={C1} stroke="#fff" strokeWidth={2} cursor="pointer"
                onClick={(d) => pick("month", (d as { month?: string }).month)} />
              <Bar isAnimationActive={false} dataKey="recurring" name="Monthly (recurring)" stackId="a" fill={C3} stroke="#fff" strokeWidth={2}
                radius={[4, 4, 0, 0]} cursor="pointer" onClick={(d) => pick("month", (d as { month?: string }).month)} />
            </BarChart>
          </ResponsiveContainer>
        </figure>

        <figure className="chart">
          <figcaption>Total raised vs. available <small>available = raised − surgery payments</small></figcaption>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data.monthly} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="month" tick={{ fill: INK2, fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={short} tick={{ fill: INK2, fontSize: 12 }} axisLine={false} tickLine={false} width={56} />
              <Tooltip formatter={(v) => mxn(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line isAnimationActive={false} dataKey="raised_cum" name="Total raised" stroke={INK1} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              <Line isAnimationActive={false} dataKey="available" name="Available" stroke={C2} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </figure>

        <figure className="chart">
          <figcaption>Who is donating (year to date) <small>click to filter</small></figcaption>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={typeData} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid stroke={GRID} horizontal={false} />
              <XAxis type="number" tickFormatter={short} tick={{ fill: INK2, fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" tick={{ fill: INK2, fontSize: 12 }} axisLine={false} tickLine={false} width={96} />
              <Tooltip formatter={(v, _n, p) => [`${mxn(Number(v))} · ${(p.payload as { count: number }).count} donations`, "Year to date"]} />
              <Bar isAnimationActive={false} dataKey="amount" name="Year to date" fill={C1} radius={[0, 4, 4, 0]} cursor="pointer"
                onClick={(d) => { const x = d as { key?: string; label?: string }; pick("type", x.key, x.label); }} />
            </BarChart>
          </ResponsiveContainer>
        </figure>

        <figure className="chart">
          <figcaption>Gift sizes (year to date) <small>click to filter</small></figcaption>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={sizeData} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: INK2, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: INK2, fontSize: 12 }} axisLine={false} tickLine={false} width={32} />
              <Tooltip formatter={(v) => [`${v} donations`, "Count"]} cursor={{ fill: "rgba(42,120,214,0.08)" }} />
              <Bar isAnimationActive={false} dataKey="count" name="Donations" radius={[4, 4, 0, 0]} cursor="pointer"
                onClick={(d) => pick("size", (d as { label?: string }).label)}>
                {sizeData.map((s) => <Cell key={s.label} fill={filter?.kind === "size" && filter.value === s.label ? C2 : C1} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </figure>
      </div>

      <div className="row left">
        <button onClick={narrate} disabled={busyNarr}>{busyNarr ? "Accountant is writing…" : "Ask #2 Accountant for a management summary"}</button>
      </div>
      {narr && <div className="card"><p>{narr.summary}</p>{!!narr.watch_outs.length && <ul>{narr.watch_outs.map((w) => <li key={w}>{w}</li>)}</ul>}</div>}

      <h3>Donations ({rows.length}{rows.length !== data.donations.length ? ` of ${data.donations.length}` : ""})</h3>
      <div className="row left table-tools">
        <input className="search" placeholder="Search donor, email, wall text, patient…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {filter && <span className="chip-filter">{filter.label} <button className="link" onClick={() => setFilter(null)}>✕ clear</button></span>}
      </div>
      {err && <p className="err">{err}</p>}
      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>Date &amp; time</th><th>Donor</th><th>Email</th><th>Tax ID (RFC)</th><th>Amount</th><th>Type</th><th>Gratitude wall</th><th>Patient</th><th>Thank-you letter (#4 Writer)</th><th>Receipt</th>
          </tr></thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <td className="nowrap">{new Date(d.created_at).toLocaleString()}</td>
                <td>{donorName(d)}<br /><span className={`badge ${d.donor_type}`}>{d.donor_type === "legal_entity" ? "Legal entity" : "Individual"}</span></td>
                <td>{d.email}</td>
                <td className="nowrap">{d.tax_id ?? <span className="muted">—</span>}</td>
                <td className="nowrap"><b>{mxn(d.amount_mxn)}</b></td>
                <td>{d.frequency === "monthly" ? "Monthly" : "One-time"}</td>
                <td>{d.display_mode === "anonymous" ? <em className="muted">Anonymous</em> : d.wall_text}</td>
                <td>{d.patient}</td>
                <td className="nowrap">
                  {d.letter_id ? (
                    d.letter_status === "sent_simulated"
                      ? <button className="small sent" onClick={() => setEditing(d.letter_id)}>✓ Marked sent</button>
                      : <button className="small" onClick={() => setEditing(d.letter_id)}>Edit / send</button>
                  ) : (
                    <button className="small ghost" disabled={drafting !== null} onClick={() => draftLetter(d.id)}>
                      {drafting === d.id ? "Writing…" : "Draft with Writer"}
                    </button>
                  )}
                </td>
                <td className="nowrap">
                  {d.invoice_folio
                    ? <button className="link" onClick={() => setReceipt(d.id)}>{d.invoice_folio}</button>
                    : <span className="muted">with letter</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!!data.expenses.length && (
        <>
          <h3>Surgery payments</h3>
          <div className="table-wrap"><table>
            <thead><tr><th>Date</th><th>Amount</th><th>Patient</th><th>Note</th><th>Recorded by</th></tr></thead>
            <tbody>{data.expenses.map((e) => (
              <tr key={e.id}><td>{new Date(e.created_at).toLocaleString()}</td><td>{mxn(e.amount_mxn)}</td>
                <td>{e.patient ?? "—"}</td><td>{e.note ?? ""}</td><td>{e.manager}</td></tr>
            ))}</tbody>
          </table></div>
        </>
      )}

      {editing !== null && <LetterEditor token={token} letterId={editing} onClose={() => { setEditing(null); load(); }}
        onReceipt={(id) => setReceipt(id)} />}
      {receipt !== null && <ReceiptView token={token} donationId={receipt} onClose={() => setReceipt(null)} />}
    </>
  );
}

const statusLabel = (s: string | null) =>
  ({ draft: "Draft", sent_simulated: "Marked sent" } as Record<string, string>)[s ?? ""] ?? "—";

function SpendForm({ token, patients, available, onDone }: {
  token: string; patients: Dashboard["patients"]; available: number; onDone: () => void;
}) {
  const active = patients.filter((p) => p.status === "active");
  const [amount, setAmount] = useState(200000);
  const [patient, setPatient] = useState<number | "">("");
  const [fullyPaid, setFullyPaid] = useState(false);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function spend(e: React.FormEvent) {
    e.preventDefault();
    if (!patient) return;
    setBusy(true);
    setMsg("");
    try {
      await api("/staff/spend", { token, body: { amount_mxn: amount, patient_id: patient, note, surgery_fully_paid: fullyPaid } });
      const who = active.find((p) => p.id === patient)?.alias;
      setMsg(`Recorded ${mxn(amount)} for ${who}.` + (fullyPaid ? ` ${who}'s surgery is marked fully paid; no new donations will be assigned to them.` : ""));
      setNote(""); setPatient(""); setFullyPaid(false);
      onDone();
    } catch (e2) { setMsg((e2 as Error).message); } finally { setBusy(false); }
  }
  const closed = patients.filter((p) => p.status !== "active");
  return (
    <form className="card spend" onSubmit={spend}>
      <b>Pay for a surgery</b>
      <small className="muted spend-msg">The Instituto Nacional de Cardiología performs the surgeries and decides which patient needs the resources first; Fundación Mexicana del Corazón pays from the funds raised.</small>
      <input type="number" min={1} step="any" value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))}
        aria-label="Amount (MXN)" title="Any amount: 200,000 MXN is only an estimate" />
      <select value={patient} onChange={(e) => setPatient(e.target.value ? Number(e.target.value) : "")} required aria-label="Patient">
        <option value="">Choose patient based on priority from Instituto Nacional de Cardiología *</option>
        {active.map((p) => <option key={p.id} value={p.id}>{p.alias} · {p.procedure}{p.paid_mxn ? ` · paid so far ${mxn(p.paid_mxn)}` : ""}</option>)}
      </select>
      <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
      <label className="check">
        <input type="checkbox" checked={fullyPaid} onChange={(e) => setFullyPaid(e.target.checked)} />
        This payment covers the whole surgery — remove this patient from the campaign
      </label>
      <button disabled={busy || !(amount > 0) || amount > available || !patient}>Record payment</button>
      {msg && <small className="muted spend-msg">{msg}</small>}
      {!!closed.length && <small className="muted spend-msg">Surgeries fully paid: {closed.map((p) => `${p.alias} (${mxn(p.paid_mxn)})`).join(", ")}</small>}
    </form>
  );
}

function LetterEditor({ token, letterId, onClose, onReceipt }: {
  token: string; letterId: number; onClose: () => void; onReceipt: (donationId: number) => void;
}) {
  type L = { subject: string; body_es: string; body_en: string; status: string; donation_id: number; invoice: Invoice | null };
  const [letter, setLetter] = useState<L | null>(null);
  const [saved, setSaved] = useState<{ subject: string; es: string; en: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    api<L>(`/staff/letters/${letterId}`, { token }).then((l) => {
      setLetter(l);
      setSaved({ subject: l.subject, es: l.body_es, en: l.body_en });
    });
  }, [letterId, token]);
  const sent = letter?.status === "sent_simulated";
  const esChanged = !!letter && !!saved && letter.body_es !== saved.es;
  const enChanged = !!letter && !!saved && letter.body_en !== saved.en;
  const subjectChanged = !!letter && !!saved && letter.subject !== saved.subject;
  const dirty = esChanged || enChanged || subjectChanged;

  async function confirmEdit() {
    if (!letter) return;
    setBusy(true); setErr(""); setMsg("");
    const changed = esChanged && enChanged ? "both" : esChanged ? "es" : enChanged ? "en" : "none";
    try {
      const r = await api<{ subject: string; body_es: string; body_en: string }>(`/staff/letters/${letterId}/translate`, {
        token, body: { subject: letter.subject, body_es: letter.body_es, body_en: letter.body_en, changed },
      });
      setLetter({ ...letter, ...r });
      setSaved({ subject: r.subject, es: r.body_es, en: r.body_en });
      setMsg(changed === "en" ? "Saved. #4 Writer translated your English edits into Spanish."
        : changed === "none" ? "Saved." : changed === "both"
          ? "Saved. Both versions were edited, so #4 Writer re-translated the Spanish into English (Spanish is the main version)."
          : "Saved. #4 Writer translated your Spanish edits into English.");
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function send() {
    if (!letter) return;
    try {
      await api(`/staff/letters/${letterId}`, { method: "PUT", token, body: { subject: letter.subject, status: "sent_simulated" } });
      setLetter({ ...letter, status: "sent_simulated" });
      setConfirming(false);
    } catch (e) { setErr((e as Error).message); }
  }
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="panel modal letter-editor" onClick={(e) => e.stopPropagation()}>
        <h3>{sent ? "✓ Sent email" : "Thank-you email · drafted by #4 Writer"}</h3>
        {!letter ? <p className="muted">Loading…</p> : (
          <>
            <label>Subject<input value={letter.subject} readOnly={sent} onChange={(e) => setLetter({ ...letter, subject: e.target.value })} /></label>
            <div className="bilingual">
              <label>Español{esChanged && <em> · edited</em>}
                <textarea rows={11} value={letter.body_es} readOnly={sent} onChange={(e) => setLetter({ ...letter, body_es: e.target.value })} />
              </label>
              <label>English translation{enChanged && <em> · edited</em>}
                <textarea rows={11} value={letter.body_en} readOnly={sent} onChange={(e) => setLetter({ ...letter, body_en: e.target.value })} />
              </label>
            </div>
            {letter.invoice && (
              <p className="note">🧾 Attached receipt <b>{letter.invoice.folio}</b> · {letter.invoice.donor_name} ·{" "}
                {letter.invoice.tax_id ? <>RFC <b>{letter.invoice.tax_id}</b> (tax-deductible)</> : <>no RFC (not deductible)</>}{" "}
                <button className="link" onClick={() => onReceipt(letter.donation_id)}>View receipt</button>
                <br /><small>The receipt note is added automatically at the end of each language.</small>
              </p>
            )}
            <p className="note disclaimer-line">
              {sent
                ? "Marked as sent (prototype — not sent). A sent email can't be changed."
                : dirty
                  ? "You have unconfirmed edits: click “Confirm edition and translate” before sending."
                  : "Prototype — not sent: clicking Send only marks this email as sent. It can't be undone."}
            </p>
            {msg && <p className="muted">{msg}</p>}
            {err && <p className="err">{err}</p>}
            <div className="row">
              <button className="ghost" onClick={onClose}>Close</button>
              {!sent && (
                <button className="ghost" disabled={!dirty || busy} onClick={confirmEdit}>
                  {busy ? "#4 Writer is translating…" : "Confirm edition and translate"}
                </button>
              )}
              {!sent && !confirming && <button disabled={dirty || busy} onClick={() => setConfirming(true)}>Send</button>}
              {!sent && confirming && <button onClick={send}>Confirm send (can't be undone)</button>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ReceiptView({ token, donationId, onClose }: { token: string; donationId: number; onClose: () => void }) {
  const [inv, setInv] = useState<Invoice | null>(null);
  useEffect(() => { api<Invoice>(`/staff/invoices/${donationId}`, { token }).then(setInv); }, [donationId, token]);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="panel modal receipt" onClick={(e) => e.stopPropagation()}>
        {!inv ? <p className="muted">Loading…</p> : (
          <>
            <div className="receipt-head">
              <div><b>💙 {inv.foundation}</b>{inv.foundation_rfc && <small>RFC: {inv.foundation_rfc}</small>}</div>
              <div className="folio"><small>Donation receipt</small><b>{inv.folio}</b></div>
            </div>
            <table className="receipt-table"><tbody>
              <tr><th>Issued</th><td>{new Date(inv.issued_at).toLocaleString()}</td></tr>
              <tr><th>Contributor</th><td>{inv.donor_name} ({inv.donor_type === "legal_entity" ? "legal entity" : "individual"})</td></tr>
              <tr><th>Tax ID (RFC)</th><td>{inv.tax_id ?? "— not provided"}</td></tr>
              <tr><th>Email</th><td>{inv.email}</td></tr>
              <tr><th>Concept</th><td>Donation to the heart-surgery campaign ({inv.frequency === "monthly" ? "monthly payment" : "one-time"})</td></tr>
              <tr><th>Amount</th><td><b>{mxn(inv.amount_mxn)}</b></td></tr>
              <tr><th>Tax-deductible</th><td>{inv.deductible ? "Yes — Fundación Mexicana del Corazón is a SAT-authorized donee" : "No — contributor has not provided an RFC"}</td></tr>
            </tbody></table>
            <p className="note">Prototype receipt. In production, the official CFDI is stamped by an authorized certification provider (PAC) and emailed with the letter.</p>
            <div className="row"><button className="ghost" onClick={() => window.print()}>Print</button><button onClick={onClose}>Close</button></div>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- insights / audit */
function Table({ rows, money = [] }: { rows: Row[]; money?: string[] }) {
  if (!rows?.length) return <p className="muted">No data yet.</p>;
  const cols = Object.keys(rows[0]);
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{cols.map((c) => <th key={c}>{c.replaceAll("_", " ")}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{cols.map((c) => (
              <td key={c}>{money.includes(c) && typeof r[c] === "number" ? mxn(r[c] as number) : typeof r[c] === "object" ? JSON.stringify(r[c]) : String(r[c] ?? "")}</td>
            ))}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface Corr {
  note: string; visits_with_conversations: number; by_topic: Row[]; by_conversation_depth: Row[];
  unanswered_questions: string[]; reported_errors: string[]; referrals: Row[];
}
interface Guidance { teaching_guidance: string; communication_guidance: string; observations: string[]; knowledge_gaps: string[] }
interface ThreadMsg { from: string; to: string; text: string }
interface AccountantCheck { checked: boolean; inconsistencies: string[]; remaining_inconsistencies?: string[] }

function Insights({ token, onAuthError }: { token: string; onAuthError: () => void }) {
  const [dep, setDep] = useState(0);
  const { data } = useLoad<Corr>("/staff/correlation", token, onAuthError, dep);
  const history = useLoad<Row[]>("/staff/guidance", token, onAuthError, dep);
  const [g, setG] = useState<Guidance | null>(null);
  const [thread, setThread] = useState<ThreadMsg[]>([]);
  const [check, setCheck] = useState<AccountantCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function run() {
    setBusy(true); setErr("");
    try {
      const r = await api<{ guidance: Guidance; thread: ThreadMsg[]; accountant_check: AccountantCheck }>("/staff/coordinator/run", { method: "POST", token });
      setG(r.guidance); setThread(r.thread); setCheck(r.accountant_check); setDep((d) => d + 1);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <>
      <h3>#2 Accountant → #3 Coordinator: topics vs. donations</h3>
      <p className="muted">{data?.note} Visits with conversations: {data?.visits_with_conversations ?? "…"}</p>
      <Table rows={data?.by_topic ?? []} money={["avg_yearly_gift_mxn"]} />
      <Table rows={data?.by_conversation_depth ?? []} money={["avg_yearly_gift_mxn"]} />
      <div className="row left">
        <button onClick={run} disabled={busy}>{busy ? "Coordinator is synthesizing…" : "Run #3 Coordinator → update Teacher & Writer guidance"}</button>
      </div>
      {err && <p className="err">{err}</p>}
      {!!thread.length && (
        <div className="card thread">
          <h4>Agent conversation</h4>
          {thread.map((m, i) => (
            <div key={i} className={`bubble-msg ${m.from.startsWith("#3") ? "coord" : "reply"}`}>
              <small>{m.from} → {m.to}</small>
              <p>{m.text}</p>
            </div>
          ))}
          {check && (
            <p className="note">
              {check.inconsistencies.length
                ? `#3 found ${check.inconsistencies.length} inconsistency(ies) in #2's figures and asked for a correction. ` +
                  (check.remaining_inconsistencies?.length ? `Still open: ${check.remaining_inconsistencies.join("; ")}` : "After #2's correction, the figures match the ledger.")
                : "✓ #3 checked #2's figures against the ledger: no inconsistencies, so #2 was not contacted."}
            </p>
          )}
        </div>
      )}
      {g && (
        <div className="card">
          <h4>For the Teacher (#1)</h4><p>{g.teaching_guidance}</p>
          <h4>For the Writer (#4)</h4><p>{g.communication_guidance}</p>
          <h4>Observations</h4><ul>{g.observations.map((o) => <li key={o}>{o}</li>)}</ul>
          <h4>Knowledge gaps to research (trusted sources only)</h4><ul>{g.knowledge_gaps.map((o) => <li key={o}>{o}</li>)}</ul>
        </div>
      )}
      <h3>Questions the Teacher couldn't answer reliably</h3>
      {data?.unanswered_questions?.length ? <ul className="card">{data.unanswered_questions.map((q, i) => <li key={i}>{q}</li>)}</ul> : <p className="muted">None yet.</p>}
      <h3>Errors reported by visitors</h3>
      {data?.reported_errors?.length ? <ul className="card">{data.reported_errors.map((q, i) => <li key={i}>{q}</li>)}</ul> : <p className="muted">None yet.</p>}
      <h3>Referrals between characters</h3>
      <Table rows={data?.referrals ?? []} />
      <h3>Guidance history</h3>
      <Table rows={history.data ?? []} />
    </>
  );
}

function Audit({ token, onAuthError }: { token: string; onAuthError: () => void }) {
  const [dep, setDep] = useState(0);
  const { data } = useLoad<{
    log: Row[]; handoffs: Row[]; totals: Row; per_day: Row[]; per_month: Row[]; by_agent: Row[];
    prices: { model: string; input_per_1m_usd: number; cached_input_per_1m_usd: number; output_per_1m_usd: number };
  }>("/staff/audit", token, onAuthError, dep);
  const usd = (v: unknown) => `$${Number(v ?? 0).toFixed(4)}`;
  return (
    <>
      <div className="row left"><button className="ghost" onClick={() => setDep((d) => d + 1)}>Refresh</button></div>
      {data && (
        <>
          <div className="kpis">
            <div><small>Model calls</small><b>{String(data.totals.calls)}</b></div>
            <div><small>Input tokens</small><b>{Number(data.totals.input_tokens).toLocaleString()}</b></div>
            <div><small>Output tokens</small><b>{Number(data.totals.output_tokens).toLocaleString()}</b></div>
            <div><small>Total cost (USD)</small><b>{usd(data.totals.cost_usd)}</b>
              <em>{data.prices.model}: ${data.prices.input_per_1m_usd}/1M in · ${data.prices.cached_input_per_1m_usd}/1M cached · ${data.prices.output_per_1m_usd}/1M out</em></div>
            <div><small>Cached input tokens</small><b>{Number(data.totals.cached_input_tokens ?? 0).toLocaleString()}</b>
              <em>reused prompt prefix, billed at the cached price</em></div>
          </div>
          <h3>Tokens and cost per month</h3>
          <Table rows={data.per_month} />
          <h3>Tokens and cost per day</h3>
          <Table rows={data.per_day} />
          <h3>Cost by agent</h3>
          <Table rows={data.by_agent} />
        </>
      )}
      <h3>Agent actions (cost per call)</h3>
      <Table rows={(data?.log ?? []).map((r) => ({ ...r, cost_usd: r.cost_usd ? usd(r.cost_usd) : "" }))} />
      <h3>Agent-to-agent handoffs</h3>
      <Table rows={data?.handoffs ?? []} />
    </>
  );
}
