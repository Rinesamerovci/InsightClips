"""Pydantic models for the backend API."""

# Analysis related models for processing and scoring podcast content
from app.models.analysis import AnalysisResult, AnalysisSummary, AnalyzePodcastRequest, ScoreSegment
# Clipping models for managing the generation and results of video/audio clips
from app.models.clipping import ClipGenerationResult, ClipResult, GenerateClipsRequest
# Clip insights and metrics models for performance tracking and recommendations
from app.models.clip_insights import (
    ClipPlanningInsight,
    ClipMetricRow,
    ClipRecommendationsResponse,
    ClipSearchItem,
    ClipSearchResponse,
    HashtagSuggestion,
    PodcastClipMetrics,
    RankingFactor,
    ReferenceMention,
)
from app.models.export_settings import (
    AudioEnhancementSettings,
    ExportSettings,
    ExportSettingsInput,
    GenerationSettings,
    GenerationSettingsInput,
    SubtitleStyle,
)
from app.models.media import MediaInspectionResult
from app.models.overlay import OverlayDecision, OverlayMappingResult
from app.models.publishing import (
    ClipPublicationResult,
    ClipPublicationStatus,
    ClipPublicationStatusResponse,
    ClipRevocationResult,
    PublicationDestination,
    PublicationStatus,
    PublishClipRequest,
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
# Public API exports
# (Defines what this module exposes)
__all__ = [
    "AnalysisResult",
    "AnalysisSummary",
    "AnalyzePodcastRequest",
    "AudioEnhancementSettings",
    "ClipGenerationResult",
    "ClipMetricRow",
    "ClipPlanningInsight",
    "ClipPublicationResult",
    "ClipPublicationStatus",
    "ClipPublicationStatusResponse",
    "ClipRecommendationsResponse",
    "ClipResult",
    "ClipRevocationResult",
    "ClipSearchItem",
    "ClipSearchHit",
    "ClipSearchResult",
    "ClipSearchResponse",
    "ExportSettings",
    "ExportSettingsInput",
    "GenerationSettings",
    "GenerationSettingsInput",
    "GenerateClipsRequest",
    "HashtagSuggestion",
    "MediaInspectionResult",
    "OverlayDecision",
    "OverlayMappingResult",
    "PodcastClipMetrics",
    "PublicationDestination",
    "PublicationStatus",
    "PublishClipRequest",
    "PublishClipsRequest",
    "RankingFactor",
    "ReferenceMention",
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
