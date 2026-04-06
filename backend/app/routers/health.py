from fastapi import APIRouter

from app.database import db_pool, run_db_healthcheck

router = APIRouter(tags=["health"])


@router.get("/")
async def root() -> dict[str, str]:
    return {"message": "InsightClips Backend", "status": "running"}


@router.get("/health")
async def health_check() -> dict[str, str | bool]:
    db_ok = run_db_healthcheck() if db_pool else False
    return {"status": "healthy", "database_connected": db_ok}
