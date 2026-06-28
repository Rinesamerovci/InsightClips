from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class RankingFactor(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str
    value: str
    impact: float
    category: str
    evidence: str | None = None

    @field_validator("label", "value", "category")
    @classmethod
    def validate_required_strings(cls, value: str) -> str:
        cleaned = " ".join(value.split()) if value.strip() else value.strip()
        if not cleaned:
            raise ValueError("Field cannot be empty.")
        return cleaned


ReferenceMentionType = Literal["book", "source", "concept", "named_reference"]


class ReferenceMention(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str
    normalized_label: str
    mention_type: ReferenceMentionType
    confidence: float = Field(ge=0, le=1)
    evidence_text: str
    topic_labels: list[str] = Field(default_factory=list, max_length=6)
    start_seconds: float | None = Field(default=None, ge=0)
    end_seconds: float | None = Field(default=None, ge=0)

    @field_validator("label", "normalized_label", "evidence_text")
    @classmethod
    def validate_required_strings(cls, value: str) -> str:
        cleaned = " ".join(value.split()) if value.strip() else value.strip()
        if not cleaned:
            raise ValueError("Field cannot be empty.")
        return cleaned

    @field_validator("topic_labels")
    @classmethod
    def normalize_topic_labels(cls, value: list[str]) -> list[str]:
        normalized: list[str] = []
        seen: set[str] = set()
        for item in value:
            cleaned = " ".join(item.split()).strip().lower()
            if cleaned and cleaned not in seen:
                normalized.append(cleaned)
                seen.add(cleaned)
        return normalized[:6]


class HashtagSuggestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tag: str
    confidence: float = Field(ge=0, le=1)
    reason: str

    @field_validator("tag")
    @classmethod
    def normalize_tag(cls, value: str) -> str:
        cleaned = value.strip().replace(" ", "")
        if not cleaned:
            raise ValueError("tag cannot be empty.")
        return cleaned if cleaned.startswith("#") else f"#{cleaned}"

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, value: str) -> str:
        cleaned = " ".join(value.split()) if value.strip() else value.strip()
        if not cleaned:
            raise ValueError("reason cannot be empty.")
        return cleaned


class ClipPlanningInsight(BaseModel):
    model_config = ConfigDict(extra="forbid")

    clip_id: str
    podcast_id: str
    topic_labels: list[str] = Field(default_factory=list, max_length=6)
    reference_mentions: list[ReferenceMention] = Field(default_factory=list)
    hashtags: list[HashtagSuggestion] = Field(default_factory=list, max_length=8)

    @field_validator("clip_id", "podcast_id")
    @classmethod
    def validate_ids(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Field cannot be empty.")
        return cleaned

    @field_validator("topic_labels")
    @classmethod
    def normalize_topics(cls, value: list[str]) -> list[str]:
        normalized: list[str] = []
        seen: set[str] = set()
        for item in value:
            cleaned = " ".join(item.split()).strip().lower()
            if cleaned and cleaned not in seen:
                normalized.append(cleaned)
                seen.add(cleaned)
        return normalized[:6]


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
    subtitle_url: str | None = None
    subtitle_text: str
    status: str
    published: bool = False
    download_url: str | None = None
    published_at: datetime | None = None
    match_reason: str | None = None
    recommendation_reason: str | None = None
    insight_score: float | None = Field(default=None, ge=0, le=100)
    insight_summary: str | None = None
    ranking_factors: list[RankingFactor] = Field(default_factory=list)
    rank_position: int | None = Field(default=None, ge=1)

    @field_validator("id", "podcast_id", "podcast_title", "video_url", "subtitle_text", "status")
    @classmethod
    def validate_required_strings(cls, value: str) -> str:
        cleaned = " ".join(value.split()) if value.strip() else value.strip()
        if not cleaned:
            raise ValueError("Field cannot be empty.")
        return cleaned

    @field_validator("subtitle_url")
    @classmethod
    def normalize_subtitle_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


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
    insight_score: float | None = Field(default=None, ge=0, le=100)
    insight_summary: str | None = None
    ranking_factors: list[RankingFactor] = Field(default_factory=list)

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
