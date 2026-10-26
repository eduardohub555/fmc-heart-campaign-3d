export type Lang = "es" | "en";

export interface Persona {
  name: string;
  age: number;
  kind: "doctor" | "kid" | "parent" | "grandparent";
  role_es: string;
  role_en: string;
  story_es: string;
  story_en: string;
  goodbye_es?: string;
  goodbye_en?: string;
}

export interface Source { id: string; title: string; publisher: string; url: string }
export interface ChatReply { answer: string; topics: string[]; sources: Source[]; followups: string[]; refer_to: string | null }
export interface User {
  id: number; first_name: string; last_name: string; company: string | null; email: string;
  wall_name: string | null; wall_anonymous: number; tax_id: string | null;
}
export interface Impact {
  amount_mxn: number; frequency: string; yearly_mxn: number; surgery_cost_mxn: number;
  share_of_one_surgery_pct: number; surgeries_funded: number; donors_like_you_for_one_surgery: number | null;
}
export interface WallEntry { name: string; anonymous: boolean; weight: number; logo: string | null }

const DONOR_KEY = "donor_token";
const STAFF_KEY = "staff_token";

export const tokens = {
  donor: () => sessionStorage.getItem(DONOR_KEY),
  setDonor: (t: string | null) => (t ? sessionStorage.setItem(DONOR_KEY, t) : sessionStorage.removeItem(DONOR_KEY)),
  staff: () => sessionStorage.getItem(STAFF_KEY),
  setStaff: (t: string | null) => (t ? sessionStorage.setItem(STAFF_KEY, t) : sessionStorage.removeItem(STAFF_KEY)),
};

export async function api<T>(path: string, opts: { method?: string; body?: unknown; token?: string | null } = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = (data as { detail?: unknown }).detail;
    const msg = typeof detail === "string" ? detail
      : Array.isArray(detail) ? detail.map((d: { msg?: string }) => d.msg).join("; ")
      : `Error ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

export function visitId(): string {
  let v = sessionStorage.getItem("visit_id");
  if (!v) {
    v = crypto.randomUUID();
    sessionStorage.setItem("visit_id", v);
  }
  return v;
}

export const mxn = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
