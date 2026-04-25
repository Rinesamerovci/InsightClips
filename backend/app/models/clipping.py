from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.analysis import ScoreSegment
from app.models.overlay import OverlayDecision
from app.models.transcription import TranscriptionResult


class ClipResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    clip_number: int = Field(ge=1)
    clip_start_seconds: float = Field(ge=0)
    clip_end_seconds: float = Field(ge=0)
    duration_seconds: float = Field(gt=0)
    virality_score: float = Field(ge=0, le=100)
    video_url: str
    subtitle_text: str
    status: Literal["ready", "processing", "failed"]
    published: bool = False
    download_url: str | None = None
    published_at: datetime | None = None
    overlay: OverlayDecision | None = None

    @field_validator("id", "video_url", "subtitle_text")
    @classmethod
    def validate_required_strings(cls, value: str) -> str:
        cleaned = " ".join(value.split()) if value.strip() else value.strip()
        if not cleaned:
            raise ValueError("Field cannot be empty.")
        return cleaned


class ClipGenerationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    podcast_id: str
    total_clips_generated: int = Field(ge=0)
    clips: list[ClipResult] = Field(default_factory=list)
    processing_time_seconds: float = Field(ge=0)
    download_folder_url: str

    @field_validator("podcast_id", "download_folder_url")
    @classmethod
    def validate_required_strings(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Field cannot be empty.")
        return cleaned


class GenerateClipsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    score_segments: list[ScoreSegment] | None = None
    transcription: TranscriptionResult | None = None

