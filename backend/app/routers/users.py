from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies.auth import AuthenticatedUser, get_current_user
from app.models.profile import (
    ProfileResponse,
    UpdateProfileRequest,
    UpdateUserExportSettingsRequest,
    UserExportSettingsResponse,
)
from app.services.profile_service import (
    get_profile_by_id,
    get_user_export_settings,
    serialize_profile,
    update_profile,
    update_user_export_settings,
)

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
        fields_to_update=payload.model_fields_set,
    )
    return serialize_profile(updated)


@router.get("/export-settings", response_model=UserExportSettingsResponse)
async def get_export_settings(
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> UserExportSettingsResponse:
    settings = get_user_export_settings(current_user.id)
    if not settings:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found.",
        )
    return settings


@router.patch("/export-settings", response_model=UserExportSettingsResponse)
async def patch_export_settings(
    payload: UpdateUserExportSettingsRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> UserExportSettingsResponse:
    profile = get_profile_by_id(current_user.id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found.",
        )
    return update_user_export_settings(current_user.id, payload.export_settings)
