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
from app.models.upload import UploadCalculatePriceRequest, UploadPrepareRequest  # noqa: E402
import app.services.upload_service as upload_service_module  # noqa: E402
from app.services.upload_service import (  # noqa: E402
    calculate_upload_price,
    determine_upload_price,
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
                with patch.object(upload_service_module, "service_supabase", service_supabase_mock):
                    with patch.object(upload_service_module, "mark_free_trial_used") as mark_free_trial_used_mock:
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
        self.assertEqual(response.status, "free_ready")
        self.assertTrue(response.storage_ready)
        self.assertFalse(response.checkout_required)
        mark_free_trial_used_mock.assert_called_once_with("user-123")


if __name__ == "__main__":
    unittest.main()
