from contextlib import asynccontextmanager
from typing import Iterator

from psycopg_pool import ConnectionPool
from supabase import Client, create_client

from app.config import get_settings

settings = get_settings()

service_supabase: Client = create_client(
    settings.supabase_url,
    settings.supabase_service_role_key or settings.supabase_anon_key,
)
public_supabase: Client = create_client(
    settings.supabase_url,
    settings.supabase_anon_key or settings.supabase_service_role_key,
)

db_pool: ConnectionPool | None = None
if settings.database_url:
    db_pool = ConnectionPool(
        conninfo=settings.database_url,
        min_size=1,
        max_size=5,
        kwargs={"autocommit": True},
        open=False,
    )


def open_db_pool() -> None:
    if db_pool and db_pool.closed:
        db_pool.open()


def close_db_pool() -> None:
    if db_pool and not db_pool.closed:
        db_pool.close()


def run_db_healthcheck() -> bool:
    if not db_pool:
        return False
    with db_pool.connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("select 1;")
            return cursor.fetchone() == (1,)


@asynccontextmanager
async def lifespan(_: object) -> Iterator[None]:
    open_db_pool()
    try:
        yield
    finally:
        close_db_pool()
