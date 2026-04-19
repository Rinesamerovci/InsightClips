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
from app.models.transcription import TranscriptionResult, TranscriptWord  # noqa: E402
from app.routers.podcasts import analyze_podcast  # noqa: E402


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


if __name__ == "__main__":
    unittest.main()
