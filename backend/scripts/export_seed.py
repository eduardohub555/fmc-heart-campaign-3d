"""Export the 50 simulated (fictional) donors to backend/seed/demo_seed.json.

Only fictional data is exported: users with sim.donorNN@example.com emails, their donations,
receipts, thank-you letters and the simulated visitors' conversations, plus the latest
Coordinator guidance. Real accounts, payments and audit logs are never exported.

Usage:  ../.venv/bin/python scripts/export_seed.py
"""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from app import config  # noqa: E402

OUT = ROOT / "seed" / "demo_seed.json"


def main() -> None:
    c = sqlite3.connect(config.DB_PATH)
    c.row_factory = sqlite3.Row
    rows = lambda sql, p=(): [dict(r) for r in c.execute(sql, p)]  # noqa: E731
    users = rows("SELECT * FROM users WHERE email LIKE 'sim.donor%@example.com' ORDER BY id")
    uids = [u["id"] for u in users]
    q = ",".join("?" * len(uids))
    donations = rows(f"SELECT * FROM donations WHERE user_id IN ({q}) ORDER BY id", uids)
    dids = [d["id"] for d in donations]
    dq = ",".join("?" * len(dids))
    seed = {
        "users": users,
        "donations": donations,
        "invoices": rows(f"SELECT * FROM invoices WHERE donation_id IN ({dq}) ORDER BY id", dids),
        "letters": rows(f"SELECT * FROM letters WHERE donation_id IN ({dq}) ORDER BY id", dids),
        "chat_messages": rows("SELECT * FROM chat_messages WHERE visit_id LIKE 'sim-%' ORDER BY id"),
        "guidance": rows("""SELECT * FROM guidance WHERE id IN (
                              SELECT MAX(id) FROM guidance WHERE kind IN ('teaching','communication','knowledge_gaps')
                              GROUP BY kind) ORDER BY id"""),
    }
    for u in seed["users"]:
        assert u["email"].endswith("@example.com"), u["email"]
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(seed, ensure_ascii=False, indent=0))
    print({k: len(v) for k, v in seed.items()}, f"-> {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
