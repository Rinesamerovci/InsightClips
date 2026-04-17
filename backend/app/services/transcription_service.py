from __future__ import annotations

import math
import shutil
import subprocess
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.models.transcription import TranscriptWord, TranscriptionResult
from app.utils.media import inspect_media

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover - exercised through service error handling
    OpenAI = None

try:
    import whisper
except ImportError:  # pragma: no cover - optional local fallback
    whisper = None


OPENAI_MAX_UPLOAD_BYTES = 24 * 1024 * 1024
PCM16_MONO_16KHZ_BYTES_PER_SECOND = 32_000
SAFE_MAX_WAV_CHUNK_SECONDS = int((OPENAI_MAX_UPLOAD_BYTES - 64 * 1024) / PCM16_MONO_16KHZ_BYTES_PER_SECOND)
WORD_ALIGNMENT_TOLERANCE_SECONDS = 0.1

# The issue uses legacy Whisper size names; map them onto current API models.
MODEL_ALIASES: dict[str, str] = {
    "tiny": "gpt-4o-mini-transcribe",
    "base": "whisper-1",
    "small": "gpt-4o-mini-transcribe",
    "medium": "gpt-4o-transcribe",
}

SUPPORTED_API_MODELS = {
    "gpt-4o-mini-transcribe",
    "gpt-4o-transcribe",
    "whisper-1",
}

ENGLISH_LANGUAGE_ALIASES = {
    "en",
    "en-us",
    "en-gb",
    "english",
}


class TranscriptionError(Exception):
    def __init__(
        self,
        detail: str,
        *,
        code: str = "transcription_error",
        status_code: int = 422,
    ) -> None:
        super().__init__(detail)
        self.detail = detail
        self.code = code
        self.status_code = status_code


class WhisperNotAvailableError(TranscriptionError):
    def __init__(self, detail: str = "OpenAI transcription is not configured or unavailable.") -> None:
        super().__init__(detail, code="whisper_not_available", status_code=503)


class AudioQualityError(TranscriptionError):
    def __init__(self, detail: str = "Audio quality is too poor for reliable transcription.") -> None:
        super().__init__(detail, code="audio_quality_error", status_code=422)


class APITimeoutError(TranscriptionError):
    def __init__(self, detail: str = "Transcription request timed out.") -> None:
        super().__init__(detail, code="api_timeout", status_code=504)


class LanguageNotSupportedError(TranscriptionError):
    def __init__(self, language: str) -> None:
        super().__init__(
            f"Only English transcription is supported in Sprint 3. Detected language: {language}.",
            code="language_not_supported",
            status_code=422,
        )


@dataclass(frozen=True)
class TranscriptionChunk:
    path: Path
    offset_seconds: float
    duration_seconds: float


def resolve_transcription_model(model: str) -> str:
    normalized = model.strip().lower()
    if not normalized:
        raise TranscriptionError("A transcription model must be provided.", code="invalid_model", status_code=400)

    resolved = MODEL_ALIASES.get(normalized, normalized)
    if resolved not in SUPPORTED_API_MODELS:
        supported = ", ".join(sorted(SUPPORTED_API_MODELS | set(MODEL_ALIASES)))
        raise TranscriptionError(
            f"Unsupported transcription model '{model}'. Supported values: {supported}.",
            code="invalid_model",
            status_code=400,
        )
    return resolved


def build_ffmpeg_chunk_command(
    file_path: Path,
    output_path: Path,
    *,
    start_seconds: float,
    duration_seconds: float,
) -> list[str]:
    return [
        "ffmpeg",
        "-v",
        "error",
        "-nostdin",
        "-y",
        "-i",
        str(file_path),
        "-ss",
        f"{start_seconds:.3f}",
        "-t",
        f"{duration_seconds:.3f}",
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        str(output_path),
    ]


def transcribe_media(file_path: Path, model: str = "base") -> TranscriptionResult:
    start_time = time.perf_counter()
    resolved_path = file_path.expanduser().resolve()
    if not resolved_path.exists() or not resolved_path.is_file():
        raise TranscriptionError(
            f"Media file not found: {resolved_path}",
            code="media_file_not_found",
            status_code=404,
        )

    inspection = inspect_media(resolved_path)
    try:
        resolved_model = resolve_transcription_model(model)
        transcript_text, all_words, detected_language, model_used = _transcribe_with_openai(
            resolved_path,
            resolved_model=resolved_model,
            duration_seconds=inspection.duration_seconds,
        )
    except TranscriptionError as exc:
        if not _should_fallback_to_local_whisper(exc):
            raise
        transcript_text, all_words, detected_language, model_used = _transcribe_with_local_whisper(
            resolved_path,
            requested_model=model,
        )

    processing_time_seconds = round(time.perf_counter() - start_time, 3)
    if not transcript_text:
        raise AudioQualityError("Transcription result was empty after combining chunk output.")

    return TranscriptionResult(
        transcript_text=transcript_text,
        duration_seconds=inspection.duration_seconds,
        detected_language=detected_language,
        words=sorted(all_words, key=lambda item: (item.start, item.end, item.word)),
        model_used=model_used,
        processing_time_seconds=processing_time_seconds,
    )


def _transcribe_with_openai(
    resolved_path: Path,
    *,
    resolved_model: str,
    duration_seconds: float,
) -> tuple[str, list[TranscriptWord], str, str]:
    client = _build_openai_client()
    prompt = ""
    transcript_parts: list[str] = []
    all_words: list[TranscriptWord] = []
    detected_language = "en"

    with _open_transcription_chunks(resolved_path, duration_seconds) as chunks:
        for chunk in chunks:
            payload = _request_transcription(
                client,
                chunk.path,
                model=resolved_model,
                prompt=prompt,
            )
            chunk_language = _normalize_language(payload.get("language"))
            if chunk_language != "en":
                raise LanguageNotSupportedError(payload.get("language") or "unknown")

            if not payload.get("text", "").strip():
                raise AudioQualityError("Transcription result was empty. The audio may be silent or too noisy.")

            chunk_words = _build_transcript_words(
                payload,
                offset_seconds=chunk.offset_seconds,
            )
            if not chunk_words:
                raise AudioQualityError(
                    "The transcription completed, but no word-level timestamps were returned."
                )

            _raise_for_low_quality_audio(payload)
            transcript_parts.append(payload["text"].strip())
            all_words.extend(chunk_words)
            detected_language = chunk_language
            prompt = payload["text"].strip()[-800:]

    return " ".join(part for part in transcript_parts if part).strip(), all_words, detected_language, resolved_model


def _transcribe_with_local_whisper(
    resolved_path: Path,
    *,
    requested_model: str,
) -> tuple[str, list[TranscriptWord], str, str]:
    if whisper is None:
        raise WhisperNotAvailableError(
            "Neither OpenAI transcription nor local Whisper is available in this environment."
        )

    local_model_name = _resolve_local_whisper_model(requested_model)
    try:
        local_model = whisper.load_model(local_model_name)
        payload = local_model.transcribe(
            str(resolved_path),
            language="en",
            word_timestamps=True,
            fp16=False,
            verbose=False,
        )
    except Exception as exc:  # pragma: no cover - depends on local runtime/model weights
        raise TranscriptionError(
            f"Local Whisper transcription failed: {exc}",
            code="local_whisper_error",
            status_code=502,
        ) from exc

    detected_language = _normalize_language(payload.get("language"))
    if detected_language != "en":
        raise LanguageNotSupportedError(payload.get("language") or "unknown")

    transcript_text = str(payload.get("text", "")).strip()
    if not transcript_text:
        raise AudioQualityError("Local Whisper returned an empty transcription.")

    words = _build_local_whisper_words(payload)
    if not words:
        raise AudioQualityError("Local Whisper did not return usable word-level timestamps.")

    return transcript_text, words, detected_language, f"local-whisper-{local_model_name}"


def _resolve_local_whisper_model(requested_model: str) -> str:
    normalized = requested_model.strip().lower()
    if normalized == "tiny":
        return "tiny"
    if normalized in {"base", "small", "medium"}:
        return "tiny"
    if normalized in SUPPORTED_API_MODELS:
        return "tiny"
    return "tiny"


def _build_local_whisper_words(payload: dict[str, Any]) -> list[TranscriptWord]:
    words: list[TranscriptWord] = []
    for raw_segment in payload.get("segments") or []:
        segment = _coerce_mapping(raw_segment)
        for raw_word in segment.get("words") or []:
            word_payload = _coerce_mapping(raw_word)
            word_text = str(word_payload.get("word", "")).strip()
            if not word_text:
                continue
            start_seconds = float(word_payload.get("start", 0.0))
            end_seconds = float(word_payload.get("end", start_seconds))
            probability = _coerce_float(word_payload.get("probability"))
            words.append(
                TranscriptWord(
                    word=word_text,
                    start=round(start_seconds, 3),
                    end=round(end_seconds, 3),
                    confidence=_clamp_confidence(probability if probability is not None else 0.75),
                )
            )
    return words


def _should_fallback_to_local_whisper(exc: TranscriptionError) -> bool:
    return exc.code in {
        "whisper_not_available",
        "transcription_api_limit",
        "transcription_api_connection_error",
    }


def _build_openai_client() -> Any:
    settings = get_settings()
    if OpenAI is None:
        raise WhisperNotAvailableError(
            "The OpenAI Python client is not installed. Add the 'openai' package to use transcription."
        )

    api_key = settings.openai_api_key.strip()
    if not api_key:
        raise WhisperNotAvailableError("OPENAI_API_KEY is not configured.")

    return OpenAI(
        api_key=api_key,
        timeout=settings.openai_transcription_timeout_seconds,
        max_retries=2,
    )


def _open_transcription_chunks(file_path: Path, duration_seconds: float):
    if not _requires_chunking(file_path):
        return _SingleChunkContext([TranscriptionChunk(path=file_path, offset_seconds=0.0, duration_seconds=duration_seconds)])

    return _ChunkDirectoryContext(file_path=file_path, duration_seconds=duration_seconds)


class _SingleChunkContext:
    def __init__(self, chunks: list[TranscriptionChunk]) -> None:
        self._chunks = chunks

    def __enter__(self) -> list[TranscriptionChunk]:
        return self._chunks

    def __exit__(self, exc_type, exc, tb) -> None:
        return None


class _ChunkDirectoryContext:
    def __init__(self, *, file_path: Path, duration_seconds: float) -> None:
        self._file_path = file_path
        self._duration_seconds = duration_seconds
        self._temp_dir_path: Path | None = None

    def __enter__(self) -> list[TranscriptionChunk]:
        self._temp_dir_path = Path(
            tempfile.mkdtemp(
            prefix="insightclips-transcription-",
            dir=str(self._file_path.parent),
            )
        )
        return _build_chunk_files(
            self._file_path,
            duration_seconds=self._duration_seconds,
            temp_dir=self._temp_dir_path,
        )

    def __exit__(self, exc_type, exc, tb) -> None:
        if self._temp_dir_path is not None:
            shutil.rmtree(self._temp_dir_path, ignore_errors=True)
        return None


def _requires_chunking(file_path: Path) -> bool:
    return file_path.stat().st_size > OPENAI_MAX_UPLOAD_BYTES


def _build_chunk_files(
    file_path: Path,
    *,
    duration_seconds: float,
    temp_dir: Path,
) -> list[TranscriptionChunk]:
    if not shutil.which("ffmpeg"):
        raise WhisperNotAvailableError(
            "ffmpeg is required to chunk media files larger than the OpenAI upload limit."
        )

    settings = get_settings()
    requested_chunk_seconds = max(1, settings.transcription_chunk_duration_seconds)
    chunk_seconds = min(requested_chunk_seconds, SAFE_MAX_WAV_CHUNK_SECONDS)
    chunks: list[TranscriptionChunk] = []

    for index, (start_seconds, window_seconds) in enumerate(
        _iter_chunk_windows(duration_seconds, chunk_seconds)
    ):
        output_path = temp_dir / f"chunk-{index:04d}.wav"
        command = build_ffmpeg_chunk_command(
            file_path,
            output_path,
            start_seconds=start_seconds,
            duration_seconds=window_seconds,
        )

        try:
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                check=False,
                timeout=max(60, int(window_seconds * 2)),
            )
        except subprocess.TimeoutExpired as exc:
            raise APITimeoutError("Timed out while preparing an audio chunk for transcription.") from exc

        if result.returncode != 0:
            detail = (result.stderr or result.stdout).strip()
            raise TranscriptionError(
                detail or "ffmpeg could not prepare the audio chunk for transcription.",
                code="ffmpeg_chunk_failed",
                status_code=422,
            )

        if not output_path.exists() or output_path.stat().st_size <= 44:
            raise AudioQualityError("Prepared audio chunk was empty.")

        chunks.append(
            TranscriptionChunk(
                path=output_path,
                offset_seconds=round(start_seconds, 3),
                duration_seconds=round(window_seconds, 3),
            )
        )

    return chunks


def _iter_chunk_windows(duration_seconds: float, chunk_seconds: int):
    start_seconds = 0.0
    while start_seconds < duration_seconds:
        remaining_seconds = max(0.0, duration_seconds - start_seconds)
        window_seconds = min(float(chunk_seconds), remaining_seconds)
        if window_seconds <= 0:
            break
        yield round(start_seconds, 3), round(window_seconds, 3)
        start_seconds = round(start_seconds + window_seconds, 3)


def _request_transcription(
    client: Any,
    file_path: Path,
    *,
    model: str,
    prompt: str = "",
) -> dict[str, Any]:
    request_kwargs: dict[str, Any] = {
        "file": file_path.open("rb"),
        "model": model,
        "response_format": "verbose_json",
        "timestamp_granularities": ["word", "segment"],
    }
    if prompt:
        request_kwargs["prompt"] = prompt

    try:
        with request_kwargs["file"]:
            response = client.audio.transcriptions.create(**request_kwargs)
    except Exception as exc:  # pragma: no cover - behavior verified via mapped errors
        raise _map_openai_exception(exc) from exc

    return _coerce_mapping(response)


def _coerce_mapping(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if hasattr(value, "model_dump"):
        return value.model_dump()
    if hasattr(value, "__dict__"):
        return {
            key: item
            for key, item in vars(value).items()
            if not key.startswith("_")
        }
    raise TranscriptionError(
        "Transcription API returned an unsupported response payload.",
        code="invalid_transcription_response",
        status_code=502,
    )


def _map_openai_exception(exc: Exception) -> TranscriptionError:
    status_code = getattr(exc, "status_code", None)
    detail = str(exc).strip() or "Unknown transcription error."
    error_name = exc.__class__.__name__
    lowered_detail = detail.lower()

    if error_name == "APITimeoutError" or isinstance(exc, TimeoutError) or "timeout" in lowered_detail:
        return APITimeoutError("OpenAI transcription request timed out.")
    if error_name == "RateLimitError" or status_code == 429:
        return TranscriptionError(
            "OpenAI transcription rate limit or quota was exceeded.",
            code="transcription_api_limit",
            status_code=429,
        )
    if error_name == "AuthenticationError" or status_code in {401, 403}:
        return WhisperNotAvailableError("OpenAI authentication failed. Check OPENAI_API_KEY.")
    if error_name == "BadRequestError" and "language" in lowered_detail:
        return LanguageNotSupportedError("unknown")
    if error_name == "APIConnectionError":
        return TranscriptionError(
            "Could not reach the OpenAI transcription API.",
            code="transcription_api_connection_error",
            status_code=502,
        )
    return TranscriptionError(
        f"OpenAI transcription request failed: {detail}",
        code="transcription_api_error",
        status_code=status_code if isinstance(status_code, int) else 502,
    )


def _normalize_language(language: Any) -> str:
    if language is None:
        return "en"

    normalized = str(language).strip().lower()
    if normalized in ENGLISH_LANGUAGE_ALIASES:
        return "en"
    return normalized


def _build_transcript_words(
    payload: dict[str, Any],
    *,
    offset_seconds: float,
) -> list[TranscriptWord]:
    segments = [_coerce_mapping(segment) for segment in payload.get("segments") or []]
    words_payload = payload.get("words") or []
    words: list[TranscriptWord] = []

    for raw_word in words_payload:
        word_payload = _coerce_mapping(raw_word)
        word_text = str(word_payload.get("word", "")).strip()
        if not word_text:
            continue

        raw_start = float(word_payload.get("start", 0.0))
        raw_end = float(word_payload.get("end", raw_start))
        start_seconds = round(raw_start + offset_seconds, 3)
        end_seconds = round(raw_end + offset_seconds, 3)
        confidence = _resolve_word_confidence(word_payload, segments)

        words.append(
            TranscriptWord(
                word=word_text,
                start=start_seconds,
                end=end_seconds,
                confidence=confidence,
            )
        )

    return words


def _resolve_word_confidence(word_payload: dict[str, Any], segments: list[dict[str, Any]]) -> float:
    direct_confidence = _coerce_float(word_payload.get("confidence"))
    if direct_confidence is not None:
        return _clamp_confidence(direct_confidence)

    direct_probability = _coerce_float(word_payload.get("probability"))
    if direct_probability is not None:
        return _clamp_confidence(direct_probability)

    word_start = _coerce_float(word_payload.get("start")) or 0.0
    word_end = _coerce_float(word_payload.get("end")) or word_start
    matching_segment = _find_matching_segment(word_start, word_end, segments)

    if matching_segment is None:
        return 0.5

    segment_confidence = _confidence_from_segment(matching_segment)
    return segment_confidence if segment_confidence is not None else 0.5


def _find_matching_segment(
    word_start: float,
    word_end: float,
    segments: list[dict[str, Any]],
) -> dict[str, Any] | None:
    for segment in segments:
        segment_start = _coerce_float(segment.get("start"))
        segment_end = _coerce_float(segment.get("end"))
        if segment_start is None or segment_end is None:
            continue
        if word_start >= segment_start - WORD_ALIGNMENT_TOLERANCE_SECONDS and word_end <= segment_end + WORD_ALIGNMENT_TOLERANCE_SECONDS:
            return segment
    return None


def _confidence_from_segment(segment: dict[str, Any]) -> float | None:
    avg_logprob = _coerce_float(segment.get("avg_logprob"))
    no_speech_prob = _coerce_float(segment.get("no_speech_prob"))
    if avg_logprob is None and no_speech_prob is None:
        return None

    confidence = math.exp(min(0.0, avg_logprob or 0.0))
    if no_speech_prob is not None:
        confidence *= max(0.0, 1.0 - no_speech_prob)
    return round(_clamp_confidence(confidence), 4)


def _raise_for_low_quality_audio(payload: dict[str, Any]) -> None:
    segments = [_coerce_mapping(segment) for segment in payload.get("segments") or []]
    if not segments:
        return

    high_no_speech_segments = 0
    for segment in segments:
        no_speech_prob = _coerce_float(segment.get("no_speech_prob"))
        if no_speech_prob is not None and no_speech_prob >= 0.85:
            high_no_speech_segments += 1

    if high_no_speech_segments == len(segments):
        raise AudioQualityError("The audio appears to contain too little discernible speech.")


def _coerce_float(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _clamp_confidence(value: float) -> float:
    return round(max(0.0, min(1.0, value)), 4)
