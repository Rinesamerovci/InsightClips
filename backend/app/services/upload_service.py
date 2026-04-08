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

FREE_TRIAL_MAX_MINUTES = 30
ABSOLUTE_MAX_MINUTES = 120
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
    profile = get_profile_by_id(current_user.id)
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
        return "free"
    if status == "awaiting_payment":
        return "unpaid"
    if status == "ready_for_processing":
        return "paid"
    if status == "blocked":
        return "blocked"
    return "draft"


def calculate_upload_price(
    payload: UploadCalculatePriceRequest,
    current_user: AuthenticatedUser,
) -> UploadCalculatePriceResponse:
    inspection = inspect_staged_media(
        payload.storage_path,
        filename=payload.filename,
        mime_type=payload.mime_type,
    )
    free_trial_used = _get_latest_free_trial_state(current_user)
    price_decision = determine_upload_price(inspection.duration_minutes, free_trial_used)

    return UploadCalculatePriceResponse(
        duration_seconds=inspection.duration_seconds,
        duration_minutes=inspection.duration_minutes,
        price=price_decision.price,
        free_trial_available=price_decision.free_trial_available,
        status=price_decision.status,
        message=price_decision.message,
        detected_format=inspection.detected_format,
        validation_flags=inspection.validation_flags,
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
    calculated_response = calculate_upload_price(
        UploadCalculatePriceRequest(
            filename=payload.filename,
            filesize_bytes=payload.filesize_bytes,
            mime_type=payload.mime_type,
            storage_path=payload.storage_path,
        ),
        current_user,
    )

    _assert_prepare_matches_quote(payload, calculated_response)
    final_status: UploadStatus = calculated_response.status
    payment_status = _derive_payment_status(final_status)
    storage_ready = final_status in {"free_ready", "ready_for_processing"}
    checkout_required = final_status == "awaiting_payment"

    insert_payload = {
        "user_id": current_user.id,
        "title": payload.title,
        "duration": round(calculated_response.duration_seconds),
        "status": final_status,
        "price": calculated_response.price,
        "payment_status": payment_status,
        "source_filename": payload.filename,
        "storage_path": payload.storage_path,
        "mime_type": payload.mime_type,
        "detected_format": calculated_response.detected_format,
    }

    response = service_supabase.table("podcasts").insert(insert_payload).execute()
    rows = response.data or []
    if not rows:
        raise UploadWorkflowError("Podcast record could not be created.", status_code=500)

    if final_status == "free_ready" and not _get_latest_free_trial_state(current_user):
        mark_free_trial_used(current_user.id)

    return UploadPrepareResponse(
        podcast_id=str(rows[0]["id"]),
        status=final_status,
        storage_ready=storage_ready,
        checkout_required=checkout_required,
        payment_status=payment_status,
        price=calculated_response.price,
    )
