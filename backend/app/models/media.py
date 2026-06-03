from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.export_settings import ExportMode, ExportPresetName, SubtitleTimingProfile

VisualOutputMode = Literal["original_people", "book_like", "stylized_animated"]
OverlayRenderPolicy = Literal["full", "limited", "disabled"]
SubtitleRenderPolicy = Literal["spoken_captions", "narrative_cards", "stylized_captions"]
RenderingProfile = Literal["live_action", "editorial_frame", "motion_graphic"]


class MediaInspectionResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    duration_seconds: float
    duration_minutes: float
    is_supported: bool
    detected_format: str | None = None
    mime_type: str | None = None
    validation_flags: dict[str, bool] = Field(default_factory=dict)


class SubtitleTimingContract(BaseModel):
    model_config = ConfigDict(extra="forbid")

    max_words_per_cue: int = Field(ge=3, le=12)
    max_duration_seconds: float = Field(gt=0, le=6)
    gap_seconds: float = Field(ge=0, le=2)
    max_lines: int = Field(ge=1, le=3)


class MediaRenderContract(BaseModel):
    model_config = ConfigDict(extra="forbid")

    preset_name: ExportPresetName
    export_mode: ExportMode
    requested_visual_output_mode: VisualOutputMode = "original_people"
    effective_visual_output_mode: VisualOutputMode = "original_people"
    rendering_profile: RenderingProfile = "live_action"
    overlay_policy: OverlayRenderPolicy = "full"
    subtitle_policy: SubtitleRenderPolicy = "spoken_captions"
    render_fallback_reason: str | None = None
    width: int = Field(ge=360)
    height: int = Field(ge=360)
    aspect_ratio: str
    container: str = "mp4"
    video_codec: str = "libx264"
    audio_codec: str = "aac"
    subtitle_timing_profile: SubtitleTimingProfile
    subtitle_timing: SubtitleTimingContract
    overlay_safe_margin_x: int = Field(ge=0)
    overlay_safe_margin_y: int = Field(ge=0)
