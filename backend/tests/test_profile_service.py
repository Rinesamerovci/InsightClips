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
    mark_free_trial_used,
    submit_user_message,
    update_profile,
    update_user_export_settings,
    upsert_profile,
)  # noqa: E402


class ProfileServiceTests(unittest.TestCase):
    def test_upsert_profile_keeps_free_trial_used_when_email_has_prior_usage(self) -> None:
        service_supabase_mock = MagicMock()
        execute_mock = MagicMock(
            return_value=SimpleNamespace(
                data=[
                    {
                        "id": "user-new",
                        "email": "creator@example.com",
                        "free_trial_used": True,
                        "full_name": "Creator",
                        "profile_picture_url": None,
                        "export_settings": {},
                        "created_at": None,
                        "updated_at": None,
                    }
                ]
            )
        )
        upsert_mock = MagicMock(return_value=SimpleNamespace(execute=execute_mock))
        service_supabase_mock.table = MagicMock(return_value=SimpleNamespace(upsert=upsert_mock))

        with (
            patch.object(profile_service_module, "service_supabase", service_supabase_mock),
            patch.object(profile_service_module, "has_email_used_free_trial", return_value=True),
        ):
            profile = upsert_profile("user-new", "Creator@Example.com", "Creator")

        self.assertTrue(profile.free_trial_used)
        upsert_payload = upsert_mock.call_args.args[0]
        self.assertEqual(upsert_payload["email"], "creator@example.com")
        self.assertTrue(upsert_payload["free_trial_used"])

    def test_mark_free_trial_used_records_email_ledger(self) -> None:
        profile = SimpleNamespace(id="user-123", email="creator@example.com")
        free_trial_table = MagicMock()
        upsert_execute = MagicMock()
        free_trial_table.upsert.return_value = SimpleNamespace(execute=upsert_execute)
        profiles_table = MagicMock()
        update_eq_execute = MagicMock()
        profiles_table.update.return_value = SimpleNamespace(
            eq=MagicMock(return_value=SimpleNamespace(execute=update_eq_execute))
        )
        service_supabase_mock = MagicMock()
        service_supabase_mock.table.side_effect = (
            lambda name: free_trial_table if name == "free_trial_usage" else profiles_table
        )

        with (
            patch.object(profile_service_module, "service_supabase", service_supabase_mock),
            patch.object(profile_service_module, "get_profile_by_id", return_value=profile),
            patch.object(profile_service_module, "get_free_trial_used_seconds", return_value=0.0),
        ):
            mark_free_trial_used("user-123")

        free_trial_table.upsert.assert_called_once()
        self.assertEqual(free_trial_table.upsert.call_args.args[0]["email"], "creator@example.com")
        self.assertEqual(free_trial_table.upsert.call_args.args[0]["used_seconds"], 1800)
        profiles_table.update.assert_called_once_with({"free_trial_used": True})

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

        with (
            patch.object(profile_service_module, "service_supabase", service_supabase_mock),
            patch.object(
                profile_service_module,
                "get_settings",
                return_value=SimpleNamespace(
                    support_inbox_email="",
                    smtp_host="",
                    smtp_username="",
                    smtp_from_email="",
                ),
            ),
        ):
            response = submit_user_message("user-123", payload)

        self.assertEqual(response.id, "message-1")
        self.assertEqual(response.category, "feature_request")
        self.assertEqual(response.subject, "Calendar")
        self.assertFalse(response.email_notification_sent)
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

        with (
            patch.object(profile_service_module, "service_supabase", service_supabase_mock),
            patch.object(
                profile_service_module,
                "get_settings",
                return_value=SimpleNamespace(
                    support_inbox_email="",
                    smtp_host="",
                    smtp_username="",
                    smtp_from_email="",
                ),
            ),
        ):
            response = submit_user_message("user-123", payload)

        self.assertEqual(response.message_type, "contact")
        self.assertEqual(response.contact_email, "creator@example.com")
        self.assertFalse(response.email_notification_sent)
        self.assertEqual(insert_mock.call_args.args[0]["message_type"], "contact")

    def test_submit_user_message_sends_support_notification_when_smtp_is_configured(self) -> None:
        service_supabase_mock = MagicMock()
        execute_mock = MagicMock(
            return_value=SimpleNamespace(
                data=[
                    {
                        "id": "message-3",
                        "user_id": "user-123",
                        "message_type": "support",
                        "category": "technical_support",
                        "subject": "Upload issue",
                        "message": "The upload flow needs help.",
                        "contact_email": "creator@example.com",
                        "status": "received",
                        "created_at": None,
                    }
                ]
            )
        )
        insert_mock = MagicMock(return_value=SimpleNamespace(execute=execute_mock))
        service_supabase_mock.table = MagicMock(return_value=SimpleNamespace(insert=insert_mock))
        settings = SimpleNamespace(
            support_inbox_email="team@insightclips.dev",
            smtp_host="smtp.resend.com",
            smtp_port=587,
            smtp_username="resend",
            smtp_password="secret",
            resend_api_key="secret-resend-key",
            smtp_from_email="noreply@insightclips.dev",
            smtp_from_name="InsightClips",
            smtp_use_tls=True,
        )

        payload = UserMessageRequest(
            message_type="support",
            category="technical_support",
            subject="Upload issue",
            message="The upload flow needs help.",
            contact_email="creator@example.com",
        )

        mock_response = MagicMock()
        mock_response.status_code = 200

        with (
            patch.object(profile_service_module, "service_supabase", service_supabase_mock),
            patch.object(profile_service_module, "get_settings", return_value=settings),
            patch("httpx.post", return_value=mock_response) as mock_post,
        ):
            response = submit_user_message("user-123", payload)

        self.assertEqual(response.id, "message-3")
        self.assertTrue(response.email_notification_sent)
        mock_post.assert_called_once()
        call_kwargs = mock_post.call_args.kwargs
        self.assertEqual(call_kwargs["headers"]["Authorization"], "Bearer secret-resend-key")
        self.assertEqual(call_kwargs["json"]["to"], ["team@insightclips.dev"])

    def test_submit_user_message_falls_back_to_onboarding_resend_dev(self) -> None:
        service_supabase_mock = MagicMock()
        execute_mock = MagicMock(
            return_value=SimpleNamespace(
                data=[
                    {
                        "id": "message-4",
                        "user_id": "user-123",
                        "message_type": "support",
                        "category": "technical_support",
                        "subject": "Fallback Test",
                        "message": "Fallback flow should be tested.",
                        "contact_email": "creator@example.com",
                        "status": "received",
                        "created_at": None,
                    }
                ]
            )
        )
        insert_mock = MagicMock(return_value=SimpleNamespace(execute=execute_mock))
        service_supabase_mock.table = MagicMock(return_value=SimpleNamespace(insert=insert_mock))

        settings = SimpleNamespace(
            support_inbox_email="team@insightclips.dev",
            smtp_host="smtp.resend.com",
            smtp_port=587,
            smtp_username="resend",
            smtp_password="secret",
            resend_api_key="secret-resend-key",
            smtp_from_email="noreply@unverified-domain.dev",
            smtp_from_name="InsightClips",
            smtp_use_tls=True,
        )

        payload = UserMessageRequest(
            message_type="support",
            category="technical_support",
            subject="Fallback Test",
            message="Fallback flow should be tested.",
            contact_email="creator@example.com",
        )

        mock_response_fail = MagicMock()
        mock_response_fail.status_code = 400
        mock_response_success = MagicMock()
        mock_response_success.status_code = 200

        with (
            patch.object(profile_service_module, "service_supabase", service_supabase_mock),
            patch.object(profile_service_module, "get_settings", return_value=settings),
            patch("httpx.post", side_effect=[mock_response_fail, mock_response_success]) as mock_post,
        ):
            response = submit_user_message("user-123", payload)

        self.assertEqual(response.id, "message-4")
        self.assertTrue(response.email_notification_sent)
        self.assertEqual(mock_post.call_count, 2)
        
        first_call_json = mock_post.call_args_list[0].kwargs["json"]
        self.assertEqual(first_call_json["from"], "InsightClips <noreply@unverified-domain.dev>")

        second_call_json = mock_post.call_args_list[1].kwargs["json"]
        self.assertEqual(second_call_json["from"], "InsightClips <onboarding@resend.dev>")

    def test_user_message_request_rejects_short_messages(self) -> None:
        with self.assertRaises(ValueError):
            UserMessageRequest(message="short")


if __name__ == "__main__":
    unittest.main()
