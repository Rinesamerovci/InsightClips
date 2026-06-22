from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import app.services.source_storage_service as source_storage_module  # noqa: E402
from app.services.source_storage_service import (  # noqa: E402
    build_source_storage_path,
    is_source_storage_path,
    materialize_source_media_path,
    parse_source_storage_path,
    upload_source_media,
    SourceStorageError,
)


class FakeStorageBucket:
    def __init__(self, upload_error: Exception | None = None) -> None:
        self.uploads: list[tuple[str, Path, dict[str, str]]] = []
        self.upload_error = upload_error

    def remove(self, _: list[str]) -> None:
        return None

    def upload(self, key: str, path: Path, options: dict[str, str]) -> None:
        if self.upload_error is not None:
            raise self.upload_error
        self.uploads.append((key, path, options))

    def download(self, key: str) -> bytes:
        return f"downloaded:{key}".encode()


class FakeStorage:
    def __init__(self, bucket: FakeStorageBucket) -> None:
        self.bucket = bucket

    def from_(self, _: str) -> FakeStorageBucket:
        return self.bucket


class FakeSupabase:
    def __init__(self, bucket: FakeStorageBucket) -> None:
        self.storage = FakeStorage(bucket)


class SourceStorageServiceTests(unittest.TestCase):
    def test_build_and_parse_source_storage_path(self) -> None:
        storage_path = build_source_storage_path("podcast-sources", "user-123/sources/video.mp4")

        self.assertTrue(is_source_storage_path(storage_path))
        self.assertEqual(parse_source_storage_path(storage_path), ("podcast-sources", "user-123/sources/video.mp4"))

    def test_parse_source_storage_path_accepts_legacy_slash_prefix(self) -> None:
        storage_path = "supabase/podcast-sources/user-123/sources/video.mp4"

        self.assertTrue(is_source_storage_path(storage_path))
        self.assertEqual(parse_source_storage_path(storage_path), ("podcast-sources", "user-123/sources/video.mp4"))

    def test_materialize_source_media_path_downloads_supabase_object(self) -> None:
        bucket = FakeStorageBucket()
        fake_supabase = FakeSupabase(bucket)

        with patch.object(source_storage_module, "service_supabase", fake_supabase):
            temp_path = materialize_source_media_path(
                "supabase://podcast-sources/user-123/sources/video.mp4",
                filename="video.mp4",
            )

        try:
            self.assertTrue(temp_path.exists())
            self.assertEqual(temp_path.read_bytes(), b"downloaded:user-123/sources/video.mp4")
            self.assertEqual(temp_path.suffix, ".mp4")
        finally:
            temp_path.unlink(missing_ok=True)

    def test_upload_source_media_maps_supabase_payload_limit_to_413(self) -> None:
        bucket = FakeStorageBucket(
            upload_error=RuntimeError(
                "{'statusCode': 413, 'error': 'Payload too large', 'message': 'The object exceeded the maximum allowed size'}"
            )
        )
        fake_supabase = FakeSupabase(bucket)
        sample_path = BACKEND_ROOT / "tests" / "fixtures" / "sample_transcription_input.fixture"

        with patch.object(source_storage_module, "service_supabase", fake_supabase):
            with self.assertRaises(SourceStorageError) as error:
                upload_source_media(
                    sample_path,
                    user_id="user-123",
                    filename="episode.mp4",
                    content_type="video/mp4",
                )

        self.assertEqual(error.exception.status_code, 413)
        self.assertIn("bucket limit", error.exception.detail)


if __name__ == "__main__":
    unittest.main()
