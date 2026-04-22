"""Pydantic models for the backend API."""

from app.models.analysis import AnalysisResult, AnalysisSummary, AnalyzePodcastRequest, ScoreSegment
from app.models.clipping import ClipGenerationResult, ClipResult, GenerateClipsRequest
from app.models.clip_insights import (
    ClipMetricRow,
    ClipRecommendationsResponse,
    ClipSearchItem,
    ClipSearchResponse,
    PodcastClipMetrics,
)
from app.models.media import MediaInspectionResult
from app.models.publishing import (
    ClipPublicationResult,
    ClipPublicationStatus,
    ClipRevocationResult,
    PublishClipsRequest,
)
from app.models.transcription import TranscriptWord, TranscriptionResult
from app.models.upload import (
    UploadCalculatePriceRequest,
    UploadCalculatePriceResponse,
    UploadPrepareRequest,
    UploadPrepareResponse,
)

__all__ = [
    "AnalysisResult",
    "AnalysisSummary",
    "AnalyzePodcastRequest",
    "ClipGenerationResult",
    "ClipMetricRow",
    "ClipPublicationResult",
    "ClipPublicationStatus",
    "ClipRecommendationsResponse",
    "ClipResult",
    "ClipRevocationResult",
    "ClipSearchItem",
    "ClipSearchResponse",
    "GenerateClipsRequest",
    "MediaInspectionResult",
    "PodcastClipMetrics",
    "PublishClipsRequest",
    "ScoreSegment",
    "TranscriptWord",
    "TranscriptionResult",
    "UploadCalculatePriceRequest",
    "UploadCalculatePriceResponse",
    "UploadPrepareRequest",
    "UploadPrepareResponse",
]
