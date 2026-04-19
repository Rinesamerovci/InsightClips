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
    score_segments_need_refresh,
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
        sentences = [
            "This exact hook helped us go from 0 to 10000 users in 30 days and changed our entire growth strategy forever.",
            "Why did this strategy go viral because the story felt authentic surprising emotional and impossible to ignore for the audience watching it.",
            "Here is the founder secret nobody tells you about audience growth and why this truth creates a stronger podcast hook every single time.",
            "What made this podcast explode was a clear emotional hook a bold truth and a crazy story that kept the audience watching longer.",
            "This behind the scenes mistake became our biggest growth breakthrough and turned a problem into a viral lesson for the entire team.",
        ]
        words: list[TranscriptWord] = []
        cursor = 0.0
        for sentence in sentences:
            sentence_words = sentence.split()
            for token in sentence_words:
                end = cursor + 0.48
                words.append(TranscriptWord(word=token, start=round(cursor, 2), end=round(end, 2), confidence=0.9))
                cursor = end + 0.08
            cursor += 1.6

        self.multi_segment_transcription = TranscriptionResult(
            transcript_text=" ".join(sentences),
            duration_seconds=round(words[-1].end, 2),
            detected_language="en",
            words=words,
            model_used="whisper-1",
            processing_time_seconds=1.5,
        )

    def _build_long_form_transcription(self) -> TranscriptionResult:
        filler_sentence = (
            "This section explains a practical workflow for teams building a podcast editing system with clear examples and repeatable guidance."
        )
        highlight_sentences = [
            "This exact viral hook helped us go from 0 to 10000 users in 30 days and became our biggest growth breakthrough.",
            "Why did this founder story explode because the emotional truth was surprising authentic and impossible for the audience to ignore.",
            "Here is the secret nobody tells you about audience growth this bold mistake turned into our strongest podcast moment ever.",
            "What made this episode go viral was a crazy behind the scenes lesson with a sharp hook a clear truth and a memorable payoff.",
            "This strategy changed everything for our audience growth and revealed the exact algorithm lesson creators need to hear right now.",
        ]

        words: list[TranscriptWord] = []
        cursor = 0.0

        for segment_index in range(120):
            sentence = highlight_sentences[segment_index // 24] if segment_index % 24 == 0 else filler_sentence
            token_cursor = cursor
            for token in sentence.split():
                end = token_cursor + 0.42
                words.append(
                    TranscriptWord(
                        word=token,
                        start=round(token_cursor, 2),
                        end=round(end, 2),
                        confidence=0.9,
                    )
                )
                token_cursor = end + 0.08
            cursor += 30.0

        return TranscriptionResult(
            transcript_text=" ".join(highlight_sentences + [filler_sentence] * 8),
            duration_seconds=3600.0,
            detected_language="en",
            words=words,
            model_used="whisper-1",
            processing_time_seconds=4.2,
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

        with self.assertRaises(AnalysisError) as exc_info:
            analyze_and_score("podcast-789", empty_transcription)

        self.assertIn("word-level timestamps", exc_info.exception.detail)

    def test_analyze_and_score_rejects_blank_podcast_id(self) -> None:
        with self.assertRaises(AnalysisError) as exc_info:
            analyze_and_score("   ", self.transcription)

        self.assertEqual(exc_info.exception.status_code, 400)
        self.assertIn("Podcast id is required", exc_info.exception.detail)

    def test_multi_segment_analysis_surfaces_multiple_high_scoring_highlights(self) -> None:
        segments = analyze_and_score("podcast-999", self.multi_segment_transcription)
        result = build_analysis_result("podcast-999", segments, processing_time_seconds=0.35)

        strong_segments = [segment for segment in result.top_scoring_segments if segment.virality_score >= 70]
        self.assertGreaterEqual(len(strong_segments), 3)
        self.assertLessEqual(len(result.top_scoring_segments), 5)
        chronological_segments = sorted(
            result.all_scored_segments,
            key=lambda item: item.segment_start_seconds,
        )
        for previous, current in zip(chronological_segments, chronological_segments[1:]):
            self.assertLessEqual(previous.segment_end_seconds, current.segment_start_seconds)
        self.assertTrue(all(segment.duration_seconds <= 45.0 for segment in result.all_scored_segments))

    def test_score_segments_need_refresh_flags_oversized_segments(self) -> None:
        segments = [
            analysis_service_module.ScoreSegment(
                segment_start_seconds=0.0,
                segment_end_seconds=120.0,
                duration_seconds=120.0,
                virality_score=90.0,
                transcript_snippet="oversized segment",
                sentiment="neutral",
                keywords=[],
            )
        ]

        self.assertTrue(score_segments_need_refresh(segments))

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

    def test_sixty_minute_transcript_benchmark_and_top_segments(self) -> None:
        long_transcription = self._build_long_form_transcription()

        import time

        started_at = time.perf_counter()
        segments = analyze_and_score("podcast-60m", long_transcription)
        elapsed = time.perf_counter() - started_at
        result = build_analysis_result("podcast-60m", segments, processing_time_seconds=elapsed)

        self.assertLess(elapsed, 300.0)
        self.assertGreaterEqual(len(result.top_scoring_segments), 3)
        strong_segments = [segment for segment in result.top_scoring_segments[:5] if segment.virality_score >= 70]
        self.assertGreaterEqual(len(strong_segments), 3)


if __name__ == "__main__":
    unittest.main()
