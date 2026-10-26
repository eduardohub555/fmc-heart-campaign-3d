"""SQLite storage. Passwords are never stored — only salted scrypt hashes."""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    company TEXT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER,
    role TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY,
    visit_id TEXT NOT NULL,
    npc_id TEXT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    topics TEXT NOT NULL,
    sources TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS handoffs (
    id INTEGER PRIMARY KEY,
    from_agent TEXT NOT NULL,
    to_agent TEXT NOT NULL,
    visit_id TEXT,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS patients (
    id INTEGER PRIMARY KEY,
    alias TEXT NOT NULL,
    age INTEGER NOT NULL,
    city TEXT NOT NULL,
    condition TEXT NOT NULL,
    procedure TEXT NOT NULL,
    raised_mxn REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS donations (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    visit_id TEXT,
    amount_mxn REAL NOT NULL,
    frequency TEXT NOT NULL,
    display_mode TEXT NOT NULL,
    display_name TEXT,
    patient_id INTEGER NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS guidance (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS letters (
    id INTEGER PRIMARY KEY,
    donation_id INTEGER NOT NULL,
    patient_id INTEGER NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS managers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY,
    amount_mxn REAL NOT NULL,
    patient_id INTEGER,
    note TEXT,
    manager TEXT,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY,
    donation_id INTEGER NOT NULL UNIQUE,
    folio TEXT NOT NULL UNIQUE,
    issued_at TEXT NOT NULL,
    donor_name TEXT NOT NULL,
    donor_type TEXT NOT NULL,
    tax_id TEXT,
    email TEXT NOT NULL,
    amount_mxn REAL NOT NULL,
    frequency TEXT NOT NULL,
    deductible INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY,
    ts TEXT NOT NULL,
    agent TEXT NOT NULL,
    action TEXT NOT NULL,
    visit_id TEXT,
    status TEXT NOT NULL,
    detail TEXT NOT NULL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    latency_ms INTEGER
);
"""

# Fictional, illustrative patients (no real people). The campaign assigns each
# donor one patient, who later writes them thank-you letters with the Writer's help.
SEED_PATIENTS = [
    ("Valentina", 6, "Oaxaca", "Congenital heart defect (ventricular septal defect)", "Surgical closure of the defect"),
    ("Don Ernesto", 67, "Estado de México", "Coronary artery disease after a heart attack", "Coronary artery bypass surgery"),
    ("Doña Rosa", 59, "Puebla", "Rheumatic mitral valve disease", "Mitral valve replacement"),
    ("Luis", 14, "Guerrero", "Congenital aortic valve stenosis", "Aortic valve repair"),
    ("Carmen", 45, "Ciudad de México", "Severe aortic valve disease", "Aortic valve replacement"),
]


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init() -> None:
    config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect() as c:
        c.executescript(SCHEMA)
        # Columns added after the first release.
        for table, col, decl in [
            ("chat_messages", "refer_to", "TEXT"),
            ("users", "wall_name", "TEXT"),
            ("users", "wall_anonymous", "INTEGER NOT NULL DEFAULT 0"),
            ("donations", "donor_type", "TEXT NOT NULL DEFAULT 'individual'"),
            ("donations", "legal_name", "TEXT"),
            ("donations", "logo", "TEXT"),
            ("letters", "status", "TEXT NOT NULL DEFAULT 'draft'"),
            ("users", "tax_id", "TEXT"),
            ("patients", "status", "TEXT NOT NULL DEFAULT 'active'"),
            ("letters", "body_es", "TEXT"),
            ("letters", "body_en", "TEXT"),
            ("patients", "closed_at", "TEXT"),
            ("donations", "tax_id", "TEXT"),
            ("letters", "updated_at", "TEXT"),
        ]:
            if col not in {r[1] for r in c.execute(f"PRAGMA table_info({table})")}:
                c.execute(f"ALTER TABLE {table} ADD COLUMN {col} {decl}")
        if c.execute("SELECT COUNT(*) FROM patients").fetchone()[0] == 0:
            c.executemany(
                "INSERT INTO patients (alias, age, city, condition, procedure) VALUES (?,?,?,?,?)",
                SEED_PATIENTS,
            )


def rows(sql: str, params: tuple = ()) -> list[dict[str, Any]]:
    with connect() as c:
        return [dict(r) for r in c.execute(sql, params).fetchall()]


def one(sql: str, params: tuple = ()) -> dict[str, Any] | None:
    found = rows(sql, params)
    return found[0] if found else None


def execute(sql: str, params: tuple = ()) -> int:
    with connect() as c:
        return c.execute(sql, params).lastrowid or 0


def handoff(from_agent: str, to_agent: str, payload: Any, visit_id: str | None = None) -> None:
    execute(
        "INSERT INTO handoffs (from_agent, to_agent, visit_id, payload, created_at) VALUES (?,?,?,?,?)",
        (from_agent, to_agent, visit_id, json.dumps(payload, ensure_ascii=False), now()),
    )
