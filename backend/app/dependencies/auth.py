from fastapi import Header, HTTPException, Query, status
from pydantic import BaseModel, EmailStr

from app.database import service_supabase
from app.services.profile_service import get_profile_by_id
from app.utils.security import decode_backend_token


class AuthenticatedUser(BaseModel):
    id: str
    email: EmailStr
    free_trial_used: bool = False


async def get_current_user(
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> AuthenticatedUser:
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing.",
        )

    try:
        scheme, token = authorization.split(" ", 1)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format.",
        ) from exc

    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format.",
        )

    return _resolve_authenticated_user(token)


async def get_current_user_for_download(
    authorization: str | None = Header(default=None, alias="Authorization"),
    access_token: str | None = Query(default=None, alias="access_token"),
) -> AuthenticatedUser:
    if access_token:
        return _resolve_authenticated_user(access_token)

    return await get_current_user(authorization)


def _resolve_authenticated_user(token: str) -> AuthenticatedUser:
    backend_payload = decode_backend_token(token)
    if backend_payload:
        return AuthenticatedUser(
            id=str(backend_payload["sub"]),
            email=str(backend_payload["email"]),
            free_trial_used=bool(backend_payload.get("free_trial_used", False)),
        )

    try:
        auth_response = service_supabase.auth.get_user(token)
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
