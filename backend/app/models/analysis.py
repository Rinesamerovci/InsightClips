from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.transcription import TranscriptionResult


class ScoreSegment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    segment_start_seconds: float = Field(ge=0)
    segment_end_seconds: float = Field(ge=0)
    duration_seconds: float = Field(gt=0)
    virality_score: float = Field(ge=0, le=100)
    transcript_snippet: str
    sentiment: Literal["positive", "neutral", "negative"]
    keywords: list[str] = Field(default_factory=list)

    @field_validator("transcript_snippet")
    @classmethod
    def validate_transcript_snippet(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if not cleaned:
            raise ValueError("Transcript snippet cannot be empty.")
        return cleaned

    @field_validator("keywords")
    @classmethod
    def validate_keywords(cls, value: list[str]) -> list[str]:
        normalized: list[str] = []
        seen: set[str] = set()
        for item in value:
            cleaned = item.strip().lower()
            if cleaned and cleaned not in seen:
                normalized.append(cleaned)
                seen.add(cleaned)
        return normalized

    @model_validator(mode="after")
    def validate_window(self) -> "ScoreSegment":
        if self.segment_end_seconds < self.segment_start_seconds:
            raise ValueError("Segment end must be greater than or equal to segment start.")
        expected_duration = round(self.segment_end_seconds - self.segment_start_seconds, 3)
        if abs(expected_duration - self.duration_seconds) > 0.02:
            raise ValueError("Duration must match the segment timestamp range.")
        return self


class AnalysisResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    podcast_id: str
    total_segments_analyzed: int = Field(ge=0)
    top_scoring_segments: list[ScoreSegment] = Field(default_factory=list)
    all_scored_segments: list[ScoreSegment] = Field(default_factory=list, exclude=True)
    average_score: float = Field(ge=0, le=100)
    processing_time_seconds: float = Field(ge=0)

    @field_validator("podcast_id")
    @classmethod
    def validate_podcast_id(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Podcast id cannot be empty.")
        return cleaned


class AnalyzePodcastRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    transcription: TranscriptionResult | None = None
    transcription_model: str = "base"


class AnalysisSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    podcast_id: str
    total_scored_segments: int = Field(ge=0)
    highest_score: float = Field(ge=0, le=100)
    top_segments: list[ScoreSegment] = Field(default_factory=list)
