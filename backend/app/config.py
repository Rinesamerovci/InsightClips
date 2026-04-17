from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


APP_DIR = Path(__file__).resolve().parent
BACKEND_DIR = APP_DIR.parent
ROOT_DIR = BACKEND_DIR.parent


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
    frontend_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:3001",
        ]
    )

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
    openai_api_key: str = Field(default="", validation_alias=AliasChoices("OPENAI_API_KEY"))
    openai_transcription_timeout_seconds: int = Field(
        default=300,
        validation_alias=AliasChoices("OPENAI_TRANSCRIPTION_TIMEOUT_SECONDS"),
    )
    transcription_chunk_duration_seconds: int = Field(
        default=600,
        validation_alias=AliasChoices("TRANSCRIPTION_CHUNK_DURATION_SECONDS"),
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
