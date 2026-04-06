from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from pathlib import Path


def get_duration_seconds(file_path: Path) -> float:
    if not shutil.which("ffprobe"):
        raise RuntimeError("ffprobe is not installed or not available on PATH.")

    command = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        str(file_path),
    ]
    result = subprocess.run(command, capture_output=True, text=True, check=True)
    payload = json.loads(result.stdout)
    return float(payload["format"]["duration"])


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Read an .mp4 file and print its duration in seconds."
    )
    parser.add_argument("file_path", type=Path, help="Path to the .mp4 file")
    args = parser.parse_args()

    if not args.file_path.exists():
        raise FileNotFoundError(f"File not found: {args.file_path}")

    duration_seconds = get_duration_seconds(args.file_path)
    print(f"File: {args.file_path.name}, Duration: {duration_seconds:.2f}s")


if __name__ == "__main__":
    main()
