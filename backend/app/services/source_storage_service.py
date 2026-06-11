from __future__ import annotations

import tempfile
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

from app.config import get_settings
from app.database import UnconfiguredSupabaseClient, service_supabase

SOURCE_STORAGE_SCHEME = "supabase"


class SourceStorageError(Exception):
    def __init__(self, detail: str, *, status_code: int = 502) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


@dataclass(frozen=True)
class StoredSourceMedia:
    bucket: str
    key: str
    storage_path: str


def get_source_storage_bucket() -> str:
    bucket = get_settings().source_storage_bucket.strip()
    return bucket or "podcast-sources"


def build_source_storage_path(bucket: str, key: str) -> str:
    cleaned_bucket = bucket.strip()
    cleaned_key = key.strip().lstrip("/")
    if not cleaned_bucket or not cleaned_key:
        raise SourceStorageError("Source storage bucket and key are required.", status_code=500)
    return f"{SOURCE_STORAGE_SCHEME}://{cleaned_bucket}/{cleaned_key}"


def is_source_storage_path(value: str | None) -> bool:
    return bool(value and value.strip().startswith(f"{SOURCE_STORAGE_SCHEME}://"))


def parse_source_storage_path(storage_path: str) -> tuple[str, str]:
    cleaned = storage_path.strip()
    prefix = f"{SOURCE_STORAGE_SCHEME}://"
    if not cleaned.startswith(prefix):
        raise SourceStorageError("Source storage path is not a Supabase Storage path.", status_code=500)
    remainder = cleaned[len(prefix) :]
    bucket, separator, key = remainder.partition("/")
    if not separator or not bucket.strip() or not key.strip():
        raise SourceStorageError("Source storage path is incomplete.", status_code=500)
    return bucket.strip(), key.strip().lstrip("/")


def upload_source_media(
    local_path: Path,
    *,
    user_id: str,
    filename: str,
    content_type: str,
) -> StoredSourceMedia | None:
    if isinstance(service_supabase, UnconfiguredSupabaseClient):
        return None

    bucket = get_source_storage_bucket()
    key = f"{_safe_storage_part(user_id)}/sources/{_safe_storage_part(filename)}"
    storage = service_supabase.storage.from_(bucket)
    try:
        try:
            storage.remove([key])
        except Exception:
            pass
        storage.upload(
            key,
            local_path,
            {"content-type": content_type, "upsert": "true"},
        )
    except Exception as exc:
        status_code, detail = _map_storage_upload_error(exc)
        raise SourceStorageError(detail, status_code=status_code) from exc

    return StoredSourceMedia(
        bucket=bucket,
        key=key,
        storage_path=build_source_storage_path(bucket, key),
    )


@contextmanager
def source_media_path(storage_path: str, *, filename: str | None = None) -> Iterator[Path]:
    cleaned = storage_path.strip()
    if not cleaned:
        raise SourceStorageError("Podcast source media is missing.", status_code=422)

    if not is_source_storage_path(cleaned):
        yield Path(cleaned).expanduser().resolve()
        return

    bucket, key = parse_source_storage_path(cleaned)
    if isinstance(service_supabase, UnconfiguredSupabaseClient):
        raise SourceStorageError("Supabase must be configured before source media can be downloaded.", status_code=503)

    suffix = Path(filename or key).suffix or ".mp4"
    temp_file = tempfile.NamedTemporaryFile(
        prefix="insightclips-source-",
        suffix=suffix,
        dir=_source_temp_dir(),
        delete=False,
    )
    temp_path = Path(temp_file.name)
    try:
        temp_file.close()
        storage = service_supabase.storage.from_(bucket)
        payload = storage.download(key)
        temp_path.write_bytes(_coerce_bytes(payload))
        yield temp_path
    except Exception as exc:
        if isinstance(exc, SourceStorageError):
            raise
        raise SourceStorageError(f"Source media could not be downloaded from Supabase Storage: {exc}") from exc
    finally:
        try:
            temp_path.unlink(missing_ok=True)
        except Exception:
            pass


def materialize_source_media_path(storage_path: str, *, filename: str | None = None) -> Path:
    cleaned = storage_path.strip()
    if not cleaned:
        raise SourceStorageError("Podcast source media is missing.", status_code=422)

    if not is_source_storage_path(cleaned):
        return Path(cleaned).expanduser().resolve()

    bucket, key = parse_source_storage_path(cleaned)
    if isinstance(service_supabase, UnconfiguredSupabaseClient):
        raise SourceStorageError("Supabase must be configured before source media can be downloaded.", status_code=503)

    suffix = Path(filename or key).suffix or ".mp4"
    temp_file = tempfile.NamedTemporaryFile(
        prefix="insightclips-source-",
        suffix=suffix,
        dir=_source_temp_dir(),
        delete=False,
    )
    temp_path = Path(temp_file.name)
    temp_file.close()
    try:
        storage = service_supabase.storage.from_(bucket)
        payload = storage.download(key)
        temp_path.write_bytes(_coerce_bytes(payload))
    except Exception as exc:
        temp_path.unlink(missing_ok=True)
        if isinstance(exc, SourceStorageError):
            raise
        raise SourceStorageError(f"Source media could not be downloaded from Supabase Storage: {exc}") from exc

    return temp_path


def _source_temp_dir() -> str | None:
    configured_dir = get_settings().upload_storage_dir.strip()
    if not configured_dir:
        return None
    temp_dir = Path(configured_dir) / "processing"
    temp_dir.mkdir(parents=True, exist_ok=True)
    return str(temp_dir)


def _coerce_bytes(payload: object) -> bytes:
    if isinstance(payload, bytes):
        return payload
    if isinstance(payload, bytearray):
        return bytes(payload)
    try:
        return bytes(payload)  # type: ignore[arg-type]
    except Exception as exc:
        raise SourceStorageError("Supabase returned an unexpected source media payload.") from exc


def _safe_storage_part(value: str) -> str:
    import re

    cleaned = re.sub(r"[^A-Za-z0-9_.-]+", "-", value.strip())
    return cleaned.strip(".-") or "source"


def _map_storage_upload_error(exc: Exception) -> tuple[int, str]:
    message = str(exc)
    normalized = message.lower()
    if "413" in normalized or "payload too large" in normalized or "maximum allowed size" in normalized:
        return (
            413,
            "Source media is larger than the Supabase Storage bucket limit. Increase the file size limit for the "
            "podcast-sources bucket or test with a smaller video.",
        )
    return 502, f"Source media could not be uploaded to Supabase Storage: {exc}"
