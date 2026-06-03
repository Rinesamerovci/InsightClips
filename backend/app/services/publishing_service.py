from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import time
from typing import Any

from app.database import UnconfiguredSupabaseClient, service_supabase
from app.models.publishing import (
    ClipMetricResponse,
    ClipPublicationResult,
    ClipPublicationStatus,
    ClipPublicationStatusResponse,
    ClipRevocationResult,
    ContentCalendarResponse,
    ContentCalendarSuggestion,
    PublicationDestination,
)
from app.services.clipping_service import CLIP_STORAGE_BUCKET, _upload_with_overwrite

PUBLISHED_DOWNLOAD_TTL_SECONDS = 900


class PublishingError(Exception):
    def __init__(self, detail: str, *, status_code: int = 422) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


def publish_clips(
    podcast_id: str,
    clip_ids: list[str],
    *,
    destination: PublicationDestination = "download",
    metadata: dict[str, Any] | None = None,
) -> ClipPublicationResult:
    started_at = time.perf_counter()
    cleaned_podcast_id = podcast_id.strip()
    if not cleaned_podcast_id:
        raise PublishingError("podcast_id is required.", status_code=400)

    normalized_clip_ids = _normalize_clip_ids(clip_ids)
    if not normalized_clip_ids:
        raise PublishingError("At least one clip_id is required.", status_code=400)
    cleaned_metadata = dict(metadata or {})
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

    ordered_rows = _order_clip_rows(rows, normalized_clip_ids)
    published_at = datetime.now(timezone.utc)
    prepared_publications: list[tuple[str, dict[str, Any], ClipPublicationStatus]] = []

    for row in ordered_rows:
        clip_id = str(row["id"])
        if bool(row.get("published")):
            raise PublishingError(
                f"Clip {clip_id} is already published. Revoke it before publishing it again.",
                status_code=409,
            )
        existing_publication = get_clip_publication_status(clip_id, destination=destination)
        if existing_publication is not None and existing_publication.published:
            raise PublishingError(
                f"Clip {clip_id} is already published to {destination}. Revoke it before publishing it again.",
                status_code=409,
            )
        if str(row.get("status") or "").strip().lower() not in {"ready", "done", "completed"}:
            _persist_publication_record(
                clip_id=clip_id,
                podcast_id=cleaned_podcast_id,
                destination=destination,
                status="failed",
                download_url=None,
                published_at=None,
                metadata={**cleaned_metadata, "error": "Clip is not ready for publishing."},
            )
            raise PublishingError(
                f"Clip {clip_id} is not ready for publishing.",
                status_code=409,
            )

        _persist_publication_record(
            clip_id=clip_id,
            podcast_id=cleaned_podcast_id,
            destination=destination,
            status="pending",
            download_url=None,
            published_at=None,
            metadata=cleaned_metadata,
        )
        try:
            storage_key = _ensure_clip_uploaded(row)
            _create_storage_signed_url(storage_key)
        except PublishingError as exc:
            _persist_publication_record(
                clip_id=clip_id,
                podcast_id=cleaned_podcast_id,
                destination=destination,
                status="failed",
                download_url=None,
                published_at=None,
                metadata={**cleaned_metadata, "error": exc.detail},
            )
            raise

        download_url = _build_backend_download_path(clip_id)
        payload = {
            "published": True,
            "download_url": download_url,
            "published_at": published_at.isoformat(),
        }
        prepared_publications.append(
            (
                clip_id,
                payload,
                ClipPublicationStatus(
                    clip_id=clip_id,
                    published=True,
                    status="published",
                    destination=destination,
                    download_url=download_url,
                    published_at=published_at,
                    metadata=cleaned_metadata,
                ),
            )
        )

    for clip_id, payload, _ in prepared_publications:
        service_supabase.table("clips").update(payload).eq("id", clip_id).execute()
        _persist_publication_record(
            clip_id=clip_id,
            podcast_id=cleaned_podcast_id,
            destination=destination,
            status="published",
            download_url=str(payload["download_url"]),
            published_at=published_at,
            metadata=cleaned_metadata,
        )

    statuses = [
        status
        for _, _, status in prepared_publications
    ]
    return ClipPublicationResult(
        podcast_id=cleaned_podcast_id,
        total_clips_published=len(statuses),
        published_clips=statuses,
        processing_time_seconds=round(time.perf_counter() - started_at, 3),
    )


def get_published_clip_download_content(clip_id: str) -> tuple[bytes | None, Path | None, str | None]:
    if isinstance(service_supabase, UnconfiguredSupabaseClient):
        return None, None, None

    rows = _select_clip_rows().eq("id", clip_id).limit(1).execute().data or []
    if not rows:
        return None, None, None

    row = rows[0]
    if not bool(row.get("published")):
        return None, None, None

    file_path = _resolve_local_clip_path(row)
    try:
        storage_key = _resolve_storage_key(row)
        filename = _build_download_filename(clip_id, row, storage_key=storage_key, file_path=file_path)
        return _download_storage_bytes(storage_key), None, filename
    except PublishingError:
        pass

    if file_path and file_path.exists():
        return None, file_path, file_path.name

    return None, None, _build_download_filename(clip_id, row, file_path=file_path)


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
    _persist_publication_record(
        clip_id=cleaned_clip_id,
        podcast_id=str(rows[0].get("podcast_id") or ""),
        destination="download",
        status="pending",
        download_url=None,
        published_at=None,
        metadata={"revoked": True},
    )

    return ClipRevocationResult(
        clip_id=cleaned_clip_id,
        revoked=True,
        published=False,
    )


def get_clip_publication_status(
    clip_id: str,
    *,
    destination: PublicationDestination = "download",
) -> ClipPublicationStatusResponse | None:
    cleaned_clip_id = clip_id.strip()
    if not cleaned_clip_id:
        raise PublishingError("clip_id is required.", status_code=400)
    if isinstance(service_supabase, UnconfiguredSupabaseClient):
        raise PublishingError("Supabase must be configured before publication status can be loaded.", status_code=503)

    rows = (
        service_supabase.table("clip_publications")
        .select("clip_id,podcast_id,destination,status,download_url,published_at,metadata,updated_at")
        .eq("clip_id", cleaned_clip_id)
        .eq("destination", destination)
        .limit(1)
        .execute()
        .data
        or []
    )
    if rows:
        row = rows[0]
        return ClipPublicationStatusResponse(
            clip_id=str(row["clip_id"]),
            podcast_id=str(row["podcast_id"]),
            published=str(row.get("status") or "") == "published",
            status=row.get("status") or "pending",
            destination=row.get("destination") or destination,
            download_url=str(row.get("download_url") or "").strip() or None,
            published_at=row.get("published_at"),
            metadata=row.get("metadata") or {},
            updated_at=row.get("updated_at"),
        )

    clip_rows = _select_clip_rows().eq("id", cleaned_clip_id).limit(1).execute().data or []
    if not clip_rows:
        return None
    row = clip_rows[0]
    is_published = bool(row.get("published"))
    return ClipPublicationStatusResponse(
        clip_id=cleaned_clip_id,
        podcast_id=str(row.get("podcast_id") or ""),
        published=is_published,
        status="published" if is_published else "pending",
        destination=destination,
        download_url=str(row.get("download_url") or "").strip() or None,
        published_at=row.get("published_at"),
        metadata={},
        updated_at=None,
    )


def get_clip_metrics(clip_id: str) -> ClipMetricResponse | None:
    cleaned_clip_id = clip_id.strip()
    if not cleaned_clip_id:
        raise PublishingError("clip_id is required.", status_code=400)
    if isinstance(service_supabase, UnconfiguredSupabaseClient):
        raise PublishingError("Supabase must be configured before clip metrics can be loaded.", status_code=503)

    try:
        rows = (
            service_supabase.table("clips")
            .select("id,podcast_id,clip_number,virality_score,status,published,published_at,view_count,download_count")
            .eq("id", cleaned_clip_id)
            .limit(1)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        if not _metrics_columns_missing(exc):
            raise
        rows = (
            service_supabase.table("clips")
            .select("id,podcast_id,clip_number,virality_score,status,published,published_at")
            .eq("id", cleaned_clip_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        for row in rows:
            row["view_count"] = 0
            row["download_count"] = 0
    if not rows:
        return None

    row = rows[0]
    views = int(row.get("view_count") or 0)
    downloads = int(row.get("download_count") or 0)
    return ClipMetricResponse(
        clip_id=cleaned_clip_id,
        podcast_id=str(row.get("podcast_id") or ""),
        clip_number=int(row.get("clip_number") or 0),
        views=views,
        downloads=downloads,
        click_through_rate=round((downloads / max(views, 1)) * 100.0, 2) if views else 0.0,
        virality_score=float(row.get("virality_score") or 0.0),
        published=bool(row.get("published")),
        published_at=row.get("published_at"),
        status=str(row.get("status") or "ready"),
    )


def build_content_calendar(
    podcast_id: str,
    *,
    days: int = 7,
    max_clips: int = 5,
) -> ContentCalendarResponse:
    cleaned_podcast_id = podcast_id.strip()
    if not cleaned_podcast_id:
        raise PublishingError("podcast_id is required.", status_code=400)
    if days < 1 or days > 14:
        raise PublishingError("days must be between 1 and 14.", status_code=400)
    if max_clips < 1 or max_clips > 10:
        raise PublishingError("max_clips must be between 1 and 10.", status_code=400)
    if isinstance(service_supabase, UnconfiguredSupabaseClient):
        raise PublishingError("Supabase must be configured before content calendars can be generated.", status_code=503)

    rows = _get_calendar_clip_rows(cleaned_podcast_id)
    ready_rows = [
        row
        for row in rows
        if str(row.get("status") or "ready").strip().lower() in {"ready", "done", "completed"}
    ]
    ranked_rows = sorted(
        ready_rows,
        key=lambda row: (
            -float(row.get("virality_score") or 0.0),
            int(row.get("clip_number") or 0),
            str(row.get("id") or ""),
        ),
    )[:max_clips]

    suggestions: list[ContentCalendarSuggestion] = []
    platforms = ("tiktok", "linkedin", "youtube")
    for clip_index, row in enumerate(ranked_rows):
        for platform_index, platform in enumerate(platforms):
            scheduled_day = ((clip_index + platform_index) % days) + 1
            suggestions.append(
                _build_calendar_suggestion(
                    row,
                    platform=platform,
                    scheduled_day=scheduled_day,
                )
            )

    return ContentCalendarResponse(
        podcast_id=cleaned_podcast_id,
        total_suggestions=len(suggestions),
        suggestions=suggestions,
    )


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


def _order_clip_rows(rows: list[dict[str, Any]], clip_ids: list[str]) -> list[dict[str, Any]]:
    row_map = {str(row["id"]): row for row in rows}
    return [row_map[clip_id] for clip_id in clip_ids if clip_id in row_map]


def _select_clip_rows():
    return service_supabase.table("clips").select(
        "id,podcast_id,clip_number,storage_path,storage_url,status,published,download_url,published_at"
    )


def _get_calendar_clip_rows(podcast_id: str) -> list[dict[str, Any]]:
    return (
        service_supabase.table("clips")
        .select("id,podcast_id,clip_number,subtitle_text,virality_score,status,published,published_at")
        .eq("podcast_id", podcast_id)
        .execute()
        .data
        or []
    )


def _build_calendar_suggestion(
    row: dict[str, Any],
    *,
    platform: str,
    scheduled_day: int,
) -> ContentCalendarSuggestion:
    clip_number = int(row.get("clip_number") or 0)
    subtitle = _normalize_calendar_text(str(row.get("subtitle_text") or ""))
    title_seed = subtitle or f"Clip {clip_number}"
    title = _truncate_words(title_seed, 9)
    angle = _platform_angle(platform, subtitle)
    return ContentCalendarSuggestion(
        clip_id=str(row.get("id") or ""),
        clip_number=clip_number,
        platform=platform,  # type: ignore[arg-type]
        scheduled_day=scheduled_day,
        best_time_local=_platform_best_time(platform),
        title=_platform_title(platform, title),
        caption=_platform_caption(platform, title_seed),
        hashtags=_platform_hashtags(platform, subtitle),
        call_to_action=_platform_cta(platform),
        repurpose_angle=angle,
    )


def _normalize_calendar_text(value: str) -> str:
    return " ".join(value.split()).strip()


def _truncate_words(value: str, limit: int) -> str:
    words = _normalize_calendar_text(value).split()
    if not words:
        return "Generated clip"
    shortened = " ".join(words[:limit])
    return shortened if len(words) <= limit else f"{shortened}..."


def _platform_best_time(platform: str) -> str:
    return {
        "tiktok": "19:30",
        "linkedin": "09:00",
        "youtube": "17:00",
    }.get(platform, "12:00")


def _platform_title(platform: str, title: str) -> str:
    if platform == "linkedin":
        return f"Insight: {title}"
    if platform == "youtube":
        return f"{title} | Podcast Clip"
    return title


def _platform_caption(platform: str, subtitle: str) -> str:
    seed = _truncate_words(subtitle, 18)
    if platform == "linkedin":
        return f"{seed}\n\nA concise takeaway from the full conversation."
    if platform == "youtube":
        return f"{seed}\n\nWatch this highlight and save the full episode for later."
    return f"{seed} Watch until the end for the key takeaway."


def _platform_cta(platform: str) -> str:
    return {
        "tiktok": "Follow for more short podcast takeaways.",
        "linkedin": "Comment with the takeaway you would apply first.",
        "youtube": "Subscribe for more clips from this podcast.",
    }.get(platform, "Save this clip for later.")


def _platform_angle(platform: str, subtitle: str) -> str:
    if platform == "linkedin":
        return "Frame the clip as a professional lesson or discussion prompt."
    if platform == "youtube":
        return "Package the clip as a searchable highlight from the episode."
    if "?" in subtitle:
        return "Open with the question and let the answer drive retention."
    return "Lead with the strongest hook in the first two seconds."


def _platform_hashtags(platform: str, subtitle: str) -> list[str]:
    base = {
        "tiktok": ["#PodcastClips", "#CreatorTips", "#InsightClips"],
        "linkedin": ["#Leadership", "#ContentStrategy", "#Podcast"],
        "youtube": ["#Podcast", "#Shorts", "#Highlights"],
    }.get(platform, ["#Podcast"])
    keyword_tags = [
        f"#{word.title()}"
        for word in _extract_calendar_keywords(subtitle)
        if len(word) > 3
    ]
    return [*base, *keyword_tags][:6]


def _extract_calendar_keywords(subtitle: str) -> list[str]:
    blocked = {
        "this",
        "that",
        "with",
        "from",
        "your",
        "have",
        "will",
        "about",
        "into",
        "they",
        "them",
    }
    words: list[str] = []
    for raw_word in subtitle.lower().replace("?", " ").replace(".", " ").replace(",", " ").split():
        cleaned = "".join(character for character in raw_word if character.isalnum())
        if cleaned and cleaned not in blocked and cleaned not in words:
            words.append(cleaned)
    return words[:3]


def _persist_publication_record(
    *,
    clip_id: str,
    podcast_id: str,
    destination: PublicationDestination,
    status: str,
    download_url: str | None,
    published_at: datetime | None,
    metadata: dict[str, Any],
) -> None:
    if not podcast_id:
        return

    updated_at = datetime.now(timezone.utc).isoformat()
    payload = {
        "clip_id": clip_id,
        "podcast_id": podcast_id,
        "destination": destination,
        "status": status,
        "download_url": download_url,
        "published_at": published_at.isoformat() if published_at else None,
        "metadata": metadata,
        "updated_at": updated_at,
    }
    service_supabase.table("clip_publications").upsert(
        payload,
        on_conflict="clip_id,destination",
    ).execute()


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


def _download_storage_bytes(storage_key: str) -> bytes:
    try:
        storage = service_supabase.storage.from_(CLIP_STORAGE_BUCKET)
        payload = storage.download(storage_key)
    except Exception as exc:
        raise PublishingError(f"Unable to download clip from storage: {exc}", status_code=502) from exc

    if isinstance(payload, bytes):
        return payload
    if isinstance(payload, bytearray):
        return bytes(payload)
    try:
        return bytes(payload)
    except Exception as exc:
        raise PublishingError(f"Supabase returned an unexpected clip payload for {storage_key}.", status_code=502) from exc


def _build_download_filename(
    clip_id: str,
    row: dict[str, Any],
    *,
    storage_key: str | None = None,
    file_path: Path | None = None,
) -> str:
    if file_path is not None:
        return file_path.name
    if storage_key:
        filename = Path(storage_key).name.strip()
        if filename:
            return filename
    raw_storage_path = str(row.get("storage_path") or "").strip()
    if raw_storage_path:
        filename = Path(raw_storage_path).name.strip()
        if filename:
            return filename
    clip_number = int(row.get("clip_number") or 0)
    if clip_number > 0:
        return f"clip-{clip_number:02d}.mp4"
    return f"{clip_id}.mp4"


def _create_storage_signed_url(storage_key: str) -> str:
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


def _metrics_columns_missing(exc: Exception) -> bool:
    message = str(exc).lower()
    return any(
        token in message
        for token in (
            "view_count",
            "download_count",
            "column clips.view_count does not exist",
            "column clips.download_count does not exist",
            "42703",
        )
    )
