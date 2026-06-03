from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import app.services.profile_service as profile_service_module  # noqa: E402
from app.models.export_settings import ExportSettingsInput  # noqa: E402
from app.models.profile import UserMessageRequest  # noqa: E402
from app.services.profile_service import (
    get_profile_by_id,
    submit_user_message,
    update_profile,
    update_user_export_settings,
)  # noqa: E402


class ProfileServiceTests(unittest.TestCase):
    def test_update_profile_normalizes_blank_fields(self) -> None:
        service_supabase_mock = MagicMock()
        execute_mock = MagicMock(
            return_value=SimpleNamespace(
                data=[
                    {
                        "id": "user-123",
                        "email": "creator@example.com",
                        "free_trial_used": False,
                        "full_name": None,
                        "profile_picture_url": None,
                        "export_settings": {},
                        "created_at": None,
                        "updated_at": None,
                    }
                ]
            )
        )
        eq_mock = MagicMock(return_value=SimpleNamespace(execute=execute_mock))
        update_mock = MagicMock(return_value=SimpleNamespace(eq=eq_mock))
        table_mock = MagicMock(return_value=SimpleNamespace(update=update_mock))
        service_supabase_mock.table = table_mock

        with patch.object(profile_service_module, "service_supabase", service_supabase_mock):
            response = update_profile(
                "user-123",
                full_name="   ",
                profile_picture_url="   ",
            )

        self.assertIsNotNone(response)
        update_mock.assert_called_once_with(
            {
                "full_name": None,
                "profile_picture_url": None,
            }
        )
        eq_mock.assert_called_once_with("id", "user-123")

    def test_update_profile_only_persists_requested_patch_fields(self) -> None:
        service_supabase_mock = MagicMock()
        execute_mock = MagicMock(
            return_value=SimpleNamespace(
                data=[
                    {
                        "id": "user-123",
                        "email": "creator@example.com",
                        "free_trial_used": False,
                        "full_name": "Rinesa",
                        "profile_picture_url": "https://example.com/avatar.png",
                        "export_settings": {},
                        "created_at": None,
                        "updated_at": None,
                    }
                ]
            )
        )
        eq_mock = MagicMock(return_value=SimpleNamespace(execute=execute_mock))
        update_mock = MagicMock(return_value=SimpleNamespace(eq=eq_mock))
        table_mock = MagicMock(return_value=SimpleNamespace(update=update_mock))
        service_supabase_mock.table = table_mock

        with patch.object(profile_service_module, "service_supabase", service_supabase_mock):
            update_profile("user-123", full_name=" Rinesa  Bislimi ", fields_to_update={"full_name"})

        update_mock.assert_called_once_with({"full_name": "Rinesa Bislimi"})

    def test_update_user_export_settings_persists_resolved_settings(self) -> None:
        service_supabase_mock = MagicMock()
        execute_mock = MagicMock(
            return_value=SimpleNamespace(
                data=[
                    {
                        "id": "user-123",
                        "email": "creator@example.com",
                        "free_trial_used": False,
                        "full_name": None,
                        "profile_picture_url": None,
                        "export_settings": {
                            "export_mode": "portrait",
                            "crop_mode": "center_crop",
                            "mobile_optimized": True,
                            "face_tracking_enabled": False,
                            "subtitle_style": {
                                "preset": "classic",
                                "font_family": "Arial",
                                "font_size": 18,
                                "primary_color": "#FFFFFF",
                                "outline_color": "#000000",
                                "background_color": "#000000",
                                "background_opacity": 0.2,
                                "position": "bottom",
                                "bold": False,
                                "italic": False,
                            },
                            "audio_enhancement": {
                                "enabled": True,
                                "normalize_loudness": True,
                                "target_lufs": -16.0,
                                "true_peak_db": -1.5,
                                "status": "enabled",
                            },
                        },
                        "created_at": None,
                        "updated_at": None,
                    }
                ]
            )
        )
        eq_mock = MagicMock(return_value=SimpleNamespace(execute=execute_mock))
        update_mock = MagicMock(return_value=SimpleNamespace(eq=eq_mock))
        table_mock = MagicMock(return_value=SimpleNamespace(update=update_mock))
        service_supabase_mock.table = table_mock

        with patch.object(profile_service_module, "service_supabase", service_supabase_mock):
            response = update_user_export_settings(
                "user-123",
                ExportSettingsInput(export_mode="portrait", mobile_optimized=True),
            )

        self.assertEqual(response.user_id, "user-123")
        self.assertEqual(response.export_settings.export_mode, "portrait")
        update_payload = update_mock.call_args.args[0]
        self.assertEqual(update_payload["export_settings"]["crop_mode"], "center_crop")

    def test_get_profile_by_id_repairs_legacy_export_settings(self) -> None:
        service_supabase_mock = MagicMock()
        execute_mock = MagicMock(
            return_value=SimpleNamespace(
                data=[
                    {
                        "id": "user-123",
                        "email": "creator@example.com",
                        "free_trial_used": False,
                        "full_name": None,
                        "profile_picture_url": None,
                        "export_settings": {
                            "preset_name": "youtube_landscape",
                            "export_mode": "portrait",
                            "crop_mode": "smart_crop",
                            "mobile_optimized": True,
                            "face_tracking_enabled": True,
                            "subtitle_style": {},
                            "audio_enhancement": {},
                            "generation_settings": {},
                        },
                        "created_at": None,
                        "updated_at": None,
                    }
                ]
            )
        )
        limit_mock = MagicMock(return_value=SimpleNamespace(execute=execute_mock))
        eq_mock = MagicMock(return_value=SimpleNamespace(limit=limit_mock))
        select_mock = MagicMock(return_value=SimpleNamespace(eq=eq_mock))
        service_supabase_mock.table = MagicMock(return_value=SimpleNamespace(select=select_mock))

        with patch.object(profile_service_module, "service_supabase", service_supabase_mock):
            profile = get_profile_by_id("user-123")

        self.assertIsNotNone(profile)
        self.assertEqual(profile.export_settings.preset_name, "youtube_shorts")
        self.assertEqual(profile.export_settings.export_mode, "portrait")
        self.assertEqual(profile.export_settings.crop_mode, "smart_crop")

    def test_submit_user_message_persists_feedback_request(self) -> None:
        service_supabase_mock = MagicMock()
        execute_mock = MagicMock(
            return_value=SimpleNamespace(
                data=[
                    {
                        "id": "message-1",
                        "user_id": "user-123",
                        "message_type": "feedback",
                        "category": "feature_request",
                        "subject": "Calendar",
                        "message": "Please add a better weekly planning flow.",
                        "contact_email": "creator@example.com",
                        "status": "received",
                        "created_at": None,
                    }
                ]
            )
        )
        insert_mock = MagicMock(return_value=SimpleNamespace(execute=execute_mock))
        table_mock = MagicMock(return_value=SimpleNamespace(insert=insert_mock))
        service_supabase_mock.table = table_mock

        payload = UserMessageRequest(
            message_type="feedback",
            category="feature_request",
            subject="  Calendar  ",
            message=" Please add a better weekly planning flow. ",
            contact_email="creator@example.com",
        )

        with patch.object(profile_service_module, "service_supabase", service_supabase_mock):
            response = submit_user_message("user-123", payload)

        self.assertEqual(response.id, "message-1")
        self.assertEqual(response.category, "feature_request")
        self.assertEqual(response.subject, "Calendar")
        insert_payload = insert_mock.call_args.args[0]
        self.assertEqual(insert_payload["user_id"], "user-123")
        self.assertEqual(insert_payload["message"], "Please add a better weekly planning flow.")
    
    def test_submit_user_message_persists_contact_request(self) -> None:
        service_supabase_mock = MagicMock()
        execute_mock = MagicMock(
            return_value=SimpleNamespace(
                data=[
                    {
                        "id": "message-2",
                        "user_id": "user-123",
                        "message_type": "contact",
                        "category": "general",
                        "subject": "Partnership",
                        "message": "I want to contact the InsightClips team.",
                        "contact_email": "creator@example.com",
                        "status": "received",
                        "created_at": None,
                    }
                ]
            )
        )
        insert_mock = MagicMock(return_value=SimpleNamespace(execute=execute_mock))
        service_supabase_mock.table = MagicMock(return_value=SimpleNamespace(insert=insert_mock))

        payload = UserMessageRequest(
            message_type="contact",
            category="general",
            subject="Partnership",
            message="I want to contact the InsightClips team.",
            contact_email="creator@example.com",
        )

        with patch.object(profile_service_module, "service_supabase", service_supabase_mock):
            response = submit_user_message("user-123", payload)

        self.assertEqual(response.message_type, "contact")
        self.assertEqual(response.contact_email, "creator@example.com")
        self.assertEqual(insert_mock.call_args.args[0]["message_type"], "contact")

    def test_user_message_request_rejects_short_messages(self) -> None:
        with self.assertRaises(ValueError):
            UserMessageRequest(message="short")


if __name__ == "__main__":
    unittest.main()
