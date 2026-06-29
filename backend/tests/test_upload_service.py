from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.dependencies.auth import AuthenticatedUser  # noqa: E402
from app.models.media import MediaInspectionResult  # noqa: E402
from app.models.upload import UploadCalculatePriceRequest, UploadPrepareRequest, YouTubeImportRequest  # noqa: E402
import app.services.upload_service as upload_service_module  # noqa: E402
from app.services.upload_service import (  # noqa: E402
    UploadWorkflowError,
    YouTubeDownloadResult,
    calculate_upload_price,
    determine_upload_price,
    import_youtube_podcast,
    parse_youtube_source,
    prepare_upload,
)


class UploadServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.user = AuthenticatedUser(
            id="user-123",
            email="rinesa@example.com",
            free_trial_used=False,
        )
        self.inspection = MediaInspectionResult(
            duration_seconds=1800.0,
            duration_minutes=30.0,
            is_supported=True,
            detected_format="mp4",
            mime_type="video/mp4",
            validation_flags={
                "ffprobe_available": True,
                "file_exists": True,
                "mime_type_supported": True,
                "duration_detected": True,
            },
        )

    def test_determine_upload_price_uses_free_trial(self) -> None:
        decision = determine_upload_price(29.5, free_trial_used=False)
        self.assertEqual(decision.status, "free_ready")
        self.assertEqual(decision.price, 0.0)
        self.assertTrue(decision.free_trial_available)

    def test_determine_upload_price_uses_remaining_free_minutes(self) -> None:
        short_decision = determine_upload_price(
            4.0,
            free_trial_used=False,
            free_trial_remaining_seconds=15 * 60,
        )
        long_decision = determine_upload_price(
            16.0,
            free_trial_used=False,
            free_trial_remaining_seconds=15 * 60,
        )

        self.assertEqual(short_decision.status, "free_ready")
        self.assertEqual(short_decision.price, 0.0)
        self.assertEqual(long_decision.status, "awaiting_payment")
        self.assertEqual(long_decision.price, 1.0)

    def test_determine_upload_price_blocks_over_mvp_limit(self) -> None:
        decision = determine_upload_price(121, free_trial_used=True)
        self.assertEqual(decision.status, "blocked")
        self.assertEqual(decision.price, 0.0)

    @patch("app.services.upload_service.get_profile_by_id")
    @patch("app.services.upload_service.inspect_staged_media")
    def test_calculate_upload_price_uses_inspection_and_profile_state(
        self,
        inspect_staged_media_mock: MagicMock,
        get_profile_by_id_mock: MagicMock,
    ) -> None:
        inspect_staged_media_mock.return_value = self.inspection
        get_profile_by_id_mock.return_value = SimpleNamespace(free_trial_used=False)

        response = calculate_upload_price(
            UploadCalculatePriceRequest(
                filename="episode.mp4",
                filesize_bytes=100,
                mime_type="video/mp4",
                storage_path=str(Path("tmp") / "episode.mp4"),
            ),
            self.user,
        )

        self.assertEqual(response.status, "free_ready")
        self.assertEqual(response.price, 0.0)
        self.assertEqual(response.duration_seconds, 1800.0)

    def test_prepare_upload_creates_guarded_record(self) -> None:
        service_supabase_mock = MagicMock()
        execute_mock = MagicMock(return_value=SimpleNamespace(data=[{"id": "podcast-123"}]))
        insert_mock = MagicMock(return_value=SimpleNamespace(execute=execute_mock))
        table_mock = MagicMock(return_value=SimpleNamespace(insert=insert_mock))
        service_supabase_mock.table = table_mock

        with patch.object(upload_service_module, "inspect_staged_media", return_value=self.inspection):
            with patch.object(
                upload_service_module,
                "get_profile_by_id",
                return_value=SimpleNamespace(free_trial_used=False),
            ):
                with patch.object(upload_service_module, "_compute_file_hash", return_value="hash-123"):
                    with patch.object(upload_service_module, "service_supabase", service_supabase_mock):
                        with patch.object(upload_service_module, "record_free_trial_usage") as record_free_trial_usage_mock:
                            response = prepare_upload(
                                UploadPrepareRequest(
                                    title="Episode 1",
                                    filename="episode.mp4",
                                    filesize_bytes=100,
                                    storage_path="tmp/episode.mp4",
                                    mime_type="video/mp4",
                                    duration_seconds=1800.0,
                                    price=0.0,
                                    status="free_ready",
                                ),
                                self.user,
                            )

        self.assertEqual(response.podcast_id, "podcast-123")
        self.assertEqual(response.status, "ready_for_processing")
        self.assertTrue(response.storage_ready)
        self.assertFalse(response.checkout_required)
        self.assertIsNotNone(response.export_settings)
        self.assertEqual(response.export_settings.audio_enhancement.status, "enabled")
        insert_payload = insert_mock.call_args.args[0]
        self.assertEqual(insert_payload["audio_enhancement"]["status"], "enabled")
        record_free_trial_usage_mock.assert_called_once_with("user-123", 1800.0)

    def test_prepare_upload_persists_export_settings(self) -> None:
        service_supabase_mock = MagicMock()
        execute_mock = MagicMock(return_value=SimpleNamespace(data=[{"id": "podcast-portrait"}]))
        insert_mock = MagicMock(return_value=SimpleNamespace(execute=execute_mock))
        table_mock = MagicMock(return_value=SimpleNamespace(insert=insert_mock))
        service_supabase_mock.table = table_mock

        with patch.object(upload_service_module, "inspect_staged_media", return_value=self.inspection):
            with patch.object(
                upload_service_module,
                "get_profile_by_id",
                return_value=SimpleNamespace(free_trial_used=False),
            ):
                with patch.object(upload_service_module, "_compute_file_hash", return_value="hash-456"):
                    with patch.object(upload_service_module, "service_supabase", service_supabase_mock):
                        with patch.object(upload_service_module, "record_free_trial_usage"):
                            response = prepare_upload(
                                UploadPrepareRequest(
                                    title="Portrait Episode",
                                    filename="portrait.mp4",
                                    filesize_bytes=100,
                                    storage_path="tmp/portrait.mp4",
                                    mime_type="video/mp4",
                                    duration_seconds=1800.0,
                                    price=0.0,
                                    status="free_ready",
                                    export_settings={
                                        "export_mode": "portrait",
                                        "mobile_optimized": True,
                                        "subtitle_style": {
                                            "preset": "boxed",
                                            "background_opacity": 0.5,
                                        },
                                        "audio_enhancement": {
                                            "enabled": True,
                                            "target_lufs": -14.0,
                                            "true_peak_db": -1.0,
                                        },
                                    },
                                ),
                                self.user,
                            )

        insert_payload = insert_mock.call_args.args[0]
        self.assertEqual(insert_payload["export_mode"], "portrait")
        self.assertEqual(insert_payload["crop_mode"], "center_crop")
        self.assertTrue(insert_payload["mobile_optimized"])
        self.assertFalse(insert_payload["face_tracking_enabled"])
        self.assertEqual(insert_payload["subtitle_style"]["preset"], "boxed")
        self.assertTrue(insert_payload["audio_enhancement"]["enabled"])
        self.assertEqual(insert_payload["audio_enhancement"]["target_lufs"], -14.0)
        self.assertEqual(insert_payload["audio_enhancement"]["status"], "enabled")
        self.assertEqual(response.export_settings.export_mode, "portrait")
        self.assertEqual(response.export_settings.crop_mode, "center_crop")
        self.assertEqual(response.export_settings.subtitle_style.preset, "boxed")
        self.assertEqual(response.export_settings.audio_enhancement.true_peak_db, -1.0)

    def test_prepare_upload_rejects_duplicate_file_uploads(self) -> None:
        with patch.object(upload_service_module, "inspect_staged_media", return_value=self.inspection):
            with patch.object(
                upload_service_module,
                "get_profile_by_id",
                return_value=SimpleNamespace(free_trial_used=False),
            ):
                with patch.object(upload_service_module, "_compute_file_hash", return_value="hash-123"):
                    with patch.object(
                        upload_service_module,
                        "find_existing_file_upload",
                        return_value={"id": "podcast-existing", "title": "Existing Episode"},
                    ):
                        with self.assertRaises(UploadWorkflowError) as error:
                            prepare_upload(
                                UploadPrepareRequest(
                                    title="Episode 1",
                                    filename="episode.mp4",
                                    filesize_bytes=100,
                                    storage_path="tmp/episode.mp4",
                                    mime_type="video/mp4",
                                    duration_seconds=1800.0,
                                    price=0.0,
                                    status="free_ready",
                                ),
                                self.user,
                            )

        self.assertEqual(error.exception.status_code, 409)
        self.assertEqual(error.exception.code, "upload_already_exists")

    def test_parse_youtube_source_accepts_single_video_links(self) -> None:
        watch_source = parse_youtube_source("https://www.youtube.com/watch?v=abcDEF123_4")
        short_source = parse_youtube_source("https://youtu.be/abcDEF123_4")

        self.assertEqual(watch_source.video_id, "abcDEF123_4")
        self.assertEqual(watch_source.normalized_url, "https://www.youtube.com/watch?v=abcDEF123_4")
        self.assertEqual(short_source.normalized_url, watch_source.normalized_url)

    def test_parse_youtube_source_rejects_playlist_and_non_youtube_hosts(self) -> None:
        with self.assertRaises(UploadWorkflowError) as playlist_error:
            parse_youtube_source("https://www.youtube.com/watch?v=abcDEF123_4&list=PL123")

        with self.assertRaises(UploadWorkflowError) as host_error:
            parse_youtube_source("https://example.com/watch?v=abcDEF123_4")

        self.assertEqual(playlist_error.exception.code, "playlist_not_supported")
        self.assertEqual(host_error.exception.code, "unsupported_youtube_source")

    def test_parse_youtube_source_rejects_invalid_video_ids(self) -> None:
        with self.assertRaises(UploadWorkflowError) as error:
            parse_youtube_source("https://www.youtube.com/watch?v=not-valid")

        self.assertEqual(error.exception.code, "invalid_youtube_video_id")
        self.assertEqual(error.exception.status_code, 400)

    def test_import_youtube_podcast_creates_ready_processing_record(self) -> None:
        download_result = YouTubeDownloadResult(
            title="Imported Founder Interview",
            storage_path=".generated/youtube-imports/user-123/abcDEF123_4.mp4",
            duration_seconds=182.4,
            filename="abcDEF123_4.mp4",
            filesize_bytes=2048,
            mime_type="video/mp4",
            detected_format="mp4",
            metadata={
                "channel": "Insight Lab",
                "normalized_url": "https://www.youtube.com/watch?v=abcDEF123_4",
            },
        )

        with patch.object(upload_service_module, "_download_youtube_media", return_value=download_result):
            with patch.object(upload_service_module, "create_imported_podcast_record", return_value="pod-youtube") as create_mock:
                with patch.object(upload_service_module, "record_free_trial_usage") as record_free_trial_usage_mock:
                    response = import_youtube_podcast(
                        YouTubeImportRequest(
                            url="https://www.youtube.com/watch?v=abcDEF123_4",
                            title="Custom Import Title",
                        ),
                        self.user,
                    )

        self.assertEqual(response.podcast_id, "pod-youtube")
        self.assertEqual(response.status, "ready_for_processing")
        self.assertEqual(response.source_type, "youtube")
        self.assertEqual(response.video_id, "abcDEF123_4")
        self.assertEqual(response.title, "Custom Import Title")
        insert_payload = create_mock.call_args.args[0]
        self.assertEqual(insert_payload["source_type"], "youtube")
        self.assertEqual(insert_payload["source_url"], "https://www.youtube.com/watch?v=abcDEF123_4")
        self.assertEqual(insert_payload["external_source_id"], "abcDEF123_4")
        self.assertEqual(insert_payload["storage_path"], download_result.storage_path)
        self.assertEqual(insert_payload["status"], "ready_for_processing")
        self.assertEqual(insert_payload["payment_status"], "not_required")
        self.assertEqual(insert_payload["import_metadata"]["channel"], "Insight Lab")
        record_free_trial_usage_mock.assert_called_once_with("user-123", 182.4)

    def test_import_youtube_podcast_rejects_existing_video(self) -> None:
        with patch.object(upload_service_module, "_get_existing_youtube_import", return_value={"id": "pod-1", "title": "Existing Video"}):
            with self.assertRaises(UploadWorkflowError) as error:
                import_youtube_podcast(
                    YouTubeImportRequest(url="https://www.youtube.com/watch?v=abcDEF123_4"),
                    self.user,
                )

        self.assertEqual(error.exception.status_code, 409)
        self.assertEqual(error.exception.code, "youtube_already_imported")

    def test_file_upload_free_usage_blocks_later_youtube_free_import(self) -> None:
        download_result = YouTubeDownloadResult(
            title="Later YouTube Episode",
            storage_path=".generated/youtube-imports/user-123/abcDEF123_4.mp4",
            duration_seconds=600.0,
            filename="abcDEF123_4.mp4",
            filesize_bytes=2048,
            mime_type="video/mp4",
            detected_format="mp4",
            metadata={"normalized_url": "https://www.youtube.com/watch?v=abcDEF123_4"},
        )
        service_supabase_mock = MagicMock()
        execute_mock = MagicMock(return_value=SimpleNamespace(data=[{"id": "podcast-upload"}]))
        insert_mock = MagicMock(return_value=SimpleNamespace(execute=execute_mock))
        service_supabase_mock.table.return_value = SimpleNamespace(insert=insert_mock)

        with (
            patch.object(upload_service_module, "service_supabase", service_supabase_mock),
            patch.object(upload_service_module, "_get_latest_free_trial_state", return_value=False),
            patch.object(upload_service_module, "_get_free_trial_remaining_for_user", side_effect=[1800.0, 0.0]),
            patch.object(upload_service_module, "record_free_trial_usage") as record_free_trial_usage_mock,
            patch.object(upload_service_module, "_get_existing_youtube_import", return_value=None),
            patch.object(upload_service_module, "_download_youtube_media", return_value=download_result),
            patch.object(upload_service_module, "_persist_youtube_source_media", return_value=download_result),
            patch.object(upload_service_module, "create_imported_podcast_record", return_value="pod-youtube") as create_mock,
        ):
            upload_response = prepare_upload(
                UploadPrepareRequest(
                    title="Free Upload",
                    filename="episode.mp4",
                    duration_seconds=1800.0,
                    price=0.0,
                    status="free_ready",
                ),
                self.user,
            )
            youtube_response = import_youtube_podcast(
                YouTubeImportRequest(url="https://www.youtube.com/watch?v=abcDEF123_4"),
                self.user,
            )

        self.assertEqual(upload_response.status, "ready_for_processing")
        self.assertEqual(youtube_response.status, "awaiting_payment")
        self.assertTrue(youtube_response.checkout_required)
        self.assertEqual(youtube_response.payment_status, "pending")
        self.assertEqual(youtube_response.price, 1.0)
        record_free_trial_usage_mock.assert_called_once_with("user-123", 1800.0)
        self.assertEqual(create_mock.call_args.args[0]["payment_status"], "pending")

    def test_youtube_free_usage_blocks_later_file_upload_free_prepare(self) -> None:
        download_result = YouTubeDownloadResult(
            title="Free YouTube Episode",
            storage_path=".generated/youtube-imports/user-123/abcDEF123_4.mp4",
            duration_seconds=1800.0,
            filename="abcDEF123_4.mp4",
            filesize_bytes=2048,
            mime_type="video/mp4",
            detected_format="mp4",
            metadata={"normalized_url": "https://www.youtube.com/watch?v=abcDEF123_4"},
        )
        service_supabase_mock = MagicMock()
        execute_mock = MagicMock(return_value=SimpleNamespace(data=[{"id": "podcast-upload"}]))
        insert_mock = MagicMock(return_value=SimpleNamespace(execute=execute_mock))
        service_supabase_mock.table.return_value = SimpleNamespace(insert=insert_mock)

        with (
            patch.object(upload_service_module, "service_supabase", service_supabase_mock),
            patch.object(upload_service_module, "_get_latest_free_trial_state", return_value=False),
            patch.object(upload_service_module, "_get_free_trial_remaining_for_user", side_effect=[1800.0, 0.0]),
            patch.object(upload_service_module, "record_free_trial_usage") as record_free_trial_usage_mock,
            patch.object(upload_service_module, "_get_existing_youtube_import", return_value=None),
            patch.object(upload_service_module, "_download_youtube_media", return_value=download_result),
            patch.object(upload_service_module, "_persist_youtube_source_media", return_value=download_result),
            patch.object(upload_service_module, "create_imported_podcast_record", return_value="pod-youtube"),
        ):
            youtube_response = import_youtube_podcast(
                YouTubeImportRequest(url="https://www.youtube.com/watch?v=abcDEF123_4"),
                self.user,
            )
            upload_response = prepare_upload(
                UploadPrepareRequest(
                    title="Paid Upload After Free YouTube",
                    filename="episode.mp4",
                    duration_seconds=600.0,
                    price=1.0,
                    status="awaiting_payment",
                ),
                self.user,
            )

        self.assertEqual(youtube_response.status, "ready_for_processing")
        self.assertEqual(upload_response.status, "awaiting_payment")
        self.assertTrue(upload_response.checkout_required)
        self.assertEqual(upload_response.payment_status, "pending")
        self.assertEqual(upload_response.price, 1.0)
        record_free_trial_usage_mock.assert_called_once_with("user-123", 1800.0)

    def test_import_youtube_podcast_surfaces_download_failure(self) -> None:
        with patch.object(
            upload_service_module,
            "_download_youtube_media",
            side_effect=UploadWorkflowError("failed", status_code=502, code="youtube_import_failed"),
        ):
            with self.assertRaises(UploadWorkflowError) as error:
                import_youtube_podcast(
                    YouTubeImportRequest(url="https://www.youtube.com/watch?v=abcDEF123_4"),
                    self.user,
                )

        self.assertEqual(error.exception.status_code, 502)
        self.assertEqual(error.exception.code, "youtube_import_failed")

    def test_get_youtube_import_dir_uses_configured_persistent_storage(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as tmp_dir:
            with patch.object(upload_service_module, "get_settings") as settings_mock:
                settings_mock.return_value.upload_storage_dir = tmp_dir

                result = upload_service_module.get_youtube_import_dir()

        self.assertEqual(result, Path(tmp_dir) / "youtube-imports")


if __name__ == "__main__":
    unittest.main()
