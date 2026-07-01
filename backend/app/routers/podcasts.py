import asyncio
import time
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse, RedirectResponse, Response

from app.dependencies.auth import AuthenticatedUser, get_current_user, get_current_user_for_download
from app.models.analysis import AnalysisResult, AnalysisSummary, AnalyzePodcastRequest
from app.models.clip_insights import PodcastClipMetrics
from app.models.clipping import ClipGenerationResult, GenerateClipsRequest
from app.models.publishing import (
    ClipPublicationResult,
    ContentCalendarPlatform,
    ContentCalendarResponse,
    PublishClipsRequest,
)
from app.models.transcription import TranscriptionResult
from app.models.podcast import (
    DeletePodcastResponse,
    PodcastResponse,
    PodcastsResponse,
    UpdatePaymentStatusRequest,
    UserPodcastAnalytics,
)
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
    get_clip_subtitle_target,
)
from app.services.publishing_service import (
    PublishingError,
    build_content_calendar,
    publish_clips,
)
from app.services.recommendation_service import RecommendationServiceError, recommend_clips
from app.services.profile_service import get_profile_for_analytics
from app.services.profile_service import get_user_export_settings, update_user_export_settings
from app.services.podcast_service import (
    PodcastDeletionError,
    delete_podcast_for_user,
    get_podcast_for_user,
    get_podcasts_for_user,
    get_user_podcast_analytics,
    update_podcast_payment_status_for_user,
    update_podcast_status_for_user,
    update_podcast_import_metadata_for_user,
)

router = APIRouter(prefix="/podcasts", tags=["podcasts"])


def _get_owned_podcast_or_404(podcast_id: str, user_id: str):
    podcast = get_podcast_for_user(podcast_id, user_id)
    if podcast is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Podcast not found for the current user.",
        )
    return podcast


def _assert_podcast_can_process(podcast_id: str, user_id: str):
    podcast = _get_owned_podcast_or_404(podcast_id, user_id)
    payment_status = podcast.payment_status
    if podcast.status == "awaiting_payment" or payment_status == "pending":
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Payment is required before this podcast can be analyzed or used to generate clips.",
        )
    if podcast.status == "blocked" or payment_status == "failed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This podcast is blocked and cannot be processed.",
        )
    if podcast.status not in {"ready_for_processing", "processing", "done"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This podcast is not ready for processing yet.",
        )
    return podcast


def _is_unsatisfiable_byte_range(range_header: str | None, *, file_size: int) -> bool:
    if not range_header:
        return False

    normalized = range_header.strip().lower()
    if not normalized.startswith("bytes="):
        return False

    first_range = normalized[6:].split(",", 1)[0].strip()
    if "-" not in first_range:
        return False

    start_raw, end_raw = first_range.split("-", 1)
    try:
        if start_raw:
            return int(start_raw) >= file_size
        if end_raw:
            return file_size <= 0 or int(end_raw) <= 0
    except ValueError:
        return False

    return False


def _build_local_file_response(
    request: Request,
    file_path: Path,
    *,
    media_type: str = "video/mp4",
    filename: str | None = None,
) -> Response:
    headers = {"Cache-Control": "no-store"}
    file_size = file_path.stat().st_size

    # Browsers can reuse a stale byte range after clips are regenerated locally.
    # Returning the full file avoids a noisy 416 and lets preview/download recover.
    if _is_unsatisfiable_byte_range(request.headers.get("range"), file_size=file_size):
        safe_filename = (filename or file_path.name).replace('"', "")
        return Response(
            content=file_path.read_bytes(),
            media_type=media_type,
            headers={
                **headers,
                "Accept-Ranges": "bytes",
                "Content-Length": str(file_size),
                "Content-Disposition": f'attachment; filename="{safe_filename}"',
            },
        )

    return FileResponse(
        path=file_path,
        media_type=media_type,
        filename=(filename or file_path.name),
        headers=headers,
    )


def _build_basic_file_response(
    file_path: Path,
    *,
    media_type: str = "video/mp4",
    filename: str | None = None,
) -> FileResponse:
    return FileResponse(
        path=file_path,
        media_type=media_type,
        filename=(filename or file_path.name),
        headers={"Cache-Control": "no-store"},
    )


@router.get("", response_model=PodcastsResponse)
async def list_podcasts(
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> PodcastsResponse:
    podcasts, is_mock = get_podcasts_for_user(current_user.id)
    return PodcastsResponse(podcasts=podcasts, is_mock=is_mock)


@router.get("/analytics", response_model=UserPodcastAnalytics)
async def get_podcast_analytics(
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> UserPodcastAnalytics:
    if get_profile_for_analytics(current_user.id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found for the current user.",
    )
    return get_user_podcast_analytics(current_user.id)


@router.get("/{podcast_id}", response_model=PodcastResponse)
async def get_podcast(
    podcast_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> PodcastResponse:
    podcast = _get_owned_podcast_or_404(podcast_id, current_user.id)
    return PodcastResponse.model_validate(podcast.model_dump())


@router.patch("/{podcast_id}/payment", response_model=PodcastResponse)
async def update_payment_status(
    podcast_id: str,
    payload: UpdatePaymentStatusRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> PodcastResponse:
    """
    Mock payment confirmation endpoint.
    INTEGRATION POINT: In production this endpoint should NOT be called by the client.
    Instead it should be triggered exclusively by your payment provider's webhook
    (e.g. POST /webhooks/stripe) after verifying the webhook signature.
    The client-side checkout page currently calls this directly for simulation purposes only.
    """
    _get_owned_podcast_or_404(podcast_id, current_user.id)
    next_status = "ready_for_processing" if payload.payment_status == "paid" else "blocked"
    updated_podcast = update_podcast_payment_status_for_user(
        podcast_id,
        current_user.id,
        payment_status=payload.payment_status,
        status=next_status,
    )
    if updated_podcast is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Podcast not found for the current user.",
        )
    return updated_podcast


@router.post("/{podcast_id}/analyze", response_model=AnalysisResult)
async def analyze_podcast(
    podcast_id: str,
    payload: AnalyzePodcastRequest,
    background_tasks: BackgroundTasks,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> AnalysisResult:
    podcast = _assert_podcast_can_process(podcast_id, current_user.id)
    if podcast.status == "processing" and not payload.force:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This podcast is already being analyzed. If it is stuck, please try again with force=true.",
        )
    if podcast.status == "done":
        existing_segments = get_scored_segments_for_podcast(podcast_id)
        if existing_segments:
            return build_analysis_result(
                podcast_id,
                existing_segments,
                processing_time_seconds=0.0,
            )

    started_at = time.perf_counter()
    update_podcast_status_for_user(podcast_id, current_user.id, "processing")
    try:
        transcription = payload.transcription
        if transcription is None:
            saved_trans_data = podcast.import_metadata.get("transcription_data")
            if saved_trans_data:
                try:
                    transcription = TranscriptionResult.model_validate(saved_trans_data)
                except Exception:
                    pass

            if transcription is None:
                transcription = await asyncio.to_thread(
                    transcribe_podcast_media_for_user,
                    podcast_id,
                    current_user.id,
                    model=payload.transcription_model,
                    language=payload.language,
                )
                podcast.import_metadata["transcription_data"] = transcription.model_dump()
                update_podcast_import_metadata_for_user(podcast_id, current_user.id, podcast.import_metadata)
                

        # Run CPU-bound semantic scoring off the event loop so the API remains responsive.
        scored_segments = await asyncio.to_thread(analyze_and_score, podcast_id, transcription, topic_focus=payload.topic_focus)
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


@router.delete("/{podcast_id}", response_model=DeletePodcastResponse)
async def delete_podcast(
    podcast_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> DeletePodcastResponse:
    try:
        return delete_podcast_for_user(podcast_id, current_user.id)
    except PodcastDeletionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.post("/{podcast_id}/generate-clips", response_model=ClipGenerationResult)
async def generate_podcast_clips(
    podcast_id: str,
    payload: GenerateClipsRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> ClipGenerationResult:
    podcast = _assert_podcast_can_process(podcast_id, current_user.id)
    if podcast.duration > 2 * 60 * 60:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="Videos longer than 2 hours cannot generate clips. Please trim the episode or use a shorter upload.",
        )

    existing_result = get_clips_for_podcast(podcast_id)

    preferred_export_settings = (
        get_user_export_settings(current_user.id)
        if payload.use_preferred_generation_settings or payload.save_generation_settings
        else None
    )
    if payload.save_generation_settings and preferred_export_settings is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found for the current user.",
        )
    preferred_generation_settings = (
        preferred_export_settings.export_settings.generation_settings
        if payload.use_preferred_generation_settings and preferred_export_settings is not None
        else None
    )
    generation_settings = payload.resolve_generation_settings(preferred_generation_settings)
    if (
        existing_result is not None
        and existing_result.clips
        and len(existing_result.clips) >= generation_settings.number_of_clips
        and not payload.force_regenerate
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Clips have already been generated for this podcast. Review the existing clips instead of generating them again.",
        )
    if payload.save_generation_settings and preferred_export_settings is not None:
        update_user_export_settings(
            current_user.id,
            preferred_export_settings.export_settings.model_copy(
                update={"generation_settings": generation_settings},
                deep=True,
            ),
        )

    started_at = time.perf_counter()
    update_podcast_status_for_user(podcast_id, current_user.id, "processing")

    try:
        score_segments = payload.score_segments or get_scored_segments_for_podcast(
            podcast_id,
            limit=generation_settings.number_of_clips,
        )
        transcription = payload.transcription
        if transcription is None:
            import_metadata = podcast.import_metadata or {}
            saved_trans_data = import_metadata.get("transcription_data")
            if saved_trans_data:
                try:
                    transcription = TranscriptionResult.model_validate(saved_trans_data)
                except Exception:
                    transcription = None

            if transcription is None:
                transcription = await asyncio.to_thread(
                    transcribe_podcast_media_for_user,
                    podcast_id,
                    current_user.id,
                    model="base",
                )
                updated_metadata = dict(podcast.import_metadata or {})
                updated_metadata["transcription_data"] = transcription.model_dump()
                update_podcast_import_metadata_for_user(podcast_id, current_user.id, updated_metadata)

        refreshed_scores = False
        if not score_segments or score_segments_need_refresh(score_segments):
            score_segments = await asyncio.to_thread(
                analyze_and_score,
                podcast_id,
                transcription,
                topic_focus=generation_settings.topic_focus,
            )
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
            generation_settings,
            payload.visual_output_mode,
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
        generation_settings=generation_settings,
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


@router.get("/{podcast_id}/content-calendar", response_model=ContentCalendarResponse)
async def get_podcast_content_calendar(
    podcast_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    platform: ContentCalendarPlatform | None = None,
) -> ContentCalendarResponse:
    if not podcast_belongs_to_user(podcast_id, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Podcast not found for the current user.",
        )
    try:
        if platform is None:
            return build_content_calendar(podcast_id)
        return build_content_calendar(podcast_id, target_platform=platform)
    except PublishingError as exc:
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
        return await asyncio.to_thread(
            publish_clips,
            podcast_id,
            payload.clip_ids,
            destination=payload.destination,
            metadata=payload.metadata,
        )
    except PublishingError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.get("/clips/{clip_id}/download")
async def download_generated_clip(
    clip_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user_for_download),
    request: Request = None,  # type: ignore[assignment]
):
    podcast_id = get_clip_podcast_id(clip_id)
    if not podcast_id or not podcast_belongs_to_user(podcast_id, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clip not found for the current user.",
        )

    storage_url, file_path = get_clip_download_target(clip_id)
    filename = file_path.name if file_path else f"{clip_id}.mp4"
    if file_path and file_path.exists():
        record_clip_download(clip_id)
        if request is None:
            return _build_basic_file_response(file_path, filename=filename)
        return _build_local_file_response(request, file_path, filename=filename)

    if storage_url:
        record_clip_download(clip_id)
        return RedirectResponse(url=storage_url)

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Clip download is unavailable.",
    )


@router.get("/clips/{clip_id}/subtitles")
def download_clip_subtitles(clip_id: str, _: AuthenticatedUser = Depends(get_current_user)):
    subtitle_url, file_path = get_clip_subtitle_target(clip_id)

    if subtitle_url:
        return RedirectResponse(url=subtitle_url)

    if file_path and file_path.exists():
        return _build_basic_file_response(file_path, media_type="text/vtt", filename=file_path.name)

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Clip subtitles are unavailable.",
    )




