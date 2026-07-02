from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field

# Register user request
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=120)
# Login request

class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

# Verify auth token request
class VerifyRequest(BaseModel):
    supabase_token: str = Field(min_length=1)

# Check email availability request
class EmailAvailabilityRequest(BaseModel):
    email: EmailStr

# Check email availability response
class EmailAvailabilityResponse(BaseModel):
    email: EmailStr
    exists: bool
    message: str


class PasswordRecoveryRequest(BaseModel):
    email: EmailStr


class PasswordRecoveryResponse(BaseModel):
    email: EmailStr
    exists: bool
    confirmed: bool
    message: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime
    user: dict[str, Any]
