from app.database import service_supabase
from app.models.profile import ProfileRecord, ProfileResponse

PROFILE_COLUMNS = "id,email,free_trial_used,full_name,profile_picture_url,created_at,updated_at"


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None

    normalized = value.strip()
    return normalized or None


def get_profile_by_id(profile_id: str) -> ProfileRecord | None:
    response = (
        service_supabase.table("profiles")
        .select(PROFILE_COLUMNS)
        .eq("id", profile_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return ProfileRecord.model_validate(rows[0]) if rows else None


def get_profile_by_email(email: str) -> ProfileRecord | None:
    response = (
        service_supabase.table("profiles")
        .select(PROFILE_COLUMNS)
        .eq("email", email.lower())
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return ProfileRecord.model_validate(rows[0]) if rows else None


def upsert_profile(profile_id: str, email: str, full_name: str | None = None) -> ProfileRecord:
    response = (
        service_supabase.table("profiles")
        .upsert(
            {
                "id": profile_id,
                "email": email.lower(),
                "free_trial_used": False,
                "full_name": full_name,
            }
        )
        .execute()
    )
    rows = response.data or []
    return ProfileRecord.model_validate(rows[0])


def mark_free_trial_used(profile_id: str) -> None:
    service_supabase.table("profiles").update({"free_trial_used": True}).eq("id", profile_id).execute()


def update_profile(
    profile_id: str,
    *,
    full_name: str | None,
    profile_picture_url: str | None,
) -> ProfileRecord | None:
    response = (
        service_supabase.table("profiles")
        .update(
            {
                "full_name": _normalize_optional_text(full_name),
                "profile_picture_url": _normalize_optional_text(profile_picture_url),
            }
        )
        .eq("id", profile_id)
        .execute()
    )
    rows = response.data or []
    return ProfileRecord.model_validate(rows[0]) if rows else None


def serialize_profile(profile: ProfileRecord) -> ProfileResponse:
    return ProfileResponse.model_validate(profile.model_dump())
