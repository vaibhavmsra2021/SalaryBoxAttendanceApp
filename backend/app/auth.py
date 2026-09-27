from datetime import datetime, timedelta, timezone

import jwt
from fastapi import HTTPException, Request

from app.config import settings

ALGORITHM = "HS256"
TOKEN_DAYS = 7


def issue_token(role: str, staff: dict | None = None) -> str:
    payload = {
        "role": role,
        "staff_id": staff["id"] if staff else None,
        "name": staff["name"] if staff else None,
        "employee_id": staff["employee_id"] if staff else None,
        "exp": datetime.now(timezone.utc) + timedelta(days=TOKEN_DAYS),
    }
    return jwt.encode(payload, settings.api_secret, algorithm=ALGORITHM)


def read_token(request: Request) -> dict:
    header = request.headers.get("authorization", "")
    if not header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Sign in required.")
    token = header.removeprefix("Bearer ").strip()
    try:
        payload = jwt.decode(token, settings.api_secret, algorithms=[ALGORITHM])
    except jwt.PyJWTError as error:
        raise HTTPException(status_code=401, detail="Sign in required.") from error
    if payload.get("role") not in {"admin", "staff"}:
        raise HTTPException(status_code=401, detail="Sign in required.")
    return payload


def require_admin(user: dict) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only.")
    return user


def require_self_or_admin(user: dict, staff_id: str) -> dict:
    if user["role"] == "admin":
        return user
    if user["role"] == "staff" and user.get("staff_id") == staff_id:
        return user
    raise HTTPException(status_code=403, detail="You can only open your own record.")
