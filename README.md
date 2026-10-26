# Fundación Mexicana del Corazón — Virtual garden for a heart-surgery campaign

A 3D walk through the gardens of the Instituto Nacional de Cardiología (INC). Visitors
learn about heart health from doctors and families and, only if they want to, enter the
hospital to donate toward surgeries (≈ 200,000 MXN each) for people who can't afford them.

- **Backend:** Python, FastAPI, PydanticAI, SQLite (`backend/`)
- **Frontend:** React, Vite, TypeScript, three.js via @react-three/fiber (`frontend/`)
- **Model:** `gpt-6-luna` through Portkey, and nothing else. The name is set in one place:
  `backend/app/config.py`.

## Deploy on Render

The repository includes a Render Blueprint (`render.yaml`) and a `Dockerfile`. They define a
single free web service: the container builds the 3D frontend and runs FastAPI, which serves
both the app and `/api`.

1. In Render, go to **New → Blueprint** and pick this repository (branch `main`).
2. When asked, paste your `PORTKEY_API_KEY`. Render generates `ADMIN_PASSWORD` itself; you can
   see it under the service's **Environment** tab (the username is `staff`).
3. Open the service URL. The management dashboard is at `/#/staff`.

Note: on Render's free plan, the disk is temporary. The SQLite database (donations, accounts,
letters) resets when the service restarts or redeploys. For lasting data, add a Render
persistent disk mounted at `/app/backend/data` (paid plans) or move to a hosted database.

## Setup (first time)

You need Python 3.12+ and Node 20+. From the repository root:

```bash
python3 -m venv .venv && .venv/bin/pip install -r backend/requirements.txt
```

```bash
cd frontend && npm install
```

```bash
cp .env.example .env
```

Then fill in `.env`: your `PORTKEY_API_KEY` and an admin password.

## Run

Start each command in its own terminal tab, from the repository root.

```bash
cd backend && PYDANTIC_AI_NO_BANNER=1 ../.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

```bash
cd frontend && npm run dev
```

Then open http://localhost:5173. The staff dashboard is at http://localhost:5173/#/staff.
The database (`backend/data/app.db`) is created automatically on first start, with the five
illustrative patients.

## Secrets

All secrets live only in `.env` files, which are never committed:

- `.env` in the repository root holds `PORTKEY_API_KEY` and `ADMIN_USERNAME` / `ADMIN_PASSWORD`
  (the built-in management login). See `.env.example`.
- Optionally add `FOUNDATION_RFC` so the foundation's tax ID appears on receipts.
- The app also reads a `.env` one folder up, if there is one (that's how the course setup shares
  the Portkey key).

Donor passwords are never stored. The app keeps only a salted **scrypt** hash in SQLite.
Session tokens are random, and the database stores only their SHA-256 hash.

## The four agents (`backend/app/agents.py`)

| # | Agent | What it does | Model? |
|---|-------|--------------|--------|
| 1 | **Teacher** | Answers in the voice of each doctor, child, parent or grandparent. It may use only the curated knowledge base (`knowledge.py`: WHO, INEGI, AHA, NIH, INC, SAT) and must cite source IDs; the backend drops any ID it doesn't recognize. When a chat ends, it sends a Q&A report to #2. It also suggests unexplored topics to visitors. | Yes, per question |
| 2 | **Accountant** | Records donations. Computes the monthly budget and a "topics vs. donations" correlation table in Python, so the numbers are exact and cost nothing. Sends that table to #3. Writes a short management summary on request. | Only for the summary |
| 3 | **Coordinator** | Turns #2's table and #4's recent drafts into *teaching* guidance for #1 and *communication* guidance for #4. It is told to aim for better education, never more donations. | On request |
| 4 | **Writer** | Drafts thank-you letters from patients to donors and **never sends them**. One-time donors get a gentle invitation to give again; monthly donors see "additional contribution" wording. | On request |

**Honesty rules (in every prompt):** no invented facts or sources, no persuasion,
pressure, guilt or urgency, and donating is optional. Answers are general education,
not medical advice. In an emergency, call 911. All characters are fictional.

**Thinking and cost limits:**
- Reasoning effort is `none`.
- Output is capped at 450 tokens for chat and 700 for reports.
- Each call has a 25–40 s timeout and an overall `asyncio` timeout.
- `UsageLimits` caps each run at 3 requests and about 14k tokens.
- Only the last 3 exchanges are re-sent with each question.
- Questions are limited to 600 characters, with at most 40 per visit.
- Opening stories are pre-written, so they cost nothing.
- Static instructions come first, so the provider can cache them.

A typical answer uses about 1.8k input and about 150 output tokens.

**Audit trail:** every agent action and agent-to-agent handoff is written to the
`audit_log` and `handoffs` tables, with tokens and latency. You can view them under
Staff → Audit trail.

## Management dashboard (`#/staff`)

Managers sign up (name, email, password) or sign in. There is no invite code, so anyone who can reach the app can create a manager account and see donor emails. Add a gate before going live. The dashboard shows:

- **Live view:** refreshes every 10 s.
- **Totals:** raised, spent on surgeries, and available now.
- **Interactive charts:** click a month, a donor type or a gift size to filter the table.
- **Donation table:** every donation with date and time, donor, email, amount and wall text, plus a
  thank-you letter column. Drafts come from the #4 Writer, and managers can edit, accept or
  "send" them. Sending is simulated: no email ever goes out.
- **Tax IDs and receipts:** donors may add a tax ID (RFC) at sign-up or when donating, either personal
  or the company's. When the Writer drafts an email, the app also issues a donation receipt with a
  folio, the contributor, the RFC and the amount. A note at the end of the email (added by code,
  not the model) quotes the exact RFC, or asks for one if none was given. Receipts are prototypes;
  real CFDIs need an authorized certification provider (PAC).
- **Surgery payments:** "Pay for a surgery" records spending and lowers the available balance.
  You can't spend more than is available.

## Agent test: 50 simulated visitors

`backend/scripts/simulate_50.py` drives 50 visitors through the real API:
- Each asks a character one or two questions, covering facts, Spanish, referrals, emergencies,
  off-topic requests, persuasion bait, false premises and prompt injection.
- Each then donates.
- After that, the Accountant, the Coordinator and the Writer run.
- Every answer is checked automatically: language, length, invented numbers, pressure language,
  the 911 rule, referrals and honesty.

The full report is saved to `backend/data/sim_report.json`. Use `--only 4,6` to re-ask selected
scenarios after a fix.

`backend/scripts/verify_letters.py` gives the 50 simulated donors fictional RFCs, drafts every
thank-you email and receipt, and checks four things: the signature, the closing wording,
the receipt (name, RFC, amount, deductible) and the RFC quoted in the email.

## Checking that everything works

With the backend running, run these from `Final Project/backend`:

```bash
../.venv/bin/python scripts/e2e_check.py
```
Runs 56 checks with no model calls, and removes all of its test data afterwards:
- Donors and managers can sign up, sign in and sign out (an old session stops working).
- Signed-in donors can donate one-time and monthly, and signed-out visitors can't.
- Managers can pay any amount toward a surgery, and close a patient's surgery.
- Money: what donors enter is exactly what managers see. Every dashboard figure (raised,
  spent, available, donation and donor counts, charts) is recomputed from the raw database
  by an independent path.

```bash
../.venv/bin/python scripts/simulate_50.py
```
50 visitors talk to the agents and donate (about US$0.03).

```bash
../.venv/bin/python scripts/verify_letters.py
```
Drafts all 50 thank-you emails and receipts, then checks the signature, the "constant support"
wording for monthly donors, the English translation, the subject prefix and the RFCs.

## How the agents talk to each other (Insights → Run #3 Coordinator)

1. **#3 → #1 and #4:** the Coordinator sends teaching guidance and knowledge gaps to the Teacher,
   and letter guidance to the Writer. Each replies in the first person, and the thread is shown
   on screen.
2. **#3 checks #2:** the Coordinator checks the Accountant's numbers in two ways:
   - a full reconciliation of the ledger, done in code;
   - every figure in the Accountant's latest summary must exist in the budget table, exact to
     the cent.
3. **#3 → #2, only when needed:** if something is inconsistent, #3 writes to #2, #2 replies,
   and #2 rewrites the summary using only table figures, which is then re-checked. If nothing
   is wrong, #2 is not contacted.

No agent produces money figures: all of them come from donor and manager records.

## Tokenomics

Audit trail shows cost per model call, plus tokens and cost per day, per month and per agent.
Prices are for `gpt-6-luna`: US$0.10 per 1M input tokens and US$0.50 per 1M output tokens.
You can override them in `.env` with `PRICE_INPUT_PER_1M` and `PRICE_OUTPUT_PER_1M`.
Typical costs:
- One visitor answer: about US$0.0003.
- One thank-you email with its translation: about US$0.0004.
- A full Coordinator round: about US$0.001.

## Prototype limits

- No real payments are processed. Plug in a certified payment provider before going live.
- Fundación Mexicana del Corazón is a SAT-authorized donee; CFDI emailing is not wired up in this prototype.
- Patients and families are fictional.
- The foundation's Instagram and Facebook posts are linked, not copied.
