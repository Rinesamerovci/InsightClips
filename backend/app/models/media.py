from pydantic import BaseModel, ConfigDict, Field


class MediaInspectionResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    duration_seconds: float
    duration_minutes: float
    is_supported: bool
    detected_format: str | None = None
    mime_type: str | None = None
    validation_flags: dict[str, bool] = Field(default_factory=dict)
