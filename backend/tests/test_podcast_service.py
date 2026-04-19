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
from app.services.podcast_service import get_podcasts_for_user, update_podcast_status_for_user  # noqa: E402


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


if __name__ == "__main__":
    unittest.main()
