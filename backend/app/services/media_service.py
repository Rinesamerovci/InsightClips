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
from app.models.media import VisualOutputMode
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
    visual_output_mode: VisualOutputMode = "original_people",
    subtitles_available: bool = True,
    clip_duration_seconds: float | None = None,
) -> ExportSettings:
    base_settings = _coerce_export_settings(export_settings).model_copy(deep=True)
    preset = PRESET_SPECS[base_settings.preset_name]
    subtitle_timing_profile = base_settings.subtitle_timing_profile or preset.subtitle_timing_profile
    mode_behavior = _resolve_visual_mode_behavior(
        base_settings,
        visual_output_mode=visual_output_mode,
        subtitles_available=subtitles_available,
    )

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
        visual_output_mode=mode_behavior["effective_visual_output_mode"],
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
    visual_output_mode: VisualOutputMode = "original_people",
    subtitles_available: bool = True,
    clip_duration_seconds: float | None = None,
) -> MediaRenderContract:
    resolved_settings = resolve_export_settings_for_render(
        export_settings,
        visual_output_mode=visual_output_mode,
        subtitles_available=subtitles_available,
        clip_duration_seconds=clip_duration_seconds,
    )
    preset = PRESET_SPECS[resolved_settings.preset_name]
    mode_behavior = _resolve_visual_mode_behavior(
        resolved_settings,
        visual_output_mode=visual_output_mode,
        subtitles_available=subtitles_available,
    )
    subtitle_timing = build_subtitle_timing_contract(
        resolved_settings,
        visual_output_mode=visual_output_mode,
        subtitles_available=subtitles_available,
        clip_duration_seconds=clip_duration_seconds,
    )
    overlay_margin_x, overlay_margin_y = _compute_overlay_safe_margins(
        preset,
        resolved_settings,
        effective_visual_output_mode=mode_behavior["effective_visual_output_mode"],
        subtitle_policy=mode_behavior["subtitle_policy"],
    )
    return MediaRenderContract(
        preset_name=resolved_settings.preset_name,
        export_mode=resolved_settings.export_mode,
        requested_visual_output_mode=visual_output_mode,
        effective_visual_output_mode=mode_behavior["effective_visual_output_mode"],
        rendering_profile=mode_behavior["rendering_profile"],
        overlay_policy=mode_behavior["overlay_policy"],
        subtitle_policy=mode_behavior["subtitle_policy"],
        render_fallback_reason=mode_behavior["render_fallback_reason"],
        width=preset.width,
        height=preset.height,
        aspect_ratio=preset.aspect_ratio,
        subtitle_timing_profile=resolved_settings.subtitle_timing_profile,
        subtitle_timing=subtitle_timing,
        overlay_safe_margin_x=overlay_margin_x,
        overlay_safe_margin_y=overlay_margin_y,
    )


def build_subtitle_timing_contract(
    export_settings: ExportSettingsInput | ExportSettings | None,
    *,
    visual_output_mode: VisualOutputMode = "original_people",
    subtitles_available: bool = True,
    clip_duration_seconds: float | None = None,
) -> SubtitleTimingContract:
    resolved_settings = _coerce_export_settings(export_settings)
    duration = max(float(clip_duration_seconds or 30.0), 1.0)
    duration_bucket = "short" if duration <= 18 else "long" if duration >= 55 else "medium"
    profile = resolved_settings.subtitle_timing_profile
    mode_behavior = _resolve_visual_mode_behavior(
        resolved_settings,
        visual_output_mode=visual_output_mode,
        subtitles_available=subtitles_available,
    )

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

    if mode_behavior["effective_visual_output_mode"] == "book_like":
        max_words_per_cue = max(3, max_words_per_cue - 2)
        max_duration_seconds = min(4.0, max_duration_seconds + 0.35)
        gap_seconds = min(0.8, gap_seconds + 0.08)
    elif mode_behavior["effective_visual_output_mode"] == "stylized_animated":
        max_words_per_cue = max(3, max_words_per_cue - 2)
        max_duration_seconds = min(max_duration_seconds, 2.4)
        gap_seconds = max(0.18, gap_seconds - 0.06)

    max_lines = 3 if resolved_settings.export_mode == "portrait" else 2
    if mode_behavior["subtitle_policy"] == "narrative_cards":
        max_lines = 3
    elif mode_behavior["subtitle_policy"] == "stylized_captions":
        max_lines = 2 if duration <= 18 else 3
    max_lines = max(1, min(max_lines, 3))

    return SubtitleTimingContract(
        max_words_per_cue=max_words_per_cue,
        max_duration_seconds=round(max_duration_seconds, 2),
        gap_seconds=round(gap_seconds, 2),
        max_lines=max_lines,
    )


def _coerce_export_settings(
    export_settings: ExportSettingsInput | ExportSettings | None,
) -> ExportSettings:
    if isinstance(export_settings, ExportSettings):
        return export_settings
    if isinstance(export_settings, ExportSettingsInput):
        return export_settings.resolve()
    return ExportSettings()


def _compute_overlay_safe_margins(
    preset: _PresetSpec,
    export_settings: ExportSettings,
    *,
    effective_visual_output_mode: VisualOutputMode,
    subtitle_policy: str,
) -> tuple[int, int]:
    overlay_margin_x = preset.overlay_safe_margin_x
    overlay_margin_y = preset.overlay_safe_margin_y

    if export_settings.export_mode == "portrait":
        overlay_margin_x += 6

    subtitle_position = export_settings.subtitle_style.position
    if subtitle_position == "center":
        overlay_margin_y += 40 if export_settings.export_mode == "portrait" else 28
    elif subtitle_position in {"top", "bottom"}:
        overlay_margin_y += 18 if export_settings.export_mode == "portrait" else 12

    if subtitle_policy == "narrative_cards":
        overlay_margin_x += 4
        overlay_margin_y += 18
    elif subtitle_policy == "stylized_captions":
        overlay_margin_x += 6
        overlay_margin_y += 24

    if effective_visual_output_mode == "book_like":
        overlay_margin_x += 10
        overlay_margin_y += 18
    elif effective_visual_output_mode == "stylized_animated":
        overlay_margin_x += 14
        overlay_margin_y += 26

    return overlay_margin_x, overlay_margin_y


def _tune_subtitle_style(
    subtitle_style: SubtitleStyle,
    *,
    export_mode: ExportMode,
    subtitle_timing_profile: SubtitleTimingProfile,
    clip_duration_seconds: float | None,
    visual_output_mode: VisualOutputMode,
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

    if visual_output_mode == "book_like":
        if tuned.font_family == "Arial":
            tuned.font_family = "Georgia"
        tuned.italic = True
        tuned.position = "top"
        tuned.background_opacity = max(tuned.background_opacity, 0.42)
        tuned.font_size = max(tuned.font_size, 20 if export_mode == "landscape" else 22)
    elif visual_output_mode == "stylized_animated":
        if tuned.font_family == "Arial":
            tuned.font_family = "DM Sans"
        tuned.bold = True
        tuned.position = "center"
        tuned.background_opacity = max(tuned.background_opacity, 0.58)
        tuned.font_size = max(tuned.font_size, 24 if export_mode == "portrait" else 20)

    return tuned


def _resolve_visual_mode_behavior(
    export_settings: ExportSettings,
    *,
    visual_output_mode: VisualOutputMode,
    subtitles_available: bool,
) -> dict[str, str | None]:
    if visual_output_mode == "book_like":
        if not subtitles_available:
            return {
                "effective_visual_output_mode": "original_people",
                "rendering_profile": "live_action",
                "overlay_policy": "full",
                "subtitle_policy": "spoken_captions",
                "render_fallback_reason": "book_like_requires_subtitles",
            }
        return {
            "effective_visual_output_mode": "book_like",
            "rendering_profile": "editorial_frame",
            "overlay_policy": "disabled",
            "subtitle_policy": "narrative_cards",
            "render_fallback_reason": None,
        }

    if visual_output_mode == "stylized_animated":
        if export_settings.export_mode != "portrait":
            return {
                "effective_visual_output_mode": "original_people",
                "rendering_profile": "live_action",
                "overlay_policy": "full",
                "subtitle_policy": "spoken_captions",
                "render_fallback_reason": "stylized_animated_requires_portrait_export",
            }
        if not subtitles_available:
            return {
                "effective_visual_output_mode": "original_people",
                "rendering_profile": "live_action",
                "overlay_policy": "full",
                "subtitle_policy": "spoken_captions",
                "render_fallback_reason": "stylized_animated_requires_subtitles",
            }
        return {
            "effective_visual_output_mode": "stylized_animated",
            "rendering_profile": "motion_graphic",
            "overlay_policy": "limited",
            "subtitle_policy": "stylized_captions",
            "render_fallback_reason": None,
        }

    return {
        "effective_visual_output_mode": "original_people",
        "rendering_profile": "live_action",
        "overlay_policy": "full",
        "subtitle_policy": "spoken_captions",
        "render_fallback_reason": None,
    }
