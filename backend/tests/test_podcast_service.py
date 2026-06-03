from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import app.services.podcast_service as podcast_service_module  # noqa: E402
from app.database import UnconfiguredSupabaseClient  # noqa: E402
from app.services.podcast_service import (  # noqa: E402
    create_imported_podcast_record,
    get_podcasts_for_user,
    get_user_podcast_analytics,
    update_podcast_status_for_user,
)
from app.services.profile_service import get_profile_for_analytics  # noqa: E402
import app.services.profile_service as profile_service_module  # noqa: E402


class FakeSelectQuery:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self._rows = rows
        self._eq_filters: list[tuple[str, object]] = []
        self._in_filter: tuple[str, set[object]] | None = None

    def eq(self, key: str, value: object) -> "FakeSelectQuery":
        self._eq_filters.append((key, value))
        return self

    def in_(self, key: str, values: list[object]) -> "FakeSelectQuery":
        self._in_filter = (key, set(values))
        return self

    def order(self, _: str, desc: bool = False) -> "FakeSelectQuery":
        return self

    def limit(self, _: int) -> "FakeSelectQuery":
        return self

    def execute(self) -> SimpleNamespace:
        rows = list(self._rows)
        for key, value in self._eq_filters:
            rows = [row for row in rows if row.get(key) == value]
        if self._in_filter is not None:
            key, values = self._in_filter
            rows = [row for row in rows if row.get(key) in values]
        return SimpleNamespace(data=rows)


class FakeTable:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self._rows = rows

    def select(self, _: str) -> FakeSelectQuery:
        return FakeSelectQuery(self._rows)


class FakeAnalyticsSupabase:
    def __init__(
        self,
        podcast_rows: list[dict[str, object]],
        clip_rows: list[dict[str, object]],
    ) -> None:
        self._podcast_rows = podcast_rows
        self._clip_rows = clip_rows

    def table(self, name: str) -> FakeTable:
        if name == "podcasts":
            return FakeTable(self._podcast_rows)
        if name == "clips":
            return FakeTable(self._clip_rows)
        raise AssertionError(f"Unexpected table requested: {name}")


class PodcastServiceTests(unittest.TestCase):
    def test_get_podcasts_for_user_returns_real_empty_list_when_user_has_no_rows(self) -> None:
        service_supabase_mock = MagicMock()
        query = MagicMock()
        query.select.return_value = query
        query.eq.return_value = query
        query.order.return_value = query
        query.execute.return_value = SimpleNamespace(data=[])
        service_supabase_mock.table.return_value = query

        with patch.object(podcast_service_module, "service_supabase", service_supabase_mock):
            podcasts, is_mock = get_podcasts_for_user("user-123")

        self.assertEqual(podcasts, [])
        self.assertFalse(is_mock)

    def test_get_podcasts_for_user_uses_mock_only_when_supabase_unconfigured(self) -> None:
        with patch.object(podcast_service_module, "service_supabase", UnconfiguredSupabaseClient()):
            podcasts, is_mock = get_podcasts_for_user("user-123")

        self.assertTrue(is_mock)
        self.assertGreaterEqual(len(podcasts), 1)

    def test_create_imported_podcast_record_persists_source_metadata(self) -> None:
        service_supabase_mock = MagicMock()
        execute_mock = MagicMock(return_value=SimpleNamespace(data=[{"id": "pod-youtube"}]))
        insert_mock = MagicMock(return_value=SimpleNamespace(execute=execute_mock))
        table_mock = MagicMock(return_value=SimpleNamespace(insert=insert_mock))
        service_supabase_mock.table = table_mock

        payload = {
            "user_id": "user-123",
            "title": "Imported Episode",
            "duration": 120,
            "status": "ready_for_processing",
            "price": 0.0,
            "payment_status": "not_required",
            "storage_path": ".generated/youtube-imports/user-123/video.mp4",
            "source_type": "youtube",
            "source_url": "https://www.youtube.com/watch?v=abcDEF123_4",
            "external_source_id": "abcDEF123_4",
            "import_metadata": {"channel": "Insight Lab"},
        }

        with patch.object(podcast_service_module, "service_supabase", service_supabase_mock):
            podcast_id = create_imported_podcast_record(payload)

        self.assertEqual(podcast_id, "pod-youtube")
        insert_payload = insert_mock.call_args.args[0]
        self.assertEqual(insert_payload["source_type"], "youtube")
        self.assertEqual(insert_payload["external_source_id"], "abcDEF123_4")

    def test_create_imported_podcast_record_falls_back_when_source_columns_are_missing(self) -> None:
        service_supabase_mock = MagicMock()
        first_execute = MagicMock(side_effect=RuntimeError("column podcasts.source_type does not exist"))
        second_execute = MagicMock(return_value=SimpleNamespace(data=[{"id": "pod-fallback"}]))
        first_insert = MagicMock(return_value=SimpleNamespace(execute=first_execute))
        second_insert = MagicMock(return_value=SimpleNamespace(execute=second_execute))
        table_mock = MagicMock()
        table_mock.return_value.insert.side_effect = [first_insert.return_value, second_insert.return_value]
        service_supabase_mock.table = table_mock

        payload = {
            "user_id": "user-123",
            "title": "Imported Episode",
            "duration": 120,
            "status": "ready_for_processing",
            "storage_path": ".generated/youtube-imports/user-123/video.mp4",
            "source_type": "youtube",
            "source_url": "https://www.youtube.com/watch?v=abcDEF123_4",
            "external_source_id": "abcDEF123_4",
            "import_metadata": {"channel": "Insight Lab"},
        }

        with patch.object(podcast_service_module, "service_supabase", service_supabase_mock):
            podcast_id = create_imported_podcast_record(payload)

        self.assertEqual(podcast_id, "pod-fallback")
        fallback_payload = table_mock.return_value.insert.call_args_list[1].args[0]
        self.assertNotIn("source_type", fallback_payload)
        self.assertNotIn("import_metadata", fallback_payload)

    def test_update_podcast_status_for_user_returns_none_when_update_raises(self) -> None:
        service_supabase_mock = MagicMock()
        query = MagicMock()
        query.update.return_value = query
        query.eq.return_value = query
        query.execute.side_effect = RuntimeError("connection terminated")
        service_supabase_mock.table.return_value = query

        with patch.object(podcast_service_module, "service_supabase", service_supabase_mock):
            with patch.object(podcast_service_module, "get_podcast_for_user") as fallback:
                result = update_podcast_status_for_user("pod-1", "user-123", "processing")

        self.assertIsNone(result)
        fallback.assert_not_called()

    def test_update_podcast_status_for_user_returns_none_when_fetch_after_update_raises(self) -> None:
        service_supabase_mock = MagicMock()
        query = MagicMock()
        query.update.return_value = query
        query.eq.return_value = query
        query.execute.return_value = SimpleNamespace(data=[{"id": "pod-1"}])
        service_supabase_mock.table.return_value = query

        with patch.object(podcast_service_module, "service_supabase", service_supabase_mock):
            with patch.object(podcast_service_module, "get_podcast_for_user", side_effect=RuntimeError("connection terminated")):
                result = update_podcast_status_for_user("pod-1", "user-123", "processing")

        self.assertIsNone(result)

    def test_get_user_podcast_analytics_aggregates_owned_podcasts_and_clips(self) -> None:
        podcast_rows = [
            {
                "id": "pod-1",
                "user_id": "user-123",
                "title": "Launch Show",
                "duration": 1200,
                "status": "done",
                "storage_path": "/tmp/pod-1.mp4",
                "created_at": "2026-05-01T10:00:00+00:00",
                "updated_at": "2026-05-01T10:00:00+00:00",
            },
            {
                "id": "pod-2",
                "user_id": "user-123",
                "title": "Growth Show",
                "duration": 900,
                "status": "processing",
                "storage_path": "/tmp/pod-2.mp4",
                "created_at": "2026-05-02T10:00:00+00:00",
                "updated_at": "2026-05-02T10:00:00+00:00",
            },
        ]
        clip_rows = [
            {
                "id": "clip-1",
                "podcast_id": "pod-1",
                "clip_number": 1,
                "virality_score": 90.0,
                "status": "ready",
                "published": True,
                "published_at": "2026-05-03T10:00:00+00:00",
                "view_count": 10,
                "download_count": 4,
            },
            {
                "id": "clip-2",
                "podcast_id": "pod-1",
                "clip_number": 2,
                "virality_score": 70.0,
                "status": "ready",
                "published": False,
                "published_at": None,
                "view_count": 3,
                "download_count": 1,
            },
            {
                "id": "clip-3",
                "podcast_id": "pod-2",
                "clip_number": 1,
                "virality_score": 80.0,
                "status": "ready",
                "published": True,
                "published_at": "2026-05-04T10:00:00+00:00",
                "view_count": 8,
                "download_count": 2,
            },
        ]
        fake_supabase = FakeAnalyticsSupabase(podcast_rows, clip_rows)

        with patch.object(podcast_service_module, "service_supabase", fake_supabase):
            result = get_user_podcast_analytics("user-123")

        self.assertEqual(result.total_podcasts, 2)
        self.assertEqual(result.total_clips, 3)
        self.assertEqual(result.published_clips, 2)
        self.assertEqual(result.private_clips, 1)
        self.assertEqual(result.total_views, 21)
        self.assertEqual(result.total_downloads, 7)
        self.assertEqual(result.average_virality_score, 80.0)
        self.assertEqual(result.publish_rate, 66.67)
        self.assertEqual(result.top_clips[0].clip_id, "clip-1")
        self.assertEqual(result.podcasts[0].podcast_id, "pod-1")
        self.assertEqual(result.podcasts[0].published_clips, 1)

    def test_get_profile_for_analytics_returns_none_for_blank_profile_id(self) -> None:
        with patch.object(profile_service_module, "get_profile_by_id") as get_profile_mock:
            result = get_profile_for_analytics("   ")

        self.assertIsNone(result)
        get_profile_mock.assert_not_called()


if __name__ == "__main__":
    unittest.main()
