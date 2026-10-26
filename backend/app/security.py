"""Password hashing (salted scrypt) and opaque session tokens.

* Passwords: hashlib.scrypt with a random 16-byte salt per user. Only the hash
  is stored; plain passwords are never logged or written to disk.
* Sessions: a random token is handed to the browser; only its SHA-256 lives in
  the database, so a leaked database cannot be replayed as logins.
* Staff login: compared in constant time against ADMIN_USERNAME/ADMIN_PASSWORD
  from Final Project/.env.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Header, HTTPException

from . import config, db

_N, _R, _P = 2**14, 8, 1


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=32)
    return "scrypt${}${}".format(base64.b64encode(salt).decode(), base64.b64encode(digest).decode())


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt_b64, digest_b64 = stored.split("$")
    except ValueError:
        return False
    digest = hashlib.scrypt(
        password.encode(), salt=base64.b64decode(salt_b64), n=_N, r=_R, p=_P, dklen=32
    )
    return hmac.compare_digest(digest, base64.b64decode(digest_b64))


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(user_id: int | None, role: str, hours: int = 12) -> str:
    token = secrets.token_urlsafe(32)
    expires = (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()
    db.execute(
        "INSERT INTO sessions (token_hash, user_id, role, expires_at) VALUES (?,?,?,?)",
        (_token_hash(token), user_id, role, expires),
    )
    return token


def drop_session(token: str) -> None:
    db.execute("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(token),))


def _session(authorization: str | None) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Please sign in.")
    found = db.one("SELECT * FROM sessions WHERE token_hash = ?", (_token_hash(authorization[7:]),))
    if not found or found["expires_at"] < datetime.now(timezone.utc).isoformat():
        raise HTTPException(401, "Your session expired. Please sign in again.")
    return found


def current_donor(authorization: str | None = Header(default=None)) -> dict:
    s = _session(authorization)
    if s["role"] != "donor":
        raise HTTPException(403, "Donor account required.")
    user = db.one(
        "SELECT id, first_name, last_name, company, email, wall_name, wall_anonymous, tax_id FROM users WHERE id = ?",
        (s["user_id"],),
    )
    if not user:
        raise HTTPException(401, "Account not found.")
    return user


def current_staff(authorization: str | None = Header(default=None)) -> dict:
    s = _session(authorization)
    if s["role"] != "staff":
        raise HTTPException(403, "Staff access only.")
    return s


def check_staff_login(username: str, password: str) -> bool:
    if not config.ADMIN_USERNAME or not config.ADMIN_PASSWORD:
        return False
    ok_user = hmac.compare_digest(username.encode(), config.ADMIN_USERNAME.encode())
    ok_pass = hmac.compare_digest(password.encode(), config.ADMIN_PASSWORD.encode())
    return ok_user and ok_pass
