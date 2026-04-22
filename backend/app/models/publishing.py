from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ClipPublicationStatus(BaseModel):
    model_config = ConfigDict(extra="forbid")

    clip_id: str
    published: bool
    download_url: str | None = None
    published_at: datetime | None = None

    @field_validator("clip_id")
    @classmethod
    def validate_clip_id(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("clip_id cannot be empty.")
        return cleaned


class ClipPublicationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    podcast_id: str
    total_clips_published: int = Field(ge=0)
    published_clips: list[ClipPublicationStatus] = Field(default_factory=list)
    processing_time_seconds: float = Field(ge=0)

    @field_validator("podcast_id")
    @classmethod
    def validate_podcast_id(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("podcast_id cannot be empty.")
        return cleaned


class ClipRevocationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    clip_id: str
    revoked: bool
    published: bool

    @field_validator("clip_id")
    @classmethod
    def validate_clip_id(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("clip_id cannot be empty.")
        return cleaned


class PublishClipsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    clip_ids: list[str] = Field(default_factory=list)
