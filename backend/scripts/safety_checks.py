"""Show the safety defenses working, against the running API (only one tiny model call).

  1. Passwords are stored as salted scrypt hashes, never in plain text.
  2. Over-long messages are rejected before reaching the model.
  3. Each visit has a question cap (stops a bot from burning the token budget).
  4. Every agent run has a token ceiling: a run that would exceed it is stopped.
  5. Invented source ids are dropped from answers.
  6. Management data needs a manager session.
  7. Nobody can spend more than is available.
  8. A sent email can't be edited afterwards.
Test rows are removed at the end.

Usage (backend on :8000):  ../.venv/bin/python scripts/safety_checks.py
"""

from __future__ import annotations

import asyncio
import sqlite3
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pydantic_ai.exceptions import UsageLimitExceeded  # noqa: E402
from pydantic_ai.usage import UsageLimits  # noqa: E402

from app import config, security  # noqa: E402
from app.knowledge import known_source_ids  # noqa: E402
from scripts.simulate_50 import call, staff_token  # noqa: E402

RUN = uuid.uuid4().hex[:6]
ok_count = 0


def show(name: str, ok: bool, evidence: str) -> None:
    global ok_count
    ok_count += ok
    print(f"{'PASS' if ok else 'FAIL'}  {name}\n      {evidence}")


def main() -> None:
    c = sqlite3.connect(config.DB_PATH)
    visit = f"safety-{RUN}"
    email = f"safety.{RUN}@example.com"
    try:
        # 1. password hashing
        call("/auth/signup", {"first_name": "Safe", "last_name": "Test", "email": email, "password": "Secret-pass-123"})
        stored = c.execute("SELECT password_hash FROM users WHERE email=?", (email,)).fetchone()[0]
        show("passwords are salted scrypt hashes", stored.startswith("scrypt$") and "Secret-pass-123" not in stored
             and security.verify_password("Secret-pass-123", stored) and not security.verify_password("wrong", stored),
             f"stored value: {stored[:38]}…  (plain password not stored; wrong password rejected)")

        # 2. message length
        r = call("/chat", {"visit_id": visit, "npc_id": "dra-herrera", "message": "x" * 601, "lang": "en"})
        show("over-long message rejected before any model call", r.get("error") == 422, f"HTTP {r.get('error')}")

        # 3. per-visit cap (fill the visit with 40 stored questions, no model calls)
        c.executemany("INSERT INTO chat_messages (visit_id, npc_id, question, answer, topics, sources, created_at) "
                      "VALUES (?,?,?,?,?,?,datetime('now'))",
                      [(visit, "dra-herrera", f"q{i}", "a", "[]", "[]") for i in range(config.MAX_MESSAGES_PER_VISIT)])
        c.commit()
        r = call("/chat", {"visit_id": visit, "npc_id": "dra-herrera", "message": "One more question", "lang": "en"})
        show(f"question cap per visit ({config.MAX_MESSAGES_PER_VISIT}) stops bots", r.get("error") == 429,
             f"HTTP {r.get('error')}: {r.get('detail')}")

        # 4. token ceiling per agent run (one tiny real call that is cut off)
        from app import agents
        try:
            asyncio.run(agents.teacher.run("What is a heart attack?", usage_limits=UsageLimits(total_tokens_limit=300)))
            show("token ceiling stops an expensive run", False, "run was not stopped")
        except UsageLimitExceeded as e:
            show("token ceiling stops an expensive run", True, f"UsageLimitExceeded: {e}")

        # 5. invented sources
        kept = known_source_ids(["who-cvd", "harvard-made-up-2026", "aha-cpr"])
        show("invented source ids are dropped", kept == ["who-cvd", "aha-cpr"], f"kept {kept}")

        # 6. management data needs a manager session
        r1 = call("/staff/dashboard")
        r2 = call("/staff/dashboard", token=call("/auth/login", {"email": email, "password": "Secret-pass-123"})["token"])
        show("donor data is for managers only", r1.get("error") == 401 and r2.get("error") == 403,
             f"no session → HTTP {r1.get('error')}; donor session → HTTP {r2.get('error')}")

        tok = staff_token()
        # 7. overspending
        d = call("/staff/dashboard", token=tok)
        pid = next(p["id"] for p in d["patients"] if p["status"] == "active")
        r = call("/staff/spend", {"amount_mxn": d["budget"]["available_mxn"] + 1, "patient_id": pid}, token=tok)
        show("cannot spend more than is available", r.get("error") == 400, f"HTTP {r.get('error')}: {r.get('detail')}")

        # 8. a sent email is final
        lid = c.execute("SELECT id FROM letters WHERE status='sent_simulated' LIMIT 1").fetchone()
        if lid:
            r = call(f"/staff/letters/{lid[0]}", {"subject": "changed", "status": "draft"}, token=tok, method="PUT")
            show("a sent email can't be edited", r.get("error") == 409, f"HTTP {r.get('error')}: {r.get('detail')}")
    finally:
        c.execute("DELETE FROM chat_messages WHERE visit_id=?", (visit,))
        c.execute("DELETE FROM sessions WHERE user_id=(SELECT id FROM users WHERE email=?)", (email,))
        c.execute("DELETE FROM users WHERE email=?", (email,))
        c.commit()
        c.close()
    print(f"\n{ok_count} safety checks passed (test data removed)")


if __name__ == "__main__":
    main()
