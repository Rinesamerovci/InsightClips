from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import app.services.auth_service as auth_service_module  # noqa: E402
from app.services.auth_service import check_password_recovery_eligibility  # noqa: E402


class AuthServiceTests(unittest.TestCase):
    def test_password_recovery_rejects_missing_account(self) -> None:
        service_supabase_mock = MagicMock()
        service_supabase_mock.auth.admin.list_users.return_value = SimpleNamespace(users=[])

        with patch.object(auth_service_module, "service_supabase", service_supabase_mock):
            with patch.object(auth_service_module, "get_profile_by_email", return_value=None):
                with self.assertRaises(HTTPException) as error:
                    check_password_recovery_eligibility("missing@example.com")

        self.assertEqual(error.exception.status_code, 404)

    def test_password_recovery_rejects_unconfirmed_account(self) -> None:
        service_supabase_mock = MagicMock()
        service_supabase_mock.auth.admin.list_users.return_value = SimpleNamespace(
            users=[SimpleNamespace(email="creator@example.com", email_confirmed_at=None, confirmed_at=None)]
        )

        with patch.object(auth_service_module, "service_supabase", service_supabase_mock):
            with patch.object(auth_service_module, "get_profile_by_email", return_value=SimpleNamespace(email="creator@example.com")):
                with self.assertRaises(HTTPException) as error:
                    check_password_recovery_eligibility("creator@example.com")

        self.assertEqual(error.exception.status_code, 409)


if __name__ == "__main__":
    unittest.main()