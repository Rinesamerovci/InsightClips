from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.database import UnconfiguredSupabaseClient, service_supabase
from app.models.publishing import ClipPublicationResult, ClipPublicationStatus, ClipRevocationResult
from app.services.clipping_service import CLIP_STORAGE_BUCKET, _upload_with_overwrite

PUBLISHED_DOWNLOAD_TTL_SECONDS = 900


class PublishingError(Exception):
    def __init__(self, detail: str, *, status_code: int = 422) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


def publish_clips(podcast_id: str, clip_ids: list[str]) -> ClipPublicationResult:
    cleaned_podcast_id = podcast_id.strip()
    if not cleaned_podcast_id:
        raise PublishingError("podcast_id is required.", status_code=400)

    normalized_clip_ids = _normalize_clip_ids(clip_ids)
    if not normalized_clip_ids:
        raise PublishingError("At least one clip_id is required.", status_code=400)
    if isinstance(service_supabase, UnconfiguredSupabaseClient):
        raise PublishingError("Supabase must be configured before clips can be published.", status_code=503)

    rows = _get_clip_rows_for_podcast(cleaned_podcast_id, normalized_clip_ids)
    if len(rows) != len(normalized_clip_ids):
        found_ids = {str(row["id"]) for row in rows}
        missing = [clip_id for clip_id in normalized_clip_ids if clip_id not in found_ids]
        raise PublishingError(
            f"Some clips were not found for podcast {cleaned_podcast_id}: {', '.join(missing)}",
            status_code=404,
        )

    published_at = datetime.now(timezone.utc)
    statuses: list[ClipPublicationStatus] = []

    for row in rows:
        storage_key = _ensure_clip_uploaded(row)
        _create_storage_signed_url(storage_key, row)

        clip_id = str(row["id"])
        download_url = _build_backend_download_path(clip_id)
        payload = {
            "published": True,
            "download_url": download_url,
            "published_at": published_at.isoformat(),
            "storage_path": storage_key,
        }
        service_supabase.table("clips").update(payload).eq("id", clip_id).execute()
        statuses.append(
            ClipPublicationStatus(
                clip_id=clip_id,
                published=True,
                download_url=download_url,
                published_at=published_at,
            )
        )

    return ClipPublicationResult(
        podcast_id=cleaned_podcast_id,
        total_clips_published=len(statuses),
        published_clips=statuses,
        processing_time_seconds=0.0,
    )


def revoke_clip_download(clip_id: str) -> ClipRevocationResult:
    cleaned_clip_id = clip_id.strip()
    if not cleaned_clip_id:
        raise PublishingError("clip_id is required.", status_code=400)
    if isinstance(service_supabase, UnconfiguredSupabaseClient):
        raise PublishingError("Supabase must be configured before clip downloads can be revoked.", status_code=503)

    rows = _select_clip_rows().eq("id", cleaned_clip_id).limit(1).execute().data or []
    if not rows:
        raise PublishingError("Clip not found.", status_code=404)

    service_supabase.table("clips").update(
        {
            "published": False,
            "download_url": None,
            "published_at": None,
        }
    ).eq("id", cleaned_clip_id).execute()

    return ClipRevocationResult(
        clip_id=cleaned_clip_id,
        revoked=True,
        published=False,
    )


def get_published_clip_download_target(clip_id: str) -> tuple[str | None, Path | None]:
    if isinstance(service_supabase, UnconfiguredSupabaseClient):
        return None, None

    rows = _select_clip_rows().eq("id", clip_id).limit(1).execute().data or []
    if not rows:
        return None, None

    row = rows[0]
    if not bool(row.get("published")):
        return None, None

    storage_path = str(row.get("storage_path") or "").strip()
    if storage_path:
        try:
            signed_url = _create_storage_signed_url(storage_path, row)
            return signed_url, None
        except PublishingError:
            file_path = Path(storage_path)
            if file_path.exists():
                return None, file_path

    return None, None


def _normalize_clip_ids(clip_ids: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for clip_id in clip_ids:
        cleaned = clip_id.strip()
        if cleaned and cleaned not in seen:
            normalized.append(cleaned)
            seen.add(cleaned)
    return normalized


def _get_clip_rows_for_podcast(podcast_id: str, clip_ids: list[str]) -> list[dict[str, Any]]:
    return (
        _select_clip_rows()
        .eq("podcast_id", podcast_id)
        .in_("id", clip_ids)
        .execute()
        .data
        or []
    )


def _select_clip_rows():
    return service_supabase.table("clips").select(
        "id,podcast_id,clip_number,storage_path,storage_url,status,published,download_url,published_at"
    )


def _ensure_clip_uploaded(row: dict[str, Any]) -> str:
    storage_key = _resolve_storage_key(row)
    file_path = _resolve_local_clip_path(row)
    if file_path is not None:
        try:
            storage = service_supabase.storage.from_(CLIP_STORAGE_BUCKET)
            _upload_with_overwrite(storage, storage_key, file_path, content_type="video/mp4")
        except Exception as exc:
            raise PublishingError(f"Clip upload failed: {exc}", status_code=502) from exc
    return storage_key


def _resolve_storage_key(row: dict[str, Any]) -> str:
    raw_storage_path = str(row.get("storage_path") or "").strip()
    clip_number = int(row.get("clip_number") or 0)
    podcast_id = str(row.get("podcast_id") or "").strip()
    if not podcast_id:
        raise PublishingError("Clip is missing its parent podcast id.", status_code=500)

    path_candidate = Path(raw_storage_path) if raw_storage_path else None
    if path_candidate and (path_candidate.drive or "\\" in raw_storage_path or "/" in raw_storage_path):
        filename = path_candidate.name
        if filename:
            return f"{podcast_id}/{filename}"

    if raw_storage_path:
        return raw_storage_path

    if clip_number <= 0:
        raise PublishingError("Clip storage metadata is incomplete.", status_code=500)
    return f"{podcast_id}/clip-{clip_number:02d}.mp4"


def _resolve_local_clip_path(row: dict[str, Any]) -> Path | None:
    raw_storage_path = str(row.get("storage_path") or "").strip()
    if not raw_storage_path:
        return None
    path = Path(raw_storage_path)
    if path.exists() and path.is_file():
        return path
    return None


def _create_storage_signed_url(storage_key: str, row: dict[str, Any]) -> str:
    try:
        storage = service_supabase.storage.from_(CLIP_STORAGE_BUCKET)
        signed = storage.create_signed_url(
            storage_key,
            PUBLISHED_DOWNLOAD_TTL_SECONDS,
            {"download": Path(storage_key).name},
        )
    except Exception as exc:
        raise PublishingError(f"Unable to generate a clip download URL: {exc}", status_code=502) from exc

    url = signed.get("signedURL") or signed.get("signedUrl")
    if not url:
        raise PublishingError("Supabase did not return a usable clip download URL.", status_code=502)
    return str(url)


def _build_backend_download_path(clip_id: str) -> str:
    return f"/podcasts/clips/{clip_id}/download"
