from datetime import datetime

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.export_settings import ExportSettings


class PodcastRecord(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    user_id: str
    title: str
    duration: int
    status: str
    price: float = 0.0
    payment_status: str = "pending"
    storage_path: str | None = None
    source_type: str = "upload"
    source_url: str | None = None
    external_source_id: str | None = None
    import_metadata: dict[str, Any] = Field(default_factory=dict)
    export_settings: ExportSettings | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class PodcastResponse(BaseModel):
    id: str
    user_id: str
    title: str
    duration: int
    status: str
    price: float = 0.0
    payment_status: str = "pending"
    storage_path: str | None = None
    source_type: str = "upload"
    source_url: str | None = None
    external_source_id: str | None = None
    import_metadata: dict[str, Any] = Field(default_factory=dict)
    export_settings: ExportSettings | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class PodcastsResponse(BaseModel):
    podcasts: list[PodcastResponse]
    is_mock: bool = False


class UpdatePaymentStatusRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    payment_status: Literal["paid", "failed"]


class DeletePodcastResponse(BaseModel):
    deleted: bool
    podcast_id: str
    source_objects_removed: int = 0
    clip_objects_removed: int = 0
    database_rows_removed: int = 0


class TopPerformingClip(BaseModel):
    model_config = ConfigDict(extra="forbid")

    clip_id: str
    podcast_id: str
    podcast_title: str
    clip_number: int = Field(ge=1)
    virality_score: float = Field(ge=0, le=100)
    views: int = Field(ge=0)
    downloads: int = Field(ge=0)
    published: bool = False
    published_at: datetime | None = None

    @field_validator("clip_id", "podcast_id", "podcast_title")
    @classmethod
    def validate_required_strings(cls, value: str) -> str:
        cleaned = " ".join(value.split()) if value.strip() else value.strip()
        if not cleaned:
            raise ValueError("Field cannot be empty.")
        return cleaned


class PodcastAnalyticsSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    podcast_id: str
    title: str
    status: str
    duration: int = Field(ge=0)
    total_clips: int = Field(ge=0)
    published_clips: int = Field(ge=0)
    total_views: int = Field(ge=0)
    total_downloads: int = Field(ge=0)
    average_virality_score: float = Field(ge=0, le=100)
    latest_published_at: datetime | None = None

    @field_validator("podcast_id", "title", "status")
    @classmethod
    def validate_required_strings(cls, value: str) -> str:
        cleaned = " ".join(value.split()) if value.strip() else value.strip()
        if not cleaned:
            raise ValueError("Field cannot be empty.")
        return cleaned


class UserPodcastAnalytics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: str
    total_podcasts: int = Field(ge=0)
    total_clips: int = Field(ge=0)
    published_clips: int = Field(ge=0)
    private_clips: int = Field(ge=0)
    total_views: int = Field(ge=0)
    total_downloads: int = Field(ge=0)
    average_virality_score: float = Field(ge=0, le=100)
    publish_rate: float = Field(ge=0, le=100)
    top_clips: list[TopPerformingClip] = Field(default_factory=list)
    podcasts: list[PodcastAnalyticsSummary] = Field(default_factory=list)

    @field_validator("user_id")
    @classmethod
    def validate_user_id(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("user_id cannot be empty.")
        return cleaned
