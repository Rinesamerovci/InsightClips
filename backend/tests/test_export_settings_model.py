from __future__ import annotations

import sys
import unittest
from pathlib import Path

from pydantic import ValidationError

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.models.export_settings import ExportSettings, ExportSettingsInput  # noqa: E402


class ExportSettingsModelTests(unittest.TestCase):
    def test_portrait_input_defaults_to_center_crop(self) -> None:
        resolved = ExportSettingsInput(export_mode="portrait").resolve()

        self.assertEqual(resolved.export_mode, "portrait")
        self.assertEqual(resolved.crop_mode, "center_crop")

    def test_landscape_rejects_crop_modes(self) -> None:
        with self.assertRaises(ValidationError) as exc_info:
            ExportSettingsInput(export_mode="landscape", crop_mode="center_crop")

        self.assertIn("Landscape exports only support", str(exc_info.exception))

    def test_face_tracking_requires_smart_crop(self) -> None:
        with self.assertRaises(ValidationError) as exc_info:
            ExportSettings(export_mode="portrait", crop_mode="center_crop", face_tracking_enabled=True)

        self.assertIn("Face tracking requires", str(exc_info.exception))


if __name__ == "__main__":
    unittest.main()
