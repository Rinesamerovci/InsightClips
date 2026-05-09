from dataclasses import dataclass
from pathlib import Path

from app.models.export_settings import (
    ExportMode,
    ExportPresetName,
    ExportSettings,
    ExportSettingsInput,
    SubtitleStyle,
    SubtitleTimingProfile,
)
from app.models.media import MediaInspectionResult, MediaRenderContract, SubtitleTimingContract
from app.utils.media import inspect_media


def inspect_staged_media(
    file_path: str | Path,
    *,
    filename: str | None = None,
    mime_type: str | None = None,
) -> MediaInspectionResult:
    return inspect_media(Path(file_path), filename=filename, mime_type=mime_type)


@dataclass(frozen=True)
class _PresetSpec:
    preset_name: ExportPresetName
    export_mode: ExportMode
    width: int
    height: int
    aspect_ratio: str
    default_crop_mode: str
    mobile_optimized: bool
    subtitle_timing_profile: SubtitleTimingProfile
    overlay_safe_margin_x: int
    overlay_safe_margin_y: int


PRESET_SPECS: dict[ExportPresetName, _PresetSpec] = {
    "youtube_landscape": _PresetSpec(
        preset_name="youtube_landscape",
        export_mode="landscape",
        width=1920,
        height=1080,
        aspect_ratio="16:9",
        default_crop_mode="none",
        mobile_optimized=False,
        subtitle_timing_profile="extended",
        overlay_safe_margin_x=42,
        overlay_safe_margin_y=38,
    ),
    "youtube_shorts": _PresetSpec(
        preset_name="youtube_shorts",
        export_mode="portrait",
        width=1080,
        height=1920,
        aspect_ratio="9:16",
        default_crop_mode="center_crop",
        mobile_optimized=True,
        subtitle_timing_profile="balanced",
        overlay_safe_margin_x=28,
        overlay_safe_margin_y=72,
    ),
    "instagram_reels": _PresetSpec(
        preset_name="instagram_reels",
        export_mode="portrait",
        width=1080,
        height=1920,
        aspect_ratio="9:16",
        default_crop_mode="smart_crop",
        mobile_optimized=True,
        subtitle_timing_profile="compact",
        overlay_safe_margin_x=28,
        overlay_safe_margin_y=84,
    ),
    "tiktok_vertical": _PresetSpec(
        preset_name="tiktok_vertical",
        export_mode="portrait",
        width=1080,
        height=1920,
        aspect_ratio="9:16",
        default_crop_mode="smart_crop",
        mobile_optimized=True,
        subtitle_timing_profile="compact",
        overlay_safe_margin_x=26,
        overlay_safe_margin_y=88,
    ),
}


def resolve_export_settings_for_render(
    export_settings: ExportSettingsInput | ExportSettings | None,
    *,
    clip_duration_seconds: float | None = None,
) -> ExportSettings:
    base_settings = _coerce_export_settings(export_settings).model_copy(deep=True)
    preset = PRESET_SPECS[base_settings.preset_name]
    subtitle_timing_profile = base_settings.subtitle_timing_profile or preset.subtitle_timing_profile

    if preset.export_mode == "landscape":
        crop_mode = "none"
        mobile_optimized = False
        face_tracking_enabled = False
    else:
        crop_mode = (
            base_settings.crop_mode
            if base_settings.crop_mode in {"center_crop", "smart_crop"}
            else preset.default_crop_mode
        )
        mobile_optimized = True
        face_tracking_enabled = base_settings.face_tracking_enabled and crop_mode == "smart_crop"

    tuned_subtitle_style = _tune_subtitle_style(
        base_settings.subtitle_style,
        export_mode=preset.export_mode,
        subtitle_timing_profile=subtitle_timing_profile,
        clip_duration_seconds=clip_duration_seconds,
    )

    return base_settings.model_copy(
        update={
            "export_mode": preset.export_mode,
            "crop_mode": crop_mode,
            "subtitle_timing_profile": subtitle_timing_profile,
            "mobile_optimized": mobile_optimized,
            "face_tracking_enabled": face_tracking_enabled,
            "subtitle_style": tuned_subtitle_style,
        },
        deep=True,
    )


def build_render_contract(
    export_settings: ExportSettingsInput | ExportSettings | None,
    *,
    clip_duration_seconds: float | None = None,
) -> MediaRenderContract:
    resolved_settings = resolve_export_settings_for_render(
        export_settings,
        clip_duration_seconds=clip_duration_seconds,
    )
    preset = PRESET_SPECS[resolved_settings.preset_name]
    subtitle_timing = build_subtitle_timing_contract(
        resolved_settings,
        clip_duration_seconds=clip_duration_seconds,
    )
    return MediaRenderContract(
        preset_name=resolved_settings.preset_name,
        export_mode=resolved_settings.export_mode,
        width=preset.width,
        height=preset.height,
        aspect_ratio=preset.aspect_ratio,
        subtitle_timing_profile=resolved_settings.subtitle_timing_profile,
        subtitle_timing=subtitle_timing,
        overlay_safe_margin_x=preset.overlay_safe_margin_x,
        overlay_safe_margin_y=preset.overlay_safe_margin_y,
    )


def build_subtitle_timing_contract(
    export_settings: ExportSettingsInput | ExportSettings | None,
    *,
    clip_duration_seconds: float | None = None,
) -> SubtitleTimingContract:
    resolved_settings = _coerce_export_settings(export_settings)
    duration = max(float(clip_duration_seconds or 30.0), 1.0)
    duration_bucket = "short" if duration <= 18 else "long" if duration >= 55 else "medium"
    profile = resolved_settings.subtitle_timing_profile

    presets: dict[SubtitleTimingProfile, dict[str, tuple[int, float, float]]] = {
        "compact": {
            "short": (5, 1.9, 0.24),
            "medium": (6, 2.3, 0.34),
            "long": (6, 2.6, 0.4),
        },
        "balanced": {
            "short": (6, 2.3, 0.34),
            "medium": (7, 2.8, 0.44),
            "long": (7, 3.1, 0.5),
        },
        "extended": {
            "short": (7, 2.7, 0.42),
            "medium": (8, 3.2, 0.5),
            "long": (8, 3.5, 0.56),
        },
    }
    max_words_per_cue, max_duration_seconds, gap_seconds = presets[profile][duration_bucket]

    if resolved_settings.export_mode == "portrait":
        max_words_per_cue = max(4, max_words_per_cue - 1)
        max_duration_seconds = min(max_duration_seconds, 3.0)
        gap_seconds = max(0.2, gap_seconds - 0.04)

    return SubtitleTimingContract(
        max_words_per_cue=max_words_per_cue,
        max_duration_seconds=round(max_duration_seconds, 2),
        gap_seconds=round(gap_seconds, 2),
        max_lines=2,
    )


def _coerce_export_settings(
    export_settings: ExportSettingsInput | ExportSettings | None,
) -> ExportSettings:
    if isinstance(export_settings, ExportSettings):
        return export_settings
    if isinstance(export_settings, ExportSettingsInput):
        return export_settings.resolve()
    return ExportSettings()


def _tune_subtitle_style(
    subtitle_style: SubtitleStyle,
    *,
    export_mode: ExportMode,
    subtitle_timing_profile: SubtitleTimingProfile,
    clip_duration_seconds: float | None,
) -> SubtitleStyle:
    tuned = subtitle_style.model_copy(deep=True)
    duration = max(float(clip_duration_seconds or 30.0), 1.0)

    if export_mode == "portrait":
        minimum_font_size = 22 if duration <= 18 else 20 if duration <= 45 else 18
        maximum_font_size = 30 if subtitle_timing_profile == "compact" else 28
    else:
        minimum_font_size = 20 if duration <= 20 else 18
        maximum_font_size = 28

    tuned.font_size = max(minimum_font_size, min(tuned.font_size, maximum_font_size))

    if tuned.preset == "minimal":
        tuned.background_opacity = 0
    elif tuned.preset == "boxed":
        tuned.background_opacity = max(tuned.background_opacity, 0.45)
    else:
        minimum_background = 0.16 if export_mode == "portrait" else 0.12
        tuned.background_opacity = max(tuned.background_opacity, minimum_background)

    if tuned.preset != "minimal" and tuned.outline_color == tuned.primary_color:
        tuned.outline_color = "#000000" if tuned.primary_color.upper() != "#000000" else "#FFFFFF"

    if export_mode == "portrait" and tuned.position == "bottom" and duration >= 45:
        tuned.position = "center"

    return tuned
