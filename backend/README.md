# InsightClips Backend

## Setup

1. Create and activate a virtual environment.
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Copy `backend/.env.example` to `backend/.env.local` and fill in your values.
4. Apply `backend/sql/schema_init.sql` in the Supabase SQL editor.
5. Start the API from the `backend` folder:
   ```bash
   uvicorn main:app --reload
   ```

## Environment Variables

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_ALGORITHM`
- `JWT_EXPIRES_MINUTES`
- `FRONTEND_ORIGINS`

## Endpoints

### Health

- `GET /`
- `GET /health`

### Auth

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/verify`
- `GET /auth/me`

### Users

- `GET /users/profile`

### Podcasts

- `GET /podcasts`

## CLI Test Script

Run the proof-of-concept duration script from the project root:

```bash
python scripts/test_audio_processing.py 15616403_3840_2160_60fps.mp4
```
