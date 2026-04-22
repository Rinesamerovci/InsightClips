from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import app.services.clip_insights_service as clip_insights_module  # noqa: E402
from app.services.clip_insights_service import (  # noqa: E402
    get_clip_metrics_for_podcast,
    get_clip_recommendations_for_podcast,
    record_clip_download,
    search_clips_for_user,
)


class FakeSelectQuery:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self._rows = rows
        self._eq_filters: list[tuple[str, object]] = []
        self._in_filter: tuple[str, set[object]] | None = None
        self._limit: int | None = None

    def eq(self, key: str, value: object) -> "FakeSelectQuery":
        self._eq_filters.append((key, value))
        return self

    def in_(self, key: str, values: list[object]) -> "FakeSelectQuery":
        self._in_filter = (key, set(values))
        return self

    def limit(self, value: int) -> "FakeSelectQuery":
        self._limit = value
        return self

    def execute(self) -> SimpleNamespace:
        rows = list(self._rows)
        for key, value in self._eq_filters:
            rows = [row for row in rows if row.get(key) == value]
        if self._in_filter is not None:
            key, values = self._in_filter
            rows = [row for row in rows if row.get(key) in values]
        if self._limit is not None:
            rows = rows[: self._limit]
        return SimpleNamespace(data=rows)


class FakeUpdateQuery:
    def __init__(self, rows: list[dict[str, object]], payload: dict[str, object]) -> None:
        self._rows = rows
        self._payload = payload
        self._eq_key: str | None = None
        self._eq_value: object | None = None

    def eq(self, key: str, value: object) -> "FakeUpdateQuery":
        self._eq_key = key
        self._eq_value = value
        return self

    def execute(self) -> SimpleNamespace:
        updated: list[dict[str, object]] = []
        for row in self._rows:
            if self._eq_key is None or row.get(self._eq_key) == self._eq_value:
                row.update(self._payload)
                updated.append(row)
        return SimpleNamespace(data=updated)


class FakeTable:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self.rows = rows

    def select(self, _: str) -> FakeSelectQuery:
        return FakeSelectQuery(self.rows)

    def update(self, payload: dict[str, object]) -> FakeUpdateQuery:
        return FakeUpdateQuery(self.rows, payload)


class FakeSupabase:
    def __init__(self, podcasts: list[dict[str, object]], clips: list[dict[str, object]]) -> None:
        self._podcasts = FakeTable(podcasts)
        self._clips = FakeTable(clips)

    def table(self, name: str) -> FakeTable:
        if name == "podcasts":
            return self._podcasts
        if name == "clips":
            return self._clips
        raise AssertionError(f"Unexpected table requested: {name}")


class ClipInsightsServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.podcasts = [
            {"id": "pod-1", "user_id": "user-123", "title": "Growth Lab"},
            {"id": "pod-2", "user_id": "user-123", "title": "Creator Signals"},
        ]
        self.clips = [
            {
                "id": "clip-1",
                "podcast_id": "pod-1",
                "clip_number": 1,
                "clip_start_sec": 0.0,
                "clip_end_sec": 20.0,
                "virality_score": 88.0,
                "storage_url": "https://example.com/clip-1.mp4",
                "subtitle_text": "How creators grow faster with retention loops",
                "status": "ready",
                "published": False,
                "download_url": None,
                "published_at": None,
                "view_count": 3,
                "download_count": 1,
            },
            {
                "id": "clip-2",
                "podcast_id": "pod-1",
                "clip_number": 2,
                "clip_start_sec": 24.0,
                "clip_end_sec": 42.0,
                "virality_score": 92.0,
                "storage_url": "https://example.com/clip-2.mp4",
                "subtitle_text": "A published clip with strong retention",
                "status": "ready",
                "published": True,
                "download_url": "/podcasts/clips/clip-2/download",
                "published_at": "2026-04-22T08:00:00+00:00",
                "view_count": 8,
                "download_count": 5,
            },
            {
                "id": "clip-3",
                "podcast_id": "pod-2",
                "clip_number": 1,
                "clip_start_sec": 12.0,
                "clip_end_sec": 30.0,
                "virality_score": 75.0,
                "storage_url": "https://example.com/clip-3.mp4",
                "subtitle_text": "Signals every creator should watch this month",
                "status": "processing",
                "published": False,
                "download_url": None,
                "published_at": None,
                "view_count": 0,
                "download_count": 0,
            },
        ]

    def test_search_clips_filters_by_query_and_status(self) -> None:
        fake_supabase = FakeSupabase(self.podcasts, self.clips)

        with patch.object(clip_insights_module, "service_supabase", fake_supabase):
            result = search_clips_for_user("user-123", query="retention", status="published")

        self.assertEqual(result.total_results, 1)
        self.assertEqual(result.clips[0].id, "clip-2")
        self.assertEqual(result.clips[0].match_reason, "Matched clip transcript")

    def test_search_clips_filters_by_selected_podcast(self) -> None:
        fake_supabase = FakeSupabase(self.podcasts, self.clips)

        with patch.object(clip_insights_module, "service_supabase", fake_supabase):
            result = search_clips_for_user("user-123", podcast_id="pod-2", status="all")

        self.assertEqual(result.total_results, 1)
        self.assertEqual(result.clips[0].id, "clip-3")
        self.assertEqual(result.clips[0].podcast_id, "pod-2")

    def test_recommendations_prioritize_unpublished_high_score_clips(self) -> None:
        fake_supabase = FakeSupabase(self.podcasts, self.clips)

        with patch.object(clip_insights_module, "service_supabase", fake_supabase):
            result = get_clip_recommendations_for_podcast("pod-1")

        self.assertEqual([item.id for item in result.recommendations[:2]], ["clip-1", "clip-2"])
        self.assertEqual(result.recommendations[0].recommendation_reason, "Highest upside right now")

    def test_metrics_aggregate_real_counts_from_clip_rows(self) -> None:
        fake_supabase = FakeSupabase(self.podcasts, self.clips)

        with patch.object(clip_insights_module, "service_supabase", fake_supabase):
            result = get_clip_metrics_for_podcast("pod-1")

        self.assertEqual(result.total_clips, 2)
        self.assertEqual(result.published_clips, 1)
        self.assertEqual(result.total_views, 11)
        self.assertEqual(result.total_downloads, 6)
        self.assertEqual(result.top_clips[0].clip_id, "clip-2")

    def test_record_clip_download_increments_view_and_download_counts(self) -> None:
        fake_supabase = FakeSupabase(self.podcasts, self.clips)

        with patch.object(clip_insights_module, "service_supabase", fake_supabase):
            record_clip_download("clip-1")

        updated = next(row for row in self.clips if row["id"] == "clip-1")
        self.assertEqual(updated["view_count"], 4)
        self.assertEqual(updated["download_count"], 2)


if __name__ == "__main__":
    unittest.main()
