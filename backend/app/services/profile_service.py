from __future__ import annotations

import logging
import smtplib
import html
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
    recipient = getattr(settings, "support_inbox_email", "").strip()
    resend_api_key = getattr(settings, "resend_api_key", "").strip() or getattr(settings, "smtp_password", "").strip()

    if not recipient or not resend_api_key:
        logger.warning("Resend API notification skipped: missing recipient or API key")
        return False

    message_type = str(record.get("message_type") or "message")
    category = str(record.get("category") or "general")
    subject = str(record.get("subject") or f"New {message_type} message")
    contact_email = str(record.get("contact_email") or "").strip()

    sender_email = getattr(settings, "smtp_from_email", "").strip() or getattr(settings, "smtp_username", "").strip()
    resend_from = sender_email if "@" in sender_email else "onboarding@resend.dev"
    sender_name = getattr(settings, "smtp_from_name", "").strip() or "InsightClips"

    user_id = str(record.get("user_id") or "").strip()
    profile_email = "Not available"
    profile_name = "Not provided"
    if user_id:
        try:
            profile = get_profile_by_id(user_id)
            if profile:
                profile_email = profile.email
                profile_name = profile.full_name or "Not provided"
        except Exception:
            pass

    from datetime import datetime, timezone
    submitted_at = datetime.now(timezone.utc).strftime("%B %d, %Y - %H:%M UTC")

    body_text = "\n".join(
        [
            "A new InsightClips user message was submitted.",
            "",
            f"Type: {message_type}",
            f"Category: {category}",
            f"User id: {user_id}",
            f"Sender Name: {profile_name}",
            f"Account Email: {profile_email}",
            f"Contact Email: {contact_email or 'Not provided'}",
            f"Subject: {subject}",
            f"Submitted at: {submitted_at}",
            "",
            "Message:",
            str(record.get("message") or ""),
        ]
    )

    # Construct the beautiful HTML template matching the premium green/dark brand
    html_template = """<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>InsightClips Support Ticket</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: #f4f8f3;
      color: #112410;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      padding: 40px 20px;
      background-color: #f4f8f3;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 16px;
      border: 1px solid rgba(130, 201, 116, 0.22);
      box-shadow: 0 10px 30px rgba(18, 43, 17, 0.04);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #112410, #1b3d19);
      padding: 32px 24px;
      text-align: center;
      position: relative;
    }
    .header h1 {
      margin: 0;
      color: #ffffff;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .header p {
      margin: 8px 0 0;
      color: #82c974;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    .content {
      padding: 36px 32px;
    }
    .badge-container {
      margin-bottom: 24px;
      text-align: center;
    }
    .badge {
      display: inline-block;
      padding: 6px 14px;
      border-radius: 99px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      margin: 0 4px;
    }
    .badge-type {
      background-color: #e2f4dd;
      color: #2b6121;
      border: 1px solid rgba(43, 97, 33, 0.12);
    }
    .badge-category {
      background-color: #f5f9f3;
      color: #4a753f;
      border: 1px solid rgba(74, 117, 63, 0.12);
    }
    .grid {
      width: 100%;
      border-collapse: collapse;
      margin: 24px 0;
      background-color: #fcfdfc;
      border-radius: 12px;
      border: 1px solid rgba(130, 201, 116, 0.12);
      overflow: hidden;
    }
    .grid td {
      padding: 14px 16px;
      border-bottom: 1px solid rgba(130, 201, 116, 0.08);
      font-size: 13px;
      vertical-align: middle;
    }
    .grid tr:last-child td {
      border-bottom: none;
    }
    .grid td.label {
      font-weight: 700;
      color: #1b3d19;
      width: 30%;
      text-transform: uppercase;
      font-size: 10px;
      letter-spacing: 0.08em;
    }
    .grid td.value {
      color: #333333;
      word-break: break-all;
    }
    .message-card {
      background-color: #fafdf9;
      border-left: 4px solid #82c974;
      border-radius: 4px 12px 12px 4px;
      padding: 24px;
      margin: 24px 0;
      box-shadow: inset 0 0 12px rgba(130, 201, 116, 0.02);
    }
    .message-title {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: #2b6121;
      margin-bottom: 12px;
    }
    .message-text {
      font-size: 14px;
      line-height: 1.7;
      color: #1a2a17;
      white-space: pre-wrap;
      margin: 0;
    }
    .button-container {
      text-align: center;
      margin-top: 32px;
      margin-bottom: 8px;
    }
    .button {
      display: inline-block;
      background-color: #1b3d19;
      color: #ffffff !important;
      text-decoration: none;
      padding: 14px 32px;
      border-radius: 99px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.05em;
      box-shadow: 0 8px 20px rgba(27, 61, 25, 0.15);
    }
    .footer {
      background-color: #fafdfa;
      padding: 20px;
      text-align: center;
      font-size: 11px;
      color: #8fa68a;
      border-top: 1px solid rgba(130, 201, 116, 0.08);
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <h1>InsightClips Hub</h1>
        <p>User Support Ticket</p>
      </div>
      <div class="content">
        <div class="badge-container">
          <span class="badge badge-type">{{message_type}}</span>
          <span class="badge badge-category">{{category}}</span>
        </div>
        
        <table class="grid">
          <tr>
            <td class="label">Date / Time</td>
            <td class="value">{{submitted_at}}</td>
          </tr>
          <tr>
            <td class="label">User Name</td>
            <td class="value" style="font-weight: 600; color: #112410;">{{profile_name}}</td>
          </tr>
          <tr>
            <td class="label">Account Email</td>
            <td class="value">
              <a href="mailto:{{profile_email}}" style="color: #2b6121; text-decoration: none; font-weight: 600;">{{profile_email}}</a>
            </td>
          </tr>
          <tr>
            <td class="label">Contact Email</td>
            <td class="value">
              <a href="mailto:{{contact_email}}" style="color: #2b6121; text-decoration: none; font-weight: 600;">{{contact_email}}</a>
            </td>
          </tr>
          <tr>
            <td class="label">User ID</td>
            <td class="value" style="font-family: monospace; font-size: 12px; color: #555555;">{{user_id}}</td>
          </tr>
          <tr>
            <td class="label">Subject</td>
            <td class="value" style="font-weight: 600; color: #112410;">{{subject}}</td>
          </tr>
        </table>
        
        <div class="message-card">
          <div class="message-title">Message Details</div>
          <p class="message-text">{{message_body}}</p>
        </div>
        
        <div class="button-container">
          <a href="mailto:{{reply_email}}?subject=Re: {{subject}}" class="button">Reply directly by email</a>
        </div>
      </div>
      <div class="footer">
        This is an automated operational notification sent from the InsightClips Platform.
      </div>
    </div>
  </div>
</body>
</html>"""

    reply_email = contact_email or (profile_email if "@" in profile_email else "") or recipient
    html_body = (
        html_template.replace("{{message_type}}", html.escape(message_type))
        .replace("{{category}}", html.escape(category.replace("_", " ")))
        .replace("{{user_id}}", html.escape(user_id))
        .replace("{{profile_name}}", html.escape(profile_name))
        .replace("{{profile_email}}", html.escape(profile_email))
        .replace("{{contact_email}}", html.escape(contact_email or "Not provided"))
        .replace("{{subject}}", html.escape(subject))
        .replace("{{message_body}}", html.escape(str(record.get("message") or "")))
        .replace("{{submitted_at}}", html.escape(submitted_at))
        .replace("{{reply_email}}", html.escape(reply_email))
    )

    headers = {
        "Authorization": f"Bearer {resend_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "from": f"{sender_name} <{resend_from}>",
        "to": [recipient],
        "subject": f"[InsightClips {message_type}] {subject}",
        "text": body_text,
        "html": html_body,
    }
    if reply_email:
        payload["reply_to"] = reply_email

    try:
        import httpx
        url = "https://api.resend.com/emails"
        response = httpx.post(url, headers=headers, json=payload, timeout=15)
        
        # Fallback if domain is unverified / invalid domain on DO or localhost
        if response.status_code >= 400 and resend_from != "onboarding@resend.dev":
            logger.warning(
                "Resend API error %d. Retrying with onboarding@resend.dev as fallback...",
                response.status_code
            )
            fallback_payload = dict(payload)
            fallback_payload["from"] = f"{sender_name} <onboarding@resend.dev>"
            response = httpx.post(url, headers=headers, json=fallback_payload, timeout=15)
            
        if response.status_code >= 400:
            logger.warning("Resend API response error: %d - %s", response.status_code, response.text)
            return False
        return True
    except Exception as exc:
        logger.warning("Unable to send user message notification via Resend API: %s", exc)
        return False



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
