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
from app.models.export_settings import AudioEnhancementSettings, ExportSettings, ExportSettingsInput, SubtitleStyle
from app.models.media import MediaInspectionResult
from app.models.overlay import OverlayDecision, OverlayMappingResult
from app.models.publishing import (
    ClipPublicationResult,
    ClipPublicationStatus,
    ClipRevocationResult,
    PublishClipsRequest,
)
from app.models.search import (
    ClipSearchHit,
    ClipSearchResult,
    RecommendationItem,
    RecommendationResult,
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
    "AudioEnhancementSettings",
    "ClipGenerationResult",
    "ClipMetricRow",
    "ClipPublicationResult",
    "ClipPublicationStatus",
    "ClipRecommendationsResponse",
    "ClipResult",
    "ClipRevocationResult",
    "ClipSearchItem",
    "ClipSearchHit",
    "ClipSearchResult",
    "ClipSearchResponse",
    "ExportSettings",
    "ExportSettingsInput",
    "GenerateClipsRequest",
    "MediaInspectionResult",
    "OverlayDecision",
    "OverlayMappingResult",
    "PodcastClipMetrics",
    "PublishClipsRequest",
    "RecommendationItem",
    "RecommendationResult",
    "ScoreSegment",
    "SubtitleStyle",
    "TranscriptWord",
    "TranscriptionResult",
    "UploadCalculatePriceRequest",
    "UploadCalculatePriceResponse",
    "UploadPrepareRequest",
    "UploadPrepareResponse",
]
