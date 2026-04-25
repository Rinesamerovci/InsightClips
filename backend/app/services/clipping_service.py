from __future__ import annotations

import shutil
import subprocess
import tempfile
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.config import ROOT_DIR, get_settings
from app.database import UnconfiguredSupabaseClient, service_supabase
from app.models.analysis import ScoreSegment
from app.models.clipping import ClipGenerationResult, ClipResult
from app.models.transcription import TranscriptWord, TranscriptionResult
import app.services.overlay_mapping_service as overlay_mapping_service_module


GENERATED_CLIPS_ROOT = ROOT_DIR / ".generated" / "clips"
CLIP_STORAGE_BUCKET = "clips"
SIGNED_URL_TTL_SECONDS = 3600
MAX_GENERATED_CLIPS = 5
MAX_SUBTITLE_WORDS_PER_CUE = 8
MAX_SUBTITLE_DURATION_SECONDS = 3.4
SUBTITLE_GAP_SECONDS = 0.55
CLIP_LEAD_IN_SECONDS = 2.0
CLIP_LEAD_OUT_SECONDS = 1.0


class ClippingError(Exception):
    def __init__(self, detail: str, *, status_code: int = 422) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


@dataclass(frozen=True)
class _SubtitleCue:
    start: float
    end: float
    text: str


def build_ffmpeg_clip_command(
    source_path: Path,
    output_path: Path,
    subtitle_path: Path,
    *,
    start_seconds: float,
    duration_seconds: float,
) -> list[str]:
    return [
        "ffmpeg",
        "-v",
        "error",
        "-nostdin",
        "-y",
        "-i",
        str(source_path),
        "-ss",
        f"{start_seconds:.3f}",
        "-t",
        f"{duration_seconds:.3f}",
        "-vf",
        _build_subtitle_filter(subtitle_path),
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        str(output_path),
    ]


def build_srt_content(
    transcription: TranscriptionResult,
    *,
    clip_start_seconds: float,
    clip_end_seconds: float,
) -> tuple[str, str]:
    clip_words = _collect_clip_words(
        transcription.words,
        clip_start_seconds=clip_start_seconds,
        clip_end_seconds=clip_end_seconds,
    )
    if not clip_words:
        raise ClippingError("No transcript words overlapped the requested clip window.")

    cues = _build_subtitle_cues(clip_words, clip_start_seconds=clip_start_seconds)
    if not cues:
        raise ClippingError("Unable to build readable subtitles for the requested clip.")

    srt_lines: list[str] = []
    for index, cue in enumerate(cues, start=1):
        srt_lines.extend(
            [
                str(index),
                f"{_format_srt_timestamp(cue.start)} --> {_format_srt_timestamp(cue.end)}",
                cue.text,
                "",
            ]
        )

    subtitle_text = _join_transcript_tokens(word.word for word in clip_words)
    return "\n".join(srt_lines).strip(), subtitle_text


def generate_clips(
    podcast_id: str,
    score_segments: list[ScoreSegment],
    transcription: TranscriptionResult,
) -> list[ClipResult]:
    podcast_row = _get_podcast_row(podcast_id)
    source_path = _resolve_source_media_path(podcast_row)
    selected_segments = _select_segments(score_segments)
    if not selected_segments:
        raise ClippingError("No scored segments are available for clip generation.", status_code=404)

    output_dir = _prepare_output_directory(podcast_id)
    generated_results: list[ClipResult] = []
    generated_pairs: list[tuple[ClipResult, ScoreSegment]] = []
    rows_to_persist: list[dict[str, Any]] = []

    for clip_number, segment in enumerate(selected_segments, start=1):
        clip_id = str(uuid.uuid4())
        clip_start, clip_end = _resolve_clip_window(segment, transcription)
        clip_duration = round(clip_end - clip_start, 3)
        if clip_duration <= 0:
            continue

        clip_filename = f"clip-{clip_number:02d}.mp4"
        subtitle_filename = f"clip-{clip_number:02d}.srt"
        clip_path = output_dir / clip_filename
        subtitle_path = output_dir / subtitle_filename

        try:
            srt_content, subtitle_text = build_srt_content(
                transcription,
                clip_start_seconds=clip_start,
                clip_end_seconds=clip_end,
            )
            subtitle_path.write_text(srt_content, encoding="utf-8")
            _run_ffmpeg_clip_generation(
                source_path,
                clip_path,
                subtitle_path,
                start_seconds=clip_start,
                duration_seconds=clip_duration,
            )
            storage_url, subtitle_url = _store_clip_assets(
                podcast_id,
                clip_filename=clip_filename,
                clip_path=clip_path,
                subtitle_filename=subtitle_filename,
                subtitle_path=subtitle_path,
            )
            video_url = storage_url or _build_backend_download_path(clip_id)
            generated_results.append(
                ClipResult(
                    id=clip_id,
                    clip_number=clip_number,
                    clip_start_seconds=clip_start,
                    clip_end_seconds=clip_end,
                    duration_seconds=clip_duration,
                    virality_score=segment.virality_score,
                    video_url=video_url,
                    subtitle_text=subtitle_text,
                    status="ready",
                )
            )
            generated_pairs.append((generated_results[-1], segment))
            rows_to_persist.append(
                {
                    "id": clip_id,
                    "podcast_id": podcast_id,
                    "clip_number": clip_number,
                    "clip_start_sec": clip_start,
                    "clip_end_sec": clip_end,
                    "virality_score": segment.virality_score,
                    "storage_path": str(clip_path),
                    "storage_url": storage_url,
                    "subtitle_url": subtitle_url or str(subtitle_path),
                    "subtitle_text": subtitle_text,
                    "status": "ready",
                }
            )
        except ClippingError:
            continue

    if not generated_results:
        raise ClippingError("No clips could be generated from the selected segments.")

    _persist_generated_clips(podcast_id, rows_to_persist)
    overlay_mapping_service_module.service_supabase = service_supabase
    overlay_result = overlay_mapping_service_module.build_overlay_mappings(podcast_id, generated_pairs)
    overlay_mapping_service_module.persist_overlay_mappings(overlay_result)
    overlays_by_clip_id = {decision.clip_id: decision for decision in overlay_result.overlay_decisions}
    generated_results = [
        clip.model_copy(update={"overlay": overlays_by_clip_id.get(clip.id)})
        for clip in generated_results
    ]
    return generated_results


def build_clip_generation_result(
    podcast_id: str,
    clips: list[ClipResult],
    *,
    processing_time_seconds: float,
) -> ClipGenerationResult:
    return ClipGenerationResult(
        podcast_id=podcast_id,
        total_clips_generated=len(clips),
        clips=clips,
        processing_time_seconds=round(processing_time_seconds, 3),
        download_folder_url=f"/podcasts/{podcast_id}/clips",
    )


def get_clips_for_podcast(podcast_id: str) -> ClipGenerationResult | None:
    if isinstance(service_supabase, UnconfiguredSupabaseClient):
        return None

    response = (
        service_supabase.table("clips")
        .select(
            "id,podcast_id,clip_number,clip_start_sec,clip_end_sec,virality_score,storage_path,storage_url,subtitle_text,status,published,download_url,published_at"
        )
        .eq("podcast_id", podcast_id)
        .order("clip_number")
        .execute()
    )
    rows = response.data or []
    if not rows:
        return None

    overlay_mapping_service_module.service_supabase = service_supabase
    overlays_by_clip_id = overlay_mapping_service_module.get_overlay_decisions_for_podcast(podcast_id)

    clips = [
        ClipResult(
            id=str(row["id"]),
            clip_number=int(row["clip_number"]),
            clip_start_seconds=float(row["clip_start_sec"]),
            clip_end_seconds=float(row["clip_end_sec"]),
            duration_seconds=round(float(row["clip_end_sec"]) - float(row["clip_start_sec"]), 3),
            virality_score=float(row["virality_score"]),
            video_url=str(row.get("storage_url") or _build_backend_download_path(str(row["id"]))),
            subtitle_text=str(row.get("subtitle_text") or ""),
            status=str(row.get("status") or "ready"),
            published=bool(row.get("published") or False),
            download_url=str(row.get("download_url") or "").strip() or None,
            published_at=row.get("published_at"),
            overlay=overlays_by_clip_id.get(str(row["id"])),
        )
        for row in rows
    ]
    return build_clip_generation_result(podcast_id, clips, processing_time_seconds=0.0)


def get_clip_download_target(clip_id: str) -> tuple[str | None, Path | None]:
    if isinstance(service_supabase, UnconfiguredSupabaseClient):
        return None, None

    response = (
        service_supabase.table("clips")
        .select("id,podcast_id,storage_path,storage_url")
        .eq("id", clip_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    if not rows:
        return None, None

    row = rows[0]
    storage_url = str(row.get("storage_url") or "").strip() or None
    storage_path = str(row.get("storage_path") or "").strip()
    file_path = Path(storage_path) if storage_path else None
    return storage_url, file_path


def get_clip_podcast_id(clip_id: str) -> str | None:
    if isinstance(service_supabase, UnconfiguredSupabaseClient):
        return None

    response = (
        service_supabase.table("clips")
        .select("podcast_id")
        .eq("id", clip_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    if not rows:
        return None
    return str(rows[0]["podcast_id"])


def _select_segments(score_segments: list[ScoreSegment]) -> list[ScoreSegment]:
    return sorted(
        score_segments,
        key=lambda item: (-item.virality_score, item.segment_start_seconds),
    )[:MAX_GENERATED_CLIPS]


def _resolve_clip_window(
    segment: ScoreSegment,
    transcription: TranscriptionResult,
) -> tuple[float, float]:
    matched_window = _match_segment_snippet_window(segment, transcription.words)
    if matched_window is not None:
        start, end = matched_window
        return _expand_clip_window(
            start,
            end,
            max_duration=transcription.duration_seconds,
        )

    return _expand_clip_window(
        segment.segment_start_seconds,
        segment.segment_end_seconds,
        max_duration=transcription.duration_seconds,
    )


def _match_segment_snippet_window(
    segment: ScoreSegment,
    words: list[TranscriptWord],
) -> tuple[float, float] | None:
    snippet_tokens = _snippet_tokens(segment.transcript_snippet)
    if not snippet_tokens:
        return None

    indexed_tokens: list[tuple[int, str]] = []
    for index, word in enumerate(words):
        normalized = _normalize_token(word.word)
        if normalized:
            indexed_tokens.append((index, normalized))

    normalized_words = [token for _, token in indexed_tokens]
    snippet_length = len(snippet_tokens)
    best_match: tuple[int, int] | None = None
    best_score = -1

    for start in range(0, max(len(normalized_words) - snippet_length + 1, 0)):
        window = normalized_words[start:start + snippet_length]
        score = sum(1 for left, right in zip(window, snippet_tokens) if left == right)
        if score > best_score:
            best_score = score
            best_match = (start, start + snippet_length - 1)
        if score == snippet_length:
            break

    if best_match is None:
        return None

    # Require a strong token match so we don't cut unrelated parts of the video.
    if best_score < max(3, int(snippet_length * 0.75)):
        return None

    start_word_index = indexed_tokens[best_match[0]][0]
    end_word_index = indexed_tokens[best_match[1]][0]
    start_seconds = max(0.0, words[start_word_index].start)
    end_seconds = min(transcription_duration(words), words[end_word_index].end)
    if end_seconds <= start_seconds:
        return None
    return start_seconds, end_seconds


def _expand_clip_window(
    start_seconds: float,
    end_seconds: float,
    *,
    max_duration: float,
) -> tuple[float, float]:
    expanded_start = max(0.0, float(start_seconds) - CLIP_LEAD_IN_SECONDS)
    expanded_end = min(max_duration, float(end_seconds) + CLIP_LEAD_OUT_SECONDS)
    if expanded_end <= expanded_start:
        expanded_end = min(max_duration, expanded_start + 1.0)
    return round(expanded_start, 3), round(expanded_end, 3)


def transcription_duration(words: list[TranscriptWord]) -> float:
    if not words:
        return 0.0
    return max(word.end for word in words)


def _snippet_tokens(snippet: str) -> list[str]:
    return [token for token in (_normalize_token(item) for item in snippet.split()) if token]


def _normalize_token(value: str) -> str:
    return str(value).strip().lower().strip(".,!?;:\"'()[]{}")


def _collect_clip_words(
    words: list[TranscriptWord],
    *,
    clip_start_seconds: float,
    clip_end_seconds: float,
) -> list[TranscriptWord]:
    return [
        word
        for word in sorted(words, key=lambda item: (item.start, item.end))
        if word.end >= clip_start_seconds and word.start <= clip_end_seconds
    ]


def _build_subtitle_cues(
    clip_words: list[TranscriptWord],
    *,
    clip_start_seconds: float,
) -> list[_SubtitleCue]:
    cues: list[_SubtitleCue] = []
    current_words: list[TranscriptWord] = []

    for word in clip_words:
        if current_words:
            cue_start_abs = current_words[0].start
            cue_end_abs = current_words[-1].end
            gap = round(word.start - current_words[-1].end, 3)
            cue_duration = round(cue_end_abs - cue_start_abs, 3)
            if (
                gap >= SUBTITLE_GAP_SECONDS
                or cue_duration >= MAX_SUBTITLE_DURATION_SECONDS
                or len(current_words) >= MAX_SUBTITLE_WORDS_PER_CUE
            ):
                cues.append(_finalize_subtitle_cue(current_words, clip_start_seconds))
                current_words = []
        current_words.append(word)

    if current_words:
        cues.append(_finalize_subtitle_cue(current_words, clip_start_seconds))

    return cues


def _finalize_subtitle_cue(words: list[TranscriptWord], clip_start_seconds: float) -> _SubtitleCue:
    start = max(0.0, round(words[0].start - clip_start_seconds, 3))
    end = max(start + 0.08, round(words[-1].end - clip_start_seconds, 3))
    tokens = [word.word for word in words]
    midpoint = len(tokens) // 2
    if len(tokens) >= 6:
        text = f"{_join_transcript_tokens(tokens[:midpoint])}\n{_join_transcript_tokens(tokens[midpoint:])}"
    else:
        text = _join_transcript_tokens(tokens)
    return _SubtitleCue(start=start, end=end, text=text)


def _join_transcript_tokens(tokens: Any) -> str:
    parts: list[str] = []
    for raw_token in tokens:
        token = str(raw_token).strip()
        if not token:
            continue
        if parts and token not in {".", ",", "!", "?", ":", ";"} and not token.startswith("'"):
            parts.append(" ")
        parts.append(token)
    return "".join(parts).strip()


def _format_srt_timestamp(seconds: float) -> str:
    total_milliseconds = int(round(seconds * 1000))
    hours, remainder = divmod(total_milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    whole_seconds, milliseconds = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{whole_seconds:02d},{milliseconds:03d}"


def _build_subtitle_filter(subtitle_path: Path) -> str:
    normalized = subtitle_path.resolve().as_posix().replace(":", r"\:")
    safe_path = normalized.replace("'", r"\'")
    style = (
        "FontName=Arial,Fontsize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H64000000,"
        "BackColour=&H32000000,BorderStyle=3,Outline=1,Shadow=0,MarginV=32"
    )
    return f"subtitles='{safe_path}':force_style='{style}'"


def _run_ffmpeg_clip_generation(
    source_path: Path,
    clip_path: Path,
    subtitle_path: Path,
    *,
    start_seconds: float,
    duration_seconds: float,
) -> None:
    if not shutil.which("ffmpeg"):
        raise ClippingError("ffmpeg is required to generate clips.", status_code=500)

    command = build_ffmpeg_clip_command(
        source_path,
        clip_path,
        subtitle_path,
        start_seconds=start_seconds,
        duration_seconds=duration_seconds,
    )
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=600,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise ClippingError("ffmpeg timed out while generating a clip.", status_code=504) from exc

    if result.returncode != 0 or not clip_path.exists():
        stderr = (result.stderr or result.stdout).strip()
        raise ClippingError(stderr or "ffmpeg failed to generate the clip.", status_code=502)


def _prepare_output_directory(podcast_id: str) -> Path:
    root = GENERATED_CLIPS_ROOT.resolve()
    root.mkdir(parents=True, exist_ok=True)
    output_dir = (root / podcast_id).resolve()
    if root not in output_dir.parents and output_dir != root:
        raise ClippingError("Resolved clip output path is unsafe.", status_code=500)
    if output_dir.exists():
        shutil.rmtree(output_dir, ignore_errors=True)
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir


def _get_podcast_row(podcast_id: str) -> dict[str, Any]:
    if isinstance(service_supabase, UnconfiguredSupabaseClient):
        raise ClippingError("Supabase must be configured before clips can be generated.", status_code=503)

    response = (
        service_supabase.table("podcasts")
        .select("id,storage_path")
        .eq("id", podcast_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    if not rows:
        raise ClippingError("Podcast was not found.", status_code=404)
    return rows[0]


def _resolve_source_media_path(podcast_row: dict[str, Any]) -> Path:
    storage_path = str(podcast_row.get("storage_path") or "").strip()
    if not storage_path:
        raise ClippingError("Podcast source media is missing, so clips cannot be generated.")
    source_path = Path(storage_path).expanduser().resolve()
    if not source_path.exists():
        raise ClippingError(f"Podcast source media was not found: {source_path}", status_code=404)
    return source_path


def _store_clip_assets(
    podcast_id: str,
    *,
    clip_filename: str,
    clip_path: Path,
    subtitle_filename: str,
    subtitle_path: Path,
) -> tuple[str | None, str | None]:
    if isinstance(service_supabase, UnconfiguredSupabaseClient):
        return None, None

    try:
        storage = service_supabase.storage.from_(CLIP_STORAGE_BUCKET)
        clip_storage_path = f"{podcast_id}/{clip_filename}"
        subtitle_storage_path = f"{podcast_id}/{subtitle_filename}"
        _upload_with_overwrite(
            storage,
            clip_storage_path,
            clip_path,
            content_type="video/mp4",
        )
        _upload_with_overwrite(
            storage,
            subtitle_storage_path,
            subtitle_path,
            content_type="application/x-subrip",
        )
        clip_signed = storage.create_signed_url(
            clip_storage_path,
            SIGNED_URL_TTL_SECONDS,
            {"download": clip_filename},
        )
        subtitle_signed = storage.create_signed_url(
            subtitle_storage_path,
            SIGNED_URL_TTL_SECONDS,
            {"download": subtitle_filename},
        )
        clip_url = clip_signed.get("signedURL") or clip_signed.get("signedUrl")
        subtitle_url = subtitle_signed.get("signedURL") or subtitle_signed.get("signedUrl")
        return str(clip_url) if clip_url else None, str(subtitle_url) if subtitle_url else None
    except Exception:
        return None, None


def _upload_with_overwrite(storage: Any, path: str, file_path: Path, *, content_type: str) -> None:
    try:
        storage.remove([path])
    except Exception:
        pass
    storage.upload(
        path,
        file_path,
        {"content-type": content_type, "upsert": "true"},
    )


def _persist_generated_clips(podcast_id: str, rows: list[dict[str, Any]]) -> None:
    if isinstance(service_supabase, UnconfiguredSupabaseClient):
        return
    service_supabase.table("clips").delete().eq("podcast_id", podcast_id).execute()
    if rows:
        service_supabase.table("clips").insert(rows).execute()


def _build_backend_download_path(clip_id: str) -> str:
    return f"/podcasts/clips/{clip_id}/download"
