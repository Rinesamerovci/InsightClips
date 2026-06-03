from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse
import re

from app.database import service_supabase
from app.dependencies.auth import AuthenticatedUser
from app.models.upload import (
    UploadCalculatePriceRequest,
    UploadCalculatePriceResponse,
    UploadPrepareRequest,
    UploadPrepareResponse,
    UploadPreflightStatus,
    UploadStatus,
    YouTubeImportRequest,
    YouTubeImportResponse,
)
from app.models.export_settings import ExportSettings
from app.services.media_service import inspect_staged_media
from app.services.podcast_service import create_imported_podcast_record
from app.services.profile_service import get_profile_by_id, mark_free_trial_used
from app.utils.media import validate_media_type

FREE_TRIAL_MAX_MINUTES = 30
ABSOLUTE_MAX_MINUTES = 120
MAX_UPLOAD_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024
SHORT_UPLOAD_PRICE = 1.0
MEDIUM_UPLOAD_PRICE = 2.0
LONG_UPLOAD_PRICE = 4.0
YOUTUBE_IMPORT_DIR = Path(".generated") / "youtube-imports"
YOUTUBE_VIDEO_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{11}$")
YOUTUBE_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
}


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


@dataclass(frozen=True)
class YouTubeSource:
    original_url: str
    normalized_url: str
    video_id: str


@dataclass(frozen=True)
class YouTubeDownloadResult:
    title: str
    storage_path: str
    duration_seconds: float
    filename: str
    filesize_bytes: int | None
    mime_type: str
    detected_format: str
    metadata: dict[str, Any]


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


def parse_youtube_source(url: str) -> YouTubeSource:
    cleaned_url = url.strip()
    parsed = urlparse(cleaned_url)
    if parsed.scheme not in {"http", "https"}:
        raise UploadWorkflowError(
            "Only http or https YouTube URLs are supported.",
            status_code=400,
            code="invalid_youtube_url",
        )

    host = (parsed.hostname or "").lower()
    if host not in YOUTUBE_HOSTS:
        raise UploadWorkflowError(
            "Only youtube.com or youtu.be links are supported.",
            status_code=400,
            code="unsupported_youtube_source",
        )

    query = parse_qs(parsed.query)
    if "list" in query:
        raise UploadWorkflowError(
            "Playlist import is not supported. Submit a single YouTube video link.",
            status_code=400,
            code="playlist_not_supported",
        )

    video_id = ""
    path_parts = [part for part in parsed.path.split("/") if part]
    if host == "youtu.be":
        video_id = path_parts[0] if path_parts else ""
    elif path_parts[:1] == ["watch"]:
        video_id = (query.get("v") or [""])[0]
    elif path_parts and path_parts[0] in {"shorts", "embed", "live"}:
        video_id = path_parts[1] if len(path_parts) > 1 else ""

    if not YOUTUBE_VIDEO_ID_PATTERN.fullmatch(video_id):
        raise UploadWorkflowError(
            "A valid single-video YouTube URL is required.",
            status_code=400,
            code="invalid_youtube_video_id",
        )

    return YouTubeSource(
        original_url=cleaned_url,
        normalized_url=f"https://www.youtube.com/watch?v={video_id}",
        video_id=video_id,
    )


def import_youtube_podcast(
    payload: YouTubeImportRequest,
    current_user: AuthenticatedUser,
) -> YouTubeImportResponse:
    source = parse_youtube_source(payload.url)
    existing = _get_existing_youtube_import(current_user.id, source.video_id)
    if existing is not None:
        raise UploadWorkflowError(
            f"This YouTube video has already been imported as \"{existing.get('title') or 'an existing podcast'}\".",
            status_code=409,
            code="youtube_already_imported",
        )
    resolved_export_settings = payload.export_settings.resolve() if payload.export_settings else ExportSettings()
    download_result = _download_youtube_media(source, current_user.id)
    title = payload.title or download_result.title
    duration_minutes = round(download_result.duration_seconds / 60, 2)
    free_trial_used = _get_latest_free_trial_state(current_user)
    price_decision = determine_upload_price(duration_minutes, free_trial_used)
    if price_decision.status == "blocked":
        raise UploadWorkflowError(
            price_decision.message,
            status_code=413,
            code="youtube_duration_blocked",
        )
    persisted_status: UploadStatus = (
        "ready_for_processing" if price_decision.status == "free_ready" else price_decision.status
    )
    payment_status = _derive_payment_status(price_decision.status)

    insert_payload = _build_youtube_podcast_insert_payload(
        current_user,
        source,
        download_result,
        title=title,
        export_settings=resolved_export_settings,
        status=persisted_status,
        price=price_decision.price,
        payment_status=payment_status,
    )

    try:
        podcast_id = create_imported_podcast_record(insert_payload)
    except Exception as exc:
        raise UploadWorkflowError("YouTube import could not be saved.", status_code=500) from exc
    if price_decision.status == "free_ready" and not _get_latest_free_trial_state(current_user):
        mark_free_trial_used(current_user.id)

    return YouTubeImportResponse(
        podcast_id=podcast_id,
        status=persisted_status,
        source_url=source.normalized_url,
        video_id=source.video_id,
        title=title,
        storage_path=download_result.storage_path,
        duration_seconds=download_result.duration_seconds,
        metadata=download_result.metadata,
        storage_ready=persisted_status == "ready_for_processing",
        checkout_required=persisted_status == "awaiting_payment",
        payment_status=payment_status,
        price=price_decision.price,
        export_settings=resolved_export_settings,
    )


def _get_existing_youtube_import(user_id: str, video_id: str) -> dict[str, Any] | None:
    try:
        rows = (
            service_supabase.table("podcasts")
            .select("id,title")
            .eq("user_id", user_id)
            .eq("source_type", "youtube")
            .eq("external_source_id", video_id)
            .limit(1)
            .execute()
            .data
            or []
        )
    except Exception:
        return None
    return rows[0] if rows else None


def _download_youtube_media(source: YouTubeSource, user_id: str) -> YouTubeDownloadResult:
    try:
        from yt_dlp import YoutubeDL
    except ImportError as exc:
        raise UploadWorkflowError(
            "YouTube import requires the yt-dlp package to be installed.",
            status_code=503,
            code="youtube_downloader_unavailable",
        ) from exc

    target_dir = YOUTUBE_IMPORT_DIR / _safe_path_part(user_id)
    target_dir.mkdir(parents=True, exist_ok=True)
    output_template = str(target_dir / f"{source.video_id}.%(ext)s")
    options = {
        "format": "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best",
        "merge_output_format": "mp4",
        "noplaylist": True,
        "outtmpl": output_template,
        "quiet": True,
        "no_warnings": True,
    }

    try:
        with YoutubeDL(options) as downloader:
            info = downloader.extract_info(source.normalized_url, download=True)
            requested_downloads = info.get("requested_downloads") or []
            downloaded_path = ""
            for item in requested_downloads:
                downloaded_path = str(item.get("filepath") or item.get("_filename") or "")
                if downloaded_path:
                    break
            if not downloaded_path:
                downloaded_path = str(info.get("filepath") or downloader.prepare_filename(info))
    except Exception as exc:
        raise UploadWorkflowError(
            "YouTube media could not be imported. Check that the video is public and try again.",
            status_code=502,
            code="youtube_import_failed",
        ) from exc

    media_path = Path(downloaded_path)
    if not media_path.exists() and media_path.suffix != ".mp4":
        mp4_candidate = media_path.with_suffix(".mp4")
        if mp4_candidate.exists():
            media_path = mp4_candidate

    if not media_path.exists():
        raise UploadWorkflowError(
            "YouTube import finished without a staged media file.",
            status_code=502,
            code="youtube_import_missing_file",
        )

    duration_seconds = float(info.get("duration") or 0.0)
    if duration_seconds <= 0:
        inspection = inspect_staged_media(str(media_path), filename=media_path.name, mime_type="video/mp4")
        duration_seconds = inspection.duration_seconds
        detected_format = inspection.detected_format
    else:
        detected_format = media_path.suffix.lstrip(".").lower() or "mp4"

    metadata = {
        "original_url": source.original_url,
        "normalized_url": source.normalized_url,
        "webpage_url": info.get("webpage_url") or source.normalized_url,
        "channel": info.get("channel") or info.get("uploader"),
        "duration_seconds": round(duration_seconds, 2),
    }
    return YouTubeDownloadResult(
        title=str(info.get("title") or f"YouTube video {source.video_id}"),
        storage_path=str(media_path),
        duration_seconds=round(duration_seconds, 2),
        filename=media_path.name,
        filesize_bytes=media_path.stat().st_size,
        mime_type="video/mp4",
        detected_format=detected_format,
        metadata={key: value for key, value in metadata.items() if value is not None},
    )


def _build_youtube_podcast_insert_payload(
    current_user: AuthenticatedUser,
    source: YouTubeSource,
    download_result: YouTubeDownloadResult,
    *,
    title: str,
    export_settings: ExportSettings,
    status: UploadStatus,
    price: float,
    payment_status: str,
) -> dict[str, Any]:
    return {
        "user_id": current_user.id,
        "title": title,
        "duration": round(download_result.duration_seconds),
        "status": status,
        "price": price,
        "payment_status": payment_status,
        "source_filename": download_result.filename,
        "storage_path": download_result.storage_path,
        "mime_type": download_result.mime_type,
        "detected_format": download_result.detected_format,
        "source_type": "youtube",
        "source_url": source.normalized_url,
        "external_source_id": source.video_id,
        "import_metadata": download_result.metadata,
        "preset_name": export_settings.preset_name,
        "export_mode": export_settings.export_mode,
        "crop_mode": export_settings.crop_mode,
        "subtitle_timing_profile": export_settings.subtitle_timing_profile,
        "mobile_optimized": export_settings.mobile_optimized,
        "face_tracking_enabled": export_settings.face_tracking_enabled,
        "subtitle_style": export_settings.subtitle_style.model_dump(mode="json"),
        "audio_enhancement": export_settings.audio_enhancement.model_dump(mode="json"),
    }


def _safe_path_part(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_.-]+", "-", value.strip())
    return cleaned.strip(".-") or "user"


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
    resolved_export_settings = payload.export_settings.resolve() if payload.export_settings else ExportSettings()

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
    insert_payload.update(
        {
            "preset_name": resolved_export_settings.preset_name,
            "export_mode": resolved_export_settings.export_mode,
            "crop_mode": resolved_export_settings.crop_mode,
            "subtitle_timing_profile": resolved_export_settings.subtitle_timing_profile,
            "mobile_optimized": resolved_export_settings.mobile_optimized,
            "face_tracking_enabled": resolved_export_settings.face_tracking_enabled,
            "subtitle_style": resolved_export_settings.subtitle_style.model_dump(mode="json"),
            "audio_enhancement": resolved_export_settings.audio_enhancement.model_dump(mode="json"),
        }
    )

    try:
        response = service_supabase.table("podcasts").insert(insert_payload).execute()
    except Exception as exc:
        if not _podcast_export_columns_missing(exc):
            raise
        fallback_payload = dict(insert_payload)
        fallback_payload.pop("preset_name", None)
        fallback_payload.pop("export_mode", None)
        fallback_payload.pop("crop_mode", None)
        fallback_payload.pop("subtitle_timing_profile", None)
        fallback_payload.pop("mobile_optimized", None)
        fallback_payload.pop("face_tracking_enabled", None)
        fallback_payload.pop("subtitle_style", None)
        fallback_payload.pop("audio_enhancement", None)
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
            "subtitle_style",
            "audio_enhancement",
            "42703",
        )
    )
