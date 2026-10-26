"""Configuration: the one model, its cost ceilings, and where secrets come from.

Secrets live only in .env files:
  * the course root .env holds PORTKEY_API_KEY
  * Final Project/.env holds the staff (admin) login for the management dashboard
Nothing secret is written anywhere else in this codebase.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from pydantic_ai.models.openai import OpenAIChatModel, OpenAIChatModelSettings
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.usage import UsageLimits

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BACKEND_DIR.parent  # Final Project/
COURSE_ROOT = PROJECT_DIR.parent

load_dotenv(COURSE_ROOT / ".env")
load_dotenv(PROJECT_DIR / ".env")

#: The only model this app may call. It appears once, here.
MODEL_NAME = "gpt-6-luna"
PORTKEY_BASE_URL = "https://api.portkey.ai/v1"

#: "Limit its thinking": reasoning is off, answers are capped in length, and
#: every call has a hard timeout. Short answers are also what visitors want.
CHAT_SETTINGS = OpenAIChatModelSettings(
    openai_reasoning_effort="none", max_tokens=450, temperature=0.3, timeout=25
)
REPORT_SETTINGS = OpenAIChatModelSettings(
    openai_reasoning_effort="none", max_tokens=700, temperature=0.2, timeout=40
)

#: One answer = one model request (plus one retry if the output is malformed).
#: Letters include an English translation, so they need more room.
WRITER_SETTINGS = OpenAIChatModelSettings(
    openai_reasoning_effort="none", max_tokens=1300, temperature=0.3, timeout=45
)
CHAT_LIMITS = UsageLimits(request_limit=3, total_tokens_limit=14_000)
REPORT_LIMITS = UsageLimits(request_limit=3, total_tokens_limit=16_000)
AGENT_TIMEOUT_SECONDS = 35

#: Abuse / cost guards for the public chat.
MAX_MESSAGE_CHARS = 600
MAX_MESSAGES_PER_VISIT = 40
HISTORY_TURNS = 3  # only the last 3 exchanges are resent to the model

#: Tokenomics: USD per 1M tokens for gpt-6-luna (course price sheet, Oct 2026).
#: Cached-input discounts aren't applied, so costs shown are the pessimistic price.
PRICE_INPUT_PER_1M = float(os.getenv("PRICE_INPUT_PER_1M", "0.10"))
PRICE_OUTPUT_PER_1M = float(os.getenv("PRICE_OUTPUT_PER_1M", "0.50"))

#: Campaign constant: estimated cost of one heart surgery (MXN).
SURGERY_COST_MXN = 200_000

DB_PATH = BACKEND_DIR / "data" / "app.db"

ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
#: The foundation's own tax ID for receipts (optional; shown as "pending" until set).
FOUNDATION_RFC = os.getenv("FOUNDATION_RFC", "")


def get_model() -> OpenAIChatModel:
    key = os.getenv("PORTKEY_API_KEY")
    if not key:
        raise RuntimeError("PORTKEY_API_KEY is missing from the course root .env file.")
    return OpenAIChatModel(
        MODEL_NAME, provider=OpenAIProvider(api_key=key, base_url=PORTKEY_BASE_URL)
    )
