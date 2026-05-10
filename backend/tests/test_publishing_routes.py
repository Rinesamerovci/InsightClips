from __future__ import annotations

import asyncio
import shutil
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.dependencies.auth import AuthenticatedUser  # noqa: E402
from app.models.publishing import (  # noqa: E402
    ClipMetricResponse,
    ClipPublicationResult,
    ClipPublicationStatus,
    ClipPublicationStatusResponse,
    ClipRevocationResult,
    PublishClipRequest,
    PublishClipsRequest,
)
from app.routers.clips import (
    get_clip_metrics_route,
    get_clip_publication_status_route,
    publish_clip_route,
    revoke_clip_download_route,
)  # noqa: E402
from app.routers.podcasts import download_generated_clip, publish_podcast_clips  # noqa: E402


class PublishingRouterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.user = AuthenticatedUser(
            id="user-123",
            email="demo@example.com",
            free_trial_used=False,
        )

    def _workspace_case_dir(self, name: str) -> Path:
        case_dir = BACKEND_ROOT / ".tmp-test-artifacts" / name
        if case_dir.exists():
            shutil.rmtree(case_dir, ignore_errors=True)
        case_dir.mkdir(parents=True, exist_ok=True)
        self.addCleanup(lambda: shutil.rmtree(case_dir, ignore_errors=True))
        return case_dir

    @patch("app.routers.podcasts.publish_clips")
    @patch("app.routers.podcasts.podcast_belongs_to_user", return_value=True)
    def test_publish_podcast_clips_returns_service_result(
        self,
        podcast_belongs_mock,
        publish_clips_mock,
    ) -> None:
        publish_clips_mock.return_value = ClipPublicationResult(
            podcast_id="podcast-123",
            total_clips_published=1,
            published_clips=[
                ClipPublicationStatus(
                    clip_id="clip-1",
                    published=True,
                    status="published",
                    destination="download",
                    download_url="/podcasts/clips/clip-1/download",
                    published_at=datetime(2026, 4, 23, 9, 30, tzinfo=timezone.utc),
                )
            ],
            processing_time_seconds=0.12,
        )

        result = asyncio.run(
            publish_podcast_clips(
                "podcast-123",
                PublishClipsRequest(clip_ids=["clip-1"]),
                self.user,
            )
        )

        self.assertEqual(result.total_clips_published, 1)
        self.assertEqual(result.published_clips[0].clip_id, "clip-1")
        podcast_belongs_mock.assert_called_once_with("podcast-123", "user-123")
        publish_clips_mock.assert_called_once_with(
            "podcast-123",
            ["clip-1"],
            destination="download",
            metadata={},
        )

    @patch("app.routers.podcasts.publish_clips")
    @patch("app.routers.podcasts.podcast_belongs_to_user", return_value=False)
    def test_publish_podcast_clips_rejects_unowned_podcast(
        self,
        podcast_belongs_mock,
        publish_clips_mock,
    ) -> None:
        with self.assertRaises(HTTPException) as exc_info:
            asyncio.run(
                publish_podcast_clips(
                    "podcast-123",
                    PublishClipsRequest(clip_ids=["clip-1"]),
                    self.user,
                )
            )

        self.assertEqual(exc_info.exception.status_code, 404)
        podcast_belongs_mock.assert_called_once_with("podcast-123", "user-123")
        publish_clips_mock.assert_not_called()

    def test_publish_request_rejects_blank_clip_ids(self) -> None:
        with self.assertRaises(ValidationError):
            PublishClipsRequest(clip_ids=["clip-1", "   "])

    @patch("app.routers.podcasts.record_clip_download")
    @patch(
        "app.routers.podcasts.get_published_clip_download_content",
        return_value=(b"clip-bytes", None, "clip-01.mp4"),
    )
    @patch("app.routers.podcasts.podcast_belongs_to_user", return_value=True)
    @patch("app.routers.podcasts.get_clip_podcast_id", return_value="podcast-123")
    def test_download_generated_clip_returns_attachment_response(
        self,
        get_clip_podcast_id_mock,
        podcast_belongs_mock,
        get_download_content_mock,
        record_download_mock,
    ) -> None:
        response = asyncio.run(download_generated_clip("clip-1", self.user))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.media_type, "video/mp4")
        self.assertEqual(response.body, b"clip-bytes")
        self.assertEqual(
            response.headers.get("content-disposition"),
            'attachment; filename="clip-01.mp4"',
        )
        get_clip_podcast_id_mock.assert_called_once_with("clip-1")
        podcast_belongs_mock.assert_called_once_with("podcast-123", "user-123")
        get_download_content_mock.assert_called_once_with("clip-1")
        record_download_mock.assert_called_once_with("clip-1")

    @patch("app.routers.podcasts.get_clip_download_target", return_value=(None, None))
    @patch("app.routers.podcasts.get_published_clip_download_content", return_value=(None, None, None))
    @patch("app.routers.podcasts.podcast_belongs_to_user", return_value=True)
    @patch("app.routers.podcasts.get_clip_podcast_id", return_value="podcast-123")
    def test_download_generated_clip_returns_404_when_content_is_unavailable(
        self,
        get_clip_podcast_id_mock,
        podcast_belongs_mock,
        get_download_content_mock,
        get_clip_download_target_mock,
    ) -> None:
        with self.assertRaises(HTTPException) as exc_info:
            asyncio.run(download_generated_clip("clip-1", self.user))

        self.assertEqual(exc_info.exception.status_code, 404)
        self.assertEqual(exc_info.exception.detail, "Clip download is unavailable or has been revoked.")
        get_clip_podcast_id_mock.assert_called_once_with("clip-1")
        podcast_belongs_mock.assert_called_once_with("podcast-123", "user-123")
        get_download_content_mock.assert_called_once_with("clip-1")
        get_clip_download_target_mock.assert_called_once_with("clip-1")

    @patch("app.routers.podcasts.get_published_clip_download_content", return_value=(None, None, None))
    @patch("app.routers.podcasts.podcast_belongs_to_user", return_value=True)
    @patch("app.routers.podcasts.get_clip_podcast_id", return_value="podcast-123")
    def test_download_generated_clip_returns_local_preview_for_private_clip(
        self,
        get_clip_podcast_id_mock,
        podcast_belongs_mock,
        get_download_content_mock,
    ) -> None:
        case_dir = self._workspace_case_dir("private-preview")
        preview_file = case_dir / "clip-01.mp4"
        preview_file.write_bytes(b"private-preview")

        with patch(
            "app.routers.podcasts.get_clip_download_target",
            return_value=(None, preview_file),
        ):
            response = asyncio.run(download_generated_clip("clip-1", self.user))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.media_type, "video/mp4")
        get_clip_podcast_id_mock.assert_called_once_with("clip-1")
        podcast_belongs_mock.assert_called_once_with("podcast-123", "user-123")
        get_download_content_mock.assert_called_once_with("clip-1")

    @patch("app.routers.clips.revoke_clip_download")
    @patch("app.routers.clips.podcast_belongs_to_user", return_value=True)
    @patch("app.routers.clips.get_clip_podcast_id", return_value="podcast-123")
    def test_revoke_clip_download_route_returns_service_result(
        self,
        get_clip_podcast_id_mock,
        podcast_belongs_mock,
        revoke_clip_download_mock,
    ) -> None:
        revoke_clip_download_mock.return_value = ClipRevocationResult(
            clip_id="clip-1",
            revoked=True,
            published=False,
        )

        result = asyncio.run(revoke_clip_download_route("clip-1", self.user))

        self.assertTrue(result.revoked)
        self.assertFalse(result.published)
        get_clip_podcast_id_mock.assert_called_once_with("clip-1")
        podcast_belongs_mock.assert_called_once_with("podcast-123", "user-123")
        revoke_clip_download_mock.assert_called_once_with("clip-1")

    @patch("app.routers.clips.publish_clips")
    @patch("app.routers.clips.podcast_belongs_to_user", return_value=True)
    @patch("app.routers.clips.get_clip_podcast_id", return_value="podcast-123")
    def test_publish_clip_route_validates_ownership_and_returns_clip_status(
        self,
        get_clip_podcast_id_mock,
        podcast_belongs_mock,
        publish_clips_mock,
    ) -> None:
        publish_clips_mock.return_value = ClipPublicationResult(
            podcast_id="podcast-123",
            total_clips_published=1,
            published_clips=[
                ClipPublicationStatus(
                    clip_id="clip-1",
                    published=True,
                    status="published",
                    destination="instagram",
                    download_url="/podcasts/clips/clip-1/download",
                    metadata={"caption": "ready"},
                )
            ],
            processing_time_seconds=0.12,
        )

        result = asyncio.run(
            publish_clip_route(
                "clip-1",
                PublishClipRequest(destination="instagram", metadata={"caption": "ready"}),
                self.user,
            )
        )

        self.assertEqual(result.status, "published")
        self.assertEqual(result.destination, "instagram")
        get_clip_podcast_id_mock.assert_called_once_with("clip-1")
        podcast_belongs_mock.assert_called_once_with("podcast-123", "user-123")
        publish_clips_mock.assert_called_once_with(
            "podcast-123",
            ["clip-1"],
            destination="instagram",
            metadata={"caption": "ready"},
        )

    @patch("app.routers.clips.publish_clips")
    @patch("app.routers.clips.podcast_belongs_to_user", return_value=False)
    @patch("app.routers.clips.get_clip_podcast_id", return_value="podcast-123")
    def test_publish_clip_route_rejects_unowned_clip(
        self,
        get_clip_podcast_id_mock,
        podcast_belongs_mock,
        publish_clips_mock,
    ) -> None:
        with self.assertRaises(HTTPException) as exc_info:
            asyncio.run(publish_clip_route("clip-1", PublishClipRequest(), self.user))

        self.assertEqual(exc_info.exception.status_code, 404)
        get_clip_podcast_id_mock.assert_called_once_with("clip-1")
        podcast_belongs_mock.assert_called_once_with("podcast-123", "user-123")
        publish_clips_mock.assert_not_called()

    @patch("app.routers.clips.get_clip_publication_status")
    @patch("app.routers.clips.podcast_belongs_to_user", return_value=True)
    @patch("app.routers.clips.get_clip_podcast_id", return_value="podcast-123")
    def test_get_clip_publication_status_route_returns_clear_status(
        self,
        get_clip_podcast_id_mock,
        podcast_belongs_mock,
        get_clip_publication_status_mock,
    ) -> None:
        get_clip_publication_status_mock.return_value = ClipPublicationStatusResponse(
            clip_id="clip-1",
            podcast_id="podcast-123",
            published=False,
            status="failed",
            destination="youtube",
            metadata={"error": "upload failed"},
        )

        result = asyncio.run(
            get_clip_publication_status_route("clip-1", destination="youtube", current_user=self.user)
        )

        self.assertEqual(result.status, "failed")
        self.assertEqual(result.destination, "youtube")
        get_clip_podcast_id_mock.assert_called_once_with("clip-1")
        podcast_belongs_mock.assert_called_once_with("podcast-123", "user-123")
        get_clip_publication_status_mock.assert_called_once_with("clip-1", destination="youtube")

    @patch("app.routers.clips.get_clip_metrics")
    @patch("app.routers.clips.podcast_belongs_to_user", return_value=True)
    @patch("app.routers.clips.get_clip_podcast_id", return_value="podcast-123")
    def test_get_clip_metrics_route_returns_owned_clip_metrics(
        self,
        get_clip_podcast_id_mock,
        podcast_belongs_mock,
        get_clip_metrics_mock,
    ) -> None:
        get_clip_metrics_mock.return_value = ClipMetricResponse(
            clip_id="clip-1",
            podcast_id="podcast-123",
            clip_number=1,
            views=20,
            downloads=5,
            click_through_rate=25.0,
            virality_score=88.0,
            published=True,
            status="ready",
        )

        result = asyncio.run(get_clip_metrics_route("clip-1", self.user))

        self.assertEqual(result.clip_id, "clip-1")
        self.assertEqual(result.click_through_rate, 25.0)
        get_clip_podcast_id_mock.assert_called_once_with("clip-1")
        podcast_belongs_mock.assert_called_once_with("podcast-123", "user-123")
        get_clip_metrics_mock.assert_called_once_with("clip-1")

    @patch("app.routers.clips.get_clip_metrics")
    @patch("app.routers.clips.podcast_belongs_to_user", return_value=False)
    @patch("app.routers.clips.get_clip_podcast_id", return_value="podcast-123")
    def test_get_clip_metrics_route_rejects_unowned_clip(
        self,
        get_clip_podcast_id_mock,
        podcast_belongs_mock,
        get_clip_metrics_mock,
    ) -> None:
        with self.assertRaises(HTTPException) as exc_info:
            asyncio.run(get_clip_metrics_route("clip-1", self.user))

        self.assertEqual(exc_info.exception.status_code, 404)
        get_clip_podcast_id_mock.assert_called_once_with("clip-1")
        podcast_belongs_mock.assert_called_once_with("podcast-123", "user-123")
        get_clip_metrics_mock.assert_not_called()


if __name__ == "__main__":
    unittest.main()
