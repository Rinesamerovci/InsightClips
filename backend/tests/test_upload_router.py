from __future__ import annotations

import asyncio
from io import BytesIO
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException
from starlette.datastructures import Headers, UploadFile

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.dependencies.auth import AuthenticatedUser  # noqa: E402
from app.models.podcast import PodcastResponse  # noqa: E402
from app.models.upload import YouTubeImportRequest, YouTubeImportResponse  # noqa: E402
from app.routers.upload import confirm_stripe_session, create_checkout, import_youtube_route, upload_file  # noqa: E402
from app.services.source_storage_service import SourceStorageError  # noqa: E402
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
            storage_ready=True,
            checkout_required=False,
            payment_status="not_required",
            price=0.0,
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

    @patch("app.routers.upload.create_checkout_session")
    @patch("app.routers.upload.get_podcast_for_user")
    def test_create_checkout_embeds_checkout_session_placeholder(
        self,
        get_podcast_mock,
        create_checkout_mock,
    ) -> None:
        podcast = PodcastResponse(
            id="pod-youtube",
            user_id=self.user.id,
            title="Imported Episode",
            duration=180,
            status="awaiting_payment",
            price=2.0,
            payment_status="pending",
            storage_path=".generated/youtube-imports/user-123/abcDEF123_4.mp4",
            source_type="youtube",
            source_url="https://www.youtube.com/watch?v=abcDEF123_4",
            external_source_id="abcDEF123_4",
            import_metadata={"channel": "Insight Lab"},
            export_settings=None,
            created_at=None,
            updated_at=None,
        )
        get_podcast_mock.return_value = podcast
        create_checkout_mock.return_value = {"url": "https://stripe.example/checkout"}

        result = asyncio.run(create_checkout({"podcast_id": "pod-youtube"}, self.user))

        self.assertEqual(result["checkout_url"], "https://stripe.example/checkout")
        create_checkout_mock.assert_called_once()
        _, _, success_url, cancel_url = create_checkout_mock.call_args.args
        self.assertIn("session_id={CHECKOUT_SESSION_ID}", success_url)
        self.assertIn("payment=success", success_url)
        self.assertIn("podcast_id=pod-youtube", success_url)
        self.assertTrue(cancel_url.endswith("/upload?payment=cancelled"))

    @patch("app.routers.upload.update_podcast_payment_status_for_user")
    @patch("app.routers.upload.get_podcast_for_user")
    @patch("app.routers.upload.stripe.checkout.Session.retrieve")
    def test_confirm_stripe_session_marks_paid_podcast_ready(
        self,
        retrieve_mock,
        get_podcast_mock,
        update_payment_mock,
    ) -> None:
        current = PodcastResponse(
            id="pod-youtube",
            user_id=self.user.id,
            title="Imported Episode",
            duration=180,
            status="awaiting_payment",
            price=2.0,
            payment_status="pending",
            storage_path=".generated/youtube-imports/user-123/abcDEF123_4.mp4",
            source_type="youtube",
            source_url="https://www.youtube.com/watch?v=abcDEF123_4",
            external_source_id="abcDEF123_4",
            import_metadata={"channel": "Insight Lab"},
            export_settings=None,
            created_at=None,
            updated_at=None,
        )
        get_podcast_mock.return_value = current
        retrieve_mock.return_value = SimpleNamespace(
            metadata={"podcast_id": "pod-youtube"},
            payment_status="paid",
            status="complete",
        )
        update_payment_mock.return_value = current

        result = asyncio.run(
            confirm_stripe_session(
                type("Payload", (), {"podcast_id": "pod-youtube", "session_id": "cs_test_123"})(),
                self.user,
            )
        )

        self.assertEqual(result["id"], "pod-youtube")
        update_payment_mock.assert_called_once_with(
            "pod-youtube",
            self.user.id,
            payment_status="paid",
            status="ready_for_processing",
        )

    def test_upload_file_sanitizes_filename_before_saving(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            staged_file = UploadFile(
                filename="../Unsafe Episode.mp4",
                file=BytesIO(b"media-bytes"),
                headers=Headers({"content-type": "video/mp4"}),
            )

            with patch("app.routers.upload.get_upload_dir", return_value=Path(tmp_dir)):
                with patch("app.routers.upload.upload_source_media", return_value=None):
                    result = asyncio.run(upload_file(staged_file, self.user))

            self.assertEqual(result.filename, "Unsafe-Episode.mp4")
            saved_path = Path(result.storage_path)
            self.assertTrue(saved_path.exists())
            self.assertEqual(saved_path.parent, Path(tmp_dir) / "user-123")
            self.assertEqual(saved_path.read_bytes(), b"media-bytes")

    def test_upload_file_returns_supabase_storage_path_when_source_upload_succeeds(self) -> None:
        from app.services.source_storage_service import StoredSourceMedia

        with tempfile.TemporaryDirectory() as tmp_dir:
            staged_file = UploadFile(
                filename="Episode.mp4",
                file=BytesIO(b"media-bytes"),
                headers=Headers({"content-type": "video/mp4"}),
            )
            stored_source = StoredSourceMedia(
                bucket="podcast-sources",
                key="user-123/sources/Episode.mp4",
                storage_path="supabase://podcast-sources/user-123/sources/Episode.mp4",
            )

            with patch("app.routers.upload.get_upload_dir", return_value=Path(tmp_dir)):
                with patch("app.routers.upload.upload_source_media", return_value=stored_source):
                    result = asyncio.run(upload_file(staged_file, self.user))

        self.assertEqual(result.storage_path, "supabase://podcast-sources/user-123/sources/Episode.mp4")
        self.assertEqual(result.filename, "Episode.mp4")
        self.assertEqual(result.source_storage, "supabase")

    def test_upload_file_can_keep_local_source_when_large_supabase_upload_is_allowed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            staged_file = UploadFile(
                filename="Large Episode.mp4",
                file=BytesIO(b"media-bytes"),
                headers=Headers({"content-type": "video/mp4"}),
            )

            with patch("app.routers.upload.get_upload_dir", return_value=Path(tmp_dir)):
                with patch("app.routers.upload.get_settings") as settings_mock:
                    settings_mock.return_value.allow_local_source_fallback = True
                    with patch(
                        "app.routers.upload.upload_source_media",
                        side_effect=SourceStorageError("too large", status_code=413),
                    ):
                        result = asyncio.run(upload_file(staged_file, self.user))

            saved_path = Path(result.storage_path)
            self.assertTrue(saved_path.exists())
            self.assertEqual(result.filename, "Large-Episode.mp4")
            self.assertEqual(result.source_storage, "local")

    def test_upload_file_keeps_local_source_for_large_uploads_in_development(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            staged_file = UploadFile(
                filename="Development Episode.mp4",
                file=BytesIO(b"media-bytes"),
                headers=Headers({"content-type": "video/mp4"}),
            )

            with patch("app.routers.upload.get_upload_dir", return_value=Path(tmp_dir)):
                with patch("app.routers.upload.get_settings") as settings_mock:
                    settings_mock.return_value.allow_local_source_fallback = False
                    settings_mock.return_value.environment = "development"
                    with patch(
                        "app.routers.upload.upload_source_media",
                        side_effect=SourceStorageError("too large", status_code=413),
                    ):
                        result = asyncio.run(upload_file(staged_file, self.user))

            self.assertTrue(Path(result.storage_path).exists())
            self.assertEqual(result.source_storage, "local")

    def test_get_upload_dir_uses_configured_persistent_storage(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            with patch("app.routers.upload.get_settings") as settings_mock:
                settings_mock.return_value.upload_storage_dir = tmp_dir

                from app.routers.upload import get_upload_dir

                result = get_upload_dir()

        self.assertEqual(result, Path(tmp_dir) / "uploads")

    def test_upload_file_rejects_unsupported_media_type(self) -> None:
        staged_file = UploadFile(
            filename="notes.txt",
            file=BytesIO(b"not-media"),
            headers=Headers({"content-type": "text/plain"}),
        )

        with self.assertRaises(HTTPException) as error:
            asyncio.run(upload_file(staged_file, self.user))

        self.assertEqual(error.exception.status_code, 422)
        self.assertIn("Unsupported media type", error.exception.detail)


if __name__ == "__main__":
    unittest.main()
