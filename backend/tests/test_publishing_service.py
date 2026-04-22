from __future__ import annotations

import shutil
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import app.services.clipping_service as clipping_service_module  # noqa: E402
import app.services.publishing_service as publishing_service_module  # noqa: E402
from app.services.clipping_service import get_clips_for_podcast  # noqa: E402
from app.services.publishing_service import (  # noqa: E402
    PublishingError,
    get_published_clip_download_target,
    publish_clips,
    revoke_clip_download,
)


class FakeStorage:
    def __init__(self, *, fail_upload: bool = False, fail_sign: bool = False) -> None:
        self.fail_upload = fail_upload
        self.fail_sign = fail_sign
        self.upload_calls: list[tuple[str, Path, dict[str, str]]] = []
        self.remove_calls: list[list[str]] = []

    def remove(self, paths: list[str]) -> None:
        self.remove_calls.append(paths)

    def upload(self, path: str, file_path: Path, options: dict[str, str]) -> None:
        if self.fail_upload:
            raise RuntimeError("upload failed")
        self.upload_calls.append((path, file_path, options))

    def create_signed_url(self, path: str, ttl: int, options: dict[str, str] | None = None) -> dict[str, str]:
        if self.fail_sign:
            raise RuntimeError("signed url failed")
        return {"signedURL": f"https://example.com/storage/{path}?ttl={ttl}"}


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

    def order(self, _: str) -> "FakeSelectQuery":
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


class FakeClipsTable:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self.rows = rows

    def select(self, _: str) -> FakeSelectQuery:
        return FakeSelectQuery(self.rows)

    def update(self, payload: dict[str, object]) -> FakeUpdateQuery:
        return FakeUpdateQuery(self.rows, payload)


class FakeSupabase:
    def __init__(self, rows: list[dict[str, object]], storage: FakeStorage) -> None:
        self._clips_table = FakeClipsTable(rows)
        self.storage = SimpleNamespace(from_=lambda _: storage)

    def table(self, name: str) -> FakeClipsTable:
        if name != "clips":
            raise AssertionError(f"Unexpected table requested: {name}")
        return self._clips_table


class PublishingServiceTests(unittest.TestCase):
    def _workspace_case_dir(self, name: str) -> Path:
        case_dir = BACKEND_ROOT / ".tmp-test-artifacts" / name
        if case_dir.exists():
            shutil.rmtree(case_dir, ignore_errors=True)
        case_dir.mkdir(parents=True, exist_ok=True)
        self.addCleanup(lambda: shutil.rmtree(case_dir, ignore_errors=True))
        return case_dir

    def _build_clip_rows(self, case_dir: Path) -> list[dict[str, object]]:
        clip_path = case_dir / "clip-01.mp4"
        clip_path.write_bytes(b"clip")
        return [
            {
                "id": "clip-1",
                "podcast_id": "podcast-123",
                "clip_number": 1,
                "clip_start_sec": 0.0,
                "clip_end_sec": 12.0,
                "virality_score": 88.5,
                "storage_path": str(clip_path),
                "storage_url": None,
                "subtitle_text": "viral clip subtitle",
                "status": "ready",
                "published": False,
                "download_url": None,
                "published_at": None,
            }
        ]

    def test_publish_clips_persists_published_state_and_download_url(self) -> None:
        case_dir = self._workspace_case_dir("publishing-success")
        rows = self._build_clip_rows(case_dir)
        storage = FakeStorage()
        fake_supabase = FakeSupabase(rows, storage)

        with patch.object(publishing_service_module, "service_supabase", fake_supabase):
            result = publish_clips("podcast-123", ["clip-1"])

        self.assertEqual(result.total_clips_published, 1)
        self.assertTrue(result.published_clips[0].published)
        self.assertEqual(result.published_clips[0].download_url, "/podcasts/clips/clip-1/download")
        self.assertTrue(bool(rows[0]["published"]))
        self.assertEqual(rows[0]["download_url"], "/podcasts/clips/clip-1/download")
        self.assertEqual(storage.upload_calls[0][0], "podcast-123/clip-01.mp4")

    def test_get_clips_for_podcast_includes_published_metadata(self) -> None:
        case_dir = self._workspace_case_dir("publishing-list")
        rows = self._build_clip_rows(case_dir)
        rows[0]["published"] = True
        rows[0]["download_url"] = "/podcasts/clips/clip-1/download"
        rows[0]["published_at"] = "2026-04-21T12:00:00+00:00"
        rows[0]["storage_url"] = "https://example.com/storage/clip-01.mp4"
        storage = FakeStorage()
        fake_supabase = FakeSupabase(rows, storage)

        with patch.object(clipping_service_module, "service_supabase", fake_supabase):
            result = get_clips_for_podcast("podcast-123")

        self.assertIsNotNone(result)
        self.assertTrue(result.clips[0].published)
        self.assertEqual(result.clips[0].download_url, "/podcasts/clips/clip-1/download")

    def test_revoke_clip_download_clears_publication_fields(self) -> None:
        case_dir = self._workspace_case_dir("publishing-revoke")
        rows = self._build_clip_rows(case_dir)
        rows[0]["published"] = True
        rows[0]["download_url"] = "/podcasts/clips/clip-1/download"
        rows[0]["published_at"] = "2026-04-21T12:00:00+00:00"
        storage = FakeStorage()
        fake_supabase = FakeSupabase(rows, storage)

        with patch.object(publishing_service_module, "service_supabase", fake_supabase):
            result = revoke_clip_download("clip-1")

        self.assertTrue(result.revoked)
        self.assertFalse(result.published)
        self.assertFalse(bool(rows[0]["published"]))
        self.assertIsNone(rows[0]["download_url"])
        self.assertIsNone(rows[0]["published_at"])

    def test_publish_clips_surfaces_upload_and_url_generation_errors(self) -> None:
        case_dir = self._workspace_case_dir("publishing-error")
        rows = self._build_clip_rows(case_dir)
        storage = FakeStorage(fail_upload=True)
        fake_supabase = FakeSupabase(rows, storage)

        with patch.object(publishing_service_module, "service_supabase", fake_supabase):
            with self.assertRaises(PublishingError) as exc_info:
                publish_clips("podcast-123", ["clip-1"])

        self.assertIn("Clip upload failed", exc_info.exception.detail)

    def test_published_download_target_returns_none_after_revocation(self) -> None:
        case_dir = self._workspace_case_dir("publishing-download")
        rows = self._build_clip_rows(case_dir)
        rows[0]["published"] = False
        storage = FakeStorage()
        fake_supabase = FakeSupabase(rows, storage)

        with patch.object(publishing_service_module, "service_supabase", fake_supabase):
            signed_url, file_path = get_published_clip_download_target("clip-1")

        self.assertIsNone(signed_url)
        self.assertIsNone(file_path)


if __name__ == "__main__":
    unittest.main()
