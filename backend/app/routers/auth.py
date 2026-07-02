from fastapi import APIRouter, Depends

from app.dependencies.auth import AuthenticatedUser, get_current_user
from app.models.auth import (
    AuthResponse,
    EmailAvailabilityRequest,
    EmailAvailabilityResponse,
    LoginRequest,
    PasswordRecoveryRequest,
    PasswordRecoveryResponse,
    RegisterRequest,
    VerifyRequest,
)
from app.services.auth_service import (
    check_email_availability,
    check_password_recovery_eligibility,
    login_user,
    register_user,
    verify_session,
)

router = APIRouter(prefix="/auth", tags=["auth"])
# Authentication Endpoints

@router.post("/register", response_model=AuthResponse, status_code=201)
async def register(payload: RegisterRequest) -> AuthResponse:
    return register_user(payload)


@router.post("/check-email", response_model=EmailAvailabilityResponse)
async def check_email(payload: EmailAvailabilityRequest) -> EmailAvailabilityResponse:
    return check_email_availability(str(payload.email))


@router.post("/forgot-password/check", response_model=PasswordRecoveryResponse)
async def check_password_recovery(payload: PasswordRecoveryRequest) -> PasswordRecoveryResponse:
    return check_password_recovery_eligibility(str(payload.email))


@router.post("/login", response_model=AuthResponse)
async def login(payload: LoginRequest) -> AuthResponse:
    return login_user(payload)


@router.post("/verify", response_model=AuthResponse)
async def verify(payload: VerifyRequest) -> AuthResponse:
    return verify_session(payload.supabase_token)


@router.get("/me")
async def auth_me(current_user: AuthenticatedUser = Depends(get_current_user)) -> dict[str, dict]:
    return {"user": current_user.model_dump()}