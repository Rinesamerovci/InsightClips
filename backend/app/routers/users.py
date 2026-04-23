from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies.auth import AuthenticatedUser, get_current_user
from app.models.profile import ProfileResponse, UpdateProfileRequest
from app.services.profile_service import get_profile_by_id, serialize_profile, update_profile

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/profile", response_model=ProfileResponse)
async def get_profile(current_user: AuthenticatedUser = Depends(get_current_user)) -> ProfileResponse:
    profile = get_profile_by_id(current_user.id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found.",
        )
    return serialize_profile(profile)


@router.patch("/profile", response_model=ProfileResponse)
async def patch_profile(
    payload: UpdateProfileRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> ProfileResponse:
    profile = get_profile_by_id(current_user.id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found.",
        )

    updated = update_profile(
        current_user.id,
        payload.full_name,
        payload.profile_picture_url,
    )
    return serialize_profile(updated)
