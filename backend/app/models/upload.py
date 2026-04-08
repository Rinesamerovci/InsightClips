from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


UploadStatus = Literal["draft", "free_ready", "awaiting_payment", "ready_for_processing", "blocked"]
UploadPreflightStatus = Literal["free_ready", "awaiting_payment", "blocked"]


class UploadCalculatePriceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    filename: str
    filesize_bytes: int = Field(gt=0)
    mime_type: str | None = None
    storage_path: str | None = None

    @field_validator("filename")
    @classmethod
    def validate_non_empty_strings(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Field cannot be empty.")
        return cleaned

    @field_validator("storage_path")
    @classmethod
    def validate_optional_storage_path(cls, value: str | None) -> str | None:
        if value is None:
            return value
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Field cannot be empty.")
        return cleaned

    @field_validator("mime_type")
    @classmethod
    def normalize_mime_type(cls, value: str | None) -> str | None:
        return value.strip().lower() if value else value


class UploadCalculatePriceResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    duration_seconds: float
    duration_minutes: float
    price: float
    currency: str = "USD"
    free_trial_available: bool
    status: UploadPreflightStatus
    message: str
    detected_format: str | None = None
    validation_flags: dict[str, bool] = Field(default_factory=dict)


class UploadPrepareRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    filename: str
    filesize_bytes: int | None = Field(default=None, gt=0)
    storage_path: str | None = None
    mime_type: str | None = None
    duration_seconds: float | None = Field(default=None, gt=0)
    price: float | None = Field(default=None, ge=0)
    status: UploadPreflightStatus | None = None

    @field_validator("title", "filename")
    @classmethod
    def validate_required_strings(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Field cannot be empty.")
        return cleaned

    @field_validator("storage_path")
    @classmethod
    def validate_optional_prepare_path(cls, value: str | None) -> str | None:
        if value is None:
            return value
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Field cannot be empty.")
        return cleaned

    @field_validator("mime_type")
    @classmethod
    def normalize_prepare_mime_type(cls, value: str | None) -> str | None:
        return value.strip().lower() if value else value


class UploadPrepareResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    podcast_id: str
    status: UploadStatus
    storage_ready: bool
    checkout_required: bool
    payment_status: str
    price: float
    currency: str = "USD"
