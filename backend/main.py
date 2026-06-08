import os
import sys
from pathlib import Path

# Add the backend directory to sys.path so that 'app' can be imported
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# Add the bin directory to PATH for ffmpeg and ffprobe
root_dir = backend_dir.parent
bin_dir = root_dir / "bin"
if bin_dir.exists():
    os.environ["PATH"] = str(bin_dir) + os.pathsep + os.environ.get("PATH", "")

from app.main import app

if __name__ == "__main__":
    import uvicorn
    # Use the PORT environment variable if available (required by Render)
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
