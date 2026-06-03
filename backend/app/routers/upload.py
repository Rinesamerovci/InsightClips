from fastapi import APIRouter, Depends, HTTPException, Request
import stripe

from app.config import get_settings
from app.database import service_supabase
from app.services.podcast_service import get_podcast_for_user
from app.services.stripe_service import create_checkout_session

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
    calculate_upload_price,
    import_youtube_podcast,
    prepare_upload,
)
from app.utils.media import MediaInspectionError

router = APIRouter(prefix="/upload", tags=["upload"])
settings = get_settings()


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
    frontend_origin = (settings.frontend_origins or [])[0] if settings.frontend_origins else ""
    if not frontend_origin:
        frontend_origin = ""
    success_url = f"{frontend_origin}/upload?payment=success&podcast_id={podcast_id}"
    cancel_url = f"{frontend_origin}/upload?payment=cancelled"

    try:
        session = create_checkout_session(podcast_id, price, success_url, cancel_url)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {"checkout_url": session.get("url")}


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
