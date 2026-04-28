import asyncio
import time

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import FileResponse, Response

from app.dependencies.auth import AuthenticatedUser, get_current_user, get_current_user_for_download
from app.models.analysis import AnalysisResult, AnalysisSummary, AnalyzePodcastRequest
from app.models.clip_insights import PodcastClipMetrics
from app.models.clipping import ClipGenerationResult, GenerateClipsRequest
from app.models.publishing import ClipPublicationResult, PublishClipsRequest
from app.models.podcast import PodcastsResponse
from app.models.search import RecommendationResult
from app.services.analysis_service import (
    AnalysisError,
    analyze_and_score,
    build_analysis_result,
    get_analysis_summary_for_podcast,
    get_scored_segments_for_podcast,
    persist_analysis_result,
    podcast_belongs_to_user,
    score_segments_need_refresh,
    transcribe_podcast_media_for_user,
)
from app.services.clip_insights_service import (
    ClipInsightsError,
    get_clip_metrics_for_podcast,
    record_clip_download,
)
from app.services.clipping_service import (
    ClippingError,
    build_clip_generation_result,
    generate_clips,
    get_clip_download_target,
    get_clip_podcast_id,
    get_clips_for_podcast,
)
from app.services.publishing_service import (
    PublishingError,
    get_published_clip_download_content,
    publish_clips,
)
from app.services.recommendation_service import RecommendationServiceError, recommend_clips
from app.services.podcast_service import get_podcasts_for_user, update_podcast_status_for_user

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
    update_podcast_status_for_user(podcast_id, current_user.id, "processing")
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
        update_podcast_status_for_user(podcast_id, current_user.id, "ready_for_processing")
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    result = build_analysis_result(
        podcast_id,
        scored_segments,
        processing_time_seconds=round(time.perf_counter() - started_at, 3),
    )
    update_podcast_status_for_user(podcast_id, current_user.id, "done")
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
    summary = get_analysis_summary_for_podcast(podcast_id)
    if summary is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No analysis saved yet for this podcast.",
        )
    return summary


@router.post("/{podcast_id}/generate-clips", response_model=ClipGenerationResult)
async def generate_podcast_clips(
    podcast_id: str,
    payload: GenerateClipsRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> ClipGenerationResult:
    if not podcast_belongs_to_user(podcast_id, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Podcast not found for the current user.",
        )

    started_at = time.perf_counter()
    update_podcast_status_for_user(podcast_id, current_user.id, "processing")

    try:
        score_segments = payload.score_segments or get_scored_segments_for_podcast(podcast_id, limit=5)
        transcription = payload.transcription
        refreshed_scores = False

        if not score_segments or score_segments_need_refresh(score_segments):
            if transcription is None:
                transcription = await asyncio.to_thread(
                    transcribe_podcast_media_for_user,
                    podcast_id,
                    current_user.id,
                    model="base",
                )
            score_segments = await asyncio.to_thread(analyze_and_score, podcast_id, transcription)
            refreshed_scores = True

        if refreshed_scores:
            await asyncio.to_thread(
                persist_analysis_result,
                build_analysis_result(
                    podcast_id,
                    score_segments,
                    processing_time_seconds=0.0,
                ),
            )

        clips = await asyncio.to_thread(
            generate_clips,
            podcast_id,
            score_segments,
            transcription,
            payload.export_settings,
        )
    except (AnalysisError, ClippingError) as exc:
        update_podcast_status_for_user(podcast_id, current_user.id, "ready_for_processing")
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    update_podcast_status_for_user(podcast_id, current_user.id, "done")
    return build_clip_generation_result(
        podcast_id,
        clips,
        processing_time_seconds=round(time.perf_counter() - started_at, 3),
        export_settings=clips[0].export_settings if clips else None,
    )


@router.get("/{podcast_id}/clips", response_model=ClipGenerationResult)
async def get_podcast_clips(
    podcast_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> ClipGenerationResult:
    if not podcast_belongs_to_user(podcast_id, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Podcast not found for the current user.",
        )

    result = get_clips_for_podcast(podcast_id)
    if result is None:
        return build_clip_generation_result(
            podcast_id,
            [],
            processing_time_seconds=0.0,
        )
    return result


@router.get("/{podcast_id}/recommendations", response_model=RecommendationResult)
async def get_podcast_recommendations(
    podcast_id: str,
    limit: int = 5,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> RecommendationResult:
    if not podcast_belongs_to_user(podcast_id, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Podcast not found for the current user.",
        )
    try:
        return recommend_clips(podcast_id, limit=limit)
    except RecommendationServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.get("/{podcast_id}/metrics", response_model=PodcastClipMetrics)
async def get_podcast_clip_metrics(
    podcast_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> PodcastClipMetrics:
    if not podcast_belongs_to_user(podcast_id, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Podcast not found for the current user.",
        )
    try:
        return get_clip_metrics_for_podcast(podcast_id)
    except ClipInsightsError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.post("/{podcast_id}/publish-clips", response_model=ClipPublicationResult)
async def publish_podcast_clips(
    podcast_id: str,
    payload: PublishClipsRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> ClipPublicationResult:
    if not podcast_belongs_to_user(podcast_id, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Podcast not found for the current user.",
        )

    try:
        return await asyncio.to_thread(publish_clips, podcast_id, payload.clip_ids)
    except PublishingError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.get("/clips/{clip_id}/download")
async def download_generated_clip(
    clip_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user_for_download),
):
    podcast_id = get_clip_podcast_id(clip_id)
    if not podcast_id or not podcast_belongs_to_user(podcast_id, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clip not found for the current user.",
        )

    content, file_path, filename = get_published_clip_download_content(clip_id)
    if content is not None:
        record_clip_download(clip_id)
        safe_filename = (filename or f"{clip_id}.mp4").replace('"', "")
        return Response(
            content=content,
            media_type="video/mp4",
            headers={"Content-Disposition": f'attachment; filename="{safe_filename}"'},
        )
    if file_path and file_path.exists():
        record_clip_download(clip_id)
        return FileResponse(
            path=file_path,
            media_type="video/mp4",
            filename=(filename or file_path.name),
        )

    _, preview_file_path = get_clip_download_target(clip_id)
    if preview_file_path and preview_file_path.exists():
        return FileResponse(
            path=preview_file_path,
            media_type="video/mp4",
            filename=preview_file_path.name,
        )

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Clip download is unavailable or has been revoked.",
    )
