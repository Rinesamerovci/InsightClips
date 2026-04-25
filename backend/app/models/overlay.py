from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator


class OverlayDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    clip_id: str
    podcast_id: str
    keyword: str | None = None
    overlay_category: str | None = None
    overlay_asset: str | None = None
    matched_text: str | None = None
    applied: bool = False
    confidence: float | None = Field(default=None, ge=0, le=1)

    @field_validator("clip_id", "podcast_id")
    @classmethod
    def validate_required_strings(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Field cannot be empty.")
        return cleaned

    @field_validator("keyword", "overlay_category", "overlay_asset", "matched_text")
    @classmethod
    def normalize_optional_strings(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = " ".join(value.split()).strip()
        return cleaned or None


class OverlayMappingResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    podcast_id: str
    total_segments_checked: int = Field(ge=0)
    overlay_decisions: list[OverlayDecision] = Field(default_factory=list)

    @field_validator("podcast_id")
    @classmethod
    def validate_podcast_id(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Podcast id cannot be empty.")
        return cleaned
