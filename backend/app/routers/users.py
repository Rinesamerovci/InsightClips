from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies.auth import AuthenticatedUser, get_current_user
from app.models.profile import ProfileResponse, ProfileUpdateRequest
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


@router.put("/profile", response_model=ProfileResponse)
async def save_profile(
    payload: ProfileUpdateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> ProfileResponse:
    profile = update_profile(
        current_user.id,
        full_name=payload.full_name,
        profile_picture_url=str(payload.profile_picture_url) if payload.profile_picture_url else None,
    )
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found.",
        )
    return serialize_profile(profile)
