import shutil
import tempfile
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel

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
from app.utils.media import MediaInspectionError

router = APIRouter(prefix="/upload", tags=["upload"])


class UploadFileResponse(BaseModel):
    storage_path: str
    filename: str
    filesize_bytes: int


def get_upload_dir() -> Path:
    """Get persistent upload directory for Render."""
    try:
        # Use temp directory on Render
        temp_dir = Path(tempfile.gettempdir()) / "insightclips-uploads"
        temp_dir.mkdir(parents=True, exist_ok=True)
        return temp_dir
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
        upload_base = get_upload_dir()
        target_dir = upload_base / _safe_path_part(current_user.id)
        target_dir.mkdir(parents=True, exist_ok=True)
        
        target_path = target_dir / file.filename
        with target_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        return UploadFileResponse(
            storage_path=str(target_path),
            filename=file.filename,
            filesize_bytes=target_path.stat().st_size
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(exc)}")


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
