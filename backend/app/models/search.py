from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.overlay import OverlayDecision


class _ClipDiscoveryBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    podcast_id: str
    podcast_title: str
    title: str
    clip_number: int = Field(ge=1)
    clip_start_seconds: float = Field(ge=0)
    clip_end_seconds: float = Field(ge=0)
    duration_seconds: float = Field(gt=0)
    virality_score: float = Field(ge=0, le=100)
    video_url: str
    subtitle_text: str
    keywords: list[str] = Field(default_factory=list)
    status: str
    published: bool = False
    download_url: str | None = None
    published_at: datetime | None = None
    overlay: OverlayDecision | None = None

    @field_validator("id", "podcast_id", "podcast_title", "title", "video_url", "subtitle_text", "status")
    @classmethod
    def validate_required_strings(cls, value: str) -> str:
        cleaned = " ".join(value.split()) if value.strip() else value.strip()
        if not cleaned:
            raise ValueError("Field cannot be empty.")
        return cleaned

    @field_validator("keywords")
    @classmethod
    def validate_keywords(cls, value: list[str]) -> list[str]:
        normalized: list[str] = []
        seen: set[str] = set()
        for item in value:
            cleaned = " ".join(item.split()).lower()
            if cleaned and cleaned not in seen:
                normalized.append(cleaned)
                seen.add(cleaned)
        return normalized


class ClipSearchHit(_ClipDiscoveryBase):
    search_score: float = Field(ge=0)
    matched_fields: list[str] = Field(default_factory=list)
    match_reason: str | None = None


class ClipSearchResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    query: str = ""
    total_results: int = Field(ge=0)
    clips: list[ClipSearchHit] = Field(default_factory=list)


class RecommendationItem(_ClipDiscoveryBase):
    recommendation_score: float = Field(ge=0)
    recommendation_reason: str | None = None


class RecommendationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    podcast_id: str
    recommendations: list[RecommendationItem] = Field(default_factory=list)

    @field_validator("podcast_id")
    @classmethod
    def validate_podcast_id(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Podcast id cannot be empty.")
        return cleaned
