from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import app.services.account_service as account_service_module  # noqa: E402
from app.services.account_service import delete_account  # noqa: E402
from app.services.account_service import _delete_auth_user  # noqa: E402
from app.services.account_service import AccountDeletionError  # noqa: E402


class _FakeTable:
    def __init__(self, rows: list[dict[str, object]] | None = None) -> None:
        self.rows = rows or []
        self.deleted_filters: list[tuple[str, str]] = []

    def select(self, _: str) -> "_FakeTable":
        return self

    def eq(self, field: str, value: str) -> "_FakeTable":
        self.deleted_filters.append((field, value))
        return self

    def delete(self) -> "_FakeTable":
        return self

    def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=self.rows)


class _FakeStorageBucket:
    def __init__(self, listings: dict[str, list[dict[str, object]]]) -> None:
        self.listings = listings
        self.removed: list[list[str]] = []

    def list(self, path: str) -> list[dict[str, object]]:
        return self.listings.get(path, [])

    def remove(self, paths: list[str]) -> None:
        self.removed.append(paths)


class AccountServiceTests(unittest.TestCase):
    def test_delete_account_removes_storage_and_auth_user(self) -> None:
        podcast_rows = [
            {
                "id": "podcast-1",
                "storage_path": "supabase://podcast-sources/user-123/sources/source.mp4",
            },
            {"id": "podcast-2", "storage_path": ""},
        ]
        podcasts_table = _FakeTable(podcast_rows)
        profiles_table = _FakeTable()
        podcast_sources = _FakeStorageBucket(
            {
                "user-123": [{"name": "sources"}],
                "user-123/sources": [{"name": "source.mp4", "id": "object-1", "metadata": {}}],
                "user-123/sources/source.mp4": [],
            }
        )
        clips = _FakeStorageBucket(
            {
                "podcast-1": [{"name": "clip-01.mp4", "id": "clip-object-1", "metadata": {}}],
                "podcast-1/clip-01.mp4": [],
                "podcast-2": [],
            }
        )
        storage = SimpleNamespace(
            from_=MagicMock(side_effect=lambda bucket: podcast_sources if bucket == "podcast-sources" else clips)
        )
        admin = SimpleNamespace(delete_user=MagicMock())
        fake_supabase = SimpleNamespace(
            table=MagicMock(side_effect=lambda name: podcasts_table if name == "podcasts" else profiles_table),
            storage=storage,
            auth=SimpleNamespace(admin=admin),
        )

        with patch.object(account_service_module, "service_supabase", fake_supabase):
            result = delete_account("user-123")

        self.assertEqual(result.user_id, "user-123")
        self.assertEqual(result.podcasts_deleted, 2)
        self.assertEqual(result.source_objects_removed, 1)
        self.assertEqual(result.clip_objects_removed, 1)
        self.assertTrue(result.auth_user_deleted)
        self.assertFalse(result.email_notification_sent)
        admin.delete_user.assert_called_once_with("user-123")
        self.assertIn(["user-123/sources/source.mp4"], podcast_sources.removed)
        self.assertIn(["podcast-1/clip-01.mp4"], clips.removed)
        self.assertIn(("id", "user-123"), profiles_table.deleted_filters)

    def test_delete_account_sends_deletion_email_when_smtp_is_configured(self) -> None:
        podcasts_table = _FakeTable([])
        profiles_table = _FakeTable()
        empty_storage = _FakeStorageBucket({})
        storage = SimpleNamespace(from_=MagicMock(return_value=empty_storage))
        admin = SimpleNamespace(delete_user=MagicMock())
        fake_supabase = SimpleNamespace(
            table=MagicMock(side_effect=lambda name: podcasts_table if name == "podcasts" else profiles_table),
            storage=storage,
            auth=SimpleNamespace(admin=admin),
        )
        smtp_client = MagicMock()
        smtp_context = MagicMock()
        smtp_context.__enter__.return_value = smtp_client
        settings = SimpleNamespace(
            smtp_host="smtp.resend.com",
            smtp_port=587,
            smtp_username="resend",
            smtp_password="secret",
            smtp_from_email="noreply@insightclips.dev",
            smtp_from_name="InsightClips",
            smtp_use_tls=True,
        )

        with (
            patch.object(account_service_module, "service_supabase", fake_supabase),
            patch.object(account_service_module, "get_settings", return_value=settings),
            patch.object(account_service_module.smtplib, "SMTP", return_value=smtp_context),
        ):
            result = delete_account("user-123", email="creator@example.com")

        self.assertTrue(result.email_notification_sent)
        smtp_client.starttls.assert_called_once()
        smtp_client.login.assert_called_once_with("resend", "secret")
        smtp_client.send_message.assert_called_once()
        admin.delete_user.assert_called_once_with("user-123")

    def test_delete_account_does_not_send_email_when_auth_delete_fails(self) -> None:
        podcast_rows = [
            {
                "id": "podcast-1",
                "storage_path": "supabase://podcast-sources/user-123/sources/source.mp4",
            }
        ]
        podcasts_table = _FakeTable(podcast_rows)
        profiles_table = _FakeTable()
        podcast_sources = _FakeStorageBucket(
            {
                "user-123": [{"name": "sources"}],
                "user-123/sources": [{"name": "source.mp4", "id": "object-1", "metadata": {}}],
            }
        )
        clips = _FakeStorageBucket({"podcast-1": [{"name": "clip-01.mp4", "id": "clip-object-1", "metadata": {}}]})
        storage = SimpleNamespace(
            from_=MagicMock(side_effect=lambda bucket: podcast_sources if bucket == "podcast-sources" else clips)
        )
        admin = SimpleNamespace(delete_user=MagicMock(side_effect=RuntimeError("permission denied")))
        fake_supabase = SimpleNamespace(
            table=MagicMock(side_effect=lambda name: podcasts_table if name == "podcasts" else profiles_table),
            storage=storage,
            auth=SimpleNamespace(admin=admin),
        )
        smtp_client = MagicMock()
        smtp_context = MagicMock()
        smtp_context.__enter__.return_value = smtp_client
        settings = SimpleNamespace(
            smtp_host="smtp.resend.com",
            smtp_port=587,
            smtp_username="resend",
            smtp_password="secret",
            smtp_from_email="noreply@insightclips.dev",
            smtp_from_name="InsightClips",
            smtp_use_tls=True,
        )

        with (
            patch.object(account_service_module, "service_supabase", fake_supabase),
            patch.object(account_service_module, "get_settings", return_value=settings),
            patch.object(account_service_module.smtplib, "SMTP", return_value=smtp_context),
        ):
            with self.assertRaises(AccountDeletionError):
                delete_account("user-123", email="creator@example.com")

        smtp_client.send_message.assert_not_called()
        self.assertEqual(podcast_sources.removed, [])
        self.assertEqual(clips.removed, [])
        self.assertIn(("id", "user-123"), profiles_table.deleted_filters)

    def test_delete_auth_user_treats_missing_auth_user_as_already_deleted(self) -> None:
        admin = SimpleNamespace(delete_user=MagicMock(side_effect=RuntimeError("User not found")))
        fake_supabase = SimpleNamespace(auth=SimpleNamespace(admin=admin))

        with patch.object(account_service_module, "service_supabase", fake_supabase):
            result = _delete_auth_user("user-123")

        self.assertFalse(result)


if __name__ == "__main__":
    unittest.main()
