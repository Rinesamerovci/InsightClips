from pathlib import Path

from app.models.media import MediaInspectionResult
from app.utils.media import inspect_media


def inspect_staged_media(
    file_path: str | Path,
    *,
    filename: str | None = None,
    mime_type: str | None = None,
) -> MediaInspectionResult:
    return inspect_media(Path(file_path), filename=filename, mime_type=mime_type)
