from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.utils.media import (  # noqa: E402
    CorruptMediaError,
    MediaInspectionResult,
    UnsupportedMediaTypeError,
    build_ffprobe_command,
    get_duration_seconds,
    inspect_media,
    validate_media_type,
)
from app.models.export_settings import ExportSettings, ExportSettingsInput, SubtitleStyle  # noqa: E402
from app.services.media_service import build_render_contract, resolve_export_settings_for_render  # noqa: E402
from app.utils.reframing import CropWindow, FaceDetection, build_portrait_video_filters, compute_portrait_crop_window  # noqa: E402


class MediaUtilsTests(unittest.TestCase):
    def test_validate_media_type_accepts_extension(self) -> None:
        self.assertEqual(validate_media_type("episode.mp4"), "mp4")

    def test_validate_media_type_accepts_supported_mime(self) -> None:
        self.assertEqual(validate_media_type("episode", "video/mp4"), "mp4")

    def test_validate_media_type_rejects_unknown_type(self) -> None:
        with self.assertRaises(UnsupportedMediaTypeError):
            validate_media_type("episode.xyz", "application/octet-stream")

    def test_build_ffprobe_command_includes_json_output(self) -> None:
        command = build_ffprobe_command(Path("sample.mp4"))
        self.assertEqual(command[0], "ffprobe")
        self.assertIn("json", command)
        self.assertEqual(command[-1], "sample.mp4")

    def test_get_duration_seconds_reads_duration_from_probe_payload(self) -> None:
        with patch("app.utils.media._probe_media", return_value={"format": {"duration": "12.345"}}):
            self.assertAlmostEqual(get_duration_seconds(Path("sample.mp4")), 12.35)

    def test_get_duration_seconds_rejects_missing_duration(self) -> None:
        with patch("app.utils.media._probe_media", return_value={"format": {}}):
            with self.assertRaises(CorruptMediaError):
                get_duration_seconds(Path("sample.mp4"))

    def test_inspect_media_returns_normalized_contract(self) -> None:
        media_path = Path("sample.mp4")
        with patch("app.utils.media._resolve_file_path", return_value=media_path):
            with patch(
                "app.utils.media._probe_media",
                return_value={"format": {"duration": "9.52", "format_name": "mov,mp4,m4a,3gp,3g2,mj2"}},
            ):
                result = inspect_media(media_path, mime_type="video/mp4")

        self.assertIsInstance(result, MediaInspectionResult)
        self.assertEqual(result.duration_seconds, 9.52)
        self.assertEqual(result.duration_minutes, 0.16)
        self.assertTrue(result.is_supported)
        self.assertEqual(result.detected_format, "mov")
        self.assertEqual(result.mime_type, "video/mp4")
        self.assertTrue(result.validation_flags["duration_detected"])

    def test_build_render_contract_returns_vertical_preset_contract(self) -> None:
        contract = build_render_contract(
            ExportSettingsInput(export_mode="portrait", preset_name="instagram_reels"),
            clip_duration_seconds=12.0,
        )

        self.assertEqual(contract.preset_name, "instagram_reels")
        self.assertEqual(contract.export_mode, "portrait")
        self.assertEqual(contract.width, 1080)
        self.assertEqual(contract.height, 1920)
        self.assertEqual(contract.subtitle_timing_profile, "compact")
        self.assertLessEqual(contract.subtitle_timing.max_words_per_cue, 5)
        self.assertEqual(contract.subtitle_timing.max_lines, 3)

    def test_build_render_contract_returns_landscape_contract(self) -> None:
        contract = build_render_contract(
            ExportSettings(),
            clip_duration_seconds=75.0,
        )

        self.assertEqual(contract.preset_name, "youtube_landscape")
        self.assertEqual(contract.aspect_ratio, "16:9")
        self.assertEqual(contract.width, 1920)
        self.assertEqual(contract.height, 1080)
        self.assertEqual(contract.subtitle_timing_profile, "extended")
        self.assertGreaterEqual(contract.subtitle_timing.max_duration_seconds, 3.4)
        self.assertEqual(contract.subtitle_timing.max_lines, 2)

    def test_build_render_contract_switches_book_like_mode_policies(self) -> None:
        contract = build_render_contract(
            ExportSettingsInput(export_mode="portrait", crop_mode="smart_crop"),
            visual_output_mode="book_like",
            subtitles_available=True,
            clip_duration_seconds=32.0,
        )

        self.assertEqual(contract.requested_visual_output_mode, "book_like")
        self.assertEqual(contract.effective_visual_output_mode, "book_like")
        self.assertEqual(contract.rendering_profile, "editorial_frame")
        self.assertEqual(contract.overlay_policy, "disabled")
        self.assertEqual(contract.subtitle_policy, "narrative_cards")
        self.assertGreaterEqual(contract.overlay_safe_margin_y, 90)

    def test_build_render_contract_falls_back_stylized_mode_on_landscape(self) -> None:
        contract = build_render_contract(
            ExportSettings(),
            visual_output_mode="stylized_animated",
            subtitles_available=True,
            clip_duration_seconds=28.0,
        )

        self.assertEqual(contract.requested_visual_output_mode, "stylized_animated")
        self.assertEqual(contract.effective_visual_output_mode, "original_people")
        self.assertEqual(contract.rendering_profile, "live_action")
        self.assertEqual(contract.overlay_policy, "full")
        self.assertEqual(
            contract.render_fallback_reason,
            "stylized_animated_requires_portrait_export",
        )

    def test_build_render_contract_expands_overlay_safe_margins_for_stylized_centered_subtitles(self) -> None:
        contract = build_render_contract(
            ExportSettingsInput(
                export_mode="portrait",
                crop_mode="smart_crop",
            ),
            visual_output_mode="stylized_animated",
            subtitles_available=True,
            clip_duration_seconds=24.0,
        )

        self.assertEqual(contract.effective_visual_output_mode, "stylized_animated")
        self.assertEqual(contract.subtitle_policy, "stylized_captions")
        self.assertGreaterEqual(contract.overlay_safe_margin_x, 50)
        self.assertGreaterEqual(contract.overlay_safe_margin_y, 150)

    def test_resolve_export_settings_for_render_tunes_short_portrait_subtitles(self) -> None:
        resolved = resolve_export_settings_for_render(
            ExportSettingsInput(
                export_mode="portrait",
                subtitle_style=SubtitleStyle(preset="classic", font_size=14),
            ),
            clip_duration_seconds=14.0,
        )

        self.assertEqual(resolved.preset_name, "youtube_shorts")
        self.assertGreaterEqual(resolved.subtitle_style.font_size, 22)
        self.assertTrue(resolved.mobile_optimized)

    def test_resolve_export_settings_for_render_preserves_minimal_subtitle_background_rules(self) -> None:
        resolved = resolve_export_settings_for_render(
            ExportSettingsInput(
                export_mode="portrait",
                subtitle_style=SubtitleStyle(preset="minimal"),
            ),
            clip_duration_seconds=36.0,
        )

        self.assertEqual(resolved.subtitle_style.background_opacity, 0)
        self.assertEqual(resolved.subtitle_style.preset, "minimal")

    def test_resolve_export_settings_for_render_tunes_book_like_subtitles(self) -> None:
        resolved = resolve_export_settings_for_render(
            ExportSettingsInput(
                export_mode="portrait",
                subtitle_style=SubtitleStyle(preset="classic", font_family="Arial", font_size=18),
            ),
            visual_output_mode="book_like",
            subtitles_available=True,
            clip_duration_seconds=36.0,
        )

        self.assertEqual(resolved.subtitle_style.font_family, "Georgia")
        self.assertEqual(resolved.subtitle_style.position, "top")
        self.assertTrue(resolved.subtitle_style.italic)
        self.assertGreaterEqual(resolved.subtitle_style.background_opacity, 0.42)

    def test_compute_portrait_crop_window_uses_face_center_when_available(self) -> None:
        with patch("app.utils.reframing.read_video_dimensions", return_value=(1920, 1080)):
            with patch(
                "app.utils.reframing.detect_primary_face",
                return_value=FaceDetection(center_x=1500.0, center_y=220.0, width=200, height=200, weight=1.0),
            ):
                crop = compute_portrait_crop_window(
                    Path("sample.mp4"),
                    clip_start_seconds=2.0,
                    clip_duration_seconds=6.0,
                )

        self.assertEqual(crop.crop_width, 882)
        self.assertEqual(crop.offset_x, 1038)
        self.assertEqual(crop.strategy, "smart_crop")
        self.assertTrue(crop.face_detected)

    def test_compute_portrait_crop_window_falls_back_to_center_crop_without_face(self) -> None:
        with patch("app.utils.reframing.read_video_dimensions", return_value=(1920, 1080)):
            with patch("app.utils.reframing.detect_primary_face", return_value=None):
                crop = compute_portrait_crop_window(
                    Path("sample.mp4"),
                    clip_start_seconds=0.0,
                    clip_duration_seconds=4.0,
                )

        self.assertEqual(crop.crop_width, 882)
        self.assertEqual(crop.offset_x, 519)
        self.assertEqual(crop.strategy, "safe_center_crop")
        self.assertFalse(crop.face_detected)

    def test_compute_portrait_crop_window_skips_face_detection_for_center_crop(self) -> None:
        with patch("app.utils.reframing.read_video_dimensions", return_value=(1920, 1080)):
            with patch("app.utils.reframing.detect_primary_face_center_x") as detect_mock:
                crop = compute_portrait_crop_window(
                    Path("sample.mp4"),
                    clip_start_seconds=0.0,
                    clip_duration_seconds=4.0,
                    prefer_face_detection=False,
                )

        detect_mock.assert_not_called()
        self.assertEqual(crop.offset_x, 657)
        self.assertEqual(crop.strategy, "center_crop")

    def test_build_portrait_video_filters_returns_crop_and_scale_chain(self) -> None:
        filters = build_portrait_video_filters(
            CropWindow(
                source_width=1920,
                source_height=1080,
                crop_width=606,
                crop_height=1080,
                offset_x=1197,
                offset_y=0,
            )
        )

        self.assertIn("crop=606:1080:1197:0", filters)
        self.assertIn("scale=1080:1920:force_original_aspect_ratio=decrease", filters)
        self.assertIn("pad=1080:1920:(ow-iw)/2:(oh-ih)/2", filters)


if __name__ == "__main__":
    unittest.main()
