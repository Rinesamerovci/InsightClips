from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.dependencies.auth import AuthenticatedUser, get_current_user
from app.models.publishing import ClipRevocationResult
from app.models.search import ClipSearchResult
from app.services.podcast_service import get_podcasts_for_user
from app.services.search_service import SearchServiceError, search_clips
from app.services.analysis_service import podcast_belongs_to_user
from app.services.clipping_service import get_clip_podcast_id
from app.services.publishing_service import PublishingError, revoke_clip_download

router = APIRouter(prefix="/clips", tags=["clips"])


@router.get("/search", response_model=ClipSearchResult)
async def search_clips_route(
    query: str = Query(default=""),
    podcast_id: str | None = Query(default=None, alias="podcast_id"),
    status_filter: str = Query(default="all", alias="status"),
    published: bool | None = Query(default=None),
    min_duration: float | None = Query(default=None, ge=0),
    max_duration: float | None = Query(default=None, ge=0),
    min_score: float | None = Query(default=None, ge=0, le=100),
    max_score: float | None = Query(default=None, ge=0, le=100),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> ClipSearchResult:
    filters = {
        "status": status_filter,
        "published": published,
        "min_duration": min_duration,
        "max_duration": max_duration,
        "min_score": min_score,
        "max_score": max_score,
    }
    try:
        if podcast_id:
            if not podcast_belongs_to_user(podcast_id, current_user.id):
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Podcast not found for the current user.",
                )
            return search_clips(podcast_id, query=query, filters=filters)

        podcasts, _ = get_podcasts_for_user(current_user.id)
        combined_hits = []
        cleaned_query = " ".join(query.split())
        for podcast in podcasts:
            result = search_clips(podcast.id, query=cleaned_query, filters=filters)
            combined_hits.extend(result.clips)

        combined_hits.sort(key=lambda item: (-item.search_score, -item.virality_score, item.clip_number))
        return ClipSearchResult(
            query=cleaned_query,
            total_results=len(combined_hits),
            clips=combined_hits,
        )
    except SearchServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.post("/{clip_id}/revoke-download", response_model=ClipRevocationResult)
async def revoke_clip_download_route(
    clip_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> ClipRevocationResult:
    podcast_id = get_clip_podcast_id(clip_id)
    if not podcast_id or not podcast_belongs_to_user(podcast_id, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clip not found for the current user.",
        )

    try:
        return revoke_clip_download(clip_id)
    except PublishingError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
