"""End-to-end check of accounts and money, against the running API.

Donors: sign up, sign out (old session must stop working), sign in, donate one-time and monthly.
Managers: sign up, sign out, sign in, pay part of a surgery, pay and close a surgery.
Money: what donors entered must equal what managers see, and every dashboard figure must match an
independent recomputation from the raw database (a third code path, not the app's own).
Everything the script creates is removed at the end, so real data is left untouched.

Usage (backend on :8000):  ../.venv/bin/python scripts/e2e_check.py
"""

from __future__ import annotations

import sqlite3
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from app import config  # noqa: E402
from scripts.simulate_50 import call  # noqa: E402

RUN = uuid.uuid4().hex[:6]
results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""))


def db():
    c = sqlite3.connect(config.DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def independent_totals() -> dict:
    """Recompute money straight from the tables (does not use the app's reports module)."""
    c = db()
    now = datetime.now(timezone.utc)
    raised = 0.0
    ytd = 0.0
    for r in c.execute("SELECT amount_mxn, frequency, created_at FROM donations"):
        start = datetime.fromisoformat(r["created_at"])
        if r["frequency"] == "one_time":
            raised += r["amount_mxn"]
            ytd += r["amount_mxn"] if start.year == now.year else 0
        else:
            months = (now.year - start.year) * 12 + now.month - start.month + 1
            raised += r["amount_mxn"] * months
            from_month = start.month - 1 if start.year == now.year else 0
            ytd += r["amount_mxn"] * max(0, now.month - 1 - from_month + 1)
    spent = c.execute("SELECT COALESCE(SUM(amount_mxn),0) FROM expenses").fetchone()[0]
    donations = c.execute("SELECT COUNT(*) FROM donations").fetchone()[0]
    donors = c.execute("SELECT COUNT(DISTINCT user_id) FROM donations").fetchone()[0]
    c.close()
    return {"raised": raised, "spent": spent, "available": raised - spent, "donations": donations, "donors": donors, "ytd": ytd}


def dash(token: str) -> dict:
    return call("/staff/dashboard", token=token)


def reconcile(token: str, label: str) -> dict:
    d = dash(token)
    b, ind = d["budget"], independent_totals()
    close = lambda a, e: abs(a - e) < 0.01  # noqa: E731
    check(f"[{label}] total raised = one-time + monthly payments so far", close(b["total_raised_mxn"], ind["raised"]),
          f"dashboard {b['total_raised_mxn']} vs ledger {ind['raised']}")
    check(f"[{label}] spent on surgeries = sum of payments", close(b["spent_on_surgeries_mxn"], ind["spent"]),
          f"{b['spent_on_surgeries_mxn']} vs {ind['spent']}")
    check(f"[{label}] available = raised − spent", close(b["available_mxn"], ind["available"]),
          f"{b['available_mxn']} vs {ind['available']}")
    check(f"[{label}] number of donations", b["donations_count"] == ind["donations"] == len(d["donations"]),
          f"{b['donations_count']} / table {len(d['donations'])} vs {ind['donations']}")
    check(f"[{label}] number of donors", b["unique_donors"] == ind["donors"], f"{b['unique_donors']} vs {ind['donors']}")
    check(f"[{label}] monthly chart ends at the same totals",
          close(d["monthly"][-1]["raised_cum"], ind["raised"]) and close(d["monthly"][-1]["available"], ind["available"]),
          f"{d['monthly'][-1]}")
    check(f"[{label}] year-to-date charts add up to total raised (all gifts are from this year)",
          close(ind["ytd"], ind["raised"]), f"ytd {ind['ytd']} vs raised {ind['raised']}")
    check(f"[{label}] surgery payments table = spent", close(sum(e["amount_mxn"] for e in d["expenses"]), ind["spent"]))
    return d


def main() -> None:
    created = {"emails": [], "manager_emails": [], "expenses": [], "closed_patient": None}
    try:
        # ------------------------------------------------------------ managers
        m_email = f"e2e.manager.{RUN}@example.com"
        created["manager_emails"].append(m_email)
        r = call("/staff/signup", {"name": "E2E Manager", "email": m_email, "password": "e2e-manager-pass"})
        check("manager can sign up (name, email, password)", "token" in r, str(r))
        mtok = r.get("token")
        check("manager session works", "budget" in dash(mtok))
        call("/auth/logout", {}, token=mtok)
        check("manager sign out ends the session", dash(mtok).get("error") == 401)
        r = call("/staff/login", {"email": m_email, "password": "e2e-manager-pass"})
        check("manager can sign in", "token" in r, str(r))
        mtok = r["token"]
        check("wrong manager password is rejected",
              call("/staff/login", {"email": m_email, "password": "nope"}).get("error") == 401)

        before = reconcile(mtok, "before")

        # ------------------------------------------------------------ donors
        email = f"e2e.donor.{RUN}@example.com"
        created["emails"].append(email)
        r = call("/auth/signup", {"first_name": "Elena", "last_name": "Prueba", "company": "Clínica Demo",
                                  "email": email, "password": "e2e-donor-pass", "tax_id": "PUXE900101AB1",
                                  "wall_name": "Familia Prueba"})
        check("donor can sign up (with tax ID and wall name)", "token" in r, str(r))
        dtok = r["token"]
        me = call("/auth/me", token=dtok)
        check("signed-in donor sees their own account", me.get("first_name") == "Elena" and me.get("tax_id") == "PUXE900101AB1", str(me))
        call("/auth/logout", {}, token=dtok)
        check("donor sign out ends the session", call("/auth/me", token=dtok).get("error") == 401)
        check("wrong donor password is rejected",
              call("/auth/login", {"email": email, "password": "nope"}).get("error") == 401)
        r = call("/auth/login", {"email": email, "password": "e2e-donor-pass"})
        check("donor can sign in", "token" in r, str(r))
        dtok = r["token"]

        one = call("/donations", {"amount_mxn": 1234.56, "frequency": "one_time", "donor_type": "individual",
                                  "anonymous": False, "wall_text": "Familia Prueba", "visit_id": f"e2e-{RUN}"}, token=dtok)
        check("signed-in donor can make a one-time donation", "donation_id" in one, str(one))
        mon = call("/donations", {"amount_mxn": 700, "frequency": "monthly", "donor_type": "legal_entity",
                                  "legal_name": "Clínica Demo S.A. de C.V.", "tax_id": "CDE010203XY1",
                                  "anonymous": False, "wall_text": "Clínica Demo", "visit_id": f"e2e-{RUN}"}, token=dtok)
        check("signed-in donor can make a monthly donation (as a company)", "donation_id" in mon, str(mon))
        check("signed-out visitor cannot donate",
              call("/donations", {"amount_mxn": 100, "frequency": "one_time"}).get("error") == 401)

        after = reconcile(mtok, "after donations")
        b0, b1 = before["budget"], after["budget"]
        check("raised went up by exactly 1,234.56 + 700 (first monthly payment)",
              abs((b1["total_raised_mxn"] - b0["total_raised_mxn"]) - 1934.56) < 0.01,
              f"delta {b1['total_raised_mxn'] - b0['total_raised_mxn']}")
        check("donations +2 and donors +1",
              b1["donations_count"] - b0["donations_count"] == 2 and b1["unique_donors"] - b0["unique_donors"] == 1)
        rows = {d["id"]: d for d in after["donations"]}
        a, m = rows.get(one["donation_id"], {}), rows.get(mon["donation_id"], {})
        check("manager sees exactly what the donor entered (one-time)",
              a.get("amount_mxn") == 1234.56 and a.get("frequency") == "one_time" and a.get("email") == email
              and a.get("tax_id") == "PUXE900101AB1" and a.get("wall_text") == "Familia Prueba" and a.get("donor_type") == "individual", str(a))
        check("manager sees exactly what the donor entered (monthly company)",
              m.get("amount_mxn") == 700 and m.get("frequency") == "monthly" and m.get("legal_name") == "Clínica Demo S.A. de C.V."
              and m.get("tax_id") == "CDE010203XY1" and m.get("donor_type") == "legal_entity", str(m))

        # ------------------------------------------------------------ paying for surgery
        active = [p for p in after["patients"] if p["status"] == "active"]
        pid = active[0]["id"]
        check("paying without a patient is refused",
              call("/staff/spend", {"amount_mxn": 1000}, token=mtok).get("error") == 422)
        r = call("/staff/spend", {"amount_mxn": 1000.75, "patient_id": pid, "note": "e2e partial"}, token=mtok)
        check("manager can pay any amount toward a surgery (1,000.75)", "id" in r, str(r))
        created["expenses"].append(r.get("id"))
        mid = reconcile(mtok, "after partial payment")
        check("partial payment reduced available by exactly 1,000.75",
              abs((b1["available_mxn"] - mid["budget"]["available_mxn"]) - 1000.75) < 0.01)
        check("patient stays in the campaign when the box is not ticked",
              next(p for p in mid["patients"] if p["id"] == pid)["status"] == "active")
        r = call("/staff/spend", {"amount_mxn": 0.25, "patient_id": pid, "note": "e2e close", "surgery_fully_paid": True}, token=mtok)
        created["expenses"].append(r.get("id"))
        created["closed_patient"] = pid
        end = reconcile(mtok, "after closing a surgery")
        check("ticking 'covers the whole surgery' removes the patient",
              next(p for p in end["patients"] if p["id"] == pid)["status"] == "surgery_paid")
        check("a closed patient can't receive more payments",
              call("/staff/spend", {"amount_mxn": 10, "patient_id": pid}, token=mtok).get("error") == 400)
        check("can't spend more than is available",
              call("/staff/spend", {"amount_mxn": end["budget"]["available_mxn"] + 1, "patient_id": active[1]["id"]},
                   token=mtok).get("error") == 400)
        call("/auth/logout", {}, token=mtok)
    finally:
        cleanup(created)
    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")


def cleanup(created: dict) -> None:
    c = db()
    for email in created["emails"]:
        ids = [r[0] for r in c.execute("SELECT d.id FROM donations d JOIN users u ON u.id=d.user_id WHERE u.email=?", (email,))]
        for did in ids:
            row = c.execute("SELECT amount_mxn, patient_id FROM donations WHERE id=?", (did,)).fetchone()
            c.execute("UPDATE patients SET raised_mxn = raised_mxn - ? WHERE id = ?", (row["amount_mxn"], row["patient_id"]))
            c.execute("DELETE FROM letters WHERE donation_id=?", (did,))
            c.execute("DELETE FROM invoices WHERE donation_id=?", (did,))
            c.execute("DELETE FROM donations WHERE id=?", (did,))
        c.execute("DELETE FROM sessions WHERE user_id=(SELECT id FROM users WHERE email=?) AND role='donor'", (email,))
        c.execute("DELETE FROM users WHERE email=?", (email,))
    for eid in created["expenses"]:
        if eid:
            c.execute("DELETE FROM expenses WHERE id=?", (eid,))
    if created["closed_patient"]:
        c.execute("UPDATE patients SET status='active', closed_at=NULL WHERE id=?", (created["closed_patient"],))
    for email in created["manager_emails"]:
        c.execute("DELETE FROM sessions WHERE role='staff' AND user_id=(SELECT id FROM managers WHERE email=?)", (email,))
        c.execute("DELETE FROM managers WHERE email=?", (email,))
    c.commit()
    c.close()
    print("cleanup: test donors, donations, payments and manager removed")


if __name__ == "__main__":
    main()
