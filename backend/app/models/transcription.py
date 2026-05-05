from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class TranscriptWord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    word: str
    start: float = Field(ge=0)
    end: float = Field(ge=0)
    confidence: float = Field(ge=0, le=1)

    @field_validator("word")
    @classmethod
    def validate_word(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Word cannot be empty.")
        return cleaned

    @model_validator(mode="after")
    def validate_window(self) -> "TranscriptWord":
        if self.end < self.start:
            raise ValueError("Word end timestamp must be greater than or equal to start timestamp.")
        return self


class TranscriptionResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    transcript_text: str
    duration_seconds: float = Field(ge=0)
    detected_language: str
    words: list[TranscriptWord] = Field(default_factory=list)
    model_used: str
    processing_time_seconds: float = Field(ge=0)

    @field_validator("transcript_text", "detected_language", "model_used")
    @classmethod
    def validate_required_strings(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Field cannot be empty.")
        return cleaned
