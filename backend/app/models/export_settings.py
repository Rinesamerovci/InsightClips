from __future__ import annotations

import re
from typing import Any, ClassVar, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

ExportMode = Literal["landscape", "portrait"]
CropMode = Literal["none", "center_crop", "smart_crop"]
ExportPresetName = Literal[
    "youtube_landscape",
    "youtube_shorts",
    "instagram_reels",
    "tiktok_vertical",
]
SubtitleStylePreset = Literal["classic", "bold", "minimal", "boxed"]
SubtitlePosition = Literal["top", "center", "bottom"]
AudioEnhancementStatus = Literal["enabled", "disabled", "failed"]
SubtitleTimingProfile = Literal["compact", "balanced", "extended"]

HEX_COLOR_PATTERN = re.compile(r"^#[0-9a-fA-F]{6}$")
VERTICAL_EXPORT_PRESETS = {"youtube_shorts", "instagram_reels", "tiktok_vertical"}
EXPORT_PRESET_EXPORT_MODE: dict[ExportPresetName, ExportMode] = {
    "youtube_landscape": "landscape",
    "youtube_shorts": "portrait",
    "instagram_reels": "portrait",
    "tiktok_vertical": "portrait",
}
EXPORT_PRESET_DEFAULT_CROP_MODE: dict[ExportPresetName, CropMode] = {
    "youtube_landscape": "none",
    "youtube_shorts": "center_crop",
    "instagram_reels": "smart_crop",
    "tiktok_vertical": "smart_crop",
}
EXPORT_PRESET_DEFAULT_TIMING: dict[ExportPresetName, SubtitleTimingProfile] = {
    "youtube_landscape": "extended",
    "youtube_shorts": "balanced",
    "instagram_reels": "compact",
    "tiktok_vertical": "compact",
}


def default_preset_name_for_mode(export_mode: ExportMode) -> ExportPresetName:
    return "youtube_shorts" if export_mode == "portrait" else "youtube_landscape"


def default_crop_mode_for_preset(
    export_mode: ExportMode,
    preset_name: ExportPresetName | None = None,
) -> CropMode:
    resolved_preset = preset_name or default_preset_name_for_mode(export_mode)
    if export_mode == "landscape":
        return "none"
    return EXPORT_PRESET_DEFAULT_CROP_MODE.get(resolved_preset, "center_crop")


def default_timing_profile_for_preset(
    preset_name: ExportPresetName | None,
    export_mode: ExportMode,
) -> SubtitleTimingProfile:
    resolved_preset = preset_name or default_preset_name_for_mode(export_mode)
    return EXPORT_PRESET_DEFAULT_TIMING.get(resolved_preset, "balanced")


class SubtitleStyle(BaseModel):
    model_config = ConfigDict(extra="forbid")

    PRESET_OVERRIDES: ClassVar[dict[SubtitleStylePreset, dict[str, Any]]] = {
        "classic": {},
        "bold": {
            "font_size": 24,
            "background_opacity": 0.25,
            "bold": True,
        },
        "minimal": {
            "font_size": 16,
            "outline_color": "#222222",
            "background_opacity": 0,
        },
        "boxed": {
            "font_size": 20,
            "background_opacity": 0.55,
            "bold": True,
        },
    }

    preset: SubtitleStylePreset = "classic"
    font_family: str = Field(default="Arial", min_length=1, max_length=64)
    font_size: int = Field(default=18, ge=12, le=72)
    primary_color: str = "#FFFFFF"
    outline_color: str = "#000000"
    background_color: str = "#000000"
    background_opacity: float = Field(default=0.2, ge=0, le=1)
    position: SubtitlePosition = "bottom"
    bold: bool = False
    italic: bool = False

    @field_validator("font_family")
    @classmethod
    def validate_font_family(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if not cleaned:
            raise ValueError("font_family cannot be empty.")
        if any(character in cleaned for character in ("'", ":", ",", "\\")):
            raise ValueError("font_family cannot contain quotes, commas, colons, or backslashes.")
        return cleaned

    @field_validator("primary_color", "outline_color", "background_color")
    @classmethod
    def validate_hex_color(cls, value: str) -> str:
        cleaned = value.strip()
        if not HEX_COLOR_PATTERN.fullmatch(cleaned):
            raise ValueError("Subtitle colors must use #RRGGBB hex format.")
        return cleaned.upper()

    @model_validator(mode="after")
    def validate_preset_contract(self) -> "SubtitleStyle":
        for field_name, preset_value in self.PRESET_OVERRIDES[self.preset].items():
            if field_name not in self.model_fields_set:
                setattr(self, field_name, preset_value)
        if self.preset == "minimal" and self.background_opacity > 0:
            raise ValueError("The minimal subtitle preset requires background_opacity=0.")
        if self.preset == "boxed" and self.background_opacity <= 0:
            raise ValueError("The boxed subtitle preset requires background_opacity greater than 0.")
        if self.preset != "minimal" and self.outline_color == self.primary_color:
            raise ValueError("outline_color must differ from primary_color.")
        return self

    @classmethod
    def for_preset(cls, preset: SubtitleStylePreset) -> "SubtitleStyle":
        return cls(preset=preset, **cls.PRESET_OVERRIDES[preset])


class AudioEnhancementSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled: bool = True
    normalize_loudness: bool = True
    target_lufs: float = Field(default=-16.0, ge=-24.0, le=-8.0)
    true_peak_db: float = Field(default=-1.5, ge=-6.0, le=0.0)
    status: AudioEnhancementStatus = "enabled"

    @model_validator(mode="after")
    def derive_status_and_flags(self) -> "AudioEnhancementSettings":
        if self.status == "failed":
            self.enabled = True
            self.normalize_loudness = False
            return self
        if not self.enabled:
            self.normalize_loudness = False
            self.status = "disabled"
        else:
            self.status = "enabled" if self.normalize_loudness else "disabled"
        return self


class GenerationSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    clip_duration_seconds: int = Field(default=30, ge=8, le=90)
    number_of_clips: int = Field(default=5, ge=1, le=10)
    topic_focus: str | None = Field(default=None, max_length=120)
    subtitles_enabled: bool = True

    @field_validator("topic_focus")
    @classmethod
    def normalize_topic_focus(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = " ".join(value.split())
        if not cleaned:
            return None
        if not re.fullmatch(r"[A-Za-z0-9\s,.'\-#/&]+", cleaned):
            raise ValueError("topic_focus can only contain letters, numbers, spaces, and simple punctuation.")
        return cleaned


class GenerationSettingsInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    clip_duration_seconds: int | None = Field(default=None, ge=8, le=90)
    number_of_clips: int | None = Field(default=None, ge=1, le=10)
    topic_focus: str | None = Field(default=None, max_length=120)
    subtitles_enabled: bool | None = None

    @field_validator("topic_focus")
    @classmethod
    def normalize_topic_focus(cls, value: str | None) -> str | None:
        return GenerationSettings.normalize_topic_focus(value)

    def resolve(self, base: GenerationSettings | None = None) -> GenerationSettings:
        resolved_base = base or GenerationSettings()
        return resolved_base.model_copy(
            update={
                key: value
                for key, value in {
                    "clip_duration_seconds": self.clip_duration_seconds,
                    "number_of_clips": self.number_of_clips,
                    "topic_focus": self.topic_focus,
                    "subtitles_enabled": self.subtitles_enabled,
                }.items()
                if value is not None
            }
        )


class ExportSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    preset_name: ExportPresetName = "youtube_landscape"
    export_mode: ExportMode = "landscape"
    crop_mode: CropMode = "none"
    subtitle_timing_profile: SubtitleTimingProfile = "extended"
    mobile_optimized: bool = False
    face_tracking_enabled: bool = False
    subtitle_style: SubtitleStyle = Field(default_factory=SubtitleStyle)
    audio_enhancement: AudioEnhancementSettings = Field(default_factory=AudioEnhancementSettings)
    generation_settings: GenerationSettings = Field(default_factory=GenerationSettings)

    @model_validator(mode="after")
    def validate_export_preferences(self) -> "ExportSettings":
        if "preset_name" not in self.model_fields_set:
            self.preset_name = default_preset_name_for_mode(self.export_mode)
        if "subtitle_timing_profile" not in self.model_fields_set:
            self.subtitle_timing_profile = default_timing_profile_for_preset(
                self.preset_name,
                self.export_mode,
            )
        expected_export_mode = EXPORT_PRESET_EXPORT_MODE[self.preset_name]
        if self.export_mode != expected_export_mode:
            raise ValueError(
                f"{self.preset_name} requires export_mode='{expected_export_mode}'."
            )
        if self.export_mode == "landscape" and self.crop_mode != "none":
            raise ValueError("Landscape exports only support crop_mode='none'.")
        if self.export_mode == "portrait" and self.crop_mode == "none":
            raise ValueError("Portrait exports require crop_mode='center_crop' or 'smart_crop'.")
        if self.face_tracking_enabled and self.crop_mode != "smart_crop":
            raise ValueError("Face tracking requires crop_mode='smart_crop'.")
        return self


class ExportSettingsInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    preset_name: ExportPresetName | None = None
    export_mode: ExportMode = "landscape"
    crop_mode: CropMode | None = None
    subtitle_timing_profile: SubtitleTimingProfile | None = None
    mobile_optimized: bool = False
    face_tracking_enabled: bool = False
    subtitle_style: SubtitleStyle | None = None
    audio_enhancement: AudioEnhancementSettings | None = None
    generation_settings: GenerationSettingsInput | None = None

    @model_validator(mode="after")
    def validate_request_preferences(self) -> "ExportSettingsInput":
        resolved_preset_name = self.preset_name or default_preset_name_for_mode(self.export_mode)
        expected_export_mode = EXPORT_PRESET_EXPORT_MODE[resolved_preset_name]
        if self.export_mode != expected_export_mode:
            raise ValueError(
                f"{resolved_preset_name} requires export_mode='{expected_export_mode}'."
            )
        resolved_crop_mode = self.crop_mode or default_crop_mode_for_preset(
            self.export_mode,
            resolved_preset_name,
        )
        if self.export_mode == "landscape" and resolved_crop_mode != "none":
            raise ValueError("Landscape exports only support crop_mode='none'.")
        if self.export_mode == "portrait" and resolved_crop_mode == "none":
            raise ValueError("Portrait exports require crop_mode='center_crop' or 'smart_crop'.")
        if self.face_tracking_enabled and resolved_crop_mode != "smart_crop":
            raise ValueError("Face tracking requires crop_mode='smart_crop'.")
        return self

    def resolve(self) -> ExportSettings:
        resolved_preset_name = self.preset_name or default_preset_name_for_mode(self.export_mode)
        return ExportSettings(
            preset_name=resolved_preset_name,
            export_mode=self.export_mode,
            crop_mode=self.crop_mode or default_crop_mode_for_preset(self.export_mode, resolved_preset_name),
            subtitle_timing_profile=self.subtitle_timing_profile or default_timing_profile_for_preset(
                resolved_preset_name,
                self.export_mode,
            ),
            mobile_optimized=self.mobile_optimized,
            face_tracking_enabled=self.face_tracking_enabled,
            subtitle_style=self.subtitle_style or SubtitleStyle(),
            audio_enhancement=self.audio_enhancement or AudioEnhancementSettings(),
            generation_settings=(
                self.generation_settings.resolve()
                if self.generation_settings is not None
                else GenerationSettings()
            ),
        )
