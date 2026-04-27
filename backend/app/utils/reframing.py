from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

try:
    import cv2  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover - exercised through fallback behavior
    cv2 = None


PORTRAIT_ASPECT_RATIO = 9 / 16
DEFAULT_PORTRAIT_WIDTH = 1080
DEFAULT_PORTRAIT_HEIGHT = 1920
DEFAULT_SAMPLE_COUNT = 5


@dataclass(frozen=True)
class CropWindow:
    source_width: int
    source_height: int
    crop_width: int
    crop_height: int
    offset_x: int
    offset_y: int
    target_width: int = DEFAULT_PORTRAIT_WIDTH
    target_height: int = DEFAULT_PORTRAIT_HEIGHT
    strategy: str = "center_crop"
    face_detected: bool = False


@dataclass(frozen=True)
class FaceDetection:
    center_x: float
    center_y: float
    width: int
    height: int
    weight: float


def compute_portrait_crop_window(
    source_path: Path,
    *,
    clip_start_seconds: float,
    clip_duration_seconds: float,
    sample_count: int = DEFAULT_SAMPLE_COUNT,
    prefer_face_detection: bool = True,
) -> CropWindow:
    dimensions = read_video_dimensions(source_path)
    source_width, source_height = dimensions
    crop_width, crop_height = _resolve_portrait_crop_size(source_width, source_height)

    if crop_width >= source_width:
        return CropWindow(
            source_width=source_width,
            source_height=source_height,
            crop_width=source_width,
            crop_height=source_height,
            offset_x=0,
            offset_y=0,
            strategy="full_frame",
            face_detected=False,
        )

    face_center_x = None
    if prefer_face_detection:
        face_center_x = detect_primary_face_center_x(
            source_path,
            clip_start_seconds=clip_start_seconds,
            clip_duration_seconds=clip_duration_seconds,
            sample_count=sample_count,
        )
    centered_x = int(round((source_width - crop_width) / 2))
    if face_center_x is None:
        return CropWindow(
            source_width=source_width,
            source_height=source_height,
            crop_width=crop_width,
            crop_height=crop_height,
            offset_x=_clamp(centered_x, 0, source_width - crop_width),
            offset_y=0,
            strategy="center_crop",
            face_detected=False,
        )

    face_aligned_x = int(round(face_center_x - (crop_width / 2)))
    return CropWindow(
        source_width=source_width,
        source_height=source_height,
        crop_width=crop_width,
        crop_height=crop_height,
        offset_x=_clamp(face_aligned_x, 0, source_width - crop_width),
        offset_y=0,
        strategy="smart_crop",
        face_detected=True,
    )


def build_portrait_video_filters(crop_window: CropWindow) -> str:
    if crop_window.strategy == "full_frame":
        return (
            f"scale={crop_window.target_width}:{crop_window.target_height}:force_original_aspect_ratio=decrease,"
            f"pad={crop_window.target_width}:{crop_window.target_height}:(ow-iw)/2:(oh-ih)/2"
        )
    return (
        f"crop={crop_window.crop_width}:{crop_window.crop_height}:{crop_window.offset_x}:{crop_window.offset_y},"
        f"scale={crop_window.target_width}:{crop_window.target_height}"
    )


def detect_primary_face_center_x(
    source_path: Path,
    *,
    clip_start_seconds: float,
    clip_duration_seconds: float,
    sample_count: int = DEFAULT_SAMPLE_COUNT,
) -> float | None:
    if cv2 is None:
        return None

    capture = cv2.VideoCapture(str(source_path))
    if not capture.isOpened():
        capture.release()
        return None

    try:
        classifier = _load_face_classifier()
        if classifier is None:
            return None

        frame_centers: list[tuple[float, float]] = []
        timestamps = _sample_timestamps(
            clip_start_seconds=clip_start_seconds,
            clip_duration_seconds=clip_duration_seconds,
            sample_count=sample_count,
        )
        frame_width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH)) or 0

        for timestamp in timestamps:
            capture.set(cv2.CAP_PROP_POS_MSEC, max(timestamp, 0.0) * 1000.0)
            ok, frame = capture.read()
            if not ok or frame is None:
                continue
            detection = _detect_most_relevant_face(frame, classifier)
            if detection is None:
                continue
            normalized_center = detection.center_x / max(frame_width or frame.shape[1], 1)
            frame_centers.append((detection.center_x, detection.weight * max(normalized_center, 0.25)))

        if not frame_centers:
            return None

        weighted_sum = sum(center * weight for center, weight in frame_centers)
        total_weight = sum(weight for _, weight in frame_centers)
        if total_weight <= 0:
            return None
        return weighted_sum / total_weight
    finally:
        capture.release()


def read_video_dimensions(source_path: Path) -> tuple[int, int]:
    if cv2 is not None:
        capture = cv2.VideoCapture(str(source_path))
        if capture.isOpened():
            try:
                width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH)) or 0
                height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 0
                if width > 0 and height > 0:
                    return width, height
            finally:
                capture.release()

    # Conservative fallback that keeps portrait exports functional when OpenCV is unavailable.
    return 1920, 1080


def _resolve_portrait_crop_size(source_width: int, source_height: int) -> tuple[int, int]:
    crop_width = int(source_height * PORTRAIT_ASPECT_RATIO)
    crop_width -= crop_width % 2
    if crop_width <= 0:
        crop_width = min(source_width, 2)
    crop_height = source_height - (source_height % 2)
    return min(crop_width, source_width), crop_height


def _sample_timestamps(
    *,
    clip_start_seconds: float,
    clip_duration_seconds: float,
    sample_count: int,
) -> list[float]:
    bounded_duration = max(float(clip_duration_seconds), 0.0)
    if bounded_duration == 0:
        return [max(float(clip_start_seconds), 0.0)]
    bounded_samples = max(int(sample_count), 1)
    return [
        max(float(clip_start_seconds), 0.0) + (bounded_duration * (index + 1) / (bounded_samples + 1))
        for index in range(bounded_samples)
    ]


def _load_face_classifier() -> Any | None:
    if cv2 is None:
        return None
    cascade_dir = getattr(cv2.data, "haarcascades", None)
    if not cascade_dir:
        return None
    classifier = cv2.CascadeClassifier(str(Path(cascade_dir) / "haarcascade_frontalface_default.xml"))
    if classifier.empty():
        return None
    return classifier


def _detect_most_relevant_face(frame: Any, classifier: Any) -> FaceDetection | None:
    frame_height, frame_width = frame.shape[:2]
    grayscale = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = classifier.detectMultiScale(
        grayscale,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(48, 48),
    )
    if len(faces) == 0:
        return None

    frame_center_x = frame_width / 2
    frame_center_y = frame_height / 2
    best_detection: FaceDetection | None = None
    best_score = float("-inf")

    for x, y, width, height in faces:
        center_x = float(x + (width / 2))
        center_y = float(y + (height / 2))
        area = float(width * height)
        distance_penalty = abs(center_x - frame_center_x) + (0.35 * abs(center_y - frame_center_y))
        score = area - (distance_penalty * 18.0)
        if score > best_score:
            best_score = score
            best_detection = FaceDetection(
                center_x=center_x,
                center_y=center_y,
                width=int(width),
                height=int(height),
                weight=max(area, 1.0),
            )

    return best_detection


def _clamp(value: int, minimum: int, maximum: int) -> int:
    return max(minimum, min(value, maximum))
