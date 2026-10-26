"""Give the 50 simulated donors fictional RFCs, then have the Writer draft every
thank-you email (with its donation receipt) and verify each one.

Checks per donation:
  * the letter is signed with the patient's first name, with no [placeholders]
  * one-time donors are invited to give again; monthly donors see "contribución adicional"
  * a receipt exists, its amount, contributor name and tax ID match the donation
  * the email's receipt note quotes exactly that RFC (or asks for one when missing)

Usage (backend running on :8000):  ../.venv/bin/python scripts/verify_letters.py
"""

from __future__ import annotations

import json
import random
import re
import sqlite3
import sys
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from app import config  # noqa: E402
from scripts.simulate_50 import call, staff_token  # noqa: E402

random.seed(2026)
ALNUM = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789"


def letters_only(s: str) -> str:
    s = unicodedata.normalize("NFD", s.upper())
    return "".join(c for c in s if "A" <= c <= "Z")


def fake_rfc(name: str, company: bool) -> str:
    """Correctly formatted but fictional RFC."""
    parts = [letters_only(p) for p in name.split() if letters_only(p)]
    if company:
        head = "".join(p[0] for p in parts)[:3].ljust(3, "X")
    else:
        first, last = parts[0], parts[-1]
        vowel = next((c for c in last[1:] if c in "AEIOU"), "X")
        head = last[0] + vowel + "X" + first[0]
    date = f"{random.randint(60, 99):02d}{random.randint(1, 12):02d}{random.randint(1, 28):02d}" if not company \
        else f"{random.randint(5, 20):02d}{random.randint(1, 12):02d}{random.randint(1, 28):02d}"
    return head + date + "".join(random.choice(ALNUM) for _ in range(3))


def assign_rfcs() -> None:
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """SELECT d.id, d.donor_type, d.legal_name, u.id AS uid, u.first_name, u.last_name
           FROM donations d JOIN users u ON u.id = d.user_id WHERE u.email LIKE 'sim.donor%'""").fetchall()
    already = any(conn.execute("SELECT 1 FROM donations d JOIN users u ON u.id = d.user_id "
                               "WHERE u.email LIKE 'sim.donor%' AND d.tax_id IS NOT NULL LIMIT 1"))
    for r in ([] if already else rows):  # keep RFCs (and receipts) from an earlier run
        company = r["donor_type"] == "legal_entity"
        if random.random() < 0.16:  # some contributors don't give a tax ID
            rfc = None
        else:
            rfc = fake_rfc(r["legal_name"] if company else f"{r['first_name']} {r['last_name']}", company)
        conn.execute("UPDATE donations SET tax_id = ? WHERE id = ?", (rfc, r["id"]))
        if not company:
            conn.execute("UPDATE users SET tax_id = ? WHERE id = ?", (rfc, r["uid"]))
    # fresh drafts so every simulated donation gets one new letter + receipt
    ids = [r["id"] for r in rows]
    conn.execute(f"DELETE FROM letters WHERE donation_id IN ({','.join('?' * len(ids))})", ids)
    if not already:
        conn.execute(f"DELETE FROM invoices WHERE donation_id IN ({','.join('?' * len(ids))})", ids)
    conn.commit()
    conn.close()


def check(d: dict, out: dict) -> list[str]:
    issues = []
    if "body" not in out:
        return [f"writer error: {out}"]
    body = out["body"]
    if not out.get("subject", "").startswith("Fundación Mexicana del Corazón - "):
        issues.append(f"subject without foundation prefix: {out.get('subject')!r}")
    spanish, _, english = body.partition("\n\n— English translation —\n\n")
    if len(english.split()) < 40:
        issues.append("missing English translation")
    elif not re.search(r"\b(thank|thanks|grateful)\b", english, re.I):
        issues.append("translation doesn't read as English")
    if d["frequency"] == "monthly" and not re.search(r"constant support", english, re.I):
        issues.append("monthly: translation doesn't thank for constant support")
    letter, _, note = spanish.partition("\n\n—\n")
    first = d["patient"].split()[-1] if d["patient"].startswith("Do") else d["patient"].split()[0]
    last_lines = [ln.strip() for ln in letter.strip().splitlines() if ln.strip()][-2:]
    if not any(first in ln for ln in last_lines):
        issues.append(f"not signed by {first}: ends with {last_lines!r}")
    if re.search(r"\[[^\]]{2,}\]", body):
        issues.append("placeholder in brackets")
    if d["frequency"] == "monthly" and not re.search(r"contribuci[oó]n adicional", letter, re.I):
        issues.append("monthly donor without 'contribución adicional'")
    if d["frequency"] == "monthly" and not re.search(r"apoyo constante|constante apoyo", letter, re.I):
        issues.append("monthly donor not thanked for constant support")
    if d["frequency"] == "one_time" and not re.search(r"(volver a|de nuevo|otra vez|nuevamente|seguir apoyando|seguir ayudando|otra donaci|otro donativo|vuelva)", letter, re.I):
        issues.append("one-time donor without invitation to give again")
    inv = out.get("invoice") or {}
    expected_name = d["legal_name"] if d["donor_type"] == "legal_entity" else f"{d['first_name']} {d['last_name']}"
    if inv.get("donor_name") != expected_name:
        issues.append(f"receipt name {inv.get('donor_name')!r} != {expected_name!r}")
    if inv.get("tax_id") != d["tax_id"]:
        issues.append(f"receipt RFC {inv.get('tax_id')} != donation RFC {d['tax_id']}")
    if abs((inv.get("amount_mxn") or 0) - d["amount_mxn"]) > 0.01:
        issues.append("receipt amount mismatch")
    if bool(inv.get("deductible")) != bool(d["tax_id"]):
        issues.append("deductible flag wrong")
    if d["tax_id"] and d["tax_id"] not in note:
        issues.append("email note does not quote the RFC")
    if not d["tax_id"] and "RFC" not in note:
        issues.append("email note does not ask for an RFC")
    return issues


def main() -> None:
    assign_rfcs()
    tok = staff_token()
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    donations = [dict(r) for r in conn.execute(
        """SELECT d.id, d.amount_mxn, d.frequency, d.donor_type, d.legal_name, d.tax_id,
                  u.first_name, u.last_name, p.alias AS patient
           FROM donations d JOIN users u ON u.id = d.user_id JOIN patients p ON p.id = d.patient_id
           WHERE u.email LIKE 'sim.donor%' ORDER BY d.id""").fetchall()]
    conn.close()
    with ThreadPoolExecutor(max_workers=5) as pool:
        outs = list(pool.map(lambda d: call("/staff/letters", {"donation_id": d["id"], "language": "es"}, token=tok),
                             donations))
    results = []
    for d, out in zip(donations, outs):
        results.append({"donation": d, "letter": out, "issues": check(d, out)})
    (ROOT / "data" / "letters_check.json").write_text(json.dumps(results, ensure_ascii=False, indent=1))
    bad = [r for r in results if r["issues"]]
    print(f"letters: {len(results)}  with issues: {len(bad)}  "
          f"deductible: {sum(1 for r in results if r['donation']['tax_id'])}  "
          f"companies: {sum(1 for r in results if r['donation']['donor_type'] == 'legal_entity')}")
    for r in bad:
        print(f"\n#{r['donation']['id']} {r['donation']['donor_type']} {r['donation']['frequency']}: {r['issues']}")
        print(r["letter"].get("body", r["letter"])[-400:])


if __name__ == "__main__":
    main()
