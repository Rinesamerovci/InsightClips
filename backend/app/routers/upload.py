import shutil
import tempfile
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel

from app.config import get_settings
from app.dependencies.auth import AuthenticatedUser, get_current_user
from app.models.upload import (
    UploadCalculatePriceRequest,
    UploadCalculatePriceResponse,
    UploadPrepareRequest,
    UploadPrepareResponse,
    YouTubeImportRequest,
    YouTubeImportResponse,
)
from app.services.upload_service import (
    UploadWorkflowError,
    calculate_upload_price,
    import_youtube_podcast,
    prepare_upload,
    _safe_path_part,
)
from app.services.source_storage_service import SourceStorageError, upload_source_media
from app.utils.media import MediaInspectionError, validate_media_type

router = APIRouter(prefix="/upload", tags=["upload"])


class UploadFileResponse(BaseModel):
    storage_path: str
    filename: str
    filesize_bytes: int
    source_storage: str = "local"


def get_upload_dir() -> Path:
    """Get upload directory, preferring persistent storage when configured."""
    try:
        configured_dir = get_settings().upload_storage_dir.strip()
        upload_dir = (
            Path(configured_dir) / "uploads"
            if configured_dir
            else Path(tempfile.gettempdir()) / "insightclips-uploads"
        )
        upload_dir.mkdir(parents=True, exist_ok=True)
        return upload_dir
    except Exception:
        # Fallback to .generated for development
        upload_dir = Path(".") / ".generated" / "uploads"
        upload_dir.mkdir(parents=True, exist_ok=True)
        return upload_dir


@router.post("/file", response_model=UploadFileResponse)
async def upload_file(
    file: UploadFile = File(...),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> UploadFileResponse:
    try:
        original_filename = (file.filename or "").strip()
        if not original_filename:
            raise HTTPException(status_code=400, detail="Uploaded file must include a filename.")
        detected_format = validate_media_type(original_filename, file.content_type)
        content_type = file.content_type or f"video/{detected_format}"

        upload_base = get_upload_dir()
        target_dir = upload_base / _safe_path_part(current_user.id)
        target_dir.mkdir(parents=True, exist_ok=True)

        safe_filename = _safe_path_part(Path(original_filename).name)
        target_path = target_dir / safe_filename
        with target_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        filesize_bytes = target_path.stat().st_size

        source_storage = "local"
        try:
            stored_source = upload_source_media(
                target_path,
                user_id=current_user.id,
                filename=safe_filename,
                content_type=content_type,
            )
        except SourceStorageError as exc:
            if not _can_keep_local_source(exc):
                raise
            stored_source = None

        if stored_source is not None:
            target_path.unlink(missing_ok=True)
            storage_path = stored_source.storage_path
            source_storage = "supabase"
        else:
            storage_path = str(target_path)

        return UploadFileResponse(
            storage_path=storage_path,
            filename=safe_filename,
            filesize_bytes=filesize_bytes,
            source_storage=source_storage,
        )
    except HTTPException:
        raise
    except MediaInspectionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except SourceStorageError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(exc)}")


def _can_keep_local_source(exc: SourceStorageError) -> bool:
    """Allow a temporary local fallback for demos when Supabase Storage rejects large files."""
    settings = get_settings()
    environment = settings.environment.strip().lower()
    development_mode = environment in {"development", "dev", "local", "test"}
    return exc.status_code == 413 and (settings.allow_local_source_fallback or development_mode)


@router.post("/calculate-price", response_model=UploadCalculatePriceResponse)
async def calculate_price(
    payload: UploadCalculatePriceRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> UploadCalculatePriceResponse:
    try:
        return calculate_upload_price(payload, current_user)
    except MediaInspectionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except UploadWorkflowError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.post("/prepare", response_model=UploadPrepareResponse)
async def prepare_upload_route(
    payload: UploadPrepareRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> UploadPrepareResponse:
    try:
        return prepare_upload(payload, current_user)
    except MediaInspectionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except UploadWorkflowError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.post("/youtube", response_model=YouTubeImportResponse)
async def import_youtube_route(
    payload: YouTubeImportRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> YouTubeImportResponse:
    try:
        return import_youtube_podcast(payload, current_user)
    except UploadWorkflowError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
