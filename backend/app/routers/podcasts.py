from fastapi import APIRouter, Depends

from app.dependencies.auth import AuthenticatedUser, get_current_user
from app.models.podcast import PodcastsResponse
from app.services.podcast_service import get_podcasts_for_user

router = APIRouter(prefix="/podcasts", tags=["podcasts"])


@router.get("", response_model=PodcastsResponse)
async def list_podcasts(
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> PodcastsResponse:
    podcasts, is_mock = get_podcasts_for_user(current_user.id)
    return PodcastsResponse(podcasts=podcasts, is_mock=is_mock)
