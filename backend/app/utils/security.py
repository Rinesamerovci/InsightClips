from datetime import UTC, datetime, timedelta

import jwt
from fastapi import HTTPException, status

from app.config import get_settings

settings = get_settings()


def create_backend_token(profile_id: str, email: str, free_trial_used: bool) -> tuple[str, datetime]:
    expires_at = datetime.now(UTC) + timedelta(minutes=settings.jwt_expires_minutes)
    payload = {
        "sub": profile_id,
        "email": email,
        "free_trial_used": free_trial_used,
        "exp": expires_at,
        "iat": datetime.now(UTC),
        "iss": "insightclips-backend",
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm), expires_at


def decode_backend_token(token: str) -> dict | None:
    if not settings.jwt_secret:
        return None
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except Exception:
        return None


def validate_password_rules(password: str) -> None:
    has_letter = any(char.isalpha() for char in password)
    has_number = any(char.isdigit() for char in password)
    if not has_letter or not has_number:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must include at least one letter and one number.",
        )
