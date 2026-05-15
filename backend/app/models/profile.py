from datetime import datetime

from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.export_settings import ExportSettings, ExportSettingsInput

UserMessageType = Literal["feedback", "support", "contact"]
UserMessageCategory = Literal["bug", "feature_request", "general", "billing", "technical_support"]


class ProfileRecord(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    email: EmailStr
    free_trial_used: bool = False
    full_name: str | None = None
    profile_picture_url: str | None = None
    export_settings: ExportSettings = Field(default_factory=ExportSettings)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ProfileResponse(BaseModel):
    id: str
    email: EmailStr
    free_trial_used: bool
    full_name: str | None = None
    profile_picture_url: str | None = None
    export_settings: ExportSettings = Field(default_factory=ExportSettings)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class UpdateProfileRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: str | None = None
    profile_picture_url: str | None = None

    @field_validator("full_name", "profile_picture_url")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = " ".join(value.split())
        return cleaned or None


class UserExportSettingsResponse(BaseModel):
    user_id: str
    export_settings: ExportSettings


class UpdateUserExportSettingsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    export_settings: ExportSettingsInput


class UserMessageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message_type: UserMessageType = "feedback"
    category: UserMessageCategory = "general"
    subject: str | None = Field(default=None, max_length=120)
    message: str = Field(min_length=10, max_length=2000)
    contact_email: EmailStr | None = None

    @field_validator("subject")
    @classmethod
    def normalize_subject(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = " ".join(value.split())
        return cleaned or None

    @field_validator("message")
    @classmethod
    def normalize_message(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if len(cleaned) < 10:
            raise ValueError("message must contain at least 10 characters.")
        return cleaned


class UserMessageResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    user_id: str
    message_type: UserMessageType
    category: UserMessageCategory
    subject: str | None = None
    message: str
    contact_email: EmailStr | None = None
    status: Literal["received", "triaged"] = "received"
    created_at: datetime | None = None
