from __future__ import annotations

import sys
import unittest
from pathlib import Path

from pydantic import ValidationError

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.models.export_settings import AudioEnhancementSettings, ExportSettings, ExportSettingsInput, SubtitleStyle  # noqa: E402


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

    def test_subtitle_style_accepts_valid_manual_settings(self) -> None:
        settings = ExportSettingsInput(
            subtitle_style={
                "preset": "boxed",
                "font_family": "Inter",
                "font_size": 28,
                "primary_color": "#f8fafc",
                "outline_color": "#111827",
                "background_color": "#000000",
                "background_opacity": 0.6,
                "position": "top",
                "bold": True,
            }
        ).resolve()

        self.assertEqual(settings.subtitle_style.primary_color, "#F8FAFC")
        self.assertEqual(settings.subtitle_style.position, "top")
        self.assertTrue(settings.subtitle_style.bold)

    def test_subtitle_style_rejects_invalid_color(self) -> None:
        with self.assertRaises(ValidationError) as exc_info:
            SubtitleStyle(primary_color="white")

        self.assertIn("#RRGGBB", str(exc_info.exception))

    def test_subtitle_style_rejects_invalid_size(self) -> None:
        with self.assertRaises(ValidationError):
            SubtitleStyle(font_size=100)

    def test_subtitle_style_supports_named_presets(self) -> None:
        style = SubtitleStyle.for_preset("bold")

        self.assertEqual(style.preset, "bold")
        self.assertTrue(style.bold)

    def test_subtitle_style_preset_applies_defaults_with_manual_overrides(self) -> None:
        style = SubtitleStyle(preset="bold", font_size=30)

        self.assertEqual(style.font_size, 30)
        self.assertTrue(style.bold)
        self.assertEqual(style.background_opacity, 0.25)

    def test_audio_enhancement_defaults_to_enabled_status(self) -> None:
        settings = ExportSettingsInput().resolve()

        self.assertTrue(settings.audio_enhancement.enabled)
        self.assertTrue(settings.audio_enhancement.normalize_loudness)
        self.assertEqual(settings.audio_enhancement.target_lufs, -16.0)
        self.assertEqual(settings.audio_enhancement.status, "enabled")

    def test_audio_enhancement_can_be_disabled_cleanly(self) -> None:
        settings = ExportSettingsInput(audio_enhancement={"enabled": False}).resolve()

        self.assertFalse(settings.audio_enhancement.enabled)
        self.assertFalse(settings.audio_enhancement.normalize_loudness)
        self.assertEqual(settings.audio_enhancement.status, "disabled")

    def test_audio_enhancement_failed_status_is_preserved_for_runtime_fallback(self) -> None:
        settings = AudioEnhancementSettings(status="failed")

        self.assertTrue(settings.enabled)
        self.assertFalse(settings.normalize_loudness)
        self.assertEqual(settings.status, "failed")

    def test_audio_enhancement_rejects_unsafe_loudness_target(self) -> None:
        with self.assertRaises(ValidationError):
            AudioEnhancementSettings(target_lufs=-40.0)


if __name__ == "__main__":
    unittest.main()
