from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.dependencies.auth import AuthenticatedUser  # noqa: E402
from app.models.account import DeleteAccountRequest  # noqa: E402
from app.models.profile import UserMessageRequest, UserMessageResponse  # noqa: E402
from app.routers.users import (  # noqa: E402
    delete_current_account,
    submit_contact_message,
    submit_feedback,
    submit_support_request,
)


class UsersRouterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.user = AuthenticatedUser(
            id="user-123",
            email="rinesa@example.com",
            free_trial_used=False,
        )
        self.profile = SimpleNamespace(id="user-123", email="rinesa@example.com")

    @patch("app.routers.users.submit_user_message")
    @patch("app.routers.users.get_profile_by_id")
    def test_submit_feedback_forces_feedback_message_type(self, get_profile_mock, submit_mock) -> None:
        get_profile_mock.return_value = self.profile
        submit_mock.return_value = UserMessageResponse(
            id="message-1",
            user_id="user-123",
            message_type="feedback",
            category="feature_request",
            message="Please add clearer planning suggestions.",
            status="received",
        )

        result = asyncio.run(
            submit_feedback(
                UserMessageRequest(
                    message_type="support",
                    category="feature_request",
                    message="Please add clearer planning suggestions.",
                ),
                self.user,
            )
        )

        self.assertEqual(result.message_type, "feedback")
        submitted_payload = submit_mock.call_args.args[1]
        self.assertEqual(submitted_payload.message_type, "feedback")
        self.assertEqual(submitted_payload.contact_email, "rinesa@example.com")
        get_profile_mock.assert_called_once_with("user-123")

    @patch("app.routers.users.submit_user_message")
    @patch("app.routers.users.get_profile_by_id")
    def test_submit_support_forces_support_message_type(self, get_profile_mock, submit_mock) -> None:
        get_profile_mock.return_value = self.profile
        submit_mock.return_value = UserMessageResponse(
            id="message-2",
            user_id="user-123",
            message_type="support",
            category="technical_support",
            message="The YouTube import needs help.",
            status="received",
        )

        result = asyncio.run(
            submit_support_request(
                UserMessageRequest(
                    message_type="feedback",
                    category="technical_support",
                    message="The YouTube import needs help.",
                ),
                self.user,
            )
        )

        self.assertEqual(result.message_type, "support")
        submitted_payload = submit_mock.call_args.args[1]
        self.assertEqual(submitted_payload.message_type, "support")
        self.assertEqual(submitted_payload.contact_email, "rinesa@example.com")

    @patch("app.routers.users.submit_user_message")
    @patch("app.routers.users.get_profile_by_id")
    def test_submit_contact_forces_contact_message_type(self, get_profile_mock, submit_mock) -> None:
        get_profile_mock.return_value = self.profile
        submit_mock.return_value = UserMessageResponse(
            id="message-3",
            user_id="user-123",
            message_type="contact",
            category="general",
            message="I want to contact the project team.",
            contact_email="creator@example.com",
            status="received",
        )

        result = asyncio.run(
            submit_contact_message(
                UserMessageRequest(
                    message_type="feedback",
                    category="general",
                    message="I want to contact the project team.",
                    contact_email="creator@example.com",
                ),
                self.user,
            )
        )

        self.assertEqual(result.message_type, "contact")
        submitted_payload = submit_mock.call_args.args[1]
        self.assertEqual(submitted_payload.message_type, "contact")
        self.assertEqual(submitted_payload.contact_email, "rinesa@example.com")

    @patch("app.routers.users.submit_user_message")
    @patch("app.routers.users.get_profile_by_id", return_value=None)
    def test_message_routes_reject_missing_profile(self, get_profile_mock, submit_mock) -> None:
        with self.assertRaises(HTTPException) as error:
            asyncio.run(
                submit_feedback(
                    UserMessageRequest(message="Please review this feedback."),
                    self.user,
                )
            )

        self.assertEqual(error.exception.status_code, 404)
        self.assertEqual(error.exception.detail, "Profile not found.")
        get_profile_mock.assert_called_once_with("user-123")
        submit_mock.assert_not_called()

    @patch("app.routers.users.delete_account")
    @patch("app.routers.users.get_profile_by_id")
    def test_delete_current_account_requires_matching_email(self, get_profile_mock, delete_mock) -> None:
        get_profile_mock.return_value = self.profile

        with self.assertRaises(HTTPException) as error:
            asyncio.run(
                delete_current_account(
                    DeleteAccountRequest(confirmation_email="other@example.com"),
                    self.user,
                )
            )

        self.assertEqual(error.exception.status_code, 400)
        self.assertIn("Confirmation email", error.exception.detail)
        delete_mock.assert_not_called()

    @patch("app.routers.users.delete_account")
    @patch("app.routers.users.get_profile_by_id")
    def test_delete_current_account_uses_authenticated_user(self, get_profile_mock, delete_mock) -> None:
        get_profile_mock.return_value = self.profile
        delete_mock.return_value = SimpleNamespace(
            user_id="user-123",
            podcasts_deleted=2,
            source_objects_removed=3,
            clip_objects_removed=4,
            auth_user_deleted=True,
            email_notification_sent=True,
        )

        result = asyncio.run(
            delete_current_account(
                DeleteAccountRequest(confirmation_email="rinesa@example.com"),
                self.user,
            )
        )

        self.assertTrue(result.deleted)
        self.assertEqual(result.podcasts_deleted, 2)
        self.assertEqual(result.source_objects_removed, 3)
        self.assertEqual(result.clip_objects_removed, 4)
        self.assertTrue(result.email_notification_sent)
        get_profile_mock.assert_called_once_with("user-123")
        delete_mock.assert_called_once_with("user-123", email="rinesa@example.com")


if __name__ == "__main__":
    unittest.main()
