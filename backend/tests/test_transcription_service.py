from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.models.media import MediaInspectionResult  # noqa: E402
from app.models.transcription import TranscriptWord  # noqa: E402
from app.services.transcription_service import (  # noqa: E402
    APITimeoutError,
    AudioQualityError,
    LanguageNotSupportedError,
    TranscriptionError,
    _build_local_whisper_words,
    _request_transcription,
    transcribe_media,
)


class TranscriptionServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.media_path = BACKEND_ROOT / "tests" / "fixtures" / "sample_transcription_input.fixture"
        self.inspection = MediaInspectionResult(
            duration_seconds=12.5,
            duration_minutes=0.21,
            is_supported=True,
            detected_format="mp4",
            mime_type="video/mp4",
            validation_flags={
                "ffprobe_available": True,
                "file_exists": True,
                "mime_type_supported": True,
                "duration_detected": True,
            },
        )

    @patch("app.services.transcription_service.time.perf_counter", side_effect=[10.0, 12.345])
    @patch("app.services.transcription_service._transcribe_with_openai")
    @patch("app.services.transcription_service.inspect_media")
    def test_transcribe_media_returns_normalized_contract(
        self,
        inspect_media_mock: MagicMock,
        transcribe_with_openai_mock: MagicMock,
        perf_counter_mock: MagicMock,
    ) -> None:
        inspect_media_mock.return_value = self.inspection
        transcribe_with_openai_mock.return_value = (
            "Hello world",
            [
                TranscriptWord(word="Hello", start=0.0, end=0.4, confidence=0.9),
                TranscriptWord(word="world", start=0.5, end=1.0, confidence=0.9),
            ],
            "en",
            "whisper-1",
        )

        result = transcribe_media(self.media_path, model="base")

        self.assertEqual(result.model_used, "whisper-1")
        self.assertEqual(result.detected_language, "en")
        self.assertEqual(result.transcript_text, "Hello world")
        self.assertEqual(result.duration_seconds, 12.5)
        self.assertEqual(len(result.words), 2)
        self.assertEqual(result.words[0].word, "Hello")
        self.assertGreaterEqual(result.words[0].confidence, 0.0)
        self.assertLessEqual(result.words[0].confidence, 1.0)
        self.assertAlmostEqual(result.processing_time_seconds, 2.345, places=3)

    @patch("app.services.transcription_service.time.perf_counter", side_effect=[1.0, 3.0])
    @patch("app.services.transcription_service._transcribe_with_openai")
    @patch("app.services.transcription_service.inspect_media")
    def test_transcribe_media_offsets_words_for_chunked_audio(
        self,
        inspect_media_mock: MagicMock,
        transcribe_with_openai_mock: MagicMock,
        perf_counter_mock: MagicMock,
    ) -> None:
        inspect_media_mock.return_value = MediaInspectionResult(
            duration_seconds=1200.0,
            duration_minutes=20.0,
            is_supported=True,
            detected_format="mp4",
            mime_type="video/mp4",
            validation_flags=self.inspection.validation_flags,
        )
        transcribe_with_openai_mock.return_value = (
            "Hello again",
            [
                TranscriptWord(word="Hello", start=0.1, end=0.5, confidence=0.9),
                TranscriptWord(word="again", start=600.2, end=600.6, confidence=0.8),
            ],
            "en",
            "whisper-1",
        )

        result = transcribe_media(self.media_path)

        self.assertEqual(result.transcript_text, "Hello again")
        self.assertEqual(len(result.words), 2)
        self.assertAlmostEqual(result.words[0].start, 0.1, places=3)
        self.assertAlmostEqual(result.words[1].start, 600.2, places=3)
        self.assertAlmostEqual(result.words[1].end, 600.6, places=3)

    @patch("app.services.transcription_service._transcribe_with_openai")
    @patch("app.services.transcription_service.inspect_media")
    def test_transcribe_media_rejects_non_english_audio(
        self,
        inspect_media_mock: MagicMock,
        transcribe_with_openai_mock: MagicMock,
    ) -> None:
        inspect_media_mock.return_value = self.inspection
        transcribe_with_openai_mock.side_effect = LanguageNotSupportedError("de")

        with self.assertRaises(LanguageNotSupportedError):
            transcribe_media(self.media_path)

    @patch("app.services.transcription_service._transcribe_with_openai")
    @patch("app.services.transcription_service.inspect_media")
    def test_transcribe_media_raises_audio_quality_error_for_missing_words(
        self,
        inspect_media_mock: MagicMock,
        transcribe_with_openai_mock: MagicMock,
    ) -> None:
        inspect_media_mock.return_value = self.inspection
        transcribe_with_openai_mock.side_effect = AudioQualityError(
            "The transcription completed, but no word-level timestamps were returned."
        )

        with self.assertRaises(AudioQualityError):
            transcribe_media(self.media_path)

    @patch("app.services.transcription_service.time.perf_counter", side_effect=[5.0, 7.0])
    @patch("app.services.transcription_service._transcribe_with_local_whisper")
    @patch("app.services.transcription_service._transcribe_with_openai")
    @patch("app.services.transcription_service.inspect_media")
    def test_transcribe_media_falls_back_to_local_whisper_on_api_limit(
        self,
        inspect_media_mock: MagicMock,
        transcribe_with_openai_mock: MagicMock,
        transcribe_with_local_whisper_mock: MagicMock,
        perf_counter_mock: MagicMock,
    ) -> None:
        inspect_media_mock.return_value = self.inspection
        transcribe_with_openai_mock.side_effect = TranscriptionError(
            "OpenAI transcription rate limit or quota was exceeded.",
            code="transcription_api_limit",
            status_code=429,
        )
        transcribe_with_local_whisper_mock.return_value = (
            "Hello from local whisper",
            [TranscriptWord(word="Hello", start=0.0, end=0.4, confidence=0.8)],
            "en",
            "local-whisper-base",
        )

        result = transcribe_media(self.media_path)
        self.assertEqual(result.model_used, "local-whisper-base")
        self.assertEqual(result.transcript_text, "Hello from local whisper")
        self.assertEqual(len(result.words), 1)
        transcribe_with_local_whisper_mock.assert_called_once()

    def test_request_transcription_maps_openai_timeout(self) -> None:
        external_timeout = type("APITimeoutError", (Exception,), {})
        client = SimpleNamespace(
            audio=SimpleNamespace(
                transcriptions=SimpleNamespace(
                    create=MagicMock(side_effect=external_timeout("timed out"))
                )
            )
        )

        with self.assertRaises(APITimeoutError):
            _request_transcription(client, self.media_path, model="whisper-1")

    def test_build_local_whisper_words_falls_back_to_segment_timings(self) -> None:
        payload = {
            "segments": [
                {
                    "start": 0.0,
                    "end": 2.0,
                    "text": "Hello there general kenobi",
                }
            ]
        }

        words = _build_local_whisper_words(payload)

        self.assertEqual(len(words), 4)
        self.assertEqual(words[0].word, "Hello")
        self.assertGreater(words[-1].end, words[-1].start)
        self.assertAlmostEqual(words[0].start, 0.0, places=3)


if __name__ == "__main__":
    unittest.main()
