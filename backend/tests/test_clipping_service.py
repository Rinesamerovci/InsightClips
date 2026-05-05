from __future__ import annotations

import subprocess
import shutil
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.models.analysis import ScoreSegment  # noqa: E402
from app.models.export_settings import ExportSettings, ExportSettingsInput, SubtitleStyle  # noqa: E402
from app.models.transcription import TranscriptWord, TranscriptionResult  # noqa: E402
from app.models.overlay import OverlayDecision  # noqa: E402
import app.services.clipping_service as clipping_service_module  # noqa: E402
from app.services.clipping_service import (  # noqa: E402
    ClippingError,
    build_ffmpeg_clip_command,
    build_segment_fallback_srt_content,
    build_srt_content,
    generate_clips,
    _build_audio_filter,
    _build_subtitle_force_style,
    _build_video_filters,
    _resolve_clip_window,
)


class ClippingServiceTests(unittest.TestCase):
    def _workspace_case_dir(self, name: str) -> Path:
        case_dir = BACKEND_ROOT / ".tmp-test-artifacts" / name
        if case_dir.exists():
            shutil.rmtree(case_dir, ignore_errors=True)
        case_dir.mkdir(parents=True, exist_ok=True)
        self.addCleanup(lambda: shutil.rmtree(case_dir, ignore_errors=True))
        return case_dir

    def _build_sample_video(self, output_path: Path, *, duration_seconds: float = 1.6) -> None:
        result = subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-y",
                "-f",
                "lavfi",
                "-i",
                f"color=c=0x203040:s=1280x720:d={duration_seconds:.2f}",
                "-f",
                "lavfi",
                "-i",
                f"sine=frequency=440:duration={duration_seconds:.2f}",
                "-c:v",
                "libx264",
                "-c:a",
                "aac",
                "-shortest",
                "-pix_fmt",
                "yuv420p",
                str(output_path),
            ],
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)

    def _assert_playable_mp4(self, output_path: Path) -> None:
        result = subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-i",
                str(output_path),
                "-f",
                "null",
                "-",
            ],
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)

    def setUp(self) -> None:
        self.transcription = TranscriptionResult(
            transcript_text="This is a strong hook for a viral clip and the subtitles should stay aligned.",
            duration_seconds=20.0,
            detected_language="en",
            words=[
                TranscriptWord(word="This", start=2.0, end=2.2, confidence=0.92),
                TranscriptWord(word="is", start=2.21, end=2.33, confidence=0.92),
                TranscriptWord(word="a", start=2.34, end=2.42, confidence=0.92),
                TranscriptWord(word="strong", start=2.43, end=2.72, confidence=0.92),
                TranscriptWord(word="hook", start=2.73, end=3.01, confidence=0.92),
                TranscriptWord(word="for", start=3.02, end=3.18, confidence=0.92),
                TranscriptWord(word="a", start=3.19, end=3.25, confidence=0.92),
                TranscriptWord(word="viral", start=3.26, end=3.56, confidence=0.92),
                TranscriptWord(word="clip", start=3.57, end=3.82, confidence=0.92),
                TranscriptWord(word="and", start=4.4, end=4.58, confidence=0.9),
                TranscriptWord(word="the", start=4.59, end=4.73, confidence=0.9),
                TranscriptWord(word="subtitles", start=4.74, end=5.15, confidence=0.9),
                TranscriptWord(word="should", start=5.16, end=5.46, confidence=0.9),
                TranscriptWord(word="stay", start=5.47, end=5.71, confidence=0.9),
                TranscriptWord(word="aligned.", start=5.72, end=6.15, confidence=0.9),
            ],
            model_used="whisper-large-v3-turbo",
            processing_time_seconds=0.6,
        )
        self.score_segments = [
            ScoreSegment(
                segment_start_seconds=2.0,
                segment_end_seconds=6.2,
                duration_seconds=4.2,
                virality_score=88.5,
                transcript_snippet="This is a strong hook for a viral clip and the subtitles should stay aligned.",
                sentiment="positive",
                keywords=["viral", "hook"],
            )
        ]

    def test_build_ffmpeg_clip_command_uses_expected_codecs_and_filter(self) -> None:
        command = build_ffmpeg_clip_command(
            Path("input.mp4"),
            Path("output.mp4"),
            Path("captions.srt"),
            start_seconds=12.345,
            duration_seconds=18.2,
        )

        self.assertIn("ffmpeg", command[0])
        self.assertIn("libx264", command)
        self.assertIn("aac", command)
        self.assertIn("+faststart", command)
        self.assertIn("subtitles=", command[command.index("-vf") + 1])
        self.assertIn("-af", command)
        self.assertIn("loudnorm=I=-16.0:TP=-1.5:LRA=11.0", command)

    def test_build_ffmpeg_clip_command_adds_portrait_crop_and_scale(self) -> None:
        command = build_ffmpeg_clip_command(
            Path("input.mp4"),
            Path("output.mp4"),
            Path("captions.srt"),
            start_seconds=12.345,
            duration_seconds=18.2,
            export_settings=ExportSettingsInput(
                export_mode="portrait",
                crop_mode="smart_crop",
                face_tracking_enabled=True,
            ).resolve(),
            crop_window=clipping_service_module.CropWindow(
                source_width=1920,
                source_height=1080,
                crop_width=606,
                crop_height=1080,
                offset_x=1197,
                offset_y=0,
            ),
        )

        self.assertIn("-vf", command)
        filters = command[command.index("-vf") + 1]
        self.assertIn("crop=606:1080:1197:0", filters)
        self.assertIn("scale=1080:1920:force_original_aspect_ratio=decrease", filters)
        self.assertIn("pad=1080:1920:(ow-iw)/2:(oh-ih)/2", filters)
        self.assertIn("subtitles=", filters)

    def test_build_ffmpeg_clip_command_uses_filter_complex_when_overlay_is_enabled(self) -> None:
        overlay = OverlayDecision(
            clip_id="clip-1",
            podcast_id="podcast-1",
            keyword="ai",
            overlay_category="technology",
            overlay_asset="ai_chip",
            asset_path="technology/ai_chip.png",
            position="bottom_right",
            scale=0.2,
            opacity=0.95,
            margin_x=32,
            margin_y=32,
            render_start_seconds=1.2,
            render_end_seconds=3.8,
            applied=True,
        )
        command = build_ffmpeg_clip_command(
            Path("input.mp4"),
            Path("output.mp4"),
            Path("captions.srt"),
            start_seconds=4.0,
            duration_seconds=18.2,
            overlay=overlay,
            overlay_asset_path=Path("overlay.png"),
        )

        self.assertIn("-filter_complex", command)
        self.assertIn("-af", command)
        self.assertIn("-map", command)
        self.assertIn("overlay=", command[command.index("-filter_complex") + 1])

    def test_build_ffmpeg_clip_command_skips_audio_filter_when_enhancement_is_disabled(self) -> None:
        command = build_ffmpeg_clip_command(
            Path("input.mp4"),
            Path("output.mp4"),
            Path("captions.srt"),
            start_seconds=0,
            duration_seconds=10,
            export_settings=ExportSettingsInput(audio_enhancement={"enabled": False}).resolve(),
        )

        self.assertNotIn("-af", command)

    def test_build_srt_content_offsets_timestamps_relative_to_clip_start(self) -> None:
        srt_content, subtitle_text = build_srt_content(
            self.transcription,
            clip_start_seconds=2.0,
            clip_end_seconds=6.2,
        )

        self.assertIn("00:00:00,000 -->", srt_content)
        self.assertIn("This is a strong", srt_content)
        self.assertIn("subtitles should stay aligned.", subtitle_text)

    def test_build_segment_fallback_srt_content_spreads_segment_snippet_across_clip(self) -> None:
        srt_content, subtitle_text = build_segment_fallback_srt_content(
            self.score_segments[0],
            clip_duration_seconds=4.2,
        )

        self.assertIn("00:00:00,000 -->", srt_content)
        self.assertIn("This is a strong hook", srt_content)
        self.assertEqual(
            subtitle_text,
            "This is a strong hook for a viral clip and the subtitles should stay aligned.",
        )

    def test_generate_clips_persists_ready_rows(self) -> None:
        case_dir = self._workspace_case_dir("clipping-persist")
        delete_execute = MagicMock()
        insert_execute = MagicMock()
        clips_table = SimpleNamespace(
            delete=MagicMock(return_value=SimpleNamespace(eq=MagicMock(return_value=SimpleNamespace(execute=delete_execute)))),
            insert=MagicMock(return_value=SimpleNamespace(execute=insert_execute)),
        )
        podcasts_update_execute = MagicMock()
        podcasts_table = SimpleNamespace(
            update=MagicMock(
                return_value=SimpleNamespace(eq=MagicMock(return_value=SimpleNamespace(execute=podcasts_update_execute)))
            )
        )
        service_supabase_mock = MagicMock()
        service_supabase_mock.table.side_effect = (
            lambda name: clips_table if name == "clips" else podcasts_table if name == "podcasts" else MagicMock()
        )

        def fake_ffmpeg(*args, **kwargs):
            clip_path = args[1]
            clip_path.write_bytes(b"clip")

        with patch.object(clipping_service_module, "service_supabase", service_supabase_mock):
            with patch.object(clipping_service_module, "GENERATED_CLIPS_ROOT", case_dir / "generated"):
                with patch.object(clipping_service_module, "_get_podcast_row", return_value={"id": "podcast-123"}):
                    with patch.object(clipping_service_module, "_resolve_source_media_path", return_value=Path("podcast.mp4")):
                        with patch.object(clipping_service_module, "_run_ffmpeg_clip_generation", side_effect=fake_ffmpeg):
                            with patch.object(
                                clipping_service_module,
                                "_store_clip_assets",
                                return_value=("https://example.com/clip.mp4", "https://example.com/clip.srt"),
                            ):
                                clips = generate_clips("podcast-123", self.score_segments, self.transcription)

        self.assertEqual(len(clips), 1)
        self.assertEqual(clips[0].status, "ready")
        self.assertEqual(clips[0].export_settings.export_mode, "landscape")
        self.assertEqual(clips[0].video_url, f"/podcasts/clips/{clips[0].id}/download")
        insert_payload = clips_table.insert.call_args.args[0]
        self.assertEqual(insert_payload[0]["podcast_id"], "podcast-123")
        self.assertIsNone(insert_payload[0]["storage_url"])
        self.assertEqual(insert_payload[0]["status"], "ready")
        self.assertEqual(insert_payload[0]["export_mode"], "landscape")
        self.assertEqual(insert_payload[0]["crop_mode"], "none")
        self.assertEqual(insert_payload[0]["audio_enhancement"]["status"], "enabled")
        podcasts_table.update.assert_called_once()

    def test_generate_clips_persists_portrait_export_preferences(self) -> None:
        case_dir = self._workspace_case_dir("clipping-export-settings")
        delete_execute = MagicMock()
        insert_execute = MagicMock()
        clips_table = SimpleNamespace(
            delete=MagicMock(return_value=SimpleNamespace(eq=MagicMock(return_value=SimpleNamespace(execute=delete_execute)))),
            insert=MagicMock(return_value=SimpleNamespace(execute=insert_execute)),
        )
        podcasts_eq_mock = MagicMock(return_value=SimpleNamespace(execute=MagicMock()))
        podcasts_table = SimpleNamespace(update=MagicMock(return_value=SimpleNamespace(eq=podcasts_eq_mock)))
        service_supabase_mock = MagicMock()
        service_supabase_mock.table.side_effect = (
            lambda name: clips_table if name == "clips" else podcasts_table if name == "podcasts" else MagicMock()
        )

        def fake_ffmpeg(*args, **kwargs):
            clip_path = args[1]
            clip_path.write_bytes(b"clip")

        with patch.object(clipping_service_module, "service_supabase", service_supabase_mock):
            with patch.object(clipping_service_module, "GENERATED_CLIPS_ROOT", case_dir / "generated"):
                with patch.object(
                    clipping_service_module,
                    "_get_podcast_row",
                    return_value={"id": "podcast-123", "storage_path": "podcast.mp4"},
                ):
                    with patch.object(clipping_service_module, "_resolve_source_media_path", return_value=Path("podcast.mp4")):
                        with patch.object(clipping_service_module, "_run_ffmpeg_clip_generation", side_effect=fake_ffmpeg):
                            with patch.object(
                                clipping_service_module,
                                "_store_clip_assets",
                                return_value=("https://example.com/clip.mp4", "https://example.com/clip.srt"),
                            ):
                                clips = generate_clips(
                                    "podcast-123",
                                    self.score_segments,
                                    self.transcription,
                                    ExportSettingsInput(
                                        export_mode="portrait",
                                        crop_mode="smart_crop",
                                        face_tracking_enabled=True,
                                        audio_enhancement={
                                            "enabled": True,
                                            "target_lufs": -14.0,
                                            "true_peak_db": -1.0,
                                        },
                                    ),
                                )

        self.assertEqual(clips[0].export_settings.export_mode, "portrait")
        self.assertEqual(clips[0].export_settings.crop_mode, "smart_crop")
        self.assertTrue(clips[0].export_settings.face_tracking_enabled)
        insert_payload = clips_table.insert.call_args.args[0]
        self.assertEqual(insert_payload[0]["export_mode"], "portrait")
        self.assertEqual(insert_payload[0]["crop_mode"], "smart_crop")
        self.assertTrue(insert_payload[0]["face_tracking_enabled"])
        self.assertEqual(insert_payload[0]["audio_enhancement"]["target_lufs"], -14.0)
        podcasts_update_payload = podcasts_table.update.call_args.args[0]
        self.assertEqual(podcasts_update_payload["export_mode"], "portrait")
        self.assertEqual(podcasts_update_payload["crop_mode"], "smart_crop")
        self.assertTrue(podcasts_update_payload["face_tracking_enabled"])
        self.assertEqual(podcasts_update_payload["audio_enhancement"]["true_peak_db"], -1.0)

    def test_generate_clips_resolves_portrait_crop_window_for_smart_crop_exports(self) -> None:
        case_dir = self._workspace_case_dir("clipping-smart-crop")
        clips_table = SimpleNamespace(
            delete=MagicMock(return_value=SimpleNamespace(eq=MagicMock(return_value=SimpleNamespace(execute=MagicMock())))),
            insert=MagicMock(return_value=SimpleNamespace(execute=MagicMock())),
        )
        podcasts_table = SimpleNamespace(
            update=MagicMock(return_value=SimpleNamespace(eq=MagicMock(return_value=SimpleNamespace(execute=MagicMock()))))
        )
        service_supabase_mock = MagicMock()
        service_supabase_mock.table.side_effect = (
            lambda name: clips_table if name == "clips" else podcasts_table if name == "podcasts" else MagicMock()
        )
        captured_crop = {}

        def fake_ffmpeg(*args, **kwargs):
            captured_crop["crop_window"] = kwargs["crop_window"]
            clip_path = args[1]
            clip_path.write_bytes(b"clip")

        with patch.object(clipping_service_module, "service_supabase", service_supabase_mock):
            with patch.object(clipping_service_module, "GENERATED_CLIPS_ROOT", case_dir / "generated"):
                with patch.object(
                    clipping_service_module,
                    "_get_podcast_row",
                    return_value={"id": "podcast-123", "storage_path": "podcast.mp4"},
                ):
                    with patch.object(clipping_service_module, "_resolve_source_media_path", return_value=Path("podcast.mp4")):
                        with patch.object(
                            clipping_service_module,
                            "compute_portrait_crop_window",
                            return_value=clipping_service_module.CropWindow(
                                source_width=1920,
                                source_height=1080,
                                crop_width=606,
                                crop_height=1080,
                                offset_x=1180,
                                offset_y=0,
                                strategy="smart_crop",
                                face_detected=True,
                            ),
                        ):
                            with patch.object(clipping_service_module, "_run_ffmpeg_clip_generation", side_effect=fake_ffmpeg):
                                with patch.object(
                                    clipping_service_module,
                                    "_store_clip_assets",
                                    return_value=("https://example.com/clip.mp4", "https://example.com/clip.srt"),
                                ):
                                    generate_clips(
                                        "podcast-123",
                                        self.score_segments,
                                        self.transcription,
                                        ExportSettingsInput(
                                            export_mode="portrait",
                                            crop_mode="smart_crop",
                                            face_tracking_enabled=True,
                                        ),
                                    )

        self.assertEqual(captured_crop["crop_window"].offset_x, 1180)

    def test_build_video_filters_keeps_landscape_exports_unchanged(self) -> None:
        filters = _build_video_filters(Path("captions.srt"))
        self.assertTrue(filters.startswith("subtitles="))

    def test_build_audio_filter_maps_normalization_settings(self) -> None:
        audio_filter = _build_audio_filter(
            ExportSettingsInput(
                audio_enhancement={
                    "enabled": True,
                    "target_lufs": -14.0,
                    "true_peak_db": -1.0,
                }
            ).resolve()
        )

        self.assertEqual(audio_filter, "loudnorm=I=-14.0:TP=-1.0:LRA=11.0")

    def test_build_video_filters_includes_subtitle_style_for_renderer(self) -> None:
        filters = _build_video_filters(
            Path("captions.srt"),
            export_settings=ExportSettings(
                subtitle_style=SubtitleStyle(
                    preset="boxed",
                    font_family="Inter",
                    font_size=26,
                    primary_color="#F8FAFC",
                    outline_color="#111827",
                    background_color="#0F172A",
                    background_opacity=0.7,
                    position="top",
                    bold=True,
                )
            ),
        )

        self.assertIn("FontName=Inter", filters)
        self.assertIn("Fontsize=26", filters)
        self.assertIn("Alignment=8", filters)
        self.assertIn("BorderStyle=3", filters)
        self.assertIn("Bold=-1", filters)

    def test_subtitle_force_style_converts_hex_colors_to_ass_format(self) -> None:
        style = _build_subtitle_force_style(
            SubtitleStyle(
                primary_color="#336699",
                outline_color="#000000",
            )
        )

        self.assertIn("PrimaryColour=&H00996633", style)
        self.assertIn("BackColour=&HCC000000", style)

    def test_subtitle_force_style_applies_preset_specific_readability_tuning(self) -> None:
        bold_style = _build_subtitle_force_style(SubtitleStyle.for_preset("bold"), export_mode="portrait")
        minimal_style = _build_subtitle_force_style(SubtitleStyle.for_preset("minimal"))
        boxed_style = _build_subtitle_force_style(SubtitleStyle.for_preset("boxed"))

        self.assertIn("Outline=3", bold_style)
        self.assertIn("Shadow=1", bold_style)
        self.assertIn("MarginL=58", bold_style)
        self.assertIn("MarginV=64", bold_style)
        self.assertIn("BorderStyle=1", minimal_style)
        self.assertIn("Shadow=1", minimal_style)
        self.assertIn("BackColour=&HFF000000", minimal_style)
        self.assertIn("BorderStyle=3", boxed_style)
        self.assertIn("Outline=0", boxed_style)
        self.assertIn("Shadow=0", boxed_style)

    def test_run_ffmpeg_clip_generation_keeps_styled_exports_playable(self) -> None:
        if not shutil.which("ffmpeg"):
            self.skipTest("ffmpeg is required for styled export integration coverage.")

        case_dir = self._workspace_case_dir("clipping-styled-export")
        source_path = case_dir / "source.mp4"
        subtitle_path = case_dir / "captions.srt"
        self._build_sample_video(source_path)
        subtitle_path.write_text(
            "1\n00:00:00,000 --> 00:00:01,200\nReadable styled subtitles stay synced.\n",
            encoding="utf-8",
        )

        scenarios = [
            (
                "landscape-bold",
                ExportSettings(subtitle_style=SubtitleStyle.for_preset("bold")),
                None,
            ),
            (
                "portrait-boxed",
                ExportSettings(
                    export_mode="portrait",
                    crop_mode="center_crop",
                    subtitle_style=SubtitleStyle(
                        preset="boxed",
                        font_family="Arial",
                        font_size=22,
                        primary_color="#F8FAFC",
                        outline_color="#111827",
                        background_color="#0F172A",
                        background_opacity=0.65,
                        position="top",
                        bold=True,
                    ),
                ),
                clipping_service_module.CropWindow(
                    source_width=1280,
                    source_height=720,
                    crop_width=405,
                    crop_height=720,
                    offset_x=438,
                    offset_y=0,
                ),
            ),
        ]

        for name, export_settings, crop_window in scenarios:
            with self.subTest(name=name):
                output_path = case_dir / f"{name}.mp4"
                clipping_service_module._run_ffmpeg_clip_generation(
                    source_path,
                    output_path,
                    subtitle_path,
                    start_seconds=0.0,
                    duration_seconds=1.4,
                    export_settings=export_settings,
                    crop_window=crop_window,
                )
                self.assertTrue(output_path.exists())
                self.assertGreater(output_path.stat().st_size, 0)
                self._assert_playable_mp4(output_path)

    def test_run_ffmpeg_clip_generation_retries_without_loudnorm_when_normalization_fails(self) -> None:
        case_dir = self._workspace_case_dir("clipping-audio-fallback")
        source_path = case_dir / "source.mp4"
        subtitle_path = case_dir / "captions.srt"
        output_path = case_dir / "output.mp4"
        subtitle_path.write_text(
            "1\n00:00:00,000 --> 00:00:01,000\nAudio fallback stays exportable.\n",
            encoding="utf-8",
        )

        commands: list[list[str]] = []

        def fake_run(command, **kwargs):
            commands.append(command)
            if "-af" in command:
                return SimpleNamespace(returncode=1, stderr="loudnorm filter failed", stdout="")
            output_path.write_bytes(b"clip")
            return SimpleNamespace(returncode=0, stderr="", stdout="")

        with patch.object(clipping_service_module.shutil, "which", return_value="ffmpeg"):
            with patch.object(clipping_service_module.subprocess, "run", side_effect=fake_run):
                final_settings = clipping_service_module._run_ffmpeg_clip_generation(
                    source_path,
                    output_path,
                    subtitle_path,
                    start_seconds=0.0,
                    duration_seconds=1.0,
                    export_settings=ExportSettings(),
                )

        self.assertEqual(len(commands), 2)
        self.assertIn("-af", commands[0])
        self.assertNotIn("-af", commands[1])
        self.assertTrue(output_path.exists())
        self.assertEqual(final_settings.audio_enhancement.status, "failed")
        self.assertFalse(final_settings.audio_enhancement.normalize_loudness)

    def test_resolve_clip_window_prefers_matching_snippet_over_stale_segment_range(self) -> None:
        stale_segment = ScoreSegment(
            segment_start_seconds=0.0,
            segment_end_seconds=1.0,
            duration_seconds=1.0,
            virality_score=88.5,
            transcript_snippet="This is a strong hook for a viral clip",
            sentiment="positive",
            keywords=["viral", "hook"],
        )

        clip_start, clip_end = _resolve_clip_window(stale_segment, self.transcription)

        self.assertGreaterEqual(clip_start, 0.0)
        self.assertLessEqual(clip_start, 0.2)
        self.assertGreaterEqual(clip_end, 4.5)

    def test_generate_clips_uses_snippet_matched_window_when_segment_times_are_stale(self) -> None:
        stale_segment = ScoreSegment(
            segment_start_seconds=0.0,
            segment_end_seconds=1.0,
            duration_seconds=1.0,
            virality_score=88.5,
            transcript_snippet="This is a strong hook for a viral clip",
            sentiment="positive",
            keywords=["viral", "hook"],
        )
        case_dir = self._workspace_case_dir("clipping-snippet-match")
        delete_execute = MagicMock()
        insert_execute = MagicMock()
        clips_table = SimpleNamespace(
            delete=MagicMock(return_value=SimpleNamespace(eq=MagicMock(return_value=SimpleNamespace(execute=delete_execute)))),
            insert=MagicMock(return_value=SimpleNamespace(execute=insert_execute)),
        )
        service_supabase_mock = MagicMock()
        service_supabase_mock.table.side_effect = lambda name: clips_table if name == "clips" else MagicMock()

        captured_command: dict[str, float] = {}

        def fake_ffmpeg(*args, **kwargs):
            captured_command["start"] = kwargs["start_seconds"]
            captured_command["duration"] = kwargs["duration_seconds"]
            clip_path = args[1]
            clip_path.write_bytes(b"clip")

        with patch.object(clipping_service_module, "service_supabase", service_supabase_mock):
            with patch.object(clipping_service_module, "GENERATED_CLIPS_ROOT", case_dir / "generated"):
                with patch.object(clipping_service_module, "_get_podcast_row", return_value={"id": "podcast-123"}):
                    with patch.object(clipping_service_module, "_resolve_source_media_path", return_value=Path("podcast.mp4")):
                        with patch.object(clipping_service_module, "_run_ffmpeg_clip_generation", side_effect=fake_ffmpeg):
                            with patch.object(
                                clipping_service_module,
                                "_store_clip_assets",
                                return_value=("https://example.com/clip.mp4", "https://example.com/clip.srt"),
                            ):
                                clips = generate_clips("podcast-123", [stale_segment], self.transcription)

        self.assertEqual(len(clips), 1)
        self.assertGreaterEqual(captured_command["start"], 0.0)
        self.assertLessEqual(captured_command["start"], 0.2)
        self.assertGreater(captured_command["duration"], 4.0)

    def test_generate_clips_can_fallback_without_transcription(self) -> None:
        case_dir = self._workspace_case_dir("clipping-no-transcription")
        delete_execute = MagicMock()
        insert_execute = MagicMock()
        clips_table = SimpleNamespace(
            delete=MagicMock(return_value=SimpleNamespace(eq=MagicMock(return_value=SimpleNamespace(execute=delete_execute)))) ,
            insert=MagicMock(return_value=SimpleNamespace(execute=insert_execute)),
        )
        service_supabase_mock = MagicMock()
        service_supabase_mock.table.side_effect = lambda name: clips_table if name == "clips" else MagicMock()

        captured_command: dict[str, float] = {}

        def fake_ffmpeg(*args, **kwargs):
            captured_command["start"] = kwargs["start_seconds"]
            captured_command["duration"] = kwargs["duration_seconds"]
            clip_path = args[1]
            clip_path.write_bytes(b"clip")

        with patch.object(clipping_service_module, "service_supabase", service_supabase_mock):
            with patch.object(clipping_service_module, "GENERATED_CLIPS_ROOT", case_dir / "generated"):
                with patch.object(clipping_service_module, "_get_podcast_row", return_value={"id": "podcast-123"}):
                    with patch.object(clipping_service_module, "_resolve_source_media_path", return_value=Path("podcast.mp4")):
                        with patch.object(clipping_service_module, "_run_ffmpeg_clip_generation", side_effect=fake_ffmpeg):
                            with patch.object(
                                clipping_service_module,
                                "_store_clip_assets",
                                return_value=("https://example.com/clip.mp4", "https://example.com/clip.srt"),
                            ):
                                clips = generate_clips("podcast-123", self.score_segments, None)

        self.assertEqual(len(clips), 1)
        self.assertEqual(clips[0].subtitle_text, self.score_segments[0].transcript_snippet)
        self.assertEqual(clips[0].video_url, f"/podcasts/clips/{clips[0].id}/download")
        self.assertEqual(captured_command["start"], 0.0)
        self.assertGreater(captured_command["duration"], 5.0)

    def test_generate_clips_raises_when_segment_has_no_overlapping_words(self) -> None:
        invalid_segment = ScoreSegment(
            segment_start_seconds=10.0,
            segment_end_seconds=12.0,
            duration_seconds=2.0,
            virality_score=50.0,
            transcript_snippet="No aligned words here.",
            sentiment="neutral",
            keywords=[],
        )

        case_dir = self._workspace_case_dir("clipping-invalid")
        service_supabase_mock = MagicMock()
        service_supabase_mock.table.side_effect = lambda name: SimpleNamespace(
            delete=MagicMock(return_value=SimpleNamespace(eq=MagicMock(return_value=SimpleNamespace(execute=MagicMock())))),
            insert=MagicMock(return_value=SimpleNamespace(execute=MagicMock())),
        )

        with patch.object(clipping_service_module, "service_supabase", service_supabase_mock):
            with patch.object(clipping_service_module, "GENERATED_CLIPS_ROOT", case_dir / "generated"):
                with patch.object(clipping_service_module, "_get_podcast_row", return_value={"id": "podcast-123"}):
                    with patch.object(clipping_service_module, "_resolve_source_media_path", return_value=Path("podcast.mp4")):
                        with self.assertRaises(ClippingError) as exc_info:
                            generate_clips("podcast-123", [invalid_segment], self.transcription)

        self.assertIn("No clips could be generated", exc_info.exception.detail)
        self.assertIn("No transcript words overlapped the requested clip window.", exc_info.exception.detail)

    def test_generate_clips_marks_overlay_missing_asset_without_crashing_export(self) -> None:
        case_dir = self._workspace_case_dir("clipping-missing-overlay")
        delete_execute = MagicMock()
        insert_execute = MagicMock()
        clips_table = SimpleNamespace(
            delete=MagicMock(return_value=SimpleNamespace(eq=MagicMock(return_value=SimpleNamespace(execute=delete_execute)))),
            insert=MagicMock(return_value=SimpleNamespace(execute=insert_execute)),
        )
        service_supabase_mock = MagicMock()
        service_supabase_mock.table.side_effect = lambda name: clips_table if name == "clips" else MagicMock()

        def fake_ffmpeg(*args, **kwargs):
            clip_path = args[1]
            clip_path.write_bytes(b"clip")

        overlay = OverlayDecision(
            clip_id="clip-1",
            podcast_id="podcast-123",
            keyword="ai",
            overlay_category="technology",
            overlay_asset="ai_chip",
            asset_path="technology/missing.png",
            applied=True,
            render_status="mapped",
        )

        with patch.object(clipping_service_module, "service_supabase", service_supabase_mock):
            with patch.object(clipping_service_module, "GENERATED_CLIPS_ROOT", case_dir / "generated"):
                with patch.object(clipping_service_module, "_get_podcast_row", return_value={"id": "podcast-123"}):
                    with patch.object(clipping_service_module, "_resolve_source_media_path", return_value=Path("podcast.mp4")):
                        with patch.object(clipping_service_module, "_run_ffmpeg_clip_generation", side_effect=fake_ffmpeg):
                            with patch.object(
                                clipping_service_module,
                                "_store_clip_assets",
                                return_value=("https://example.com/clip.mp4", "https://example.com/clip.srt"),
                            ):
                                with patch.object(
                                    clipping_service_module.overlay_mapping_service_module,
                                    "detect_overlay_decision",
                                    return_value=overlay,
                                ):
                                    clips = generate_clips("podcast-123", self.score_segments, self.transcription)

        self.assertEqual(len(clips), 1)
        self.assertIsNotNone(clips[0].overlay)
        self.assertEqual(clips[0].overlay.render_status, "missing_asset")
        self.assertFalse(clips[0].overlay.rendered)

    def test_generate_clips_falls_back_when_overlay_render_fails(self) -> None:
        case_dir = self._workspace_case_dir("clipping-overlay-fallback")
        delete_execute = MagicMock()
        insert_execute = MagicMock()
        clips_table = SimpleNamespace(
            delete=MagicMock(return_value=SimpleNamespace(eq=MagicMock(return_value=SimpleNamespace(execute=delete_execute)))),
            insert=MagicMock(return_value=SimpleNamespace(execute=insert_execute)),
        )
        service_supabase_mock = MagicMock()
        service_supabase_mock.table.side_effect = lambda name: clips_table if name == "clips" else MagicMock()
        asset_dir = case_dir / "technology"
        asset_dir.mkdir(parents=True, exist_ok=True)
        asset_path = asset_dir / "ai_chip.png"
        asset_path.write_bytes(b"png")

        call_count = {"value": 0}

        def fake_ffmpeg(*args, **kwargs):
            call_count["value"] += 1
            clip_path = args[1]
            if kwargs.get("overlay") is not None:
                raise ClippingError("overlay filter failed", status_code=502)
            clip_path.write_bytes(b"clip")

        overlay = OverlayDecision(
            clip_id="clip-1",
            podcast_id="podcast-123",
            keyword="ai",
            overlay_category="technology",
            overlay_asset="ai_chip",
            asset_path="technology/ai_chip.png",
            position="bottom_right",
            scale=0.2,
            opacity=0.95,
            render_start_seconds=0.8,
            render_end_seconds=2.6,
            applied=True,
            render_status="mapped",
        )

        with patch.object(clipping_service_module, "service_supabase", service_supabase_mock):
            with patch.object(clipping_service_module, "GENERATED_CLIPS_ROOT", case_dir / "generated"):
                with patch.object(clipping_service_module, "OVERLAY_ASSETS_ROOT", case_dir):
                    with patch.object(clipping_service_module, "_get_podcast_row", return_value={"id": "podcast-123"}):
                        with patch.object(clipping_service_module, "_resolve_source_media_path", return_value=Path("podcast.mp4")):
                            with patch.object(clipping_service_module, "_run_ffmpeg_clip_generation", side_effect=fake_ffmpeg):
                                with patch.object(
                                    clipping_service_module,
                                    "_store_clip_assets",
                                    return_value=("https://example.com/clip.mp4", "https://example.com/clip.srt"),
                                ):
                                    with patch.object(
                                        clipping_service_module.overlay_mapping_service_module,
                                        "detect_overlay_decision",
                                        return_value=overlay,
                                    ):
                                        clips = generate_clips("podcast-123", self.score_segments, self.transcription)

        self.assertEqual(len(clips), 1)
        self.assertEqual(call_count["value"], 2)
        self.assertEqual(clips[0].overlay.render_status, "render_fallback")
        self.assertFalse(clips[0].overlay.rendered)


if __name__ == "__main__":
    unittest.main()
