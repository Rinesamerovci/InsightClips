# Rinesa Bislimi Backend Completion Notes

This document closes the backend/data-pipeline sprint requirements owned by
Rinesa Bislimi. It documents the implemented architecture, endpoint contracts,
database ownership model, and remaining operational notes without changing the
payment implementation, which is owned separately.

## Scope

Rinesa Bislimi owns the backend data-pipeline layer:

- Supabase authentication integration and profile data model
- Row-level security and ownership rules
- Backend upload and YouTube import validation
- Analytics and metrics delivery contracts
- Publishing lifecycle API contract
- Feedback, support, contact, and user settings APIs
- Environment and deployment documentation

Out of scope for this document and branch:

- Payment, pricing, checkout, Stripe, free-trial, and payment-status logic
- FFmpeg rendering internals
- Transcription provider internals
- AI scoring quality and render-output reliability
- Frontend UI implementation

## Sprint 1: Authentication, Profile, Schema, And RLS

### Implemented Architecture

InsightClips uses Supabase Auth as the canonical user identity provider.
Passwords are not stored in the application database. Supabase manages
`auth.users`, password hashing, email verification, refresh tokens, and session
security.

Application-specific user data is stored in `public.profiles`.

This means the sprint requirement for a local `users.password_hash` table is
implemented differently by design:

- `auth.users` is the secure user identity table.
- `public.profiles` extends each auth user with app-specific fields.
- `public.profiles.id` references `auth.users(id)`.
- The backend creates or syncs profile records during register, login, and
  session verification.

This avoids duplicating password storage and keeps credentials inside Supabase
Auth instead of the application schema.

### Auth Endpoints

Implemented in `backend/app/routers/auth.py`.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/auth/register` | Creates a Supabase Auth user and app profile |
| `POST` | `/auth/login` | Signs in with Supabase Auth and returns backend token |
| `POST` | `/auth/verify` | Verifies a Supabase session token and returns backend token |
| `POST` | `/auth/check-email` | Checks whether an account already exists |
| `GET` | `/auth/me` | Returns the authenticated backend user |

### Profile Endpoints

Implemented in `backend/app/routers/users.py`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/users/profile` | Loads the current user's profile |
| `PATCH` | `/users/profile` | Updates profile fields for the current user |
| `GET` | `/users/export-settings` | Loads the current user's saved export settings |
| `PATCH` | `/users/export-settings` | Saves export settings for the current user |
| `DELETE` | `/users/account` | Permanently deletes the authenticated user's account and owned data |

### Account Deletion

Account deletion is implemented as a backend-owned hard delete flow. The
frontend must send the signed-in email as confirmation, but it never sends a
`user_id`. The backend resolves the authenticated user from the backend token,
verifies the confirmation email against the profile, removes owned source media
from `podcast-sources`, removes generated clip objects from `clips`, cleans local
generated clip folders when present, deletes the Supabase Auth user, and relies
on database cascade/fallback profile deletion for owned rows.

### RLS And Ownership

Implemented in:

- `backend/sql/auth_schema.sql`
- `backend/sql/99_final_rls_policies.sql`

Canonical ownership rules:

- Users can select and update only their own `profiles` row.
- Users can select, insert, and update only their own `podcasts`.
- Users can select clips only through podcasts they own.
- Users can select overlays, scores, and publication records only for podcasts
  they own.
- Users can submit and view only their own `user_messages`.
- The service role can manage backend-owned tables during server-side workflows.

## Sprint 2: Upload And YouTube Import Backend

### File Upload Contract

Implemented in:

- `backend/app/routers/upload.py`
- `backend/app/services/upload_service.py`
- `backend/app/models/upload.py`

Supported backend flow:

1. Authenticated user uploads or stages media.
2. Backend validates filename, media type, size, and duration source.
3. Backend inspects staged media when a `storage_path` is available.
4. Backend creates a podcast record through the prepare flow.
5. Export settings are persisted with the podcast where available.

Payment-related decisions exist in the current codebase but are not part of
this completion scope.

### YouTube Import Contract

Implemented in `import_youtube_podcast`.

Accepted sources:

- `youtube.com`
- `www.youtube.com`
- `m.youtube.com`
- `music.youtube.com`
- `youtu.be`

Supported URL formats:

- `https://www.youtube.com/watch?v=<video_id>`
- `https://youtu.be/<video_id>`
- `https://www.youtube.com/shorts/<video_id>`
- `https://www.youtube.com/embed/<video_id>`
- `https://www.youtube.com/live/<video_id>`

Rejected cases:

- Non-YouTube hosts
- Empty URLs
- Unsupported URL schemes
- Playlist URLs
- Invalid YouTube video IDs
- Duplicate imports for the same user and YouTube video ID
- Failed or missing downloaded media

Stored metadata:

- `source_type = "youtube"`
- `source_url`
- `external_source_id`
- `import_metadata`
- `storage_path`
- `source_filename`
- detected format and MIME type

## Sprint 4: Publishing Lifecycle Backend Contract

Implemented in:

- `backend/app/routers/podcasts.py`
- `backend/app/routers/clips.py`
- `backend/app/services/publishing_service.py`
- `backend/app/models/publishing.py`

### Publish Flow

Publishing is protected by ownership checks before the publishing service is
called.

When a clip is published:

1. Backend confirms the podcast or clip belongs to the authenticated user.
2. Backend ensures the clip exists and is ready.
3. Backend uploads the local clip to Supabase Storage when needed.
4. Backend verifies storage access by generating a temporary signed URL.
5. Backend persists a stable backend download route in `clips.download_url`.
6. Backend records publication status in `clip_publications`.

The saved `download_url` is intentionally a backend route:

```text
/podcasts/clips/{clip_id}/download
```

The app does not persist long-lived Supabase signed URLs. The backend route
keeps ownership checks and download tracking centralized.

### Download Flow

When a user downloads a clip:

1. Backend resolves the clip's podcast.
2. Backend verifies the current user owns that podcast.
3. Backend serves published storage content when available.
4. Backend falls back to local preview content only when available.
5. Backend records the download metric.

### Revoke Flow

When a download is revoked:

- `clips.published` becomes `false`.
- `clips.download_url` becomes `null`.
- `clips.published_at` becomes `null`.
- The backend attempts to remove the published object from the `clips` storage
  bucket so older signed URLs stop resolving as soon as Supabase accepts the
  removal.
- `clip_publications` is updated with `status = "revoked"` and revoked
  metadata.

If storage removal fails because the object is already gone or storage is
temporarily unavailable, database revocation still completes. After revoke, the
protected download route returns an unavailable/not-found response because it
checks `clips.published` before serving content.

## Sprint 9: Profile, Settings, Publishing Authorization

Implemented safeguards:

- Profile updates use the authenticated user's ID.
- Export settings are saved only for the authenticated profile.
- Clip metrics require clip ownership through the parent podcast.
- Clip publication status requires clip ownership through the parent podcast.
- Publish and revoke actions require podcast or clip ownership.

The frontend does not get to choose another user's `user_id` for protected
backend operations.

## Sprint 10: Analytics API And Backend Hardening

Implemented in:

- `backend/app/routers/podcasts.py`
- `backend/app/routers/clips.py`
- `backend/app/services/podcast_service.py`
- `backend/app/services/publishing_service.py`

Analytics endpoints:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/podcasts/analytics` | User-level podcast and clip analytics |
| `GET` | `/podcasts/{podcast_id}/metrics` | Clip metrics for one owned podcast |
| `GET` | `/clips/{clip_id}/metrics` | Metrics for one owned clip |

Returned metrics include:

- total podcasts
- total clips
- published clips
- private clips
- total views
- total downloads
- average virality score
- publish rate
- top-performing clips
- per-podcast analytics summaries

Missing metric columns are handled with a fallback to zero values, which keeps
older databases from breaking the analytics response contract.

## Sprint 11: Generation Settings Backend Contract

Implemented in:

- `backend/app/models/export_settings.py`
- `backend/app/models/clipping.py`
- `backend/app/routers/clips.py`
- `backend/app/routers/podcasts.py`

Supported generation settings:

| Field | Validation |
|---|---|
| `clip_duration_seconds` | integer, 8 to 90 |
| `number_of_clips` | integer, 1 to 10 |
| `topic_focus` | optional, max 120 chars, safe punctuation only |
| `subtitles_enabled` | boolean |

The backend supports:

- default generation settings
- direct generation settings in clip-generation requests
- nested `generation_settings` inside export settings
- saved preferred generation settings on the user profile
- using preferred generation settings during later generation requests

## Sprint 12: Feedback, Support, Contact, And Content Calendar

Implemented in:

- `backend/app/routers/users.py`
- `backend/app/services/profile_service.py`
- `backend/app/services/publishing_service.py`
- `backend/app/models/profile.py`
- `backend/app/models/publishing.py`

Message endpoints:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/users/feedback` | Submit product feedback |
| `POST` | `/users/support` | Submit support request |
| `POST` | `/users/contact` | Submit contact message |

Message validation:

- `message_type` is one of `feedback`, `support`, or `contact`.
- `category` is one of `bug`, `feature_request`, `general`,
  `billing`, or `technical_support`.
- `message` must be 10 to 2000 characters.
- `subject` is optional and normalized.
- `contact_email` must be a valid email when present.

Content calendar endpoint:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/podcasts/{podcast_id}/content-calendar` | Returns platform planning suggestions for an owned podcast |

Supported platforms:

- TikTok
- LinkedIn
- YouTube

Each suggestion includes:

- clip ID and clip number
- scheduled day
- best local time
- title
- caption
- hashtags
- call to action
- repurpose angle

## Sprint 13: YouTube Import Backend Integration

The YouTube backend integration is implemented and covered by service/router
tests.

Key behaviors:

- User submits one YouTube video URL.
- Backend validates and normalizes the video ID.
- Playlist import is rejected.
- Duplicate import for the same user/video is rejected.
- `yt-dlp` downloads public media.
- Podcast metadata is created with source fields.
- Imported media enters the same podcast processing model as uploaded media.

Non-goals that remain out of scope:

- Playlist import
- Bulk channel import
- Direct browser-extension capture

## Environment Variables

Backend environment variables:

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Public Supabase key for auth operations |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side Supabase key for protected database/storage operations |
| `DATABASE_URL` | Optional direct PostgreSQL health-check connection |
| `JWT_SECRET` | Secret for backend-issued tokens |
| `FRONTEND_ORIGINS` | Comma-separated or JSON list of allowed frontend origins |
| `INSIGHTCLIPS_UPLOAD_DIR` | Persistent directory for uploaded and imported source media |
| `GROQ_API_KEY` | Transcription provider key used by the processing layer |
| `TRANSCRIPTION_API_BASE_URL` | Optional transcription-compatible API base URL |
| `TRANSCRIPTION_TIMEOUT_SECONDS` | Transcription request timeout |
| `TRANSCRIPTION_CHUNK_DURATION_SECONDS` | Chunk duration for long media |
| `SOURCE_STORAGE_BUCKET` | Optional source media bucket override; defaults to `podcast-sources` |
| `ALLOW_LOCAL_SOURCE_FALLBACK` | Allows local source fallback in development when storage upload fails |
| `SUPPORT_INBOX_EMAIL` | Inbox that receives feedback, support, and contact notifications |
| `SMTP_HOST` | SMTP host, for Resend use `smtp.resend.com` |
| `SMTP_PORT` | SMTP port, for Resend use `587` |
| `SMTP_USERNAME` | SMTP username, for Resend use `resend` |
| `SMTP_PASSWORD` | SMTP password or Resend API key |
| `SMTP_FROM_EMAIL` | Verified sender address, for example `noreply@insightclips.dev` |
| `SMTP_FROM_NAME` | Sender display name, for example `InsightClips` |
| `SMTP_USE_TLS` | Whether to start TLS for SMTP, usually `true` |
| `CLIP_FFMPEG_PRESET` | FFmpeg render speed preset; defaults to `veryfast` |
| `CLIP_FFMPEG_CRF` | Clip quality/speed CRF; defaults to `22` |
| `CLIP_FFMPEG_THREADS` | FFmpeg threads per clip; defaults to `1` to protect small Render instances |
| `CLIP_FFMPEG_TIMEOUT_SECONDS` | Per-clip FFmpeg timeout; defaults to `240` |

Recommended `FRONTEND_ORIGINS` format:

```text
http://localhost:3000,http://127.0.0.1:3000,https://insight-clips.vercel.app,https://insightclips.dev,https://www.insightclips.dev
```

## Deployment Notes

Current deployment layout:

- Frontend: Vercel
- Backend: Render
- Database/Auth/Storage: Supabase
- Email/Supabase SMTP: Resend through the verified project domain
- Domain: `insightclips.dev`

Render must include both apex and `www` frontend origins in CORS settings when
the production domain is active.

### Persistent Source Media On Render

Source media should be stored in Supabase Storage when the backend has a
configured service-role client and the `podcast-sources` bucket exists.

The backend stores source references in this format:

```text
supabase://podcast-sources/{user_id}/sources/{filename}
```

During transcription or clip generation, the backend downloads that object into
a temporary processing file, passes the local path to the existing media
pipeline, and keeps the database row pointing to Supabase Storage.

Render's `/tmp` directory is temporary. If the service restarts, source media
stored only in `/tmp` can disappear while the database row still points to the
old path. That causes processing errors such as:

```text
Podcast source media was not found
```

For extra safety and to avoid temporary processing files landing in `/tmp`,
configure a Render Persistent Disk and set:

```text
INSIGHTCLIPS_UPLOAD_DIR=/var/data/insightclips
```

With this setting:

- local fallback uploads are stored under `/var/data/insightclips/uploads`
- local fallback YouTube imports are stored under `/var/data/insightclips/youtube-imports`
- downloaded processing copies are stored under `/var/data/insightclips/processing`
- local development still falls back to the temporary/generated folders when
  the variable is not configured

Old podcast rows that already point to deleted `/tmp` files must be uploaded or
imported again because the original file no longer exists.

### Clip Generation Speed Notes

Clip rendering uses faster FFmpeg defaults to keep small Render instances from
stalling:

```text
CLIP_FFMPEG_PRESET=veryfast
CLIP_FFMPEG_CRF=22
CLIP_FFMPEG_THREADS=1
CLIP_FFMPEG_TIMEOUT_SECONDS=240
```

For a short demo on a machine with enough CPU/RAM, `CLIP_FFMPEG_PRESET=ultrafast`
and `CLIP_FFMPEG_CRF=24` can make renders faster at the cost of larger files and
lower visual compression quality. Avoid increasing `CLIP_FFMPEG_THREADS` too much
on Render's 512 MB plan because multiple threads can push memory usage back over
the instance limit.

Required Supabase Storage buckets:

| Bucket | Visibility | Purpose |
|---|---|---|
| `podcast-sources` | Private | Original uploaded/imported source media |
| `clips` | Private or protected | Generated clips and subtitles |

Storage bucket creation and policies are documented in:

```text
backend/sql/storage_policies.sql
```

Run that file in the Supabase SQL Editor after the public table schemas and
final RLS policies. It keeps both storage buckets private, gives users access
only to their own source-media folder, and lets the backend service role manage
source and generated clip objects.

## Verification Checklist

Use this checklist before final submission:

- [x] Auth architecture uses Supabase Auth plus `public.profiles`.
- [x] Passwords are not stored in application tables.
- [x] RLS protects profile, podcast, clip, publication, overlay, score, and
  message data.
- [x] Upload and YouTube import requests are authenticated.
- [x] YouTube playlist and invalid-source requests are rejected.
- [x] Analytics endpoints aggregate only owned user data.
- [x] Publish, revoke, download, and metric routes verify ownership.
- [x] Feedback/support/contact messages are validated and saved.
- [x] Generation settings are validated and persistable.
- [x] Environment variables and deployment responsibilities are documented.
- [x] Upload and YouTube source media can use Render Persistent Disk through
  `INSIGHTCLIPS_UPLOAD_DIR`.
