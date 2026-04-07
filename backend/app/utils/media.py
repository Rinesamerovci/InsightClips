from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

from app.models.media import MediaInspectionResult

SUPPORTED_MIME_TYPES: dict[str, str] = {
    "audio/aac": "aac",
    "audio/flac": "flac",
    "audio/m4a": "m4a",
    "audio/mp3": "mp3",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/webm": "webm",
    "audio/x-m4a": "m4a",
    "audio/x-wav": "wav",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "video/x-m4v": "m4v",
}

SUPPORTED_EXTENSIONS: set[str] = {
    ".aac",
    ".flac",
    ".m4a",
    ".m4v",
    ".mov",
    ".mp3",
    ".mp4",
    ".wav",
    ".webm",
}


class MediaInspectionError(Exception):
    def __init__(self, detail: str, code: str = "media_inspection_failed") -> None:
        super().__init__(detail)
        self.detail = detail
        self.code = code


class FFprobeNotAvailableError(MediaInspectionError):
    def __init__(self) -> None:
        super().__init__(
            "ffprobe is not installed or not available on PATH.",
            code="ffprobe_not_available",
        )


class MediaFileNotFoundError(MediaInspectionError):
    def __init__(self, file_path: Path) -> None:
        super().__init__(
            f"Media file not found: {file_path}",
            code="media_file_not_found",
        )


class UnsupportedMediaTypeError(MediaInspectionError):
    def __init__(self, detail: str) -> None:
        super().__init__(detail, code="unsupported_media_type")


class CorruptMediaError(MediaInspectionError):
    def __init__(self, detail: str = "Unable to inspect media file.") -> None:
        super().__init__(detail, code="corrupt_media")


def validate_media_type(filename: str, mime_type: str | None = None) -> str:
    suffix = Path(filename).suffix.lower()
    normalized_mime = mime_type.lower().strip() if mime_type else None

    if normalized_mime and normalized_mime not in SUPPORTED_MIME_TYPES:
        raise UnsupportedMediaTypeError(f"Unsupported media type: {normalized_mime}")

    if suffix in SUPPORTED_EXTENSIONS:
        return suffix.removeprefix(".")

    if normalized_mime:
        return SUPPORTED_MIME_TYPES[normalized_mime]

    raise UnsupportedMediaTypeError(
        f"Unsupported media file extension: {suffix or 'missing extension'}"
    )


def _ensure_ffprobe_available() -> None:
    if not shutil.which("ffprobe"):
        raise FFprobeNotAvailableError()


def _resolve_file_path(file_path: Path) -> Path:
    resolved_path = file_path.expanduser().resolve()
    if not resolved_path.exists() or not resolved_path.is_file():
        raise MediaFileNotFoundError(resolved_path)
    return resolved_path


def _probe_media(file_path: Path) -> dict:
    _ensure_ffprobe_available()
    resolved_path = _resolve_file_path(file_path)

    command = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration,format_name",
        "-of",
        "json",
        str(resolved_path),
    ]

    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,
            timeout=30,
        )
    except subprocess.TimeoutExpired as exc:
        raise MediaInspectionError(
            "Timed out while inspecting the media file.",
            code="ffprobe_timeout",
        ) from exc

    if result.returncode != 0:
        stderr = (result.stderr or result.stdout).strip()
        raise CorruptMediaError(stderr or "ffprobe could not inspect the media file.")

    try:
        return json.loads(result.stdout or "{}")
    except json.JSONDecodeError as exc:
        raise CorruptMediaError("ffprobe returned invalid JSON output.") from exc


def get_duration_seconds(file_path: Path) -> float:
    payload = _probe_media(file_path)
    format_payload = payload.get("format", {})

    duration_value = format_payload.get("duration")
    if duration_value in (None, ""):
        raise CorruptMediaError("Media duration could not be detected.")

    try:
        duration_seconds = float(duration_value)
    except (TypeError, ValueError) as exc:
        raise CorruptMediaError("Media duration is invalid.") from exc

    if duration_seconds <= 0:
        raise CorruptMediaError("Media duration must be greater than zero.")

    return duration_seconds


def get_duration_minutes(file_path: Path) -> float:
    return round(get_duration_seconds(file_path) / 60, 2)


def inspect_media(
    file_path: Path,
    *,
    filename: str | None = None,
    mime_type: str | None = None,
) -> MediaInspectionResult:
    resolved_path = _resolve_file_path(file_path)
    detected_format = validate_media_type(filename or resolved_path.name, mime_type)
    payload = _probe_media(resolved_path)
    format_payload = payload.get("format", {})

    duration_value = format_payload.get("duration")
    if duration_value in (None, ""):
        raise CorruptMediaError("Media duration could not be detected.")

    try:
        duration_seconds = float(duration_value)
    except (TypeError, ValueError) as exc:
        raise CorruptMediaError("Media duration is invalid.") from exc

    if duration_seconds <= 0:
        raise CorruptMediaError("Media duration must be greater than zero.")

    ffprobe_format = format_payload.get("format_name")
    if isinstance(ffprobe_format, str) and ffprobe_format.strip():
        detected_format = ffprobe_format.split(",")[0].strip()

    return MediaInspectionResult(
        duration_seconds=round(duration_seconds, 2),
        duration_minutes=round(duration_seconds / 60, 2),
        is_supported=True,
        detected_format=detected_format,
        mime_type=mime_type,
        validation_flags={
            "ffprobe_available": True,
            "file_exists": True,
            "mime_type_supported": True,
            "duration_detected": True,
        },
    )
