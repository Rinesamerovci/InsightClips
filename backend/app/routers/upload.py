from fastapi import APIRouter, Depends, HTTPException

from app.dependencies.auth import AuthenticatedUser, get_current_user
from app.models.upload import (
    UploadCalculatePriceRequest,
    UploadCalculatePriceResponse,
    UploadPrepareRequest,
    UploadPrepareResponse,
)
from app.services.upload_service import UploadWorkflowError, calculate_upload_price, prepare_upload
from app.utils.media import MediaInspectionError

router = APIRouter(prefix="/upload", tags=["upload"])


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
