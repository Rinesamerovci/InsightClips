from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.transcription_service import TranscriptionError, transcribe_media


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Transcribe a local media file and print transcript text with word timestamps."
    )
    parser.add_argument("file_path", type=Path, help="Path to a local media file")
    parser.add_argument(
        "--model",
        default="base",
        help=(
            "Transcription model alias or OpenAI model ID. "
            "Supported aliases: tiny, base, small, medium."
        ),
    )
    args = parser.parse_args()

    try:
        result = transcribe_media(args.file_path, model=args.model)
    except TranscriptionError as exc:
        raise SystemExit(f"Error [{exc.code}]: {exc.detail}") from exc

    print(json.dumps(result.model_dump(mode="json"), indent=2))


if __name__ == "__main__":
    main()
