# Final AI Project — Fundación Mexicana del Corazón

**▶ Live app (use this first): https://fmc-heart-campaign-3d.onrender.com**
Management dashboard: https://fmc-heart-campaign-3d.onrender.com/#/staff

**GitHub repo (for cloning): https://github.com/eduardohub555/fmc-heart-campaign-3d**

*Eduardo Casarrubias Solano · MGT 409 AI Foundations for Managers · Yale SOM*

This app lets potential donors learn about heart disease and create an account to make one-time
or recurring donations. It also helps the management team of Fundación Mexicana del Corazón track
donations and pay for surgeries for patients in need.

Visitors walk through a 3D garden modeled on the Instituto Nacional de Cardiología. Doctors teach
heart health, and families tell their stories. If they wish, visitors enter the hospital to donate
toward heart surgeries (about 200,000 MXN each) for people who can't afford them.

Both the live app and a fresh clone start with the same demo data: 50 fictional donors, including
12 companies with logos, with their donations, receipts, thank-you emails and conversations.

---

## Option 1 — Use it online (recommended)

Open **https://fmc-heart-campaign-3d.onrender.com**. It's hosted on Render's free plan:
- **First load:** if nobody has visited in about 15 minutes, the first load takes about a minute
  while the server wakes up.
- **Data resets:** the database resets when the server restarts, and comes back with the same
  50 demo donors.

Things to try:
- **Visitor:** walk with W A S D or by clicking the grass. Click a person with 💬 to talk, then
  "Enter the hospital" to donate. Sign up as a new donor; the RFC (tax ID) field is optional.
- **Manager:** open `/#/staff`, choose **Sign up** (name, email, password), and you're in.
- **Demo donor sign-in:** `sim.donor03@example.com` / `sim-pass-03-2026` (fictional).

## Option 2 — Clone and run it locally

You need **Python 3.11+** (tested on 3.14, the same version the live app uses). Node is **not** required, because the built 3D frontend is included in
`frontend/dist` and the Python server serves it.

```bash
git clone https://github.com/eduardohub555/fmc-heart-campaign-3d.git
```

```bash
cd fmc-heart-campaign-3d && python3 -m venv .venv && .venv/bin/pip install -r backend/requirements.txt
```

```bash
cd backend && ../.venv/bin/python -m uvicorn app.main:app --port 8000
```

Then open **http://localhost:8000** (dashboard: http://localhost:8000/#/staff).

**API key.** The app needs `PORTKEY_API_KEY`, and that is the only key it uses (model
`gpt-6-luna`). It looks for a `.env` file in **two places**: first in the repo's own folder, then
in the folder **above** it. In the course's `submissions/` folder, the teaching staff's `.env`
works as is. Otherwise, copy `.env.example` to `.env` and fill in the key.

**Database.** On first start the app creates `backend/data/app.db` and loads the same 50 demo
donors as the live app (`backend/seed/demo_seed.json`).

### Developer mode (optional, needs Node 20+)
Run the backend as above, then in a second terminal:

```bash
cd frontend && npm install && npm run dev
```

Then open http://localhost:5173. Live reload works there; `npm run build` refreshes `frontend/dist`.

---

## What's inside

- **Backend:** Python, FastAPI, PydanticAI and SQLite (`backend/`).
- **Frontend:** React, Vite, TypeScript, and three.js via @react-three/fiber (`frontend/`).
- **Model:** `gpt-6-luna` through Portkey, and nothing else. The name is set in one place,
  `backend/app/config.py`.

### The four agents (`backend/app/agents.py`)

| # | Agent | What it does | Model call? |
|---|-------|--------------|-------------|
| 1 | **Teacher** | Answers in the voice of each doctor, child, parent or grandparent, using only the curated knowledge base (`knowledge.py`: WHO, INEGI, AHA, NIH, INC, SAT). Refers visitors between characters, and the next character receives the conversation. Sends a Q&A report to #2 when a chat ends. | Per question |
| 2 | **Accountant** | Records donations and surgery payments, issues receipts with the tax ID, and computes the budget and the "topics vs. donations" table in code (exact, no model). Writes a management summary on request. | Only for the summary |
| 3 | **Coordinator** | Turns #2's table, unanswered questions and recent letters into guidance for #1 and #4, and a list of knowledge gaps for staff. Checks #2's numbers against the ledger, and writes to #2 only if something is inconsistent. | On request |
| 4 | **Writer** | Drafts bilingual (Spanish + English) thank-you emails from patients to donors, with the receipt note. When a manager edits one, it translates the edit into the other language. **Never sends.** | Per email |

**Honesty rules (in every prompt):**
- No invented facts, figures or sources.
- No persuasion, pressure, guilt or urgency: the goal is learning, and donating is optional.
- General education only, not medical advice; for emergencies, call 911.

**Limits on thinking and cost:**
- Reasoning effort is `none`, and output tokens are capped.
- Every call has a timeout, and `UsageLimits` caps tokens and requests per run.
- Only the last 3 exchanges are re-sent with each question.
- Questions are capped at 600 characters and 40 per visit.
- Stories, health tips and procedure explanations are pre-written, so they cost nothing.
- Static instructions come first in the prompt, so the provider caches them.

### Management dashboard (`#/staff`)
- **Live totals:** raised (one-time gifts plus monthly payments received), spent on surgeries,
  and available.
- **Interactive charts:** click a month, a donor type or a gift size to filter the table.
- **Donation table:** date, donor, email, RFC, amount, type and wall text.
- **Emails:** bilingual thank-you emails with "Confirm edition and translate" and a simulated Send.
- **Receipts:** each donation's receipt, with its folio and RFC.
- **Pay for a surgery:** any amount, for a patient chosen by the Instituto Nacional de
  Cardiología's priority, with an option to close that patient's surgery.
- **Insights:** the agents' conversation thread, unanswered questions and knowledge gaps.
- **Audit trail:** every agent action and handoff, with tokens, cached tokens and cost per call,
  per day, per month and per agent.

### Checks you can run (from `backend/`, with the server running)

```bash
../.venv/bin/python scripts/e2e_check.py
```
56 checks, with no model calls:
- donor and manager sign up, sign in and sign out;
- one-time and monthly donations;
- surgery payments;
- every dashboard figure reconciled with the raw ledger.

```bash
../.venv/bin/python scripts/safety_checks.py
```
8 checks on the defenses: password hashing, input and visit caps, the per-run token ceiling,
invented sources being dropped, manager-only data, the overspending guard and locked sent emails.

```bash
../.venv/bin/python scripts/simulate_50.py
```
50 simulated visitors talk to the agents and donate, about US$0.03.

```bash
../.venv/bin/python scripts/verify_letters.py
```
Drafts and checks all 50 bilingual thank-you emails and receipts.

## Secrets
- **Never committed:** `.env` is ignored by git, and `.env.example` lists the keys with no values.
- **Passwords:** stored only as salted **scrypt** hashes.
- **Sessions:** random tokens, stored only as their SHA-256 hash.

## Deploy on Render
`render.yaml` together with the `Dockerfile` defines one free web service. Use **New → Blueprint**
in Render, pick this repo and paste `PORTKEY_API_KEY` when asked. `SEED_DEMO_DATA=1` reloads the
50 demo donors whenever the free plan's temporary disk starts empty.

## Prototype limits
- **Patients:** the five patients and their families are fictional.
- **Money:** no real payments are processed, and emails are never sent.
- **Receipts:** prototypes. Real CFDIs require an authorized certification provider (PAC).
- **Manager accounts:** anyone can create one. That's for grading; restrict it before real use.
