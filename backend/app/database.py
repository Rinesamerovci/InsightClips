from contextlib import asynccontextmanager
from typing import AsyncGenerator

import httpx
from psycopg import connect
from psycopg_pool import ConnectionPool
from supabase import Client, ClientOptions, create_client

from app.config import get_settings
# Load application settings from environment
settings = get_settings()

class UnconfiguredSupabaseClient:
    def __getattr__(self, name: str) -> object:
        if name.startswith("__"):
            raise AttributeError(name)
        raise RuntimeError(
            "Supabase client is not configured. Set SUPABASE_URL and the corresponding key "
            "environment variables before using database-backed services."
        )

def _create_supabase_client(url: str, key: str) -> Client | UnconfiguredSupabaseClient:
    if not url or not key:
        return UnconfiguredSupabaseClient()
    return create_client(
        url,
        key,
        ClientOptions(httpx_client=httpx.Client(trust_env=False, timeout=600.0)),
    )
# Supabase clients (service role + public anon)
service_supabase: Client | UnconfiguredSupabaseClient = _create_supabase_client(
    settings.supabase_url,
    settings.supabase_service_role_key or settings.supabase_anon_key,
)

public_supabase: Client | UnconfiguredSupabaseClient = _create_supabase_client(
    settings.supabase_url,
    settings.supabase_anon_key or settings.supabase_service_role_key,
)

db_pool: ConnectionPool | None = None
if settings.database_url:
    db_pool = ConnectionPool(
        conninfo=settings.database_url,
        min_size=0,
        max_size=5,
        kwargs={"autocommit": True, "connect_timeout": 3},
        open=False,
    )

def open_db_pool() -> None:
    # Keep startup resilient when the direct database host is unavailable.
    # Health checks can still verify connectivity with a one-off connection.
    return None

def close_db_pool() -> None:
    if db_pool and not db_pool.closed:
        db_pool.close()

def run_db_healthcheck() -> bool:
    if db_pool:
        try:
            with connect(settings.database_url, autocommit=True, connect_timeout=3) as connection:
                with connection.cursor() as cursor:
                    cursor.execute("select 1;")
                    return cursor.fetchone() == (1,)
        except Exception:
            pass
    # Fallback: Supabase health check
    if settings.supabase_url and (settings.supabase_service_role_key or settings.supabase_anon_key):
        try:
            service_supabase.table("profiles").select("id").limit(1).execute()
            return True
        except Exception:
            pass

    return False

@asynccontextmanager
async def lifespan(_: object) -> AsyncGenerator[None, None]:
    open_db_pool()
    try:
        if not isinstance(service_supabase, UnconfiguredSupabaseClient):
            service_supabase.table("podcasts").update({"status": "ready_for_processing"}).eq("status", "processing").execute()
    except Exception:
        pass
    try:
        yield
    finally:
        close_db_pool()

