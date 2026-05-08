from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

PublicationStatus = Literal["pending", "published", "failed"]
PublicationDestination = Literal["download", "tiktok", "instagram", "youtube", "other"]


class ClipPublicationStatus(BaseModel):
    model_config = ConfigDict(extra="forbid")

    clip_id: str
    published: bool
    status: PublicationStatus = "published"
    destination: PublicationDestination = "download"
    download_url: str | None = None
    published_at: datetime | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("clip_id")
    @classmethod
    def validate_clip_id(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("clip_id cannot be empty.")
        return cleaned


class ClipPublicationStatusResponse(ClipPublicationStatus):
    model_config = ConfigDict(extra="forbid")

    podcast_id: str
    updated_at: datetime | None = None

    @field_validator("podcast_id")
    @classmethod
    def validate_podcast_id(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("podcast_id cannot be empty.")
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

    clip_ids: list[str] = Field(min_length=1, max_length=50)
    destination: PublicationDestination = "download"
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("clip_ids")
    @classmethod
    def validate_clip_ids(cls, value: list[str]) -> list[str]:
        normalized: list[str] = []
        seen: set[str] = set()
        for clip_id in value:
            cleaned = clip_id.strip()
            if not cleaned:
                raise ValueError("clip_ids cannot contain blank values.")
            if cleaned not in seen:
                normalized.append(cleaned)
                seen.add(cleaned)
        return normalized

    @field_validator("metadata")
    @classmethod
    def validate_metadata(cls, value: dict[str, Any]) -> dict[str, Any]:
        if len(value) > 25:
            raise ValueError("metadata cannot contain more than 25 fields.")
        return value


class PublishClipRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    destination: PublicationDestination = "download"
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("metadata")
    @classmethod
    def validate_metadata(cls, value: dict[str, Any]) -> dict[str, Any]:
        if len(value) > 25:
            raise ValueError("metadata cannot contain more than 25 fields.")
        return value
