import hashlib
import shutil
import tempfile
from urllib.parse import urlencode
from pathlib import Path

import stripe
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel

from app.config import get_settings
from app.database import service_supabase
from app.dependencies.auth import AuthenticatedUser, get_current_user
from app.models.upload import (
    UploadCalculatePriceRequest,
    UploadCalculatePriceResponse,
    UploadPrepareRequest,
    UploadPrepareResponse,
    YouTubeImportRequest,
    YouTubeImportResponse,
)
from app.services.upload_service import (
    UploadWorkflowError,
    _safe_path_part,
    calculate_upload_price,
    find_existing_file_upload,
    import_youtube_podcast,
    prepare_upload,
)
from app.services.podcast_service import get_podcast_for_user
from app.services.podcast_service import update_podcast_payment_status_for_user
from app.services.source_storage_service import SourceStorageError, upload_source_media
from app.services.stripe_service import create_checkout_session
from app.utils.media import MediaInspectionError, validate_media_type

router = APIRouter(prefix="/upload", tags=["upload"])
settings = get_settings()


class UploadFileResponse(BaseModel):
    storage_path: str
    filename: str
    filesize_bytes: int
    source_storage: str = "local"


class StripeSessionConfirmRequest(BaseModel):
    podcast_id: str
    session_id: str


def _pick_public_frontend_origin() -> str:
    for origin in settings.frontend_origins:
        cleaned = origin.strip().rstrip("/")
        if not cleaned:
            continue
        lowered = cleaned.lower()
        if "localhost" in lowered or "127.0.0.1" in lowered or "::1" in lowered:
            continue
        return cleaned
    return settings.frontend_origins[0].strip().rstrip("/") if settings.frontend_origins else ""


def get_upload_dir() -> Path:
    """Get upload directory, preferring persistent storage when configured."""
    try:
        configured_dir = get_settings().upload_storage_dir.strip()
        upload_dir = (
            Path(configured_dir) / "uploads"
            if configured_dir
            else Path(tempfile.gettempdir()) / "insightclips-uploads"
        )
        upload_dir.mkdir(parents=True, exist_ok=True)
        return upload_dir
    except Exception:
        # Fallback to .generated for development
        upload_dir = Path(".") / ".generated" / "uploads"
        upload_dir.mkdir(parents=True, exist_ok=True)
        return upload_dir


@router.post("/file", response_model=UploadFileResponse)
async def upload_file(
    file: UploadFile = File(...),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> UploadFileResponse:
    try:
        original_filename = (file.filename or "").strip()
        if not original_filename:
            raise HTTPException(status_code=400, detail="Uploaded file must include a filename.")
        detected_format = validate_media_type(original_filename, file.content_type)
        content_type = file.content_type or f"video/{detected_format}"

        upload_base = get_upload_dir()
        target_dir = upload_base / _safe_path_part(current_user.id)
        target_dir.mkdir(parents=True, exist_ok=True)

        safe_filename = _safe_path_part(Path(original_filename).name)
        target_path = target_dir / safe_filename
        digest = hashlib.sha256()
        with target_path.open("wb") as buffer:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                digest.update(chunk)
                buffer.write(chunk)
        filesize_bytes = target_path.stat().st_size
        file_hash = digest.hexdigest()

        existing = find_existing_file_upload(current_user.id, file_hash)
        if existing is not None:
            target_path.unlink(missing_ok=True)
            raise HTTPException(
                status_code=409,
                detail=f'This video already exists in your library as "{existing.get("title") or "an existing podcast"}".',
            )

        source_storage = "local"
        try:
            stored_source = upload_source_media(
                target_path,
                user_id=current_user.id,
                filename=safe_filename,
                content_type=content_type,
            )
        except SourceStorageError as exc:
            if not _can_keep_local_source(exc):
                raise
            stored_source = None

        if stored_source is not None:
            target_path.unlink(missing_ok=True)
            storage_path = stored_source.storage_path
            source_storage = "supabase"
        else:
            storage_path = str(target_path)

        return UploadFileResponse(
            storage_path=storage_path,
            filename=safe_filename,
            filesize_bytes=filesize_bytes,
            source_storage=source_storage,
        )
    except HTTPException:
        raise
    except MediaInspectionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except SourceStorageError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(exc)}")


def _can_keep_local_source(exc: SourceStorageError) -> bool:
    """Allow a temporary local fallback for demos when Supabase Storage rejects large files."""
    settings = get_settings()
    environment = settings.environment.strip().lower()
    development_mode = environment in {"development", "dev", "local", "test"}
    return exc.status_code == 413 and (settings.allow_local_source_fallback or development_mode)


@router.post("/calculate-price", response_model=UploadCalculatePriceResponse)
async def calculate_price(
    payload: UploadCalculatePriceRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> UploadCalculatePriceResponse:
    try:
        return calculate_upload_price(payload, current_user)
    except MediaInspectionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except UploadWorkflowError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.post("/prepare", response_model=UploadPrepareResponse)
async def prepare_upload_route(
    payload: UploadPrepareRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> UploadPrepareResponse:
    try:
        return prepare_upload(payload, current_user)
    except MediaInspectionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except UploadWorkflowError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.post("/youtube", response_model=YouTubeImportResponse)
async def import_youtube_route(
    payload: YouTubeImportRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> YouTubeImportResponse:
    try:
        return import_youtube_podcast(payload, current_user)
    except UploadWorkflowError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.post("/checkout-session")
async def create_checkout(
    payload: dict,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    podcast_id = str(payload.get("podcast_id") or "").strip()
    if not podcast_id:
        raise HTTPException(status_code=400, detail="podcast_id is required")

    podcast = get_podcast_for_user(podcast_id, current_user.id)
    if podcast is None:
        raise HTTPException(status_code=404, detail="Podcast not found")

    if podcast.payment_status != "pending" and podcast.status != "awaiting_payment":
        raise HTTPException(status_code=409, detail="Podcast is not awaiting payment")

    price = float(podcast.price or 0.0)
    frontend_origin = _pick_public_frontend_origin()
    success_query = urlencode(
        {
            "payment": "success",
            "podcast_id": podcast_id,
        }
    )
    success_url = f"{frontend_origin}/upload/complete?{success_query}&session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{frontend_origin}/upload?payment=cancelled"

    try:
        session = create_checkout_session(podcast_id, price, success_url, cancel_url)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {"checkout_url": session.get("url")}


@router.post("/stripe-session-confirm")
async def confirm_stripe_session(
    payload: StripeSessionConfirmRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    podcast_id = payload.podcast_id.strip()
    session_id = payload.session_id.strip()
    if not podcast_id:
        raise HTTPException(status_code=400, detail="podcast_id is required")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")

    podcast = get_podcast_for_user(podcast_id, current_user.id)
    if podcast is None:
        raise HTTPException(status_code=404, detail="Podcast not found")

    try:
        session = stripe.checkout.Session.retrieve(session_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Unable to confirm Stripe session: {exc}") from exc

    try:
        metadata = dict(getattr(session, "metadata", {}) or {})
    except Exception:
        metadata = {}

    session_podcast_id = str(metadata.get("podcast_id") or "").strip()
    if session_podcast_id and session_podcast_id != podcast_id:
        raise HTTPException(status_code=409, detail="Stripe session does not match this podcast")

    payment_status = str(getattr(session, "payment_status", "") or "").strip().lower()
    session_status = str(getattr(session, "status", "") or "").strip().lower()
    if payment_status == "paid" or session_status == "complete":
        updated_podcast = update_podcast_payment_status_for_user(
            podcast_id,
            current_user.id,
            payment_status="paid",
            status="ready_for_processing",
        )
        if updated_podcast is not None:
            return updated_podcast.model_dump()

    return {
        "confirmed": False,
        "payment_status": payment_status or str(podcast.payment_status or ""),
        "status": str(podcast.status or ""),
    }


@router.post("/stripe-webhook")
async def stripe_webhook(request: Request) -> dict:
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    stripe.api_key = settings.stripe_secret_key
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, settings.stripe_webhook_secret)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        metadata = session.get("metadata") or {}
        podcast_id = metadata.get("podcast_id")
        if podcast_id:
            try:
                service_supabase.table("podcasts").update({"payment_status": "paid", "status": "ready_for_processing"}).eq("id", podcast_id).execute()
            except Exception:
                # Log and continue
                pass

    return {"received": True}
