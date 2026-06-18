from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.analysis import ScoreSegment
from app.models.export_settings import (
    ExportSettings,
    ExportSettingsInput,
    GenerationSettings,
    GenerationSettingsInput,
)
from app.models.media import VisualOutputMode
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
    export_settings: ExportSettings = Field(default_factory=ExportSettings)
    generation_settings: GenerationSettings = Field(default_factory=GenerationSettings)
    visual_output_mode: VisualOutputMode = "original_people"
    effective_visual_output_mode: VisualOutputMode = "original_people"
    render_fallback_reason: str | None = None

    @field_validator("id", "video_url")
    @classmethod
    def validate_required_strings(cls, value: str) -> str:
        cleaned = " ".join(value.split()) if value.strip() else value.strip()
        if not cleaned:
            raise ValueError("Field cannot be empty.")
        return cleaned

    @field_validator("subtitle_text")
    @classmethod
    def normalize_subtitle_text(cls, value: str) -> str:
        return " ".join(value.split()) if value.strip() else ""


class ClipGenerationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    podcast_id: str
    total_clips_generated: int = Field(ge=0)
    clips: list[ClipResult] = Field(default_factory=list)
    processing_time_seconds: float = Field(ge=0)
    download_folder_url: str
    export_settings: ExportSettings = Field(default_factory=ExportSettings)
    generation_settings: GenerationSettings = Field(default_factory=GenerationSettings)

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
    export_settings: ExportSettingsInput | None = None
    generation_settings: GenerationSettingsInput | None = None
    clip_duration_seconds: int | None = Field(default=None, ge=8, le=90)
    number_of_clips: int | None = Field(default=None, ge=1, le=10)
    topic_focus: str | None = Field(default=None, max_length=500)
    subtitles_enabled: bool | None = None
    visual_output_mode: VisualOutputMode = "original_people"
    save_generation_settings: bool = False
    use_preferred_generation_settings: bool = False

    @field_validator("topic_focus")
    @classmethod
    def normalize_topic_focus(cls, value: str | None) -> str | None:
        return GenerationSettings.normalize_topic_focus(value)

    @model_validator(mode="after")
    def validate_generation_payload(self) -> "GenerateClipsRequest":
        if self.save_generation_settings and self.generation_settings is None and not self._has_direct_generation_fields():
            raise ValueError("save_generation_settings requires at least one generation setting.")
        return self

    def resolve_generation_settings(self, preferred: GenerationSettings | None = None) -> GenerationSettings:
        resolved = self.generation_settings.resolve(preferred) if self.generation_settings else (preferred or GenerationSettings())
        direct_updates = {
            key: value
            for key, value in {
                "clip_duration_seconds": self.clip_duration_seconds,
                "number_of_clips": self.number_of_clips,
                "topic_focus": self.topic_focus,
                "subtitles_enabled": self.subtitles_enabled,
            }.items()
            if value is not None
        }
        return resolved.model_copy(update=direct_updates)

    def _has_direct_generation_fields(self) -> bool:
        return any(
            value is not None
            for value in (
                self.clip_duration_seconds,
                self.number_of_clips,
                self.topic_focus,
                self.subtitles_enabled,
            )
        )

