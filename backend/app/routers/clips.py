from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.dependencies.auth import AuthenticatedUser, get_current_user
from app.models.clip_insights import ClipSearchResponse
from app.models.publishing import ClipRevocationResult
from app.services.clip_insights_service import ClipInsightsError, search_clips_for_user
from app.services.analysis_service import podcast_belongs_to_user
from app.services.clipping_service import get_clip_podcast_id
from app.services.publishing_service import PublishingError, revoke_clip_download

router = APIRouter(prefix="/clips", tags=["clips"])


@router.get("/search", response_model=ClipSearchResponse)
async def search_clips_route(
    query: str = Query(default=""),
    podcast_id: str | None = Query(default=None, alias="podcast_id"),
    status_filter: str = Query(default="all", alias="status"),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> ClipSearchResponse:
    try:
        return search_clips_for_user(
            current_user.id,
            query=query,
            podcast_id=podcast_id,
            status=status_filter,
        )
    except ClipInsightsError as exc:
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
