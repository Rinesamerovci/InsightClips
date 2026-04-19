from fastapi import HTTPException, status

from app.database import public_supabase, service_supabase
from app.models.auth import AuthResponse, LoginRequest, RegisterRequest
from app.services.profile_service import get_profile_by_id, upsert_profile
from app.utils.security import create_backend_token, validate_password_rules


def _issue_auth_response(profile_id: str, email: str | None = None, full_name: str | None = None) -> AuthResponse:
    profile = get_profile_by_id(profile_id)
    if not profile:
        if not email:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Authenticated profile is missing from the database.",
            )
        profile = upsert_profile(profile_id, email, full_name)

    token, expires_at = create_backend_token(profile.id, profile.email, profile.free_trial_used)
    return AuthResponse(
        access_token=token,
        expires_at=expires_at,
        user={
            "id": profile.id,
            "email": profile.email,
            "free_trial_used": profile.free_trial_used,
            "full_name": profile.full_name,
            "profile_picture_url": profile.profile_picture_url,
            "created_at": profile.created_at.isoformat() if profile.created_at else None,
            "updated_at": profile.updated_at.isoformat() if profile.updated_at else None,
        },
    )


def register_user(payload: RegisterRequest) -> AuthResponse:
    validate_password_rules(payload.password)
    email = payload.email.lower()

    try:
        sign_up_response = public_supabase.auth.sign_up(
            {
                "email": email,
                "password": payload.password,
                "options": {
                    "data": {"full_name": payload.full_name} if payload.full_name else {},
                },
            }
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Registration failed: {exc}",
        ) from exc

    user = sign_up_response.user
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration failed. Supabase did not return a user record.",
        )

    upsert_profile(user.id, email, payload.full_name)
    return _issue_auth_response(user.id)


def login_user(payload: LoginRequest) -> AuthResponse:
    try:
        sign_in_response = public_supabase.auth.sign_in_with_password(
            {"email": payload.email.lower(), "password": payload.password}
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        ) from exc

    user = sign_in_response.user
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    full_name = None
    if user.user_metadata:
        full_name = user.user_metadata.get("full_name")

    return _issue_auth_response(user.id, user.email, full_name)


def verify_session(supabase_token: str) -> AuthResponse:
    try:
        auth_response = service_supabase.auth.get_user(supabase_token)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Supabase session.",
        ) from exc

    user = auth_response.user
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Supabase session.",
        )

    full_name = None
    if user.user_metadata:
        full_name = user.user_metadata.get("full_name")

    return _issue_auth_response(user.id, user.email, full_name)
