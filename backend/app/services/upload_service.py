from __future__ import annotations

from dataclasses import dataclass

from app.database import service_supabase
from app.dependencies.auth import AuthenticatedUser
from app.models.upload import (
    UploadCalculatePriceRequest,
    UploadCalculatePriceResponse,
    UploadPrepareRequest,
    UploadPrepareResponse,
    UploadPreflightStatus,
    UploadStatus,
)
from app.services.media_service import inspect_staged_media
from app.services.profile_service import get_profile_by_id, mark_free_trial_used
from app.utils.media import validate_media_type

FREE_TRIAL_MAX_MINUTES = 30
ABSOLUTE_MAX_MINUTES = 120
MAX_UPLOAD_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024
SHORT_UPLOAD_PRICE = 1.0
MEDIUM_UPLOAD_PRICE = 2.0
LONG_UPLOAD_PRICE = 4.0


class UploadWorkflowError(Exception):
    def __init__(self, detail: str, status_code: int = 422, code: str = "upload_workflow_error") -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code
        self.code = code


@dataclass(frozen=True)
class UploadPriceDecision:
    status: UploadPreflightStatus
    price: float
    free_trial_available: bool
    message: str


def _get_latest_free_trial_state(current_user: AuthenticatedUser) -> bool:
    try:
        profile = get_profile_by_id(current_user.id)
    except Exception:
        return current_user.free_trial_used
    if profile:
        return profile.free_trial_used
    return current_user.free_trial_used


def determine_upload_price(duration_minutes: float, free_trial_used: bool) -> UploadPriceDecision:
    if duration_minutes > ABSOLUTE_MAX_MINUTES:
        return UploadPriceDecision(
            status="blocked",
            price=0.0,
            free_trial_available=False,
            message="Videos longer than 120 minutes are blocked in Sprint 2.",
        )

    if duration_minutes <= FREE_TRIAL_MAX_MINUTES:
        if not free_trial_used:
            return UploadPriceDecision(
                status="free_ready",
                price=0.0,
                free_trial_available=True,
                message="This upload qualifies for the one-time free trial.",
            )

        return UploadPriceDecision(
            status="awaiting_payment",
            price=SHORT_UPLOAD_PRICE,
            free_trial_available=False,
            message="Payment is required before processing can continue.",
        )

    if duration_minutes <= 60:
        return UploadPriceDecision(
            status="awaiting_payment",
            price=MEDIUM_UPLOAD_PRICE,
            free_trial_available=False,
            message="Payment is required before processing can continue.",
        )

    return UploadPriceDecision(
        status="awaiting_payment",
        price=LONG_UPLOAD_PRICE,
        free_trial_available=False,
        message="Payment is required before processing can continue.",
    )


def _derive_payment_status(status: UploadStatus) -> str:
    if status == "free_ready":
        return "not_required"
    if status == "awaiting_payment":
        return "pending"
    if status == "ready_for_processing":
        return "paid"
    if status == "blocked":
        return "failed"
    return "pending"


def calculate_upload_price(
    payload: UploadCalculatePriceRequest,
    current_user: AuthenticatedUser,
) -> UploadCalculatePriceResponse:
    if payload.filesize_bytes > MAX_UPLOAD_FILE_SIZE_BYTES:
        raise UploadWorkflowError(
            "File exceeds allowed size limit.",
            status_code=413,
            code="file_too_large",
        )

    detected_format = validate_media_type(payload.filename, payload.mime_type)

    if payload.storage_path:
        inspection = inspect_staged_media(
            payload.storage_path,
            filename=payload.filename,
            mime_type=payload.mime_type,
        )
        duration_seconds = inspection.duration_seconds
        duration_minutes = inspection.duration_minutes
        validation_flags = inspection.validation_flags
        detected_format = inspection.detected_format
    elif payload.duration_seconds is not None:
        duration_seconds = round(payload.duration_seconds, 2)
        duration_minutes = round(duration_seconds / 60, 2)
        validation_flags = {
            "client_duration_provided": True,
            "mime_type_supported": True,
        }
    else:
        raise UploadWorkflowError(
            "Either storage_path or duration_seconds is required for duration inspection.",
            status_code=400,
            code="missing_duration_source",
        )

    free_trial_used = _get_latest_free_trial_state(current_user)
    price_decision = determine_upload_price(duration_minutes, free_trial_used)

    return UploadCalculatePriceResponse(
        duration_seconds=duration_seconds,
        duration_minutes=duration_minutes,
        price=price_decision.price,
        free_trial_available=price_decision.free_trial_available,
        status=price_decision.status,
        message=price_decision.message,
        detected_format=detected_format,
        validation_flags=validation_flags,
    )


def _assert_prepare_matches_quote(
    payload: UploadPrepareRequest,
    calculated_response: UploadCalculatePriceResponse,
) -> None:
    if payload.duration_seconds is not None and round(payload.duration_seconds, 2) != round(
        calculated_response.duration_seconds, 2
    ):
        raise UploadWorkflowError("Provided duration does not match the inspected media.")

    if payload.price is not None and round(payload.price, 2) != round(calculated_response.price, 2):
        raise UploadWorkflowError("Provided price does not match the calculated server price.")

    if payload.status is not None and payload.status != calculated_response.status:
        raise UploadWorkflowError("Provided status does not match the calculated server status.")


def prepare_upload(
    payload: UploadPrepareRequest,
    current_user: AuthenticatedUser,
) -> UploadPrepareResponse:
    resolved_export_settings = payload.export_settings.resolve() if payload.export_settings else None

    if payload.storage_path:
        if payload.filesize_bytes is None:
            raise UploadWorkflowError(
                "filesize_bytes is required when storage_path is provided.",
                status_code=400,
                code="missing_filesize_bytes",
            )

        calculated_response = calculate_upload_price(
            UploadCalculatePriceRequest(
                filename=payload.filename,
                filesize_bytes=payload.filesize_bytes,
                mime_type=payload.mime_type,
                storage_path=payload.storage_path,
            ),
            current_user,
        )
    else:
        if payload.duration_seconds is None or payload.price is None or payload.status is None:
            raise UploadWorkflowError(
                "duration_seconds, price, and status are required when storage_path is omitted.",
                status_code=400,
                code="missing_prepare_fields",
            )

        duration_minutes = round(payload.duration_seconds / 60, 2)
        free_trial_used = _get_latest_free_trial_state(current_user)
        price_decision = determine_upload_price(duration_minutes, free_trial_used)
        calculated_response = UploadCalculatePriceResponse(
            duration_seconds=round(payload.duration_seconds, 2),
            duration_minutes=duration_minutes,
            price=price_decision.price,
            free_trial_available=price_decision.free_trial_available,
            status=price_decision.status,
            message=price_decision.message,
            detected_format=None,
            validation_flags={},
        )

    _assert_prepare_matches_quote(payload, calculated_response)
    final_status: UploadStatus = calculated_response.status
    persisted_status: UploadStatus = (
        "ready_for_processing" if final_status == "free_ready" else final_status
    )
    payment_status = _derive_payment_status(final_status)
    storage_ready = persisted_status == "ready_for_processing"
    checkout_required = persisted_status == "awaiting_payment"

    insert_payload = {
        "user_id": current_user.id,
        "title": payload.title,
        "duration": round(calculated_response.duration_seconds),
        "status": persisted_status,
        "price": calculated_response.price,
        "payment_status": payment_status,
        "source_filename": payload.filename,
        "storage_path": payload.storage_path,
        "mime_type": payload.mime_type,
        "detected_format": calculated_response.detected_format,
    }
    if resolved_export_settings is not None:
        insert_payload.update(
            {
                "export_mode": resolved_export_settings.export_mode,
                "crop_mode": resolved_export_settings.crop_mode,
                "mobile_optimized": resolved_export_settings.mobile_optimized,
                "face_tracking_enabled": resolved_export_settings.face_tracking_enabled,
            }
        )

    try:
        response = service_supabase.table("podcasts").insert(insert_payload).execute()
    except Exception as exc:
        if not _podcast_export_columns_missing(exc):
            raise
        fallback_payload = dict(insert_payload)
        fallback_payload.pop("export_mode", None)
        fallback_payload.pop("crop_mode", None)
        fallback_payload.pop("mobile_optimized", None)
        fallback_payload.pop("face_tracking_enabled", None)
        response = service_supabase.table("podcasts").insert(fallback_payload).execute()
    rows = response.data or []
    if not rows:
        raise UploadWorkflowError("Podcast record could not be created.", status_code=500)

    if final_status == "free_ready" and not _get_latest_free_trial_state(current_user):
        mark_free_trial_used(current_user.id)

    return UploadPrepareResponse(
        podcast_id=str(rows[0]["id"]),
        status=persisted_status,
        storage_ready=storage_ready,
        checkout_required=checkout_required,
        payment_status=payment_status,
        price=calculated_response.price,
        export_settings=resolved_export_settings,
    )


def _podcast_export_columns_missing(exc: Exception) -> bool:
    message = str(exc).lower()
    return any(
        token in message
        for token in (
            "export_mode",
            "crop_mode",
            "mobile_optimized",
            "face_tracking_enabled",
            "42703",
        )
    )
