from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, model_validator

ExportMode = Literal["landscape", "portrait"]
CropMode = Literal["none", "center_crop", "smart_crop"]


class ExportSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    export_mode: ExportMode = "landscape"
    crop_mode: CropMode = "none"
    mobile_optimized: bool = False
    face_tracking_enabled: bool = False

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
        )
