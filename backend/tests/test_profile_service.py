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
from app.services.profile_service import update_profile  # noqa: E402


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


if __name__ == "__main__":
    unittest.main()
