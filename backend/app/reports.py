"""Agent #2 (Accountant) deterministic work: exact numbers, no model needed."""

from __future__ import annotations

import json
from collections import defaultdict

from . import audit, config, db


def impact(amount: float, frequency: str) -> dict:
    yearly = amount * 12 if frequency == "monthly" else amount
    share = yearly / config.SURGERY_COST_MXN
    donors_needed = max(1, round(config.SURGERY_COST_MXN / yearly)) if yearly else None
    return {
        "amount_mxn": amount,
        "frequency": frequency,
        "yearly_mxn": yearly,
        "surgery_cost_mxn": config.SURGERY_COST_MXN,
        "share_of_one_surgery_pct": round(share * 100, 1),
        "surgeries_funded": round(share, 2),
        "donors_like_you_for_one_surgery": donors_needed,
    }


def _month_range(first: str, last: str) -> list[str]:
    y, m = int(first[:4]), int(first[5:7])
    out = []
    while f"{y:04d}-{m:02d}" <= last:
        out.append(f"{y:04d}-{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def budget(log: bool = False) -> dict:
    """Money in and out. Monthly donors pay every month from the month they joined through the
    current month, so the month list is continuous (no gaps) up to today."""
    donations = db.rows("SELECT amount_mxn, frequency, created_at FROM donations ORDER BY created_at")
    now_month = db.now()[:7]
    months = _month_range(donations[0]["created_at"][:7], max(now_month, donations[-1]["created_at"][:7])) \
        if donations else []
    table = []
    cumulative = 0.0
    for m in months:
        one_time = sum(d["amount_mxn"] for d in donations if d["frequency"] == "one_time" and d["created_at"][:7] == m)
        recurring = sum(d["amount_mxn"] for d in donations if d["frequency"] == "monthly" and d["created_at"][:7] <= m)
        new_recurring = sum(1 for d in donations if d["frequency"] == "monthly" and d["created_at"][:7] == m)
        total = one_time + recurring
        cumulative += total
        table.append({
            "month": m,
            "one_time_mxn": one_time,
            "recurring_mxn": recurring,
            "new_recurring_donors": new_recurring,
            "total_mxn": total,
            "surgeries_funded_this_month": round(total / config.SURGERY_COST_MXN, 2),
            "cumulative_mxn": cumulative,
        })
    mrr = sum(d["amount_mxn"] for d in donations if d["frequency"] == "monthly")
    spent = db.one("SELECT COALESCE(SUM(amount_mxn), 0) AS s FROM expenses")["s"]
    donors = db.one("SELECT COUNT(DISTINCT user_id) AS n FROM donations")["n"]
    report = {
        "surgery_cost_mxn": config.SURGERY_COST_MXN,
        "donations_count": len(donations),
        "unique_donors": donors,
        "recurring_monthly_revenue_mxn": mrr,
        "recurring_annualized_mxn": mrr * 12,
        "total_raised_mxn": cumulative,
        "surgeries_funded_to_date": round(cumulative / config.SURGERY_COST_MXN, 2),
        "spent_on_surgeries_mxn": spent,
        "available_mxn": cumulative - spent,
        "surgeries_per_year_from_recurring": round(mrr * 12 / config.SURGERY_COST_MXN, 2),
        "monthly": table,
    }
    if log:
        audit.log("accountant", "compute_budget", {"donations": len(donations), "total_mxn": cumulative})
    return report


def reconcile() -> list[str]:
    """Independent re-computation of the money from the raw ledger (a different code path from
    budget()). Any difference is an inconsistency the Coordinator reports to the Accountant."""
    b = budget()
    rows = db.rows("SELECT amount_mxn, frequency, created_at, user_id FROM donations")
    issues = []
    total = 0.0
    for r in rows:
        if r["frequency"] == "one_time":
            total += r["amount_mxn"]
        else:
            y0, m0 = int(r["created_at"][:4]), int(r["created_at"][5:7])
            last = b["monthly"][-1]["month"] if b["monthly"] else r["created_at"][:7]
            months_paid = (int(last[:4]) - y0) * 12 + int(last[5:7]) - m0 + 1
            total += r["amount_mxn"] * months_paid
    spent = sum(e["amount_mxn"] for e in db.rows("SELECT amount_mxn FROM expenses"))
    checks = [
        ("total raised", b["total_raised_mxn"], total),
        ("sum of monthly totals", sum(m["total_mxn"] for m in b["monthly"]), total),
        ("spent on surgeries", b["spent_on_surgeries_mxn"], spent),
        ("available", b["available_mxn"], total - spent),
        ("number of donations", b["donations_count"], len(rows)),
        ("number of donors", b["unique_donors"], len({r["user_id"] for r in rows})),
    ]
    for name, reported, expected in checks:
        if abs(reported - expected) > 0.01:
            issues.append(f"{name}: reported {reported:,.2f} but the ledger gives {expected:,.2f}")
    return issues


def narrative_numbers_ok(narrative: dict, b: dict) -> list[str]:
    """Every number the Accountant wrote must come from the budget table (no invented figures)."""
    import re
    allowed: list[float] = [float(x) for x in range(0, 13)] + [2025.0, 2026.0, float(config.SURGERY_COST_MXN)]

    def collect(v):
        if isinstance(v, (int, float)):
            v = float(v)
            allowed.extend([v, round(v, 2),
                            round(v / config.SURGERY_COST_MXN, 2), round(v / config.SURGERY_COST_MXN, 1),
                            round(v / 1e6, 2), round(v / 1e6, 1)])  # "3.27 million"
        elif isinstance(v, dict):
            for x in v.values():
                collect(x)
        elif isinstance(v, list):
            for x in v:
                collect(x)
    collect(b)
    text = narrative.get("summary", "") + " " + " ".join(narrative.get("watch_outs", []))
    issues = []
    for raw in re.findall(r"\d[\d,]*(?:\.\d+)?", text):
        n = float(raw.replace(",", ""))
        if not any(abs(n - a) <= 0.011 for a in allowed):  # exact (money must match to the cent)
            issues.append(f"the summary says {raw}, which is not in the budget table")
    return sorted(set(issues))


def correlation() -> dict:
    """Which conversation topics co-occurred with donations (correlation, not causation)."""
    msgs = db.rows("SELECT visit_id, npc_id, topics FROM chat_messages")
    dons = db.rows("SELECT visit_id, amount_mxn, frequency FROM donations WHERE visit_id IS NOT NULL")
    gift: dict[str, float] = defaultdict(float)
    for d in dons:
        gift[d["visit_id"]] += d["amount_mxn"] * (12 if d["frequency"] == "monthly" else 1)

    topics_by_visit: dict[str, set] = defaultdict(set)
    questions_by_visit: dict[str, int] = defaultdict(int)
    for m in msgs:
        topics_by_visit[m["visit_id"]].update(json.loads(m["topics"]))
        questions_by_visit[m["visit_id"]] += 1

    rows = []
    all_topics = sorted({t for ts in topics_by_visit.values() for t in ts})
    for t in all_topics:
        visits = [v for v, ts in topics_by_visit.items() if t in ts]
        donor_visits = [v for v in visits if v in gift]
        rows.append({
            "topic": t,
            "visits_discussing": len(visits),
            "visits_that_donated": len(donor_visits),
            "donation_rate_pct": round(100 * len(donor_visits) / len(visits), 1) if visits else 0,
            "avg_yearly_gift_mxn": round(sum(gift[v] for v in donor_visits) / len(donor_visits)) if donor_visits else 0,
        })
    rows.sort(key=lambda r: (-r["avg_yearly_gift_mxn"], -r["visits_discussing"]))

    depth = []
    for label, lo, hi in [("1-2 questions", 1, 2), ("3-5 questions", 3, 5), ("6+ questions", 6, 10_000)]:
        vs = [v for v, n in questions_by_visit.items() if lo <= n <= hi]
        dv = [v for v in vs if v in gift]
        depth.append({
            "conversation_depth": label,
            "visits": len(vs),
            "donated": len(dv),
            "avg_yearly_gift_mxn": round(sum(gift[v] for v in dv) / len(dv)) if dv else 0,
        })

    gap_re = r"(don.t have reliable|no tengo información confiable|i can.t reliably|i don.t have (?:comparative|reliable|that))"
    import re
    recent = db.rows("SELECT question, answer, topics FROM chat_messages ORDER BY id DESC LIMIT 400")
    unanswered = [m["question"] for m in recent if re.search(gap_re, m["answer"], re.I)][:15]
    errors = [m["question"] for m in recent if "reported_error" in json.loads(m["topics"])][:10]
    referrals = db.rows("SELECT npc_id AS from_npc, refer_to AS to_npc, COUNT(*) AS n FROM chat_messages "
                        "WHERE refer_to IS NOT NULL GROUP BY npc_id, refer_to ORDER BY n DESC")
    result = {
        "note": "Correlation only, not causation. Small samples are noisy.",
        "unanswered_questions": unanswered,
        "reported_errors": errors,
        "referrals": referrals,
        "visits_with_conversations": len(topics_by_visit),
        "by_topic": rows,
        "by_conversation_depth": depth,
    }
    db.handoff("accountant", "coordinator", result)
    audit.log("accountant", "share_correlation_table", {"topics": len(rows), "visits": len(topics_by_visit)})
    return result
