"""Audit trail: every agent action (model call or deterministic step) is logged."""

from __future__ import annotations

import json
from typing import Any

from . import db


def log(
    agent: str,
    action: str,
    detail: dict[str, Any],
    *,
    visit_id: str | None = None,
    status: str = "ok",
    usage: Any = None,
    latency_ms: int | None = None,
) -> None:
    db.execute(
        """INSERT INTO audit_log
           (ts, agent, action, visit_id, status, detail, input_tokens, output_tokens, latency_ms)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (
            db.now(),
            agent,
            action,
            visit_id,
            status,
            json.dumps(detail, ensure_ascii=False)[:4000],
            getattr(usage, "input_tokens", None),
            getattr(usage, "output_tokens", None),
            latency_ms,
        ),
    )
