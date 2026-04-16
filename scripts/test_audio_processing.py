from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.utils.media import MediaInspectionError, inspect_media


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Inspect a local media file and print normalized duration metadata."
    )
    parser.add_argument("file_path", type=Path, help="Path to a local media file")
    parser.add_argument(
        "--mime-type",
        dest="mime_type",
        help="Optional MIME type to validate alongside the file extension.",
    )
    args = parser.parse_args()

    try:
        inspection = inspect_media(args.file_path, mime_type=args.mime_type)
    except MediaInspectionError as exc:
        raise SystemExit(f"Error [{exc.code}]: {exc.detail}") from exc

    print(json.dumps(inspection.model_dump(mode="json"), indent=2))


if __name__ == "__main__":
    main()
