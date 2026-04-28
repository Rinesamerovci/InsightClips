from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import BackgroundTasks, HTTPException

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.dependencies.auth import AuthenticatedUser  # noqa: E402
from app.models.analysis import AnalysisResult, AnalyzePodcastRequest, ScoreSegment  # noqa: E402
from app.models.clipping import ClipGenerationResult, ClipResult, GenerateClipsRequest  # noqa: E402
from app.models.export_settings import ExportSettings  # noqa: E402
from app.models.transcription import TranscriptionResult, TranscriptWord  # noqa: E402
from app.routers.podcasts import analyze_podcast, generate_podcast_clips, get_podcast_clips  # noqa: E402


class PodcastAnalysisRouterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.user = AuthenticatedUser(
            id="user-123",
            email="rinesa@example.com",
            free_trial_used=False,
        )
        self.payload = AnalyzePodcastRequest(
            transcription=TranscriptionResult(
                transcript_text="This clip explains the viral hook.",
                duration_seconds=16.0,
                detected_language="en",
                words=[
                    TranscriptWord(word="This", start=0.0, end=0.2, confidence=0.9),
                    TranscriptWord(word="clip", start=0.21, end=0.4, confidence=0.9),
                ],
                model_used="whisper-1",
                processing_time_seconds=0.8,
            )
        )

    @patch("app.routers.podcasts.generate_clips")
    @patch("app.routers.podcasts.persist_analysis_result")
    @patch("app.routers.podcasts.build_analysis_result")
    @patch("app.routers.podcasts.analyze_and_score")
    @patch("app.routers.podcasts.update_podcast_status_for_user")
    @patch("app.routers.podcasts.podcast_belongs_to_user", return_value=True)
    def test_generate_podcast_clips_returns_generated_assets(
        self,
        podcast_belongs_mock,
        update_status_mock,
        analyze_and_score_mock,
        build_analysis_result_mock,
        persist_analysis_result_mock,
        generate_clips_mock,
    ) -> None:
        analyze_and_score_mock.return_value = [
            ScoreSegment(
                segment_start_seconds=0.0,
                segment_end_seconds=12.0,
                duration_seconds=12.0,
                virality_score=82.4,
                transcript_snippet="A strong subtitle line",
                sentiment="positive",
                keywords=["clip"],
            )
        ]
        build_analysis_result_mock.return_value = {"podcast_id": "podcast-123"}
        generate_clips_mock.return_value = [
            ClipResult(
                id="clip-1",
                clip_number=1,
                clip_start_seconds=0.0,
                clip_end_seconds=12.0,
                duration_seconds=12.0,
                virality_score=82.4,
                video_url="https://example.com/clip-1.mp4",
                subtitle_text="A strong subtitle line",
                status="ready",
                export_settings=ExportSettings(export_mode="portrait", crop_mode="center_crop"),
            )
        ]

        result = asyncio.run(
            generate_podcast_clips(
                "podcast-123",
                GenerateClipsRequest(
                    score_segments=[
                        ScoreSegment(
                            segment_start_seconds=0.0,
                            segment_end_seconds=12.0,
                            duration_seconds=12.0,
                            virality_score=82.4,
                            transcript_snippet="A strong subtitle line",
                            sentiment="positive",
                            keywords=["clip"],
                        )
                    ],
                    transcription=self.payload.transcription,
                    export_settings={"export_mode": "portrait"},
                ),
                self.user,
            )
        )

        self.assertIsInstance(result, ClipGenerationResult)
        self.assertEqual(result.total_clips_generated, 1)
        self.assertEqual(result.export_settings.export_mode, "portrait")
        podcast_belongs_mock.assert_called_once_with("podcast-123", "user-123")
        update_status_mock.assert_any_call("podcast-123", "user-123", "processing")
        update_status_mock.assert_any_call("podcast-123", "user-123", "done")
        generate_clips_mock.assert_called_once()
        self.assertEqual(generate_clips_mock.call_args.args[3].resolve().export_mode, "portrait")
        analyze_and_score_mock.assert_not_called()
        persist_analysis_result_mock.assert_not_called()

    @patch("app.routers.podcasts.generate_clips")
    @patch("app.routers.podcasts.persist_analysis_result")
    @patch("app.routers.podcasts.build_analysis_result")
    @patch("app.routers.podcasts.transcribe_podcast_media_for_user")
    @patch("app.routers.podcasts.get_scored_segments_for_podcast")
    @patch("app.routers.podcasts.update_podcast_status_for_user")
    @patch("app.routers.podcasts.podcast_belongs_to_user", return_value=True)
    def test_generate_podcast_clips_reuses_existing_scores_without_retranscribing(
        self,
        podcast_belongs_mock,
        update_status_mock,
        get_scored_segments_mock,
        transcribe_podcast_mock,
        build_analysis_result_mock,
        persist_analysis_result_mock,
        generate_clips_mock,
    ) -> None:
        get_scored_segments_mock.return_value = [
            ScoreSegment(
                segment_start_seconds=5.0,
                segment_end_seconds=35.0,
                duration_seconds=30.0,
                virality_score=88.0,
                transcript_snippet="refreshed segment",
                sentiment="positive",
                keywords=["refresh"],
            )
        ]
        generate_clips_mock.return_value = [
            ClipResult(
                id="clip-1",
                clip_number=1,
                clip_start_seconds=5.0,
                clip_end_seconds=35.0,
                duration_seconds=30.0,
                virality_score=88.0,
                video_url="https://example.com/clip-1.mp4",
                subtitle_text="refreshed segment",
                status="ready",
            )
        ]

        result = asyncio.run(
            generate_podcast_clips(
                "podcast-123",
                GenerateClipsRequest(),
                self.user,
            )
        )

        self.assertEqual(result.total_clips_generated, 1)
        get_scored_segments_mock.assert_called_once_with("podcast-123", limit=5)
        transcribe_podcast_mock.assert_not_called()
        self.assertIsNone(generate_clips_mock.call_args.args[2])
        build_analysis_result_mock.assert_not_called()
        persist_analysis_result_mock.assert_not_called()

    @patch("app.routers.podcasts.generate_clips")
    @patch("app.routers.podcasts.persist_analysis_result")
    @patch("app.routers.podcasts.build_analysis_result")
    @patch("app.routers.podcasts.analyze_and_score")
    @patch("app.routers.podcasts.transcribe_podcast_media_for_user")
    @patch("app.routers.podcasts.get_scored_segments_for_podcast")
    @patch("app.routers.podcasts.update_podcast_status_for_user")
    @patch("app.routers.podcasts.podcast_belongs_to_user", return_value=True)
    def test_generate_podcast_clips_refreshes_oversized_segments(
        self,
        podcast_belongs_mock,
        update_status_mock,
        get_scored_segments_mock,
        transcribe_podcast_mock,
        analyze_and_score_mock,
        build_analysis_result_mock,
        persist_analysis_result_mock,
        generate_clips_mock,
    ) -> None:
        get_scored_segments_mock.return_value = [
            ScoreSegment(
                segment_start_seconds=0.0,
                segment_end_seconds=120.0,
                duration_seconds=120.0,
                virality_score=90.0,
                transcript_snippet="oversized",
                sentiment="neutral",
                keywords=[],
            )
        ]
        transcribe_podcast_mock.return_value = self.payload.transcription
        analyze_and_score_mock.return_value = [
            ScoreSegment(
                segment_start_seconds=5.0,
                segment_end_seconds=35.0,
                duration_seconds=30.0,
                virality_score=88.0,
                transcript_snippet="refreshed segment",
                sentiment="positive",
                keywords=["refresh"],
            )
        ]
        build_analysis_result_mock.return_value = {"podcast_id": "podcast-123"}
        generate_clips_mock.return_value = [
            ClipResult(
                id="clip-1",
                clip_number=1,
                clip_start_seconds=5.0,
                clip_end_seconds=35.0,
                duration_seconds=30.0,
                virality_score=88.0,
                video_url="https://example.com/clip-1.mp4",
                subtitle_text="refreshed segment",
                status="ready",
            )
        ]

        result = asyncio.run(
            generate_podcast_clips(
                "podcast-123",
                GenerateClipsRequest(),
                self.user,
            )
        )

        self.assertEqual(result.total_clips_generated, 1)
        get_scored_segments_mock.assert_called_once_with("podcast-123", limit=5)
        transcribe_podcast_mock.assert_called_once_with("podcast-123", "user-123", model="base")
        analyze_and_score_mock.assert_called_once_with("podcast-123", self.payload.transcription)
        build_analysis_result_mock.assert_called_once()
        persist_analysis_result_mock.assert_called_once()

    @patch("app.routers.podcasts.persist_analysis_result")
    @patch("app.routers.podcasts.build_analysis_result")
    @patch("app.routers.podcasts.analyze_and_score")
    @patch("app.routers.podcasts.update_podcast_status_for_user")
    @patch("app.routers.podcasts.podcast_belongs_to_user", return_value=True)
    def test_analyze_podcast_returns_analysis_result(
        self,
        podcast_belongs_mock,
        update_status_mock,
        analyze_and_score_mock,
        build_analysis_result_mock,
        persist_analysis_result_mock,
    ) -> None:
        analyze_and_score_mock.return_value = [
            ScoreSegment(
                segment_start_seconds=0.0,
                segment_end_seconds=16.0,
                duration_seconds=16.0,
                virality_score=81.2,
                transcript_snippet="This clip explains the viral hook.",
                sentiment="positive",
                keywords=["viral", "hook"],
            )
        ]
        build_analysis_result_mock.return_value = AnalysisResult(
            podcast_id="podcast-123",
            total_segments_analyzed=1,
            top_scoring_segments=[
                ScoreSegment(
                    segment_start_seconds=0.0,
                    segment_end_seconds=16.0,
                    duration_seconds=16.0,
                    virality_score=81.2,
                    transcript_snippet="This clip explains the viral hook.",
                    sentiment="positive",
                    keywords=["viral", "hook"],
                )
            ],
            average_score=73.1,
            processing_time_seconds=0.23,
        )

        background_tasks = BackgroundTasks()
        result = asyncio.run(
            analyze_podcast(
                "podcast-123",
                self.payload,
                background_tasks,
                self.user,
            )
        )

        self.assertEqual(result.podcast_id, "podcast-123")
        podcast_belongs_mock.assert_called_once_with("podcast-123", "user-123")
        update_status_mock.assert_any_call("podcast-123", "user-123", "processing")
        update_status_mock.assert_any_call("podcast-123", "user-123", "done")
        analyze_and_score_mock.assert_called_once()
        build_analysis_result_mock.assert_called_once()
        self.assertEqual(len(background_tasks.tasks), 1)
        asyncio.run(background_tasks.tasks[0]())
        persist_analysis_result_mock.assert_called_once()

    @patch("app.routers.podcasts.persist_analysis_result")
    @patch("app.routers.podcasts.build_analysis_result")
    @patch("app.routers.podcasts.analyze_and_score")
    @patch("app.routers.podcasts.transcribe_podcast_media_for_user")
    @patch("app.routers.podcasts.update_podcast_status_for_user")
    @patch("app.routers.podcasts.podcast_belongs_to_user", return_value=True)
    def test_analyze_podcast_can_transcribe_when_request_omits_transcription(
        self,
        podcast_belongs_mock,
        update_status_mock,
        transcribe_podcast_mock,
        analyze_and_score_mock,
        build_analysis_result_mock,
        persist_analysis_result_mock,
    ) -> None:
        transcribe_podcast_mock.return_value = self.payload.transcription
        analyze_and_score_mock.return_value = []
        build_analysis_result_mock.return_value = AnalysisResult(
            podcast_id="podcast-123",
            total_segments_analyzed=0,
            top_scoring_segments=[],
            average_score=0,
            processing_time_seconds=0.2,
        )

        background_tasks = BackgroundTasks()
        result = asyncio.run(
            analyze_podcast(
                "podcast-123",
                AnalyzePodcastRequest(),
                background_tasks,
                self.user,
            )
        )

        self.assertEqual(result.podcast_id, "podcast-123")
        update_status_mock.assert_any_call("podcast-123", "user-123", "processing")
        update_status_mock.assert_any_call("podcast-123", "user-123", "done")
        transcribe_podcast_mock.assert_called_once_with("podcast-123", "user-123", model="base")
        analyze_and_score_mock.assert_called_once()
        self.assertEqual(len(background_tasks.tasks), 1)
        asyncio.run(background_tasks.tasks[0]())
        persist_analysis_result_mock.assert_called_once()

    @patch("app.routers.podcasts.podcast_belongs_to_user", return_value=False)
    def test_analyze_podcast_returns_404_for_missing_podcast(self, podcast_belongs_mock) -> None:
        background_tasks = BackgroundTasks()

        with self.assertRaises(HTTPException) as exc_info:
            asyncio.run(
                analyze_podcast(
                    "podcast-404",
                    self.payload,
                    background_tasks,
                    self.user,
                )
            )

        self.assertEqual(exc_info.exception.status_code, 404)
        self.assertIn("Podcast not found", exc_info.exception.detail)
        podcast_belongs_mock.assert_called_once_with("podcast-404", "user-123")

    @patch("app.routers.podcasts.get_analysis_summary_for_podcast")
    @patch("app.routers.podcasts.podcast_belongs_to_user", return_value=True)
    def test_get_podcast_analysis_returns_summary(self, podcast_belongs_mock, get_summary_mock) -> None:
        get_summary_mock.return_value = {
            "podcast_id": "podcast-123",
            "total_scored_segments": 2,
            "highest_score": 87.5,
            "top_segments": [],
        }

        from app.routers.podcasts import get_podcast_analysis

        result = asyncio.run(get_podcast_analysis("podcast-123", self.user))

        self.assertEqual(result["podcast_id"], "podcast-123")
        podcast_belongs_mock.assert_called_once_with("podcast-123", "user-123")
        get_summary_mock.assert_called_once_with("podcast-123")

    @patch("app.routers.podcasts.podcast_belongs_to_user", return_value=False)
    def test_generate_podcast_clips_returns_404_for_missing_podcast(self, podcast_belongs_mock) -> None:
        with self.assertRaises(HTTPException) as exc_info:
            asyncio.run(
                generate_podcast_clips(
                    "podcast-404",
                    GenerateClipsRequest(),
                    self.user,
                )
            )

        self.assertEqual(exc_info.exception.status_code, 404)
        podcast_belongs_mock.assert_called_once_with("podcast-404", "user-123")

    @patch("app.routers.podcasts.get_clips_for_podcast", return_value=None)
    @patch("app.routers.podcasts.podcast_belongs_to_user", return_value=True)
    def test_get_podcast_clips_returns_empty_result_when_none_generated(
        self,
        podcast_belongs_mock,
        get_clips_mock,
    ) -> None:
        result = asyncio.run(get_podcast_clips("podcast-123", self.user))

        self.assertEqual(result.podcast_id, "podcast-123")
        self.assertEqual(result.total_clips_generated, 0)
        self.assertEqual(result.clips, [])
        podcast_belongs_mock.assert_called_once_with("podcast-123", "user-123")
        get_clips_mock.assert_called_once_with("podcast-123")


if __name__ == "__main__":
    unittest.main()
