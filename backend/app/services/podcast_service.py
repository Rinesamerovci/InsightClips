from datetime import UTC, datetime
from dataclasses import dataclass
from pathlib import Path

from app.config import ROOT_DIR
from app.database import UnconfiguredSupabaseClient, service_supabase
from app.models.export_settings import ExportSettings, coerce_persisted_export_settings
from app.models.podcast import (
    DeletePodcastResponse,
    PodcastAnalyticsSummary,
    PodcastRecord,
    PodcastResponse,
    TopPerformingClip,
    UserPodcastAnalytics,
)
from app.services.source_storage_service import is_source_storage_path, parse_source_storage_path

PODCAST_COLUMNS = (
    "id,user_id,title,duration,status,price,payment_status,storage_path,export_mode,crop_mode,"
    "mobile_optimized,face_tracking_enabled,subtitle_style,audio_enhancement,"
    "source_type,source_url,external_source_id,import_metadata,created_at,updated_at"
)
CLIP_ANALYTICS_COLUMNS_WITH_METRICS = (
    "id,podcast_id,clip_number,clip_start_sec,clip_end_sec,virality_score,status,"
    "published,published_at,view_count,download_count"
)
CLIP_ANALYTICS_COLUMNS_FALLBACK = (
    "id,podcast_id,clip_number,clip_start_sec,clip_end_sec,virality_score,status,published,published_at"
)


class PodcastDeletionError(Exception):
    def __init__(self, detail: str, *, status_code: int = 400) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


@dataclass(frozen=True)
class PodcastDeletionResult:
    podcast_id: str
    source_objects_removed: int
    clip_objects_removed: int
    database_rows_removed: int


def _mock_podcasts(user_id: str) -> list[PodcastRecord]:
    now = datetime.now(UTC)
    items = [
        ("Welcome Episode Breakdown", 754, "completed"),
        ("Founder Interview Highlights", 512, "processing"),
        ("Marketing Sprint Recap", 906, "queued"),
    ]
    return [
        PodcastRecord(
            id=f"mock-{index}",
            user_id=user_id,
            title=title,
            duration=duration,
            status=status,
            export_settings=ExportSettings(),
            created_at=now,
            updated_at=now,
        )
        for index, (title, duration, status) in enumerate(items, start=1)
    ]


def _build_export_settings(row: dict[str, object]) -> ExportSettings:
    return coerce_persisted_export_settings(row)


def _serialize_podcast_row(row: dict[str, object]) -> dict[str, object]:
    payload = dict(row)
    payload.setdefault("source_type", "upload")
    payload.setdefault("import_metadata", {})
    payload["export_settings"] = _build_export_settings(payload)
    return payload


def create_imported_podcast_record(payload: dict[str, object]) -> str:
    try:
        response = service_supabase.table("podcasts").insert(payload).execute()
    except Exception as exc:
        if not _optional_podcast_columns_missing(exc):
            raise
        fallback_payload = dict(payload)
        for key in (
            "preset_name",
            "export_mode",
            "crop_mode",
            "subtitle_timing_profile",
            "mobile_optimized",
            "face_tracking_enabled",
            "subtitle_style",
            "audio_enhancement",
            "source_type",
            "source_url",
            "external_source_id",
            "import_metadata",
        ):
            fallback_payload.pop(key, None)
        response = service_supabase.table("podcasts").insert(fallback_payload).execute()

    rows = response.data or []
    if not rows:
        raise RuntimeError("Podcast record could not be created.")
    return str(rows[0]["id"])


def get_podcasts_for_user(user_id: str) -> tuple[list[PodcastResponse], bool]:
    if isinstance(service_supabase, UnconfiguredSupabaseClient):
        return [PodcastResponse.model_validate(item.model_dump()) for item in _mock_podcasts(user_id)], True

    response = _select_podcast_rows_for_user(user_id)
    rows = response.data or []
    return [PodcastResponse.model_validate(_serialize_podcast_row(item)) for item in rows], False


def get_podcast_for_user(podcast_id: str, user_id: str) -> PodcastRecord | None:
    if isinstance(service_supabase, UnconfiguredSupabaseClient):
        return None

    response = _select_podcast_row_for_user(podcast_id, user_id)
    rows = response.data or []
    return PodcastRecord.model_validate(_serialize_podcast_row(rows[0])) if rows else None


def update_podcast_payment_status_for_user(
    podcast_id: str,
    user_id: str,
    *,
    payment_status: str,
    status: str,
) -> PodcastResponse | None:
    if isinstance(service_supabase, UnconfiguredSupabaseClient):
        return None

    updated_at = datetime.utcnow().isoformat()
    (
        service_supabase.table("podcasts")
        .update(
            {
                "payment_status": payment_status,
                "status": status,
                "updated_at": updated_at,
            }
        )
        .eq("id", podcast_id)
        .eq("user_id", user_id)
        .execute()
    )

    podcast = get_podcast_for_user(podcast_id, user_id)
    return PodcastResponse.model_validate(podcast.model_dump()) if podcast is not None else None


def update_podcast_status_for_user(podcast_id: str, user_id: str, status: str) -> PodcastRecord | None:
    if isinstance(service_supabase, UnconfiguredSupabaseClient):
        return None

    try:
        (
            service_supabase.table("podcasts")
            .update({"status": status})
            .eq("id", podcast_id)
            .eq("user_id", user_id)
            .execute()
        )
    except Exception:
        return None


def delete_podcast_for_user(podcast_id: str, user_id: str) -> DeletePodcastResponse:
    cleaned_podcast_id = podcast_id.strip()
    cleaned_user_id = user_id.strip()
    if not cleaned_podcast_id or not cleaned_user_id:
        raise PodcastDeletionError("Podcast id and user id are required.")
    if isinstance(service_supabase, UnconfiguredSupabaseClient):
        raise PodcastDeletionError("Supabase must be configured before a podcast can be deleted.", status_code=503)

    podcast = get_podcast_for_user(cleaned_podcast_id, cleaned_user_id)
    if podcast is None:
        raise PodcastDeletionError("Podcast not found for the current user.", status_code=404)

    source_objects_removed = _remove_podcast_source_object(podcast)
    clip_objects_removed = _remove_podcast_clip_objects(cleaned_podcast_id)
    _remove_local_generated_clip_dir(cleaned_podcast_id)
    database_rows_removed = _delete_podcast_database_rows(cleaned_podcast_id, cleaned_user_id)

    return DeletePodcastResponse(
        deleted=True,
        podcast_id=cleaned_podcast_id,
        source_objects_removed=source_objects_removed,
        clip_objects_removed=clip_objects_removed,
        database_rows_removed=database_rows_removed,
    )


def get_user_podcast_analytics(user_id: str) -> UserPodcastAnalytics:
    cleaned_user_id = user_id.strip()
    if not cleaned_user_id:
        raise ValueError("user_id is required.")

    podcasts, _ = get_podcasts_for_user(cleaned_user_id)
    if not podcasts:
        return UserPodcastAnalytics(
            user_id=cleaned_user_id,
            total_podcasts=0,
            total_clips=0,
            published_clips=0,
            private_clips=0,
            total_views=0,
            total_downloads=0,
            average_virality_score=0.0,
            publish_rate=0.0,
            top_clips=[],
            podcasts=[],
        )

    podcast_map = {podcast.id: podcast for podcast in podcasts}
    clip_rows = _select_clip_analytics_rows_for_podcasts(list(podcast_map))
    rows_by_podcast: dict[str, list[dict[str, object]]] = {podcast_id: [] for podcast_id in podcast_map}
    for row in clip_rows:
        podcast_id = str(row.get("podcast_id") or "")
        if podcast_id in rows_by_podcast:
            rows_by_podcast[podcast_id].append(row)

    podcast_summaries = [
        _build_podcast_analytics_summary(podcast, rows_by_podcast.get(podcast.id, []))
        for podcast in podcasts
    ]
    total_clips = sum(summary.total_clips for summary in podcast_summaries)
    published_clips = sum(summary.published_clips for summary in podcast_summaries)
    total_views = sum(summary.total_views for summary in podcast_summaries)
    total_downloads = sum(summary.total_downloads for summary in podcast_summaries)
    virality_scores = [
        float(row.get("virality_score") or 0.0)
        for row in clip_rows
    ]
    top_clips = _build_top_clips(clip_rows, podcast_map)
    return UserPodcastAnalytics(
        user_id=cleaned_user_id,
        total_podcasts=len(podcasts),
        total_clips=total_clips,
        published_clips=published_clips,
        private_clips=max(0, total_clips - published_clips),
        total_views=total_views,
        total_downloads=total_downloads,
        average_virality_score=_average(virality_scores),
        publish_rate=round((published_clips / total_clips) * 100.0, 2) if total_clips else 0.0,
        top_clips=top_clips,
        podcasts=podcast_summaries,
    )

    try:
        return get_podcast_for_user(podcast_id, user_id)
    except Exception:
        return None


def _remove_podcast_source_object(podcast: PodcastRecord) -> int:
    storage_path = (podcast.storage_path or "").strip()
    if not is_source_storage_path(storage_path):
        return 0
    try:
        bucket, key = parse_source_storage_path(storage_path)
        service_supabase.storage.from_(bucket).remove([key])
    except Exception:
        return 0
    return 1


def _remove_podcast_clip_objects(podcast_id: str) -> int:
    keys = _list_storage_paths("clips", podcast_id)
    if not keys:
        return 0
    removed = 0
    storage = service_supabase.storage.from_("clips")
    for chunk in _chunked(sorted(keys), 100):
        try:
            storage.remove(chunk)
            removed += len(chunk)
        except Exception:
            continue
    return removed


def _list_storage_paths(bucket: str, prefix: str) -> set[str]:
    storage = service_supabase.storage.from_(bucket)
    found: set[str] = set()
    visited: set[str] = set()

    def walk(path: str, depth: int = 0) -> None:
        if depth > 6 or path in visited:
            return
        visited.add(path)
        try:
            entries = storage.list(path)
        except Exception:
            return
        for entry in entries or []:
            if not isinstance(entry, dict):
                continue
            name = str(entry.get("name") or "").strip()
            if not name:
                continue
            child_path = f"{path.rstrip('/')}/{name}" if path else name
            if entry.get("metadata") is not None or entry.get("id"):
                found.add(child_path)
            walk(child_path, depth + 1)

    walk(prefix.strip("/"))
    return found


def _remove_local_generated_clip_dir(podcast_id: str) -> None:
    generated_root = (ROOT_DIR / ".generated" / "clips").resolve()
    candidate = (generated_root / podcast_id).resolve()
    if generated_root in candidate.parents and candidate.exists():
        import shutil

        shutil.rmtree(candidate, ignore_errors=True)


def _delete_podcast_database_rows(podcast_id: str, user_id: str) -> int:
    deleted = 0
    for table_name in ("clip_publications", "clip_overlays", "scores", "clips"):
        deleted += _delete_optional_rows(table_name, "podcast_id", podcast_id)

    try:
        response = (
            service_supabase.table("podcasts")
            .delete()
            .eq("id", podcast_id)
            .eq("user_id", user_id)
            .execute()
        )
        deleted += len(response.data or []) or 1
    except Exception as exc:
        raise PodcastDeletionError(f"Podcast could not be deleted: {exc}", status_code=502) from exc
    return deleted


def _delete_optional_rows(table_name: str, column: str, value: str) -> int:
    try:
        response = service_supabase.table(table_name).delete().eq(column, value).execute()
    except Exception:
        return 0
    return len(response.data or [])


def _chunked(items: list[str], size: int) -> list[list[str]]:
    return [items[index : index + size] for index in range(0, len(items), size)]


def _select_podcast_rows_for_user(user_id: str):
    try:
        return (
            service_supabase.table("podcasts")
            .select(PODCAST_COLUMNS)
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
    except Exception as exc:
        if not _optional_podcast_columns_missing(exc):
            raise
        return (
            service_supabase.table("podcasts")
            .select("id,user_id,title,duration,status,storage_path,created_at,updated_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )


def _select_podcast_row_for_user(podcast_id: str, user_id: str):
    try:
        return (
            service_supabase.table("podcasts")
            .select(PODCAST_COLUMNS)
            .eq("id", podcast_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        if not _optional_podcast_columns_missing(exc):
            raise
        return (
            service_supabase.table("podcasts")
            .select("id,user_id,title,duration,status,storage_path,created_at,updated_at")
            .eq("id", podcast_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )


def _select_clip_analytics_rows_for_podcasts(podcast_ids: list[str]) -> list[dict[str, object]]:
    if not podcast_ids or isinstance(service_supabase, UnconfiguredSupabaseClient):
        return []

    def execute(columns: str):
        return (
            service_supabase.table("clips")
            .select(columns)
            .in_("podcast_id", podcast_ids)
            .execute()
            .data
            or []
        )

    try:
        return execute(CLIP_ANALYTICS_COLUMNS_WITH_METRICS)
    except Exception as exc:
        if not _metrics_columns_missing(exc):
            raise
        rows = execute(CLIP_ANALYTICS_COLUMNS_FALLBACK)
        for row in rows:
            row["view_count"] = 0
            row["download_count"] = 0
        return rows


def _build_podcast_analytics_summary(
    podcast: PodcastResponse,
    clip_rows: list[dict[str, object]],
) -> PodcastAnalyticsSummary:
    virality_scores = [float(row.get("virality_score") or 0.0) for row in clip_rows]
    published_dates = [
        row.get("published_at")
        for row in clip_rows
        if bool(row.get("published")) and row.get("published_at") is not None
    ]
    return PodcastAnalyticsSummary(
        podcast_id=podcast.id,
        title=podcast.title,
        status=podcast.status,
        duration=podcast.duration,
        total_clips=len(clip_rows),
        published_clips=sum(1 for row in clip_rows if bool(row.get("published"))),
        total_views=sum(int(row.get("view_count") or 0) for row in clip_rows),
        total_downloads=sum(int(row.get("download_count") or 0) for row in clip_rows),
        average_virality_score=_average(virality_scores),
        latest_published_at=max(published_dates) if published_dates else None,
    )


def _build_top_clips(
    clip_rows: list[dict[str, object]],
    podcast_map: dict[str, PodcastResponse],
) -> list[TopPerformingClip]:
    sorted_rows = sorted(
        clip_rows,
        key=lambda row: (
            -int(row.get("view_count") or 0),
            -int(row.get("download_count") or 0),
            -float(row.get("virality_score") or 0.0),
            int(row.get("clip_number") or 0),
        ),
    )
    top_clips: list[TopPerformingClip] = []
    for row in sorted_rows[:5]:
        podcast_id = str(row.get("podcast_id") or "")
        podcast = podcast_map.get(podcast_id)
        if podcast is None:
            continue
        top_clips.append(
            TopPerformingClip(
                clip_id=str(row["id"]),
                podcast_id=podcast_id,
                podcast_title=podcast.title,
                clip_number=int(row.get("clip_number") or 0),
                virality_score=float(row.get("virality_score") or 0.0),
                views=int(row.get("view_count") or 0),
                downloads=int(row.get("download_count") or 0),
                published=bool(row.get("published")),
                published_at=row.get("published_at"),
            )
        )
    return top_clips


def _average(values: list[float]) -> float:
    return round(sum(values) / len(values), 2) if values else 0.0


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


def _podcast_source_columns_missing(exc: Exception) -> bool:
    message = str(exc).lower()
    return any(
        token in message
        for token in (
            "source_type",
            "source_url",
            "external_source_id",
            "import_metadata",
            "column podcasts.source_type does not exist",
            "column podcasts.source_url does not exist",
            "column podcasts.external_source_id does not exist",
            "column podcasts.import_metadata does not exist",
            "42703",
        )
    )


def _optional_podcast_columns_missing(exc: Exception) -> bool:
    return _podcast_export_columns_missing(exc) or _podcast_source_columns_missing(exc)
