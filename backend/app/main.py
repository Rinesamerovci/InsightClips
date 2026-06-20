import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
BACKEND_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BACKEND_DIR.parent

# Add the bin directory to PATH for ffmpeg and ffprobe
bin_dir = ROOT_DIR / "bin"
if bin_dir.exists():
    os.environ["PATH"] = str(bin_dir) + os.pathsep + os.environ.get("PATH", "")
else:
    bin_dir_backend = BACKEND_DIR / "bin"
    if bin_dir_backend.exists():
        os.environ["PATH"] = str(bin_dir_backend) + os.pathsep + os.environ.get("PATH", "")

load_dotenv(ROOT_DIR / ".env.local")
load_dotenv(ROOT_DIR / ".env")
load_dotenv(BACKEND_DIR / ".env.local")
load_dotenv(BACKEND_DIR / ".env")

from app.config import get_settings
from app.database import lifespan
from app.middleware import add_common_middleware, register_exception_handlers, wrap_with_cors
from app.routers import auth, clips, health, podcasts, upload, users

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
app.include_router(clips.router)
app.include_router(upload.router)

app = wrap_with_cors(app)
