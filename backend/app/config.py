import json
from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


APP_DIR = Path(__file__).resolve().parent
BACKEND_DIR = APP_DIR.parent
ROOT_DIR = BACKEND_DIR.parent

DEFAULT_FRONTEND_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(
            ROOT_DIR / ".env.local",
            ROOT_DIR / ".env",
            BACKEND_DIR / ".env.local",
            BACKEND_DIR / ".env",
        ),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "InsightClips"
    app_version: str = "1.0.0"
    environment: str = "development"
    frontend_origins: list[str] = Field(default_factory=lambda: list(DEFAULT_FRONTEND_ORIGINS))

    @field_validator("frontend_origins", mode="before")
    @classmethod
    def parse_frontend_origins(cls, value: object) -> object:
        if isinstance(value, str):
            cleaned = value.strip()
            if not cleaned:
                return list(DEFAULT_FRONTEND_ORIGINS)
            if cleaned.startswith("["):
                try:
                    parsed = [str(origin).strip() for origin in json.loads(cleaned)]
                except Exception:
                    parsed = []
            else:
                parsed = [origin.strip() for origin in cleaned.split(",") if origin.strip()]
            return _merge_frontend_origins(parsed)
        if isinstance(value, list):
            return _merge_frontend_origins([str(origin).strip() for origin in value if str(origin).strip()])
        return value

    supabase_url: str = Field(
        default="",
        validation_alias=AliasChoices("SUPABASE_URL"),
    )
    supabase_anon_key: str = Field(
        default="",
        validation_alias=AliasChoices("SUPABASE_ANON_KEY", "SUPABASE_KEY"),
    )
    supabase_service_role_key: str = Field(
        default="",
        validation_alias=AliasChoices("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"),
    )
    database_url: str = Field(default="", validation_alias=AliasChoices("DATABASE_URL"))
    jwt_secret: str = Field(default="", validation_alias=AliasChoices("JWT_SECRET"))
    jwt_algorithm: str = "HS256"
    jwt_expires_minutes: int = 60
    upload_storage_dir: str = Field(
        default="",
        validation_alias=AliasChoices("INSIGHTCLIPS_UPLOAD_DIR", "UPLOAD_STORAGE_DIR"),
    )
    source_storage_bucket: str = Field(
        default="podcast-sources",
        validation_alias=AliasChoices("SOURCE_STORAGE_BUCKET", "PODCAST_SOURCE_STORAGE_BUCKET"),
    )
    allow_local_source_fallback: bool = Field(
        default=False,
        validation_alias=AliasChoices("ALLOW_LOCAL_SOURCE_FALLBACK"),
    )
    support_inbox_email: str = Field(
        default="",
        validation_alias=AliasChoices("SUPPORT_INBOX_EMAIL", "INSIGHTCLIPS_SUPPORT_EMAIL"),
    )
    smtp_host: str = Field(default="", validation_alias=AliasChoices("SMTP_HOST"))
    smtp_port: int = Field(default=587, validation_alias=AliasChoices("SMTP_PORT"))
    smtp_username: str = Field(default="", validation_alias=AliasChoices("SMTP_USERNAME", "SMTP_USER"))
    smtp_password: str = Field(default="", validation_alias=AliasChoices("SMTP_PASSWORD", "SMTP_PASS"))
    smtp_from_email: str = Field(default="", validation_alias=AliasChoices("SMTP_FROM_EMAIL", "SMTP_SENDER_EMAIL"))
    smtp_from_name: str = Field(default="InsightClips", validation_alias=AliasChoices("SMTP_FROM_NAME"))
    smtp_use_tls: bool = Field(default=True, validation_alias=AliasChoices("SMTP_USE_TLS"))
    groq_api_key: str = Field(default="", validation_alias=AliasChoices("GROQ_API_KEY"))
    transcription_api_base_url: str = Field(
        default="",
        validation_alias=AliasChoices("GROQ_API_BASE_URL", "TRANSCRIPTION_API_BASE_URL"),
    )
    transcription_timeout_seconds: int = Field(
        default=300,
        validation_alias=AliasChoices(
            "GROQ_TRANSCRIPTION_TIMEOUT_SECONDS",
            "TRANSCRIPTION_TIMEOUT_SECONDS",
            "OPENAI_TRANSCRIPTION_TIMEOUT_SECONDS",
        ),
    )
    transcription_chunk_duration_seconds: int = Field(
        default=600,
        validation_alias=AliasChoices("TRANSCRIPTION_CHUNK_DURATION_SECONDS"),
    )
    stripe_secret_key: str = Field(default="", validation_alias=AliasChoices("STRIPE_SECRET_KEY"))
    stripe_webhook_secret: str = Field(default="", validation_alias=AliasChoices("STRIPE_WEBHOOK_SECRET"))
    clip_ffmpeg_preset: str = Field(
        default="veryfast",
        validation_alias=AliasChoices("CLIP_FFMPEG_PRESET", "FFMPEG_PRESET"),
    )
    clip_ffmpeg_crf: int = Field(
        default=22,
        validation_alias=AliasChoices("CLIP_FFMPEG_CRF", "FFMPEG_CRF"),
    )
    clip_ffmpeg_threads: int = Field(
        default=1,
        validation_alias=AliasChoices("CLIP_FFMPEG_THREADS", "FFMPEG_THREADS"),
    )
    clip_ffmpeg_timeout_seconds: int = Field(
        default=240,
        validation_alias=AliasChoices("CLIP_FFMPEG_TIMEOUT_SECONDS", "FFMPEG_TIMEOUT_SECONDS"),
    )


def _merge_frontend_origins(origins: list[str]) -> list[str]:
    merged: list[str] = []
    for origin in [*DEFAULT_FRONTEND_ORIGINS, *origins]:
        cleaned = origin.strip()
        if cleaned and cleaned not in merged:
            merged.append(cleaned)
    return merged


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
