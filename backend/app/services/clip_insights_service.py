from __future__ import annotations

from typing import Any

from app.database import UnconfiguredSupabaseClient, service_supabase
from app.models.clip_insights import (
    ClipMetricRow,
    ClipRecommendationsResponse,
    ClipSearchItem,
    ClipSearchResponse,
    PodcastClipMetrics,
)


class ClipInsightsError(Exception):
    def __init__(self, detail: str, *, status_code: int = 422) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


CLIP_SELECT_COLUMNS_WITH_METRICS = (
    "id,podcast_id,clip_number,clip_start_sec,clip_end_sec,virality_score,"
    "storage_url,subtitle_text,status,published,download_url,published_at,view_count,download_count"
)
CLIP_SELECT_COLUMNS_FALLBACK = (
    "id,podcast_id,clip_number,clip_start_sec,clip_end_sec,virality_score,"
    "storage_url,subtitle_text,status,published,download_url,published_at"
)


def search_clips_for_user(
    user_id: str,
    *,
    query: str = "",
    podcast_id: str | None = None,
    status: str = "all",
) -> ClipSearchResponse:
    cleaned_user_id = user_id.strip()
    if not cleaned_user_id:
        raise ClipInsightsError("user_id is required.", status_code=400)
    rows = _get_clip_rows_for_user(cleaned_user_id, podcast_id=podcast_id)
    filtered_rows = _filter_rows(rows, query=query, status=status)
    items = [_build_search_item(row, query=query) for row in filtered_rows]
    return ClipSearchResponse(
        query=query.strip(),
        total_results=len(items),
        clips=items,
    )


def get_clip_recommendations_for_podcast(podcast_id: str) -> ClipRecommendationsResponse:
    cleaned_podcast_id = podcast_id.strip()
    if not cleaned_podcast_id:
        raise ClipInsightsError("podcast_id is required.", status_code=400)

    rows = _get_clip_rows_for_podcast(cleaned_podcast_id)
    recommendations = sorted(
        rows,
        key=lambda row: (
            bool(row.get("published")),
            -float(row.get("virality_score") or 0.0),
            int(row.get("clip_number") or 0),
        ),
    )[:4]

    items = [
        _build_search_item(
            row,
            recommendation_reason=(
                "Highest upside right now"
                if index == 0
                else "Already published and performing"
                if bool(row.get("published"))
                else "Strong virality signal for next publish"
            ),
        )
        for index, row in enumerate(recommendations)
    ]
    return ClipRecommendationsResponse(
        podcast_id=cleaned_podcast_id,
        recommendations=items,
    )


def get_clip_metrics_for_podcast(podcast_id: str) -> PodcastClipMetrics:
    cleaned_podcast_id = podcast_id.strip()
    if not cleaned_podcast_id:
        raise ClipInsightsError("podcast_id is required.", status_code=400)

    rows = _get_clip_rows_for_podcast(cleaned_podcast_id)
    if not rows:
        raise ClipInsightsError("No clips found for this podcast.", status_code=404)

    podcast_title = str(rows[0].get("podcast_title") or "").strip()
    metric_rows = [_build_metric_row(row) for row in rows]
    metric_rows.sort(key=lambda row: (-row.views, -row.downloads, -row.virality_score, row.clip_number))

    total_views = sum(item.views for item in metric_rows)
    total_downloads = sum(item.downloads for item in metric_rows)
    average_click_trend = round(
        sum(item.click_trend for item in metric_rows) / len(metric_rows),
        2,
    ) if metric_rows else 0.0

    published_clips = sum(1 for row in rows if bool(row.get("published")))
    total_clips = len(rows)
    return PodcastClipMetrics(
        podcast_id=cleaned_podcast_id,
        podcast_title=podcast_title,
        total_clips=total_clips,
        published_clips=published_clips,
        unpublished_clips=max(0, total_clips - published_clips),
        total_views=total_views,
        total_downloads=total_downloads,
        average_click_trend=average_click_trend,
        top_clips=metric_rows[:5],
    )


def record_clip_download(clip_id: str) -> None:
    cleaned_clip_id = clip_id.strip()
    if not cleaned_clip_id or isinstance(service_supabase, UnconfiguredSupabaseClient):
        return

    try:
        rows = (
            service_supabase.table("clips")
            .select("id,view_count,download_count")
            .eq("id", cleaned_clip_id)
            .limit(1)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        if _metrics_columns_missing(exc):
            return
        raise
    if not rows:
        return

    row = rows[0]
    view_count = int(row.get("view_count") or 0) + 1
    download_count = int(row.get("download_count") or 0) + 1
    try:
        service_supabase.table("clips").update(
            {
                "view_count": view_count,
                "download_count": download_count,
            }
        ).eq("id", cleaned_clip_id).execute()
    except Exception as exc:
        if _metrics_columns_missing(exc):
            return
        raise


def _get_clip_rows_for_user(user_id: str, *, podcast_id: str | None = None) -> list[dict[str, Any]]:
    if isinstance(service_supabase, UnconfiguredSupabaseClient):
        raise ClipInsightsError("Supabase must be configured before clip search can run.", status_code=503)

    cleaned_podcast_id = podcast_id.strip() if podcast_id else ""
    podcast_rows = (
        service_supabase.table("podcasts")
        .select("id,title")
        .eq("user_id", user_id)
        .execute()
        .data
        or []
    )
    if cleaned_podcast_id:
        podcast_rows = [row for row in podcast_rows if str(row.get("id") or "").strip() == cleaned_podcast_id]
    if not podcast_rows:
        return []

    podcast_map = {
        str(row["id"]): str(row.get("title") or "").strip()
        for row in podcast_rows
        if str(row.get("id") or "").strip()
    }
    clip_rows = _select_clip_rows_with_metrics_fallback(
        lambda columns: (
            service_supabase.table("clips")
            .select(columns)
            .in_("podcast_id", list(podcast_map))
            .execute()
            .data
            or []
        )
    )
    for row in clip_rows:
        row["podcast_title"] = podcast_map.get(str(row.get("podcast_id") or ""), "")
    return clip_rows


def _get_clip_rows_for_podcast(podcast_id: str) -> list[dict[str, Any]]:
    if isinstance(service_supabase, UnconfiguredSupabaseClient):
        raise ClipInsightsError("Supabase must be configured before clip insights can run.", status_code=503)

    podcast_rows = (
        service_supabase.table("podcasts")
        .select("id,title")
        .eq("id", podcast_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not podcast_rows:
        raise ClipInsightsError("Podcast not found.", status_code=404)

    podcast_title = str(podcast_rows[0].get("title") or "").strip()
    clip_rows = _select_clip_rows_with_metrics_fallback(
        lambda columns: (
            service_supabase.table("clips")
            .select(columns)
            .eq("podcast_id", podcast_id)
            .execute()
            .data
            or []
        )
    )
    for row in clip_rows:
        row["podcast_title"] = podcast_title
    return clip_rows


def _select_clip_rows_with_metrics_fallback(
    executor: Any,
) -> list[dict[str, Any]]:
    try:
        return executor(CLIP_SELECT_COLUMNS_WITH_METRICS)
    except Exception as exc:
        if not _metrics_columns_missing(exc):
            raise
        rows = executor(CLIP_SELECT_COLUMNS_FALLBACK)
        for row in rows:
            row["view_count"] = int(row.get("view_count") or 0)
            row["download_count"] = int(row.get("download_count") or 0)
        return rows


def _metrics_columns_missing(exc: Exception) -> bool:
    message = str(exc).lower()
    return (
        "view_count" in message
        or "download_count" in message
        or "column clips.view_count does not exist" in message
        or "column clips.download_count does not exist" in message
        or "42703" in message
    )


def _filter_rows(rows: list[dict[str, Any]], *, query: str, status: str) -> list[dict[str, Any]]:
    normalized_query = query.strip().lower()
    normalized_status = status.strip().lower() or "all"
    filtered: list[dict[str, Any]] = []

    for row in rows:
        if not _matches_status(row, normalized_status):
            continue
        if normalized_query and not _matches_query(row, normalized_query):
            continue
        filtered.append(row)

    filtered.sort(
        key=lambda row: (
            -float(row.get("virality_score") or 0.0),
            int(row.get("clip_number") or 0),
        )
    )
    return filtered


def _matches_status(row: dict[str, Any], status: str) -> bool:
    if status == "all":
        return True
    if status == "published":
        return bool(row.get("published"))
    if status == "unpublished":
        return not bool(row.get("published"))
    return str(row.get("status") or "").strip().lower() == status


def _matches_query(row: dict[str, Any], query: str) -> bool:
    haystack = " ".join(
        [
            str(row.get("podcast_title") or ""),
            str(row.get("subtitle_text") or ""),
            f"clip {int(row.get('clip_number') or 0)}",
            "published" if bool(row.get("published")) else "unpublished",
            str(row.get("status") or ""),
        ]
    ).lower()
    return query in haystack


def _build_search_item(
    row: dict[str, Any],
    *,
    query: str = "",
    recommendation_reason: str | None = None,
) -> ClipSearchItem:
    clip_number = int(row.get("clip_number") or 0)
    podcast_title = str(row.get("podcast_title") or "").strip()
    subtitle_text = str(row.get("subtitle_text") or "").strip()
    match_reason = _resolve_match_reason(podcast_title, subtitle_text, clip_number, query)
    clip_id = str(row["id"])
    return ClipSearchItem(
        id=clip_id,
        podcast_id=str(row["podcast_id"]),
        podcast_title=podcast_title,
        clip_number=clip_number,
        clip_start_seconds=float(row.get("clip_start_sec") or 0.0),
        clip_end_seconds=float(row.get("clip_end_sec") or 0.0),
        duration_seconds=round(
            float(row.get("clip_end_sec") or 0.0) - float(row.get("clip_start_sec") or 0.0),
            3,
        ),
        virality_score=float(row.get("virality_score") or 0.0),
        video_url=str(row.get("storage_url") or "").strip() or f"/podcasts/clips/{clip_id}/download",
        subtitle_text=subtitle_text,
        status=str(row.get("status") or "ready"),
        published=bool(row.get("published")),
        download_url=str(row.get("download_url") or "").strip() or None,
        published_at=row.get("published_at"),
        match_reason=match_reason,
        recommendation_reason=recommendation_reason,
    )


def _resolve_match_reason(
    podcast_title: str,
    subtitle_text: str,
    clip_number: int,
    query: str,
) -> str | None:
    normalized_query = query.strip().lower()
    if not normalized_query:
        return None
    if normalized_query in subtitle_text.lower():
        return "Matched clip transcript"
    if normalized_query in podcast_title.lower():
        return "Matched podcast title"
    if normalized_query in f"clip {clip_number}":
        return "Matched clip number"
    return None


def _build_metric_row(row: dict[str, Any]) -> ClipMetricRow:
    views = int(row.get("view_count") or 0)
    downloads = int(row.get("download_count") or 0)
    click_trend = round((downloads / max(views, 1)) * 100.0, 2) if views > 0 else 0.0
    subtitle_text = str(row.get("subtitle_text") or "").strip()
    return ClipMetricRow(
        clip_id=str(row["id"]),
        clip_number=int(row.get("clip_number") or 0),
        title=subtitle_text[:120] or f"Clip {int(row.get('clip_number') or 0)}",
        views=views,
        downloads=downloads,
        click_trend=click_trend,
        published=bool(row.get("published")),
        published_at=row.get("published_at"),
        virality_score=float(row.get("virality_score") or 0.0),
    )
