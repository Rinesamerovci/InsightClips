from __future__ import annotations

import re
from typing import Any, ClassVar, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

ExportMode = Literal["landscape", "portrait"]
CropMode = Literal["none", "center_crop", "smart_crop"]
SubtitleStylePreset = Literal["classic", "bold", "minimal", "boxed"]
SubtitlePosition = Literal["top", "center", "bottom"]

HEX_COLOR_PATTERN = re.compile(r"^#[0-9a-fA-F]{6}$")


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


class ExportSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    export_mode: ExportMode = "landscape"
    crop_mode: CropMode = "none"
    mobile_optimized: bool = False
    face_tracking_enabled: bool = False
    subtitle_style: SubtitleStyle = Field(default_factory=SubtitleStyle)

    @model_validator(mode="after")
    def validate_export_preferences(self) -> "ExportSettings":
        if self.export_mode == "landscape" and self.crop_mode != "none":
            raise ValueError("Landscape exports only support crop_mode='none'.")
        if self.face_tracking_enabled and self.crop_mode != "smart_crop":
            raise ValueError("Face tracking requires crop_mode='smart_crop'.")
        return self


class ExportSettingsInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    export_mode: ExportMode = "landscape"
    crop_mode: CropMode | None = None
    mobile_optimized: bool = False
    face_tracking_enabled: bool = False
    subtitle_style: SubtitleStyle | None = None

    @model_validator(mode="after")
    def validate_request_preferences(self) -> "ExportSettingsInput":
        resolved_crop_mode = self.crop_mode or ("center_crop" if self.export_mode == "portrait" else "none")
        if self.export_mode == "landscape" and resolved_crop_mode != "none":
            raise ValueError("Landscape exports only support crop_mode='none'.")
        if self.face_tracking_enabled and resolved_crop_mode != "smart_crop":
            raise ValueError("Face tracking requires crop_mode='smart_crop'.")
        return self

    def resolve(self) -> ExportSettings:
        return ExportSettings(
            export_mode=self.export_mode,
            crop_mode=self.crop_mode or ("center_crop" if self.export_mode == "portrait" else "none"),
            mobile_optimized=self.mobile_optimized,
            face_tracking_enabled=self.face_tracking_enabled,
            subtitle_style=self.subtitle_style or SubtitleStyle(),
        )
