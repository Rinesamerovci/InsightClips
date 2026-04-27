from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


OverlayPosition = Literal[
    "top_left",
    "top_center",
    "top_right",
    "bottom_left",
    "bottom_center",
    "bottom_right",
    "center",
]


class OverlayDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    clip_id: str
    podcast_id: str
    keyword: str | None = None
    overlay_category: str | None = None
    overlay_asset: str | None = None
    asset_path: str | None = None
    matched_text: str | None = None
    position: OverlayPosition | None = None
    scale: float | None = Field(default=None, gt=0, le=1)
    opacity: float | None = Field(default=None, ge=0, le=1)
    margin_x: int | None = Field(default=None, ge=0)
    margin_y: int | None = Field(default=None, ge=0)
    render_start_seconds: float | None = Field(default=None, ge=0)
    render_end_seconds: float | None = Field(default=None, ge=0)
    applied: bool = False
    rendered: bool = False
    render_status: str | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)

    @field_validator("clip_id", "podcast_id")
    @classmethod
    def validate_required_strings(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Field cannot be empty.")
        return cleaned

    @field_validator(
        "keyword",
        "overlay_category",
        "overlay_asset",
        "asset_path",
        "matched_text",
        "render_status",
    )
    @classmethod
    def normalize_optional_strings(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = " ".join(value.split()).strip()
        return cleaned or None

    @model_validator(mode="after")
    def validate_render_window(self) -> "OverlayDecision":
        if (
            self.render_start_seconds is not None
            and self.render_end_seconds is not None
            and self.render_end_seconds < self.render_start_seconds
        ):
            raise ValueError("Overlay render end must be greater than or equal to render start.")
        return self


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
