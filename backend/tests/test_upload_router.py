from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.dependencies.auth import AuthenticatedUser  # noqa: E402
from app.models.upload import YouTubeImportRequest, YouTubeImportResponse  # noqa: E402
from app.routers.upload import import_youtube_route  # noqa: E402
from app.services.upload_service import UploadWorkflowError  # noqa: E402


class UploadRouterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.user = AuthenticatedUser(
            id="user-123",
            email="rinesa@example.com",
            free_trial_used=False,
        )

    @patch("app.routers.upload.import_youtube_podcast")
    def test_import_youtube_route_accepts_processing_request(self, import_mock) -> None:
        import_mock.return_value = YouTubeImportResponse(
            podcast_id="pod-youtube",
            status="ready_for_processing",
            source_url="https://www.youtube.com/watch?v=abcDEF123_4",
            video_id="abcDEF123_4",
            title="Imported Episode",
            storage_path=".generated/youtube-imports/user-123/abcDEF123_4.mp4",
            duration_seconds=180.0,
            metadata={"channel": "Insight Lab"},
        )

        result = asyncio.run(
            import_youtube_route(
                YouTubeImportRequest(url="https://youtu.be/abcDEF123_4"),
                self.user,
            )
        )

        self.assertEqual(result.podcast_id, "pod-youtube")
        self.assertEqual(result.status, "ready_for_processing")
        self.assertEqual(result.source_type, "youtube")
        import_mock.assert_called_once()

    @patch("app.routers.upload.import_youtube_podcast")
    def test_import_youtube_route_returns_clear_http_error(self, import_mock) -> None:
        import_mock.side_effect = UploadWorkflowError(
            "Playlist import is not supported. Submit a single YouTube video link.",
            status_code=400,
            code="playlist_not_supported",
        )

        with self.assertRaises(HTTPException) as error:
            asyncio.run(
                import_youtube_route(
                    YouTubeImportRequest(url="https://www.youtube.com/watch?v=abcDEF123_4"),
                    self.user,
                )
            )

        self.assertEqual(error.exception.status_code, 400)
        self.assertEqual(
            error.exception.detail,
            "Playlist import is not supported. Submit a single YouTube video link.",
        )


if __name__ == "__main__":
    unittest.main()
