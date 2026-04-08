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
            self.assertAlmostEqual(get_duration_seconds(Path("sample.mp4")), 12.345)

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


if __name__ == "__main__":
    unittest.main()
