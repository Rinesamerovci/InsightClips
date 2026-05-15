from app.database import service_supabase
from app.models.export_settings import ExportSettings, ExportSettingsInput
from app.models.profile import (
    ProfileRecord,
    ProfileResponse,
    UserExportSettingsResponse,
    UserMessageRequest,
    UserMessageResponse,
)

PROFILE_COLUMNS = "id,email,free_trial_used,full_name,profile_picture_url,export_settings,created_at,updated_at"


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None

    normalized = " ".join(value.split())
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
    full_name: str | None = None,
    profile_picture_url: str | None = None,
    fields_to_update: set[str] | None = None,
) -> ProfileRecord:
    payload: dict[str, str | None] = {}
    requested_fields = fields_to_update or {"full_name", "profile_picture_url"}
    if "full_name" in requested_fields:
        payload["full_name"] = _normalize_optional_text(full_name)
    if "profile_picture_url" in requested_fields:
        payload["profile_picture_url"] = _normalize_optional_text(profile_picture_url)
    if not payload:
        profile = get_profile_by_id(profile_id)
        if not profile:
            raise ValueError("Profile not found.")
        return profile

    response = (
        service_supabase.table("profiles")
        .update(payload)
        .eq("id", profile_id)
        .execute()
    )
    rows = response.data or []
    return ProfileRecord.model_validate(rows[0])


def get_user_export_settings(profile_id: str) -> UserExportSettingsResponse | None:
    profile = get_profile_by_id(profile_id)
    if not profile:
        return None
    return UserExportSettingsResponse(
        user_id=profile.id,
        export_settings=profile.export_settings,
    )


def get_profile_for_analytics(profile_id: str) -> ProfileRecord | None:
    cleaned_profile_id = profile_id.strip()
    if not cleaned_profile_id:
        return None
    return get_profile_by_id(cleaned_profile_id)


def update_user_export_settings(
    profile_id: str,
    export_settings: ExportSettingsInput | ExportSettings,
) -> UserExportSettingsResponse:
    resolved = export_settings.resolve() if isinstance(export_settings, ExportSettingsInput) else export_settings
    response = (
        service_supabase.table("profiles")
        .update({"export_settings": resolved.model_dump(mode="json")})
        .eq("id", profile_id)
        .execute()
    )
    rows = response.data or []
    profile = ProfileRecord.model_validate(rows[0])
    return UserExportSettingsResponse(
        user_id=profile.id,
        export_settings=profile.export_settings,
    )


def submit_user_message(profile_id: str, payload: UserMessageRequest) -> UserMessageResponse:
    cleaned_profile_id = profile_id.strip()
    if not cleaned_profile_id:
        raise ValueError("Profile id is required.")

    record = {
        "user_id": cleaned_profile_id,
        "message_type": payload.message_type,
        "category": payload.category,
        "subject": payload.subject,
        "message": payload.message,
        "contact_email": str(payload.contact_email) if payload.contact_email else None,
        "status": "received",
    }
    response = service_supabase.table("user_messages").insert(record).execute()
    rows = response.data or []
    if not rows:
        raise ValueError("Unable to submit message.")

    row = rows[0]
    return UserMessageResponse(
        id=str(row.get("id") or ""),
        user_id=str(row.get("user_id") or cleaned_profile_id),
        message_type=row.get("message_type") or payload.message_type,
        category=row.get("category") or payload.category,
        subject=row.get("subject"),
        message=str(row.get("message") or payload.message),
        contact_email=row.get("contact_email"),
        status=row.get("status") or "received",
        created_at=row.get("created_at"),
    )


def serialize_profile(profile: ProfileRecord) -> ProfileResponse:
    return ProfileResponse.model_validate(profile.model_dump())
