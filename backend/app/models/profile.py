from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.export_settings import ExportSettings, ExportSettingsInput


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
