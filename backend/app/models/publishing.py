from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
# Publication enums (status + destinations + platforms)
PublicationStatus = Literal["pending", "published", "failed"]
PublicationDestination = Literal["download", "tiktok", "instagram", "youtube", "other"]
ContentCalendarPlatform = Literal["tiktok", "instagram_reels", "facebook", "youtube", "linkedin"]

# Model: ClipPublicationStatus
# (Current publication state of a clip)
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

# Model: ClipPublicationStatusResponse
# (Extended status with podcast context)
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


class ClipMetricResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    clip_id: str
    podcast_id: str
    clip_number: int = Field(ge=1)
    views: int = Field(ge=0)
    downloads: int = Field(ge=0)
    click_through_rate: float = Field(ge=0)
    virality_score: float = Field(ge=0, le=100)
    published: bool = False
    published_at: datetime | None = None
    status: str

    @field_validator("clip_id", "podcast_id", "status")
    @classmethod
    def validate_required_strings(cls, value: str) -> str:
        cleaned = " ".join(value.split()) if value.strip() else value.strip()
        if not cleaned:
            raise ValueError("Field cannot be empty.")
        return cleaned

# Model: PublishClipsRequest
# (Batch publish request)
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

# Model: PublishClipRequest
# (Single clip publish request)
class ContentCalendarSuggestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    clip_id: str
    clip_number: int = Field(ge=1)
    platform: ContentCalendarPlatform
    scheduled_day: int = Field(ge=1, le=14)
    best_time_local: str
    title: str
    caption: str
    hashtags: list[str] = Field(default_factory=list, max_length=8)
    call_to_action: str
    repurpose_angle: str

    @field_validator("clip_id", "best_time_local", "title", "caption", "call_to_action", "repurpose_angle")
    @classmethod
    def validate_required_strings(cls, value: str) -> str:
        cleaned = " ".join(value.split()) if value.strip() else value.strip()
        if not cleaned:
            raise ValueError("Field cannot be empty.")
        return cleaned

    @field_validator("hashtags")
    @classmethod
    def normalize_hashtags(cls, value: list[str]) -> list[str]:
        normalized: list[str] = []
        seen: set[str] = set()
        for tag in value:
            cleaned = tag.strip()
            if not cleaned:
                continue
            if not cleaned.startswith("#"):
                cleaned = f"#{cleaned}"
            cleaned = cleaned.replace(" ", "")
            lowered = cleaned.lower()
            if lowered not in seen:
                normalized.append(cleaned)
                seen.add(lowered)
        return normalized[:8]

# Model: ContentCalendarSuggestion
# (AI-generated posting schedule suggestion)
class ContentCalendarResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    podcast_id: str
    total_suggestions: int = Field(ge=0)
    suggestions: list[ContentCalendarSuggestion] = Field(default_factory=list)

    @field_validator("podcast_id")
    @classmethod
    def validate_podcast_id(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("podcast_id cannot be empty.")
        return cleaned
