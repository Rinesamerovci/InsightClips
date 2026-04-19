from datetime import UTC, datetime

from app.database import UnconfiguredSupabaseClient, service_supabase
from app.models.podcast import PodcastRecord, PodcastResponse

PODCAST_COLUMNS = "id,user_id,title,duration,status,storage_path,created_at,updated_at"


def _mock_podcasts(user_id: str) -> list[PodcastRecord]:
    now = datetime.now(UTC)
    items = [
        ("Welcome Episode Breakdown", 754, "completed"),
        ("Founder Interview Highlights", 512, "processing"),
        ("Marketing Sprint Recap", 906, "queued"),
    ]
    return [
        PodcastRecord(
            id=f"mock-{index}",
            user_id=user_id,
            title=title,
            duration=duration,
            status=status,
            created_at=now,
            updated_at=now,
        )
        for index, (title, duration, status) in enumerate(items, start=1)
    ]


def get_podcasts_for_user(user_id: str) -> tuple[list[PodcastResponse], bool]:
    if isinstance(service_supabase, UnconfiguredSupabaseClient):
        return [PodcastResponse.model_validate(item.model_dump()) for item in _mock_podcasts(user_id)], True

    response = (
        service_supabase.table("podcasts")
        .select(PODCAST_COLUMNS)
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    rows = response.data or []
    return [PodcastResponse.model_validate(item) for item in rows], False


def get_podcast_for_user(podcast_id: str, user_id: str) -> PodcastRecord | None:
    if isinstance(service_supabase, UnconfiguredSupabaseClient):
        return None

    response = (
        service_supabase.table("podcasts")
        .select(PODCAST_COLUMNS)
        .eq("id", podcast_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return PodcastRecord.model_validate(rows[0]) if rows else None


def update_podcast_status_for_user(podcast_id: str, user_id: str, status: str) -> PodcastRecord | None:
    if isinstance(service_supabase, UnconfiguredSupabaseClient):
        return None

    try:
        (
            service_supabase.table("podcasts")
            .update({"status": status})
            .eq("id", podcast_id)
            .eq("user_id", user_id)
            .execute()
        )
    except Exception:
        return None

    try:
        return get_podcast_for_user(podcast_id, user_id)
    except Exception:
        return None
