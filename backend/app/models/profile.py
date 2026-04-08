from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr


class ProfileRecord(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    email: EmailStr
    free_trial_used: bool = False
    full_name: str | None = None
    profile_picture_url: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ProfileResponse(BaseModel):
    id: str
    email: EmailStr
    free_trial_used: bool
    full_name: str | None = None
    profile_picture_url: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
