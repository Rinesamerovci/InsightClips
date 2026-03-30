# InsightClips Backend

This folder contains the backend server for InsightClips.

## What is included

- `main.py` - FastAPI application with a simple Hello World endpoint.
- `test_ffmpeg.py` - FFmpeg/ffprobe test script that reads the duration of a `.mp4` video.
- `sample.mp4` - Example video used for local FFmpeg testing.

## Setup

1. Install dependencies in your Python environment:

   ```powershell
   python -m pip install -r ..\requirements.txt
   ```

2. Ensure `ffmpeg`/`ffprobe` is installed and available on your PATH.

## Run the backend server

From the workspace root:

```powershell
cd ..
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

Or from the `backend/` folder using the helper script:

```powershell
cd backend
.\start_backend.ps1
```

Then open:

```text
http://127.0.0.1:8000/
```

## Test FFmpeg duration reading

Run:

```powershell
cd backend
python test_ffmpeg.py sample.mp4
```

This should output the video duration if `ffprobe` is installed correctly.
