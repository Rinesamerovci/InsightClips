from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
BACKEND_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BACKEND_DIR.parent

load_dotenv(ROOT_DIR / ".env.local")
load_dotenv(ROOT_DIR / ".env")
load_dotenv(BACKEND_DIR / ".env.local")
load_dotenv(BACKEND_DIR / ".env")

from app.config import get_settings
from app.database import lifespan
from app.middleware import add_common_middleware, register_exception_handlers
from app.routers import auth, health, podcasts, upload, users

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)

add_common_middleware(app)
register_exception_handlers(app)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(podcasts.router)
app.include_router(upload.router)
