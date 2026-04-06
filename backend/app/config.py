import os
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env.local", ".env"),
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
        default_factory=lambda: os.getenv("SUPABASE_URL", ""),
        alias="SUPABASE_URL",
    )
    supabase_anon_key: str = Field(
        default_factory=lambda: os.getenv("SUPABASE_ANON_KEY", os.getenv("SUPABASE_KEY", "")),
        alias="SUPABASE_ANON_KEY",
    )
    supabase_service_role_key: str = Field(
        default_factory=lambda: os.getenv(
            "SUPABASE_SERVICE_ROLE_KEY", os.getenv("SUPABASE_SERVICE_KEY", "")
        ),
        alias="SUPABASE_SERVICE_ROLE_KEY",
    )
    database_url: str = Field(default_factory=lambda: os.getenv("DATABASE_URL", ""))
    jwt_secret: str = Field(default_factory=lambda: os.getenv("JWT_SECRET", ""))
    jwt_algorithm: str = "HS256"
    jwt_expires_minutes: int = 60


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
