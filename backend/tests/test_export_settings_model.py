from __future__ import annotations

import sys
import unittest
from pathlib import Path

from pydantic import ValidationError

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.models.clipping import GenerateClipsRequest  # noqa: E402
from app.models.export_settings import (  # noqa: E402
    AudioEnhancementSettings,
    ExportSettings,
    ExportSettingsInput,
    GenerationSettings,
    GenerationSettingsInput,
    SubtitleStyle,
    coerce_persisted_export_settings,
)


class ExportSettingsModelTests(unittest.TestCase):
    def test_portrait_input_defaults_to_center_crop(self) -> None:
        resolved = ExportSettingsInput(export_mode="portrait").resolve()

        self.assertEqual(resolved.export_mode, "portrait")
        self.assertEqual(resolved.crop_mode, "center_crop")
        self.assertEqual(resolved.preset_name, "youtube_shorts")
        self.assertEqual(resolved.subtitle_timing_profile, "balanced")

    def test_landscape_rejects_crop_modes(self) -> None:
        with self.assertRaises(ValidationError) as exc_info:
            ExportSettingsInput(export_mode="landscape", crop_mode="center_crop")

        self.assertIn("Landscape exports only support", str(exc_info.exception))

    def test_face_tracking_requires_smart_crop(self) -> None:
        with self.assertRaises(ValidationError) as exc_info:
            ExportSettings(
                preset_name="youtube_shorts",
                export_mode="portrait",
                crop_mode="center_crop",
                face_tracking_enabled=True,
            )

        self.assertIn("Face tracking requires", str(exc_info.exception))

    def test_vertical_preset_rejects_landscape_mode(self) -> None:
        with self.assertRaises(ValidationError) as exc_info:
            ExportSettingsInput(preset_name="instagram_reels", export_mode="landscape")

        self.assertIn("instagram_reels requires export_mode='portrait'", str(exc_info.exception))

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

    def test_generation_settings_accepts_safe_user_preferences(self) -> None:
        settings = GenerationSettings(
            clip_duration_seconds=45,
            number_of_clips=7,
            topic_focus="AI growth, startup clips",
            subtitles_enabled=False,
        )

        self.assertEqual(settings.clip_duration_seconds, 45)
        self.assertEqual(settings.number_of_clips, 7)
        self.assertEqual(settings.topic_focus, "AI growth, startup clips")
        self.assertFalse(settings.subtitles_enabled)

    def test_generation_settings_rejects_unsafe_values(self) -> None:
        with self.assertRaises(ValidationError) as exc_info:
            GenerationSettings(clip_duration_seconds=3, number_of_clips=30)

        self.assertIn("clip_duration_seconds", str(exc_info.exception))
        self.assertIn("number_of_clips", str(exc_info.exception))

    def test_generation_settings_rejects_unsafe_topic_focus(self) -> None:
        with self.assertRaises(ValidationError) as exc_info:
            GenerationSettings(topic_focus="AI <script>")

        self.assertIn("cannot contain script brackets", str(exc_info.exception))

    def test_export_settings_can_persist_generation_preferences(self) -> None:
        settings = ExportSettingsInput(
            generation_settings={
                "clip_duration_seconds": 60,
                "number_of_clips": 4,
                "subtitles_enabled": False,
            }
        ).resolve()

        self.assertEqual(settings.generation_settings.clip_duration_seconds, 60)
        self.assertEqual(settings.generation_settings.number_of_clips, 4)
        self.assertFalse(settings.generation_settings.subtitles_enabled)

    def test_coerce_persisted_export_settings_repairs_legacy_mode_preset_mismatch(self) -> None:
        resolved = coerce_persisted_export_settings(
            {
                "preset_name": "youtube_landscape",
                "export_mode": "portrait",
                "crop_mode": "smart_crop",
                "mobile_optimized": True,
                "face_tracking_enabled": True,
                "subtitle_style": {},
                "audio_enhancement": {},
                "generation_settings": {},
            }
        )

        self.assertEqual(resolved.preset_name, "youtube_shorts")
        self.assertEqual(resolved.export_mode, "portrait")
        self.assertEqual(resolved.crop_mode, "smart_crop")

    def test_generation_settings_input_resolves_over_preferred_defaults(self) -> None:
        preferred = GenerationSettings(
            clip_duration_seconds=40,
            number_of_clips=6,
            topic_focus="marketing",
            subtitles_enabled=False,
        )

        resolved = GenerationSettingsInput(number_of_clips=3).resolve(preferred)

        self.assertEqual(resolved.clip_duration_seconds, 40)
        self.assertEqual(resolved.number_of_clips, 3)
        self.assertEqual(resolved.topic_focus, "marketing")
        self.assertFalse(resolved.subtitles_enabled)

    def test_generate_clips_request_supports_direct_generation_fields(self) -> None:
        request = GenerateClipsRequest(
            clip_duration_seconds=35,
            number_of_clips=2,
            topic_focus="product launch",
            subtitles_enabled=True,
        )

        resolved = request.resolve_generation_settings()

        self.assertEqual(resolved.clip_duration_seconds, 35)
        self.assertEqual(resolved.number_of_clips, 2)
        self.assertEqual(resolved.topic_focus, "product launch")
        self.assertTrue(resolved.subtitles_enabled)

    def test_generate_clips_request_requires_settings_when_saving_preferences(self) -> None:
        with self.assertRaises(ValidationError) as exc_info:
            GenerateClipsRequest(save_generation_settings=True)

        self.assertIn("save_generation_settings requires", str(exc_info.exception))


if __name__ == "__main__":
    unittest.main()
