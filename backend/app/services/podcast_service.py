from datetime import UTC, datetime

from app.database import UnconfiguredSupabaseClient, service_supabase
from app.models.export_settings import ExportSettings
from app.models.podcast import (
    PodcastAnalyticsSummary,
    PodcastRecord,
    PodcastResponse,
    TopPerformingClip,
    UserPodcastAnalytics,
)

PODCAST_COLUMNS = (
    "id,user_id,title,duration,status,storage_path,export_mode,crop_mode,"
    "mobile_optimized,face_tracking_enabled,subtitle_style,audio_enhancement,created_at,updated_at"
)
CLIP_ANALYTICS_COLUMNS_WITH_METRICS = (
    "id,podcast_id,clip_number,clip_start_sec,clip_end_sec,virality_score,status,"
    "published,published_at,view_count,download_count"
)
CLIP_ANALYTICS_COLUMNS_FALLBACK = (
    "id,podcast_id,clip_number,clip_start_sec,clip_end_sec,virality_score,status,published,published_at"
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
        subtitle_style=row.get("subtitle_style") or {},
        audio_enhancement=row.get("audio_enhancement") or {},
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
