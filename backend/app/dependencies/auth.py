from fastapi import Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, EmailStr, field_validator

from app.database import service_supabase
from app.services.profile_service import get_profile_by_id
from app.utils.security import decode_backend_token

bearer_scheme = HTTPBearer(auto_error=False)


class AuthenticatedUser(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    email: EmailStr
    free_trial_used: bool = False

    @field_validator("id")
    @classmethod
    def validate_user_id(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Authenticated user id cannot be empty.")
        return cleaned


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> AuthenticatedUser:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing.",
        )

    return _resolve_authenticated_user(credentials.credentials)


async def get_current_user_for_download(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    access_token: str | None = Query(default=None, alias="access_token"),
) -> AuthenticatedUser:
    if access_token:
        return _resolve_authenticated_user(access_token)

    return await get_current_user(credentials)


def _resolve_authenticated_user(token: str) -> AuthenticatedUser:
    cleaned_token = token.strip()
    if not cleaned_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format.",
        )

    backend_payload = decode_backend_token(cleaned_token)
    if backend_payload:
        return AuthenticatedUser(
            id=str(backend_payload["sub"]),
            email=str(backend_payload["email"]),
            free_trial_used=bool(backend_payload.get("free_trial_used", False)),
        )

    try:
        auth_response = service_supabase.auth.get_user(cleaned_token)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication verification failed.",
        ) from exc

    auth_user = auth_response.user
    if not auth_user or not auth_user.email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication verification failed.",
        )

    profile = get_profile_by_id(auth_user.id)
    return AuthenticatedUser(
        id=auth_user.id,
        email=auth_user.email,
        free_trial_used=profile.free_trial_used if profile else False,
    )
