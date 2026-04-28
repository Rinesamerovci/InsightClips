from datetime import UTC, datetime

from app.database import UnconfiguredSupabaseClient, service_supabase
from app.models.export_settings import ExportSettings
from app.models.podcast import PodcastRecord, PodcastResponse

PODCAST_COLUMNS = (
    "id,user_id,title,duration,status,storage_path,export_mode,crop_mode,"
    "mobile_optimized,face_tracking_enabled,created_at,updated_at"
)


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
    export_mode = str(row.get("export_mode") or "landscape").strip() or "landscape"
    crop_mode = str(row.get("crop_mode") or ("center_crop" if export_mode == "portrait" else "none")).strip()
    mobile_optimized = bool(row.get("mobile_optimized") or False)
    face_tracking_enabled = bool(row.get("face_tracking_enabled") or False)
    return ExportSettings(
        export_mode=export_mode,  # type: ignore[arg-type]
        crop_mode=crop_mode,  # type: ignore[arg-type]
        mobile_optimized=mobile_optimized,
        face_tracking_enabled=face_tracking_enabled,
    )


def _serialize_podcast_row(row: dict[str, object]) -> dict[str, object]:
    payload = dict(row)
    payload["export_settings"] = _build_export_settings(payload)
    return payload


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

    try:
        return get_podcast_for_user(podcast_id, user_id)
    except Exception:
        return None


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
        if not _podcast_export_columns_missing(exc):
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
        if not _podcast_export_columns_missing(exc):
            raise
        return (
            service_supabase.table("podcasts")
            .select("id,user_id,title,duration,status,storage_path,created_at,updated_at")
            .eq("id", podcast_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
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
