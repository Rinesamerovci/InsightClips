from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import app.utils.reframing as reframing_module  # noqa: E402
from app.utils.reframing import FaceDetection, build_portrait_video_filters, compute_portrait_crop_window, read_video_dimensions  # noqa: E402


class ReframingTests(unittest.TestCase):
    def test_read_video_dimensions_uses_ffprobe_when_opencv_is_unavailable(self) -> None:
        ffprobe_payload = json.dumps({"streams": [{"width": 1280, "height": 720}]})

        with patch.object(reframing_module, "cv2", None):
            with patch.object(reframing_module.shutil, "which", return_value="ffprobe"):
                with patch.object(reframing_module.Path, "exists", return_value=True):
                    with patch.object(reframing_module.Path, "is_file", return_value=True):
                        with patch.object(
                            reframing_module.subprocess,
                            "run",
                            return_value=MagicMock(returncode=0, stdout=ffprobe_payload),
                        ):
                            dimensions = read_video_dimensions(Path("sample.mp4"))

        self.assertEqual(dimensions, (1280, 720))

    def test_compute_portrait_crop_window_matches_real_720p_source_dimensions(self) -> None:
        with patch.object(reframing_module, "read_video_dimensions", return_value=(1280, 720)):
            crop_window = compute_portrait_crop_window(
                Path("sample.mp4"),
                clip_start_seconds=0.0,
                clip_duration_seconds=15.0,
                prefer_face_detection=False,
            )

        self.assertEqual(crop_window.source_width, 1280)
        self.assertEqual(crop_window.source_height, 720)
        self.assertEqual(crop_window.crop_width, 404)
        self.assertEqual(crop_window.crop_height, 720)
        self.assertEqual(crop_window.offset_x, 438)

    def test_compute_portrait_crop_window_widens_smart_crop_to_protect_face(self) -> None:
        with patch.object(reframing_module, "read_video_dimensions", return_value=(1280, 720)):
            with patch.object(
                reframing_module,
                "detect_primary_face",
                return_value=FaceDetection(center_x=260.0, center_y=180.0, width=180, height=180, weight=1.0),
            ):
                crop_window = compute_portrait_crop_window(
                    Path("sample.mp4"),
                    clip_start_seconds=0.0,
                    clip_duration_seconds=15.0,
                    prefer_face_detection=True,
                )

        self.assertEqual(crop_window.source_width, 1280)
        self.assertEqual(crop_window.source_height, 720)
        self.assertEqual(crop_window.crop_width, 588)
        self.assertEqual(crop_window.offset_x, 0)
        self.assertEqual(crop_window.strategy, "smart_crop")
        self.assertTrue(crop_window.face_detected)

    def test_build_portrait_video_filters_preserves_aspect_with_padding_for_safe_crop(self) -> None:
        filters = build_portrait_video_filters(
            reframing_module.CropWindow(
                source_width=1280,
                source_height=720,
                crop_width=588,
                crop_height=720,
                offset_x=0,
                offset_y=0,
                strategy="smart_crop",
                face_detected=True,
            )
        )

        self.assertIn("crop=588:720:0:0", filters)
        self.assertIn("scale=1080:1920:force_original_aspect_ratio=decrease", filters)
        self.assertIn("pad=1080:1920:(ow-iw)/2:(oh-ih)/2", filters)


if __name__ == "__main__":
    unittest.main()
