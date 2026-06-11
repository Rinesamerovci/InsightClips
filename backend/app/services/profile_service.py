from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from app.config import get_settings
from app.database import service_supabase
from app.models.export_settings import (
    ExportSettings,
    ExportSettingsInput,
    coerce_persisted_export_settings,
)
from app.models.profile import (
    ProfileRecord,
    ProfileResponse,
    UserExportSettingsResponse,
    UserMessageRequest,
    UserMessageResponse,
)

PROFILE_COLUMNS = "id,email,free_trial_used,full_name,profile_picture_url,export_settings,created_at,updated_at"
FREE_TRIAL_LIMIT_SECONDS = 30 * 60
logger = logging.getLogger(__name__)


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None

    normalized = " ".join(value.split())
    return normalized or None


def _hydrate_profile_record(row: dict[str, object]) -> ProfileRecord:
    payload = dict(row)
    payload["export_settings"] = coerce_persisted_export_settings(row.get("export_settings"))
    return ProfileRecord.model_validate(payload)


def get_profile_by_id(profile_id: str) -> ProfileRecord | None:
    response = (
        service_supabase.table("profiles")
        .select(PROFILE_COLUMNS)
        .eq("id", profile_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return _hydrate_profile_record(rows[0]) if rows else None


def get_profile_by_email(email: str) -> ProfileRecord | None:
    response = (
        service_supabase.table("profiles")
        .select(PROFILE_COLUMNS)
        .eq("email", email.lower())
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return _hydrate_profile_record(rows[0]) if rows else None


def has_email_used_free_trial(email: str) -> bool:
    normalized_email = email.strip().lower()
    if not normalized_email:
        return False
    return _get_free_trial_ledger_seconds(normalized_email) >= FREE_TRIAL_LIMIT_SECONDS


def get_free_trial_used_seconds(profile_id: str, email: str) -> float:
    cleaned_profile_id = profile_id.strip()
    normalized_email = email.strip().lower()
    ledger_seconds = _get_free_trial_ledger_seconds(normalized_email)
    podcast_seconds = _get_free_trial_podcast_seconds(cleaned_profile_id)
    return max(ledger_seconds, podcast_seconds)


def get_free_trial_remaining_seconds(profile_id: str, email: str) -> float:
    return max(0.0, FREE_TRIAL_LIMIT_SECONDS - get_free_trial_used_seconds(profile_id, email))


def upsert_profile(profile_id: str, email: str, full_name: str | None = None) -> ProfileRecord:
    default_export_settings = ExportSettings().model_dump(mode="json")
    normalized_email = email.lower()
    free_trial_used = has_email_used_free_trial(normalized_email)
    response = (
        service_supabase.table("profiles")
        .upsert(
            {
                "id": profile_id,
                "email": normalized_email,
                "free_trial_used": free_trial_used,
                "full_name": full_name,
                "export_settings": default_export_settings,
            }
        )
        .execute()
    )
    rows = response.data or []
    return _hydrate_profile_record(rows[0])


def mark_free_trial_used(profile_id: str) -> None:
    record_free_trial_usage(profile_id, FREE_TRIAL_LIMIT_SECONDS)


def record_free_trial_usage(profile_id: str, duration_seconds: float) -> None:
    profile = get_profile_by_id(profile_id)
    used_seconds = max(0.0, float(duration_seconds or 0.0))
    if profile:
        existing_seconds = get_free_trial_used_seconds(profile.id, profile.email)
        total_seconds = min(FREE_TRIAL_LIMIT_SECONDS, existing_seconds + used_seconds)
        try:
            service_supabase.table("free_trial_usage").upsert(
                {
                    "email": profile.email.lower(),
                    "first_profile_id": profile.id,
                    "used_seconds": round(total_seconds, 2),
                },
                on_conflict="email",
            ).execute()
        except Exception:
            pass
        service_supabase.table("profiles").update(
            {"free_trial_used": total_seconds >= FREE_TRIAL_LIMIT_SECONDS}
        ).eq("id", profile_id).execute()
        return

    service_supabase.table("profiles").update({"free_trial_used": True}).eq("id", profile_id).execute()


def _get_free_trial_ledger_seconds(email: str) -> float:
    if not email:
        return 0.0
    try:
        response = (
            service_supabase.table("free_trial_usage")
            .select("used_seconds")
            .eq("email", email)
            .limit(1)
            .execute()
        )
    except Exception:
        return 0.0
    rows = response.data or []
    if not rows:
        return 0.0
    try:
        return max(0.0, float(rows[0].get("used_seconds") or 0.0))
    except Exception:
        return 0.0


def _get_free_trial_podcast_seconds(profile_id: str) -> float:
    if not profile_id:
        return 0.0
    try:
        response = (
            service_supabase.table("podcasts")
            .select("duration,price,payment_status")
            .eq("user_id", profile_id)
            .execute()
        )
    except Exception:
        return 0.0
    total = 0.0
    for row in response.data or []:
        try:
            price = float(row.get("price") or 0.0)
            payment_status = str(row.get("payment_status") or "")
            if price == 0.0 and payment_status == "not_required":
                total += max(0.0, float(row.get("duration") or 0.0))
        except Exception:
            continue
    return min(FREE_TRIAL_LIMIT_SECONDS, total)


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
    return _hydrate_profile_record(rows[0])


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
    profile = _hydrate_profile_record(rows[0])
    return UserExportSettingsResponse(
        user_id=profile.id,
        export_settings=profile.export_settings,
    )


def _send_user_message_notification(record: dict[str, object]) -> bool:
    settings = get_settings()
    recipient = settings.support_inbox_email.strip()
    smtp_host = settings.smtp_host.strip()
    sender_email = settings.smtp_from_email.strip() or settings.smtp_username.strip()

    if not recipient or not smtp_host or not sender_email:
        return False

    message_type = str(record.get("message_type") or "message")
    category = str(record.get("category") or "general")
    subject = str(record.get("subject") or f"New {message_type} message")
    contact_email = str(record.get("contact_email") or "").strip()

    email_message = EmailMessage()
    email_message["Subject"] = f"[InsightClips {message_type}] {subject}"
    email_message["From"] = f"{settings.smtp_from_name} <{sender_email}>"
    email_message["To"] = recipient
    if contact_email:
        email_message["Reply-To"] = contact_email
    email_message.set_content(
        "\n".join(
            [
                "A new InsightClips user message was submitted.",
                "",
                f"Type: {message_type}",
                f"Category: {category}",
                f"User id: {record.get('user_id') or ''}",
                f"Contact email: {contact_email or 'Not provided'}",
                f"Subject: {subject}",
                "",
                "Message:",
                str(record.get("message") or ""),
            ]
        )
    )

    try:
        if settings.smtp_port == 465:
            with smtplib.SMTP_SSL(smtp_host, settings.smtp_port, timeout=15) as smtp:
                if settings.smtp_username and settings.smtp_password:
                    smtp.login(settings.smtp_username, settings.smtp_password)
                smtp.send_message(email_message)
        else:
            with smtplib.SMTP(smtp_host, settings.smtp_port, timeout=15) as smtp:
                if settings.smtp_use_tls:
                    smtp.starttls()
                if settings.smtp_username and settings.smtp_password:
                    smtp.login(settings.smtp_username, settings.smtp_password)
                smtp.send_message(email_message)
    except Exception as exc:
        logger.warning("Unable to send user message notification email: %s", exc)
        return False

    return True


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
    email_notification_sent = _send_user_message_notification({**record, **row})
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
        email_notification_sent=email_notification_sent,
    )


def serialize_profile(profile: ProfileRecord) -> ProfileResponse:
    return ProfileResponse.model_validate(profile.model_dump())
