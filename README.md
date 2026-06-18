# InsightClips

AI-powered podcast clipping platform for uploading long-form audio/video, analyzing the strongest moments, and generating short clips with captions.

## Current Architecture

```text
Frontend: Next.js / React
Backend: FastAPI / Python
Auth + Database: Supabase
Source media: Supabase Storage bucket podcast-sources
Generated clips: Supabase Storage bucket clips
Email: Resend SMTP through backend settings
Video processing: FFmpeg
```

For production-like video processing, the backend needs enough RAM/CPU for FFmpeg. Render/Vercel free tiers are useful for small demos, but long videos should run on a stronger backend host such as a DigitalOcean Droplet.

## Project Structure

```text
InsightClips/
  backend/
    app/
      models/
      routers/
      services/
      utils/
    sql/
    tests/
  frontend/
    app/
    components/
    context/
    lib/
    tests/
  docs/
  planning/
  scripts/
```

## Main Features

- Supabase authentication and profile sync
- Upload from local file or YouTube import
- One-time free upload logic with persistent email ledger
- Media inspection and duration-based upload gating
- Podcast analysis and virality scoring
- FFmpeg clip generation with subtitle rendering
- Clip publishing, revoke/download tracking, and analytics
- Feedback, support, and contact forms with optional SMTP email
- Delete podcast with storage/database cleanup
- Delete account with email confirmation and final browser confirmation

## Backend Setup

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r ..\requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Health check:

```text
http://127.0.0.1:8000/health
```

## Frontend Setup

```powershell
cd frontend
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## Required Environment Variables

Backend:

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
JWT_SECRET=
GROQ_API_KEY=
FRONTEND_ORIGINS=http://localhost:3000,https://insightclips.dev

SUPPORT_INBOX_EMAIL=
RESEND_API_KEY=
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USERNAME=resend
SMTP_PASSWORD=
SMTP_FROM_EMAIL=noreply@insightclips.dev
SMTP_FROM_NAME=InsightClips
SMTP_USE_TLS=true
```

Frontend:

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Never commit `.env`, `.env.local`, service role keys, API keys, or SMTP passwords.

## Supabase Setup

Run the SQL files from `backend/sql` in the order listed in:

```text
backend/sql/00_SUPABASE_RUN_ORDER.sql
```

Important files:

- `schema_init.sql`
- `auth_schema.sql`
- `analysis_schema.sql`
- `clips_schema.sql`
- `publication_schema.sql`
- `free_trial_usage_ledger.sql`
- `storage_policies.sql`
- `99_final_rls_policies.sql`

Required buckets:

```text
podcast-sources
clips
```

The buckets should be private. Backend operations that manage source videos and generated clips require `SUPABASE_SERVICE_ROLE_KEY`.

## Testing

Backend:

```powershell
python -m unittest discover backend.tests
python -m compileall backend\app
```

Frontend:

```powershell
cd frontend
npm run test
npm run lint
```

## Deployment Notes

Recommended stable setup:

```text
Frontend: Vercel or DigitalOcean
Backend + FFmpeg worker: DigitalOcean Droplet
Database/Auth: Supabase
Storage: Supabase Storage or DigitalOcean Spaces
Email: Resend
Domain: insightclips.dev
```

For long videos, avoid relying on `/tmp` as permanent storage. Source media and generated clips should live in object storage, while the backend only uses temporary local files during processing.

## Team Workflow

- Work in feature branches.
- Do not commit secrets.
- Open pull requests into `develop`.
- Test `develop` before merging to `main`.
- Keep payment-specific work isolated from non-payment backend/data-pipeline changes.

## Useful Docs

- Backend completion notes: `docs/rinesa-bislimi-backend-completion.md`
- Lista 2 audit: `docs/rinesa-bislimi-lista-2-audit.md`
