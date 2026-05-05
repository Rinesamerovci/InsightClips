from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ClipSearchItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    podcast_id: str
    podcast_title: str
    clip_number: int = Field(ge=1)
    clip_start_seconds: float = Field(ge=0)
    clip_end_seconds: float = Field(ge=0)
    duration_seconds: float = Field(gt=0)
    virality_score: float = Field(ge=0, le=100)
    video_url: str
    subtitle_text: str
    status: str
    published: bool = False
    download_url: str | None = None
    published_at: datetime | None = None
    match_reason: str | None = None
    recommendation_reason: str | None = None

    @field_validator("id", "podcast_id", "podcast_title", "video_url", "subtitle_text", "status")
    @classmethod
    def validate_required_strings(cls, value: str) -> str:
        cleaned = " ".join(value.split()) if value.strip() else value.strip()
        if not cleaned:
            raise ValueError("Field cannot be empty.")
        return cleaned


class ClipSearchResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    query: str = ""
    total_results: int = Field(ge=0)
    clips: list[ClipSearchItem] = Field(default_factory=list)


class ClipRecommendationsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    podcast_id: str
    recommendations: list[ClipSearchItem] = Field(default_factory=list)

    @field_validator("podcast_id")
    @classmethod
    def validate_podcast_id(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Podcast id cannot be empty.")
        return cleaned


class ClipMetricRow(BaseModel):
    model_config = ConfigDict(extra="forbid")

    clip_id: str
    clip_number: int = Field(ge=1)
    title: str
    views: int = Field(ge=0)
    downloads: int = Field(ge=0)
    click_trend: float
    published: bool
    published_at: datetime | None = None
    virality_score: float = Field(ge=0, le=100)

    @field_validator("clip_id", "title")
    @classmethod
    def validate_required_strings(cls, value: str) -> str:
        cleaned = " ".join(value.split()) if value.strip() else value.strip()
        if not cleaned:
            raise ValueError("Field cannot be empty.")
        return cleaned


class PodcastClipMetrics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    podcast_id: str
    podcast_title: str
    total_clips: int = Field(ge=0)
    published_clips: int = Field(ge=0)
    unpublished_clips: int = Field(ge=0)
    total_views: int = Field(ge=0)
    total_downloads: int = Field(ge=0)
    average_click_trend: float
    top_clips: list[ClipMetricRow] = Field(default_factory=list)

    @field_validator("podcast_id", "podcast_title")
    @classmethod
    def validate_required_strings(cls, value: str) -> str:
        cleaned = " ".join(value.split()) if value.strip() else value.strip()
        if not cleaned:
            raise ValueError("Field cannot be empty.")
        return cleaned
