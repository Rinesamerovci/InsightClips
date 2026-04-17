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
from app.services.transcription_service import (  # noqa: E402
    APITimeoutError,
    AudioQualityError,
    LanguageNotSupportedError,
    TranscriptionChunk,
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
    @patch("app.services.transcription_service._request_transcription")
    @patch("app.services.transcription_service._build_openai_client")
    @patch("app.services.transcription_service.inspect_media")
    def test_transcribe_media_returns_normalized_contract(
        self,
        inspect_media_mock: MagicMock,
        build_openai_client_mock: MagicMock,
        request_transcription_mock: MagicMock,
        perf_counter_mock: MagicMock,
    ) -> None:
        inspect_media_mock.return_value = self.inspection
        build_openai_client_mock.return_value = object()
        request_transcription_mock.return_value = {
            "text": "Hello world",
            "language": "english",
            "words": [
                {"word": "Hello", "start": 0.0, "end": 0.4},
                {"word": "world", "start": 0.5, "end": 1.0},
            ],
            "segments": [
                {
                    "start": 0.0,
                    "end": 1.0,
                    "avg_logprob": -0.1,
                    "no_speech_prob": 0.02,
                }
            ],
        }

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
    @patch("app.services.transcription_service._build_chunk_files")
    @patch("app.services.transcription_service._requires_chunking", return_value=True)
    @patch("app.services.transcription_service._request_transcription")
    @patch("app.services.transcription_service._build_openai_client")
    @patch("app.services.transcription_service.inspect_media")
    def test_transcribe_media_offsets_words_for_chunked_audio(
        self,
        inspect_media_mock: MagicMock,
        build_openai_client_mock: MagicMock,
        request_transcription_mock: MagicMock,
        requires_chunking_mock: MagicMock,
        build_chunk_files_mock: MagicMock,
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
        build_openai_client_mock.return_value = object()
        build_chunk_files_mock.return_value = [
            TranscriptionChunk(path=self.media_path, offset_seconds=0.0, duration_seconds=600.0),
            TranscriptionChunk(path=self.media_path, offset_seconds=600.0, duration_seconds=600.0),
        ]
        request_transcription_mock.side_effect = [
            {
                "text": "Hello",
                "language": "en",
                "words": [{"word": "Hello", "start": 0.1, "end": 0.5, "confidence": 0.9}],
                "segments": [{"start": 0.0, "end": 1.0}],
            },
            {
                "text": "again",
                "language": "en",
                "words": [{"word": "again", "start": 0.2, "end": 0.6, "confidence": 0.8}],
                "segments": [{"start": 0.0, "end": 1.0}],
            },
        ]

        result = transcribe_media(self.media_path)

        self.assertEqual(result.transcript_text, "Hello again")
        self.assertEqual(len(result.words), 2)
        self.assertAlmostEqual(result.words[0].start, 0.1, places=3)
        self.assertAlmostEqual(result.words[1].start, 600.2, places=3)
        self.assertAlmostEqual(result.words[1].end, 600.6, places=3)

    @patch("app.services.transcription_service._request_transcription")
    @patch("app.services.transcription_service._build_openai_client")
    @patch("app.services.transcription_service.inspect_media")
    def test_transcribe_media_rejects_non_english_audio(
        self,
        inspect_media_mock: MagicMock,
        build_openai_client_mock: MagicMock,
        request_transcription_mock: MagicMock,
    ) -> None:
        inspect_media_mock.return_value = self.inspection
        build_openai_client_mock.return_value = object()
        request_transcription_mock.return_value = {
            "text": "Guten tag",
            "language": "de",
            "words": [{"word": "Guten", "start": 0.0, "end": 0.4}],
            "segments": [{"start": 0.0, "end": 1.0}],
        }

        with self.assertRaises(LanguageNotSupportedError):
            transcribe_media(self.media_path)

    @patch("app.services.transcription_service._request_transcription")
    @patch("app.services.transcription_service._build_openai_client")
    @patch("app.services.transcription_service.inspect_media")
    def test_transcribe_media_raises_audio_quality_error_for_missing_words(
        self,
        inspect_media_mock: MagicMock,
        build_openai_client_mock: MagicMock,
        request_transcription_mock: MagicMock,
    ) -> None:
        inspect_media_mock.return_value = self.inspection
        build_openai_client_mock.return_value = object()
        request_transcription_mock.return_value = {
            "text": "Hello world",
            "language": "en",
            "words": [],
            "segments": [{"start": 0.0, "end": 1.0}],
        }

        with self.assertRaises(AudioQualityError):
            transcribe_media(self.media_path)

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


if __name__ == "__main__":
    unittest.main()
