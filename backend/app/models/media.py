from pydantic import BaseModel, ConfigDict, Field

from app.models.export_settings import ExportMode, ExportPresetName, SubtitleTimingProfile


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
