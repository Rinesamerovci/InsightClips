from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.models.transcription import TranscriptWord, TranscriptionResult  # noqa: E402
import app.services.analysis_service as analysis_service_module  # noqa: E402
from app.services.analysis_service import (  # noqa: E402
    AnalysisError,
    analyze_and_score,
    build_analysis_result,
    persist_analysis_result,
)


class AnalysisServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.transcription = TranscriptionResult(
            transcript_text=(
                "This is the exact growth strategy that helped us go from 0 to 10000 users in 30 days. "
                "Why did this clip go viral? Because the hook was emotional, clear, and surprising."
            ),
            duration_seconds=28.0,
            detected_language="en",
            words=[
                TranscriptWord(word="This", start=0.0, end=0.3, confidence=0.9),
                TranscriptWord(word="is", start=0.31, end=0.45, confidence=0.9),
                TranscriptWord(word="the", start=0.46, end=0.6, confidence=0.9),
                TranscriptWord(word="exact", start=0.61, end=0.92, confidence=0.9),
                TranscriptWord(word="growth", start=0.93, end=1.25, confidence=0.9),
                TranscriptWord(word="strategy", start=1.26, end=1.75, confidence=0.9),
                TranscriptWord(word="that", start=1.76, end=1.99, confidence=0.9),
                TranscriptWord(word="helped", start=2.0, end=2.37, confidence=0.9),
                TranscriptWord(word="us", start=2.38, end=2.52, confidence=0.9),
                TranscriptWord(word="go", start=2.53, end=2.72, confidence=0.9),
                TranscriptWord(word="from", start=2.73, end=2.95, confidence=0.9),
                TranscriptWord(word="0", start=2.96, end=3.02, confidence=0.9),
                TranscriptWord(word="to", start=3.03, end=3.11, confidence=0.9),
                TranscriptWord(word="10000", start=3.12, end=3.45, confidence=0.9),
                TranscriptWord(word="users", start=3.46, end=3.82, confidence=0.9),
                TranscriptWord(word="in", start=3.83, end=3.96, confidence=0.9),
                TranscriptWord(word="30", start=3.97, end=4.15, confidence=0.9),
                TranscriptWord(word="days.", start=4.16, end=4.45, confidence=0.9),
                TranscriptWord(word="Why", start=6.1, end=6.38, confidence=0.9),
                TranscriptWord(word="did", start=6.39, end=6.56, confidence=0.9),
                TranscriptWord(word="this", start=6.57, end=6.78, confidence=0.9),
                TranscriptWord(word="clip", start=6.79, end=7.05, confidence=0.9),
                TranscriptWord(word="go", start=7.06, end=7.24, confidence=0.9),
                TranscriptWord(word="viral?", start=7.25, end=7.7, confidence=0.9),
                TranscriptWord(word="Because", start=7.71, end=8.11, confidence=0.9),
                TranscriptWord(word="the", start=8.12, end=8.25, confidence=0.9),
                TranscriptWord(word="hook", start=8.26, end=8.53, confidence=0.9),
                TranscriptWord(word="was", start=8.54, end=8.72, confidence=0.9),
                TranscriptWord(word="emotional,", start=8.73, end=9.18, confidence=0.9),
                TranscriptWord(word="clear,", start=9.19, end=9.45, confidence=0.9),
                TranscriptWord(word="and", start=9.46, end=9.58, confidence=0.9),
                TranscriptWord(word="surprising.", start=9.59, end=10.09, confidence=0.9),
            ],
            model_used="whisper-1",
            processing_time_seconds=1.1,
        )

    def test_analyze_and_score_returns_ranked_segments(self) -> None:
        segments = analyze_and_score("podcast-123", self.transcription)
        result = build_analysis_result("podcast-123", segments, processing_time_seconds=0.25)

        self.assertEqual(result.podcast_id, "podcast-123")
        self.assertGreaterEqual(result.total_segments_analyzed, 1)
        self.assertGreater(result.average_score, 0)
        self.assertLessEqual(len(result.top_scoring_segments), 5)
        self.assertGreaterEqual(result.top_scoring_segments[0].virality_score, 70)
        self.assertEqual(result.total_segments_analyzed, len(result.all_scored_segments))
        self.assertIn(result.top_scoring_segments[0].sentiment, {"positive", "neutral", "negative"})
        self.assertTrue(result.top_scoring_segments[0].keywords)

    def test_analyze_and_score_keeps_segments_non_overlapping(self) -> None:
        segments = analyze_and_score("podcast-456", self.transcription)
        result = build_analysis_result("podcast-456", segments, processing_time_seconds=0.2)

        segments = sorted(
            result.top_scoring_segments,
            key=lambda item: item.segment_start_seconds,
        )
        for previous, current in zip(segments, segments[1:]):
            self.assertLessEqual(previous.segment_end_seconds, current.segment_start_seconds)

    def test_analyze_and_score_rejects_missing_word_timestamps(self) -> None:
        empty_transcription = self.transcription.model_copy(update={"words": []})

        with self.assertRaises(AnalysisError):
            analyze_and_score("podcast-789", empty_transcription)

    def test_persist_analysis_result_writes_top_segments(self) -> None:
        result = build_analysis_result(
            "podcast-123",
            analyze_and_score("podcast-123", self.transcription),
            processing_time_seconds=0.4,
        )
        service_supabase_mock = MagicMock()
        delete_execute_mock = MagicMock()
        delete_chain = SimpleNamespace(execute=delete_execute_mock)
        delete_mock = MagicMock(return_value=SimpleNamespace(eq=MagicMock(return_value=delete_chain)))
        insert_mock = MagicMock(return_value=SimpleNamespace(execute=MagicMock()))
        service_supabase_mock.table = MagicMock(
            return_value=SimpleNamespace(
                delete=delete_mock,
                insert=insert_mock,
            )
        )

        with patch.object(analysis_service_module, "service_supabase", service_supabase_mock):
            persist_analysis_result(result)

        self.assertEqual(service_supabase_mock.table.call_count, 2)
        payload = insert_mock.call_args.args[0]
        self.assertEqual(len(payload), len(result.all_scored_segments))
        self.assertEqual(payload[0]["podcast_id"], "podcast-123")


if __name__ == "__main__":
    unittest.main()
