import asyncio
import time

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status

from app.dependencies.auth import AuthenticatedUser, get_current_user
from app.models.analysis import AnalysisResult, AnalysisSummary, AnalyzePodcastRequest
from app.models.podcast import PodcastsResponse
from app.services.analysis_service import (
    AnalysisError,
    analyze_and_score,
    build_analysis_result,
    get_analysis_summary_for_podcast,
    persist_analysis_result,
    podcast_belongs_to_user,
    transcribe_podcast_media_for_user,
)
from app.services.podcast_service import get_podcasts_for_user

router = APIRouter(prefix="/podcasts", tags=["podcasts"])


@router.get("", response_model=PodcastsResponse)
async def list_podcasts(
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> PodcastsResponse:
    podcasts, is_mock = get_podcasts_for_user(current_user.id)
    return PodcastsResponse(podcasts=podcasts, is_mock=is_mock)


@router.post("/{podcast_id}/analyze", response_model=AnalysisResult)
async def analyze_podcast(
    podcast_id: str,
    payload: AnalyzePodcastRequest,
    background_tasks: BackgroundTasks,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> AnalysisResult:
    if not podcast_belongs_to_user(podcast_id, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Podcast not found for the current user.",
        )
    started_at = time.perf_counter()
    try:
        transcription = payload.transcription
        if transcription is None:
            transcription = await asyncio.to_thread(
                transcribe_podcast_media_for_user,
                podcast_id,
                current_user.id,
                model=payload.transcription_model,
            )
        # Run CPU-bound semantic scoring off the event loop so the API remains responsive.
        scored_segments = await asyncio.to_thread(analyze_and_score, podcast_id, transcription)
    except AnalysisError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    result = build_analysis_result(
        podcast_id,
        scored_segments,
        processing_time_seconds=round(time.perf_counter() - started_at, 3),
    )
    background_tasks.add_task(persist_analysis_result, result)
    return result


@router.get("/{podcast_id}/analysis", response_model=AnalysisSummary)
async def get_podcast_analysis(
    podcast_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> AnalysisSummary:
    if not podcast_belongs_to_user(podcast_id, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Podcast not found for the current user.",
        )
    return get_analysis_summary_for_podcast(podcast_id)
