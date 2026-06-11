from __future__ import annotations

from dataclasses import dataclass
import logging
from pathlib import Path
from typing import Any
import smtplib
from email.message import EmailMessage

from app.config import ROOT_DIR, get_settings
from app.database import UnconfiguredSupabaseClient, service_supabase
from app.services.source_storage_service import is_source_storage_path, parse_source_storage_path

logger = logging.getLogger(__name__)


class AccountDeletionError(Exception):
    def __init__(self, detail: str, *, status_code: int = 400) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


@dataclass(frozen=True)
class AccountDeletionResult:
    user_id: str
    podcasts_deleted: int
    source_objects_removed: int
    clip_objects_removed: int
    auth_user_deleted: bool
    email_notification_sent: bool


def delete_account(profile_id: str, *, email: str | None = None) -> AccountDeletionResult:
    cleaned_profile_id = profile_id.strip()
    if not cleaned_profile_id:
        raise AccountDeletionError("Profile id is required.")
    if isinstance(service_supabase, UnconfiguredSupabaseClient):
        raise AccountDeletionError("Supabase must be configured before an account can be deleted.", status_code=503)

    podcast_rows = _select_user_podcasts(cleaned_profile_id)
    podcast_ids = [str(row.get("id") or "").strip() for row in podcast_rows if str(row.get("id") or "").strip()]

    _delete_profile_row(cleaned_profile_id)
    auth_user_deleted = _delete_auth_user(cleaned_profile_id)

    source_objects_removed = _remove_source_objects(cleaned_profile_id, podcast_rows)
    clip_objects_removed = _remove_clip_objects(podcast_ids)
    _remove_local_generated_clip_dirs(podcast_ids)

    email_notification_sent = _send_account_deleted_email(email)

    return AccountDeletionResult(
        user_id=cleaned_profile_id,
        podcasts_deleted=len(podcast_ids),
        source_objects_removed=source_objects_removed,
        clip_objects_removed=clip_objects_removed,
        auth_user_deleted=auth_user_deleted,
        email_notification_sent=email_notification_sent,
    )


def _send_account_deleted_email(email: str | None) -> bool:
    recipient = (email or "").strip().lower()
    if not recipient:
        return False

    settings = get_settings()
    smtp_host = settings.smtp_host.strip()
    sender_email = settings.smtp_from_email.strip() or settings.smtp_username.strip()
    if not smtp_host or not sender_email:
        return False

    message = EmailMessage()
    message["Subject"] = "Your InsightClips account was deleted"
    message["From"] = f"{settings.smtp_from_name} <{sender_email}>"
    message["To"] = recipient
    message.set_content(
        "\n".join(
            [
                "Your InsightClips account has been deleted.",
                "",
                "We removed your profile, podcasts, source media, and generated clips from the application.",
                "For fairness, the one-time free upload remains tied to this email if it was already used before deletion.",
                "",
                "If this was not requested by you, please contact the InsightClips team.",
            ]
        )
    )

    try:
        if settings.smtp_port == 465:
            with smtplib.SMTP_SSL(smtp_host, settings.smtp_port, timeout=15) as smtp:
                if settings.smtp_username and settings.smtp_password:
                    smtp.login(settings.smtp_username, settings.smtp_password)
                smtp.send_message(message)
        else:
            with smtplib.SMTP(smtp_host, settings.smtp_port, timeout=15) as smtp:
                if settings.smtp_use_tls:
                    smtp.starttls()
                if settings.smtp_username and settings.smtp_password:
                    smtp.login(settings.smtp_username, settings.smtp_password)
                smtp.send_message(message)
    except Exception as exc:
        logger.warning("Unable to send account deletion email: %s", exc)
        return False
    return True


def _select_user_podcasts(profile_id: str) -> list[dict[str, Any]]:
    response = (
        service_supabase.table("podcasts")
        .select("id,storage_path")
        .eq("user_id", profile_id)
        .execute()
    )
    return list(response.data or [])


def _remove_source_objects(profile_id: str, podcast_rows: list[dict[str, Any]]) -> int:
    keys_by_bucket: dict[str, set[str]] = {}
    for row in podcast_rows:
        storage_path = str(row.get("storage_path") or "").strip()
        if is_source_storage_path(storage_path):
            bucket, key = parse_source_storage_path(storage_path)
            keys_by_bucket.setdefault(bucket, set()).add(key)

    keys_by_bucket.setdefault("podcast-sources", set()).update(
        _list_storage_paths("podcast-sources", profile_id)
    )
    return _remove_storage_keys(keys_by_bucket)


def _remove_clip_objects(podcast_ids: list[str]) -> int:
    keys: set[str] = set()
    for podcast_id in podcast_ids:
        keys.update(_list_storage_paths("clips", podcast_id))
    return _remove_storage_keys({"clips": keys})


def _list_storage_paths(bucket: str, prefix: str) -> set[str]:
    storage = service_supabase.storage.from_(bucket)
    found: set[str] = set()
    visited: set[str] = set()

    def walk(path: str, depth: int = 0) -> None:
        if depth > 6 or path in visited:
            return
        visited.add(path)
        try:
            entries = storage.list(path)
        except Exception:
            return
        for entry in entries or []:
            if not isinstance(entry, dict):
                continue
            name = str(entry.get("name") or "").strip()
            if not name:
                continue
            child_path = f"{path.rstrip('/')}/{name}" if path else name
            metadata = entry.get("metadata")
            object_id = entry.get("id")
            if metadata is not None or object_id:
                found.add(child_path)
            walk(child_path, depth + 1)

    walk(prefix.strip("/"))
    return found


def _remove_storage_keys(keys_by_bucket: dict[str, set[str]]) -> int:
    removed = 0
    for bucket, keys in keys_by_bucket.items():
        cleaned_keys = sorted({key.strip("/") for key in keys if key.strip("/")})
        if not cleaned_keys:
            continue
        storage = service_supabase.storage.from_(bucket)
        for chunk in _chunked(cleaned_keys, 100):
            try:
                storage.remove(chunk)
                removed += len(chunk)
            except Exception:
                continue
    return removed


def _remove_local_generated_clip_dirs(podcast_ids: list[str]) -> None:
    generated_root = ROOT_DIR / ".generated" / "clips"
    root = generated_root.resolve()
    for podcast_id in podcast_ids:
        candidate = (root / podcast_id).resolve()
        if root in candidate.parents and candidate.exists():
            import shutil

            shutil.rmtree(candidate, ignore_errors=True)


def _delete_auth_user(profile_id: str) -> bool:
    admin = getattr(getattr(service_supabase, "auth", None), "admin", None)
    delete_user = getattr(admin, "delete_user", None)
    if not callable(delete_user):
        raise AccountDeletionError(
            "Supabase Auth admin API is not available. Confirm SUPABASE_SERVICE_ROLE_KEY is configured in the backend.",
            status_code=503,
        )
    try:
        delete_user(profile_id)
    except Exception as exc:
        message = str(exc)
        normalized_message = message.lower()
        if "not found" in normalized_message or "404" in normalized_message:
            return False
        raise AccountDeletionError(
            "Supabase Auth user could not be deleted. Confirm the backend is using the service_role key "
            f"and restart it. Supabase said: {message}",
            status_code=502,
        ) from exc
    return True


def _delete_profile_row(profile_id: str) -> None:
    try:
        service_supabase.table("profiles").delete().eq("id", profile_id).execute()
    except Exception as exc:
        raise AccountDeletionError(
            "Account profile data could not be deleted before removing auth access. "
            "Check that related user tables use ON DELETE CASCADE and rerun the Supabase schema repairs. "
            f"Supabase said: {exc}",
            status_code=502,
        ) from exc


def _chunked(items: list[str], size: int) -> list[list[str]]:
    return [items[index : index + size] for index in range(0, len(items), size)]
