from datetime import UTC, datetime

from app.database import service_supabase
from app.models.podcast import PodcastRecord, PodcastResponse

PODCAST_COLUMNS = "id,user_id,title,duration,status,created_at,updated_at"


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
    response = (
        service_supabase.table("podcasts")
        .select(PODCAST_COLUMNS)
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    rows = response.data or []
    if not rows:
        return [PodcastResponse.model_validate(item.model_dump()) for item in _mock_podcasts(user_id)], True

    return [PodcastResponse.model_validate(item) for item in rows], False
