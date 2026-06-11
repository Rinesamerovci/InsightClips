from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies.auth import AuthenticatedUser, get_current_user
from app.models.account import DeleteAccountRequest, DeleteAccountResponse
from app.models.profile import (
    ProfileResponse,
    UpdateProfileRequest,
    UpdateUserExportSettingsRequest,
    UserExportSettingsResponse,
    UserMessageRequest,
    UserMessageResponse,
)
from app.services.account_service import AccountDeletionError, delete_account
from app.services.profile_service import (
    get_profile_by_id,
    get_user_export_settings,
    serialize_profile,
    submit_user_message,
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


@router.post("/feedback", response_model=UserMessageResponse, status_code=status.HTTP_201_CREATED)
async def submit_feedback(
    payload: UserMessageRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> UserMessageResponse:
    profile = get_profile_by_id(current_user.id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found.",
        )

    try:
        return submit_user_message(
            current_user.id,
            payload.model_copy(update={"message_type": "feedback", "contact_email": profile.email}),
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/support", response_model=UserMessageResponse, status_code=status.HTTP_201_CREATED)
async def submit_support_request(
    payload: UserMessageRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> UserMessageResponse:
    profile = get_profile_by_id(current_user.id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found.",
        )

    try:
        return submit_user_message(
            current_user.id,
            payload.model_copy(update={"message_type": "support", "contact_email": profile.email}),
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/contact", response_model=UserMessageResponse, status_code=status.HTTP_201_CREATED)
async def submit_contact_message(
    payload: UserMessageRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> UserMessageResponse:
    profile = get_profile_by_id(current_user.id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found.",
        )

    try:
        return submit_user_message(
            current_user.id,
            payload.model_copy(update={"message_type": "contact", "contact_email": profile.email}),
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.delete("/account", response_model=DeleteAccountResponse)
async def delete_current_account(
    payload: DeleteAccountRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> DeleteAccountResponse:
    profile = get_profile_by_id(current_user.id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found.",
        )
    if str(payload.confirmation_email).lower() != profile.email.lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Confirmation email must match the signed-in account email.",
        )

    try:
        result = delete_account(current_user.id, email=profile.email)
    except AccountDeletionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return DeleteAccountResponse(
        deleted=True,
        user_id=result.user_id,
        podcasts_deleted=result.podcasts_deleted,
        source_objects_removed=result.source_objects_removed,
        clip_objects_removed=result.clip_objects_removed,
        auth_user_deleted=result.auth_user_deleted,
        email_notification_sent=getattr(result, "email_notification_sent", False),
    )
