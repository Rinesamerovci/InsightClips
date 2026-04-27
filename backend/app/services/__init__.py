"""Service layer for InsightClips."""

from app.services.analysis_service import (
    analyze_and_score,
    build_analysis_result,
    get_analysis_summary_for_podcast,
    persist_analysis_result,
    transcribe_podcast_media_for_user,
)
from app.services.media_service import inspect_staged_media
from app.services.overlay_mapping_service import (
    build_overlay_mappings,
    detect_overlay_decision,
    get_overlay_decisions_for_podcast,
    persist_overlay_mappings,
)
from app.services.publishing_service import publish_clips, revoke_clip_download
from app.services.recommendation_service import recommend_clips
from app.services.search_service import search_clips
from app.services.transcription_service import transcribe_media

__all__ = [
    "analyze_and_score",
    "build_analysis_result",
    "get_analysis_summary_for_podcast",
    "get_overlay_decisions_for_podcast",
    "inspect_staged_media",
    "build_overlay_mappings",
    "detect_overlay_decision",
    "persist_analysis_result",
    "persist_overlay_mappings",
    "publish_clips",
    "recommend_clips",
    "revoke_clip_download",
    "search_clips",
    "transcribe_podcast_media_for_user",
    "transcribe_media",
]
