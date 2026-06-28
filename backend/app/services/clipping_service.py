from __future__ import annotations

import re
import shutil
import subprocess
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.config import BACKEND_DIR, ROOT_DIR, get_settings
from app.database import UnconfiguredSupabaseClient, service_supabase
from app.models.analysis import ScoreSegment
from app.models.clipping import ClipGenerationResult, ClipResult
from app.models.export_settings import (
    ExportSettings,
    ExportSettingsInput,
    coerce_persisted_export_settings,
)
from app.models.overlay import OverlayDecision, OverlayMappingResult
from app.models.transcription import TranscriptWord, TranscriptionResult
import app.services.overlay_mapping_service as overlay_mapping_service_module


GENERATED_CLIPS_ROOT = ROOT_DIR / ".generated" / "clips"
CLIP_STORAGE_BUCKET = "clips"
SIGNED_URL_TTL_SECONDS = 3600
MAX_GENERATED_CLIPS = 5
MAX_SUBTITLE_WORDS_PER_CUE = 6
MAX_SUBTITLE_DURATION_SECONDS = 2.6
SUBTITLE_GAP_SECONDS = 0.35
CLIP_LEAD_IN_SECONDS = 2.0
CLIP_LEAD_OUT_SECONDS = 1.0
OVERLAY_ASSETS_ROOT = BACKEND_DIR / "assets" / "overlays"
PORTRAIT_WIDTH = 720
PORTRAIT_HEIGHT = 1280


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
    export_settings: ExportSettings | None = None,
    overlay: OverlayDecision | None = None,
    overlay_asset_path: Path | None = None,
) -> list[str]:
    settings = get_settings()
    resolved_export_settings = export_settings or ExportSettings()
    command = [
        "ffmpeg",
        "-v",
        "error",
        "-nostdin",
        "-y",
        "-i",
        str(source_path),
    ]
    if overlay is not None and overlay_asset_path is not None:
        command.extend(
            [
                "-loop",
                "1",
                "-i",
                str(overlay_asset_path),
            ]
        )
    command.extend(
        [
            "-ss",
            f"{start_seconds:.3f}",
            "-t",
            f"{duration_seconds:.3f}",
        ]
    )
    if overlay is not None and overlay_asset_path is not None:
        command.extend(
            [
                "-filter_complex",
                _build_video_filter_graph(subtitle_path, overlay, resolved_export_settings),
                "-map",
                "[vout]",
                "-map",
                "0:a?",
            ]
        )
    else:
        command.extend(["-vf", _build_clip_filter_chain(subtitle_path, resolved_export_settings)])
    command.extend(
        [
            "-c:v",
            "libx264",
            "-preset",
            settings.clip_ffmpeg_preset,
            "-crf",
            str(settings.clip_ffmpeg_crf),
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
    )
    if settings.clip_ffmpeg_threads is not None:
        command.extend(["-threads", str(settings.clip_ffmpeg_threads)])
    return command


def build_srt_content(
    transcription: TranscriptionResult,
    *,
    clip_start_seconds: float,
    clip_end_seconds: float,
    export_mode: str = "landscape",
    subtitle_timing_profile: str = "balanced",
) -> tuple[str, str]:
    max_words_per_cue, max_duration_seconds, gap_seconds = _resolve_subtitle_timing(
        export_mode=export_mode,
        subtitle_timing_profile=subtitle_timing_profile,
    )
    clip_words = _collect_clip_words(
        transcription.words,
        clip_start_seconds=clip_start_seconds,
        clip_end_seconds=clip_end_seconds,
    )
    if not clip_words:
        raise ClippingError("No transcript words overlapped the requested clip window.")

    cues = _build_subtitle_cues(
        clip_words,
        clip_start_seconds=clip_start_seconds,
        export_mode=export_mode,
        max_words_per_cue=max_words_per_cue,
        max_duration_seconds=max_duration_seconds,
        gap_seconds=gap_seconds,
    )
    if not cues:
        raise ClippingError("Unable to build readable subtitles for the requested clip.")

    srt_lines: list[str] = []
    for index, cue in enumerate(cues, start=1):
        srt_lines.extend(
            [
                str(index),
                f"{_format_srt_timestamp(cue.start)} --> {_format_srt_timestamp(cue.end)}",
                _format_subtitle_text(cue.text),
                "",
            ]
        )

    subtitle_text = _format_subtitle_text(_join_transcript_tokens(word.word for word in clip_words))
    return "\n".join(srt_lines).strip(), subtitle_text


from app.models.export_settings import GenerationSettings

def generate_clips(
    podcast_id: str,
    score_segments: list[ScoreSegment],
    transcription: TranscriptionResult,
    export_settings: ExportSettingsInput | ExportSettings | None = None,
    generation_settings: GenerationSettings | None = None,
    visual_output_mode: str = "original_people",
) -> list[ClipResult]:
    podcast_row = _get_podcast_row(podcast_id)
    source_path = _resolve_source_media_path(podcast_row)
    resolved_generation_settings = generation_settings or GenerationSettings()
    source_duration_seconds = float(podcast_row.get("duration") or 0.0)
    requested_clip_count = _resolve_clip_count_limit(
        source_duration_seconds,
        resolved_generation_settings.clip_duration_seconds,
        resolved_generation_settings.number_of_clips,
    )
    selected_segments = _select_segments(score_segments, limit=requested_clip_count)
    if not selected_segments:
        raise ClippingError("No scored segments are available for clip generation.", status_code=404)

    resolved_export_settings = _resolve_export_settings(export_settings, podcast_row=podcast_row)
    resolved_generation_settings = generation_settings or GenerationSettings()
    output_dir = _prepare_output_directory(podcast_id)
    overlay_mapping_service_module.service_supabase = service_supabase
    generated_results: list[ClipResult] = []
    overlay_decisions: list[OverlayDecision] = []
    rows_to_persist: list[dict[str, Any]] = []

    for clip_number, segment in enumerate(selected_segments, start=1):
        clip_id = str(uuid.uuid4())
        clip_start, clip_end = _resolve_clip_window(segment, transcription, target_duration_seconds=resolved_generation_settings.clip_duration_seconds)
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
                export_mode=resolved_export_settings.export_mode,
                subtitle_timing_profile=resolved_export_settings.subtitle_timing_profile,
            )
            from app.services.analysis_service import generate_smart_hooks_with_groq
            smart_hooks = generate_smart_hooks_with_groq(subtitle_text)

            draft_clip = ClipResult(
                id=clip_id,
                clip_number=clip_number,
                clip_start_seconds=clip_start,
                clip_end_seconds=clip_end,
                duration_seconds=clip_duration,
                virality_score=segment.virality_score,
                topic_matched=segment.topic_matched,
                video_url=_build_backend_download_path(clip_id),
                subtitle_url=None,
                subtitle_text=subtitle_text,
                status="ready",
                export_settings=resolved_export_settings,
                generation_settings=resolved_generation_settings,
                visual_output_mode=visual_output_mode,
                smart_hooks=smart_hooks,
            )
            overlay_decision = overlay_mapping_service_module.detect_overlay_decision(
                podcast_id,
                draft_clip,
                segment,
            )
            subtitle_path.write_text(srt_content, encoding="utf-8")
            final_overlay = _render_clip_with_optional_overlay(
                source_path,
                clip_path,
                subtitle_path,
                start_seconds=clip_start,
                duration_seconds=clip_duration,
                export_settings=resolved_export_settings,
                overlay=overlay_decision,
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
                draft_clip.model_copy(
                    update={
                        "video_url": video_url,
                        "overlay": final_overlay,
                    }
                )
            )
            overlay_decisions.append(final_overlay)
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
                    "export_mode": resolved_export_settings.export_mode,
                    "crop_mode": resolved_export_settings.crop_mode,
                    "subtitle_timing_profile": resolved_export_settings.subtitle_timing_profile,
                    "mobile_optimized": resolved_export_settings.mobile_optimized,
                    "face_tracking_enabled": resolved_export_settings.face_tracking_enabled,
                    "subtitle_style": resolved_export_settings.subtitle_style.model_dump(mode="json"),
                    "audio_enhancement": resolved_export_settings.audio_enhancement.model_dump(mode="json"),
                    "smart_hooks": smart_hooks,
                }
            )
        except ClippingError:
            continue

    if not generated_results:
        raise ClippingError("No clips could be generated from the selected segments.")

    _persist_generated_clips(podcast_id, rows_to_persist)
    _persist_podcast_export_settings(podcast_id, resolved_export_settings)
    overlay_result = OverlayMappingResult(
        podcast_id=podcast_id,
        total_segments_checked=len(overlay_decisions),
        overlay_decisions=overlay_decisions,
    )
    overlay_mapping_service_module.persist_overlay_mappings(overlay_result)
    return generated_results


from app.models.export_settings import GenerationSettings

def build_clip_generation_result(
    podcast_id: str,
    clips: list[ClipResult],
    *,
    processing_time_seconds: float,
    export_settings: ExportSettings | None = None,
    generation_settings: GenerationSettings | None = None,
) -> ClipGenerationResult:
    resolved_export_settings = export_settings or (clips[0].export_settings if clips else ExportSettings())
    resolved_generation_settings = generation_settings or GenerationSettings()
    return ClipGenerationResult(
        podcast_id=podcast_id,
        total_clips_generated=len(clips),
        clips=clips,
        processing_time_seconds=round(processing_time_seconds, 3),
        download_folder_url=f"/podcasts/{podcast_id}/clips",
        export_settings=resolved_export_settings,
        generation_settings=resolved_generation_settings,
    )


def get_clips_for_podcast(podcast_id: str) -> ClipGenerationResult | None:
    if isinstance(service_supabase, UnconfiguredSupabaseClient):
        return None

    response = (
        service_supabase.table("clips")
        .select(
            "id,podcast_id,clip_number,clip_start_sec,clip_end_sec,virality_score,topic_matched,storage_path,storage_url,subtitle_url,subtitle_text,status,published,download_url,published_at,export_mode,crop_mode,subtitle_timing_profile,mobile_optimized,face_tracking_enabled,subtitle_style,audio_enhancement,smart_hooks"
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
            subtitle_url=str(row.get("subtitle_url") or "").strip() or None,
            subtitle_text=str(row.get("subtitle_text") or ""),
            status=str(row.get("status") or "ready"),
            published=bool(row.get("published") or False),
            download_url=str(row.get("download_url") or "").strip() or None,
            published_at=row.get("published_at"),
            overlay=overlays_by_clip_id.get(str(row["id"])),
            export_settings=_build_export_settings_from_row(row),
            smart_hooks=row.get("smart_hooks") or [],
        )
        for row in rows
    ]
    return build_clip_generation_result(
        podcast_id,
        clips,
        processing_time_seconds=0.0,
        export_settings=clips[0].export_settings if clips else ExportSettings(),
    )


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


def _select_segments(score_segments: list[ScoreSegment], *, limit: int) -> list[ScoreSegment]:
    return sorted(
        score_segments,
        key=lambda item: (-item.virality_score, item.segment_start_seconds),
    )[: max(1, min(int(limit), MAX_GENERATED_CLIPS))]


def _resolve_clip_count_limit(
    source_duration_seconds: float,
    clip_duration_seconds: int,
    requested_count: int,
) -> int:
    normalized_source_duration = max(0.0, float(source_duration_seconds))
    normalized_clip_duration = max(1.0, float(clip_duration_seconds))
    requested_cap = max(1, min(int(requested_count), MAX_GENERATED_CLIPS))

    if normalized_source_duration <= 0:
        return requested_cap

    duration_cap = max(1, int(normalized_source_duration // normalized_clip_duration))
    return max(1, min(requested_cap, duration_cap))


def _resolve_clip_window(
    segment: ScoreSegment,
    transcription: TranscriptionResult,
    *,
    target_duration_seconds: float,
) -> tuple[float, float]:
    source_duration_seconds = transcription.duration_seconds

    matched_window = _match_segment_snippet_window(segment, transcription.words)
    if matched_window is not None:
        preferred_start = matched_window[0] - CLIP_LEAD_IN_SECONDS
    else:
        preferred_start = segment.segment_start_seconds - CLIP_LEAD_IN_SECONDS

    clip_start = max(0.0, min(preferred_start, source_duration_seconds - target_duration_seconds))
    clip_end = clip_start + target_duration_seconds
    return round(clip_start, 3), round(clip_end, 3)


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
    export_mode: str,
    max_words_per_cue: int,
    max_duration_seconds: float,
    gap_seconds: float,
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
                gap >= gap_seconds
                or cue_duration >= max_duration_seconds
                or len(current_words) >= max_words_per_cue
            ):
                cues.append(_finalize_subtitle_cue(current_words, clip_start_seconds, export_mode))
                current_words = []
        current_words.append(word)

    if current_words:
        cues.append(_finalize_subtitle_cue(current_words, clip_start_seconds, export_mode))

    return cues


def _resolve_subtitle_timing(
    *,
    export_mode: str,
    subtitle_timing_profile: str,
) -> tuple[int, float, float]:
    if subtitle_timing_profile == "compact":
        if export_mode == "portrait":
            return 3, 1.7, 0.20
        return 4, 1.9, 0.24

    if subtitle_timing_profile == "extended":
        if export_mode == "portrait":
            return 5, 2.4, 0.30
        return 6, 2.6, 0.35

    if export_mode == "portrait":
        return 4, 2.0, 0.24
    return 5, 2.2, 0.28


def _finalize_subtitle_cue(
    words: list[TranscriptWord],
    clip_start_seconds: float,
    export_mode: str,
) -> _SubtitleCue:
    cue_padding_start = 0.08
    cue_padding_end = 0.18
    start = max(0.0, round(words[0].start - clip_start_seconds - cue_padding_start, 3))
    end = max(start + 0.18, round(words[-1].end - clip_start_seconds + cue_padding_end, 3))
    tokens = [word.word for word in words]
    text = _wrap_subtitle_tokens(tokens, export_mode=export_mode)
    return _SubtitleCue(start=start, end=end, text=text)



def _wrap_subtitle_tokens(tokens: list[str], *, export_mode: str) -> str:
    if not tokens:
        return ""

    max_chars_per_line = 14 if export_mode == 'portrait' else 28
    max_lines = 4 if export_mode == 'portrait' else 2
    lines: list[str] = []
    current_line = ""

    for token in tokens:
        word = str(token).strip()
        if not word:
            continue

        candidate = f"{current_line} {word}".strip() if current_line else word
        if current_line and len(candidate) > max_chars_per_line and len(lines) < max_lines - 1:
            lines.append(current_line)
            current_line = word
            continue

        current_line = candidate

    if current_line:
        lines.append(current_line)

    return "\n".join(lines[:max_lines]).strip()
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


def _format_subtitle_text(text: str) -> str:
    cleaned = " ".join(str(text).split())
    if not cleaned:
        return cleaned

    match = re.search(r"[A-Za-zÀ-ÿ]", cleaned)
    if match is None:
        return cleaned

    index = match.start()
    return f"{cleaned[:index]}{cleaned[index].upper()}{cleaned[index + 1:]}"


def _format_srt_timestamp(seconds: float) -> str:
    total_milliseconds = int(round(seconds * 1000))
    hours, remainder = divmod(total_milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    whole_seconds, milliseconds = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{whole_seconds:02d},{milliseconds:03d}"


def _build_subtitle_filter(subtitle_path: Path, subtitle_style: "SubtitleStyle", export_mode: str) -> str:
    normalized = subtitle_path.resolve().as_posix().replace(":", r"\:")
    safe_path = normalized.replace("'", r"\'")

    def to_ass_color(hex_color: str, opacity: float = 1.0) -> str:
        hex_color = hex_color.lstrip('#')
        if len(hex_color) != 6:
            hex_color = "FFFFFF"
        r, g, b = hex_color[0:2], hex_color[2:4], hex_color[4:6]
        alpha = int((1.0 - opacity) * 255)
        return f"&H{alpha:02X}{b}{g}{r}"

    primary = to_ass_color(subtitle_style.primary_color)
    outline = to_ass_color(subtitle_style.outline_color)
    bg = to_ass_color(subtitle_style.background_color, subtitle_style.background_opacity)
    bold = -1 if subtitle_style.bold else 0
    italic = -1 if subtitle_style.italic else 0
    if subtitle_style.position == "top":
        alignment = 8
        margin_v = 72 if export_mode == "portrait" else 32
    elif subtitle_style.position == "center":
        alignment = 5
        margin_v = 0
    else:
        alignment = 2
        margin_v = 72 if export_mode == "portrait" else 32

    style = (
        f"FontName={subtitle_style.font_family},Fontsize={subtitle_style.font_size},"
        f"PrimaryColour={primary},OutlineColour={outline},"
        f"BackColour={bg},BorderStyle=3,Outline=1,Shadow=0,WrapStyle=2,Alignment={alignment},"
        f"MarginL={56 if export_mode == 'portrait' else 28},"
        f"MarginR={56 if export_mode == 'portrait' else 28},"
        f"MarginV={margin_v},"
        f"Bold={bold},Italic={italic}"
    )
    return f"subtitles='{safe_path}':force_style='{style}'"


def _build_export_filter(export_settings: ExportSettings) -> str | None:
    if export_settings.export_mode != "portrait":
        return None
    return (
        "crop="
        "w='if(gte(iw/ih,9/16),trunc(ih*9/16/2)*2,iw)':"
        "h='if(gte(iw/ih,9/16),ih,trunc(iw*16/9/2)*2)':"
        "x='(in_w-out_w)/2':"
        "y='(in_h-out_h)/2',"
        f"scale={PORTRAIT_WIDTH}:{PORTRAIT_HEIGHT}"
    )


def _build_clip_filter_chain(subtitle_path: Path, export_settings: ExportSettings) -> str:
    filters: list[str] = []
    export_filter = _build_export_filter(export_settings)
    if export_filter:
        filters.append(export_filter)
    filters.append(_build_subtitle_filter(subtitle_path, export_settings.subtitle_style, export_settings.export_mode))
    return ",".join(filters)


def _build_base_video_chain(export_settings: ExportSettings) -> str:
    export_filter = _build_export_filter(export_settings)
    if export_filter:
        return f"[0:v]{export_filter}[base]"
    return "[0:v]null[base]"


def _build_video_filter_graph(
    subtitle_path: Path,
    overlay: OverlayDecision,
    export_settings: ExportSettings,
) -> str:
    base_video_chain = _build_base_video_chain(export_settings)
    subtitle_filter = _build_subtitle_filter(
        subtitle_path,
        export_settings.subtitle_style,
        export_settings.export_mode,
    )
    opacity = max(0.0, min(float(overlay.opacity or 1.0), 1.0))
    scale = max(0.05, min(float(overlay.scale or 0.18), 0.95))
    start = max(0.0, float(overlay.render_start_seconds or 0.0))
    end = max(start + 0.6, float(overlay.render_end_seconds or (start + 2.0)))
    x_expr, y_expr = _resolve_overlay_coordinates(overlay)
    return (
        f"{base_video_chain};"
        f"[1:v]format=rgba,colorchannelmixer=aa={opacity:.3f}[ovsrc];"
        f"[ovsrc][base]scale2ref=w=oh*mdar:h=trunc(main_h*{scale:.3f}/2)*2[ov][base2];"
        f"[base2][ov]overlay=x='{x_expr}':y='{y_expr}':enable='between(t,{start:.3f},{end:.3f})'[overlaid];"
        f"[overlaid]{subtitle_filter}[vout]"
    )


def _resolve_overlay_coordinates(overlay: OverlayDecision) -> tuple[str, str]:
    margin_x = int(overlay.margin_x or 32)
    margin_y = int(overlay.margin_y or 32)
    position = overlay.position or "top_right"
    coordinates = {
        "top_left": (f"{margin_x}", f"{margin_y}"),
        "top_center": ("(main_w-overlay_w)/2", f"{margin_y}"),
        "top_right": (f"main_w-overlay_w-{margin_x}", f"{margin_y}"),
        "bottom_left": (f"{margin_x}", f"main_h-overlay_h-{margin_y}"),
        "bottom_center": ("(main_w-overlay_w)/2", f"main_h-overlay_h-{margin_y}"),
        "bottom_right": (f"main_w-overlay_w-{margin_x}", f"main_h-overlay_h-{margin_y}"),
        "center": ("(main_w-overlay_w)/2", "(main_h-overlay_h)/2"),
    }
    return coordinates.get(position, coordinates["top_right"])


def _resolve_overlay_asset_path(asset_path: str | None) -> Path | None:
    if not asset_path:
        return None
    root = OVERLAY_ASSETS_ROOT.resolve()
    resolved = (root / asset_path).resolve()
    if root not in resolved.parents:
        return None
    if not resolved.exists() or not resolved.is_file():
        return None
    return resolved


def _render_clip_with_optional_overlay(
    source_path: Path,
    clip_path: Path,
    subtitle_path: Path,
    *,
    start_seconds: float,
    duration_seconds: float,
    export_settings: ExportSettings,
    overlay: OverlayDecision,
) -> OverlayDecision:
    if not overlay.applied:
        _run_ffmpeg_clip_generation(
            source_path,
            clip_path,
            subtitle_path,
            start_seconds=start_seconds,
            duration_seconds=duration_seconds,
            export_settings=export_settings,
        )
        return overlay.model_copy(update={"rendered": False, "render_status": "no_match"})

    overlay_asset_path = _resolve_overlay_asset_path(overlay.asset_path)
    if overlay_asset_path is None:
        _run_ffmpeg_clip_generation(
            source_path,
            clip_path,
            subtitle_path,
            start_seconds=start_seconds,
            duration_seconds=duration_seconds,
            export_settings=export_settings,
        )
        return overlay.model_copy(update={"rendered": False, "render_status": "missing_asset"})

    try:
        _run_ffmpeg_clip_generation(
            source_path,
            clip_path,
            subtitle_path,
            start_seconds=start_seconds,
            duration_seconds=duration_seconds,
            export_settings=export_settings,
            overlay=overlay,
            overlay_asset_path=overlay_asset_path,
        )
        return overlay.model_copy(update={"rendered": True, "render_status": "rendered"})
    except ClippingError:
        _run_ffmpeg_clip_generation(
            source_path,
            clip_path,
            subtitle_path,
            start_seconds=start_seconds,
            duration_seconds=duration_seconds,
            export_settings=export_settings,
        )
        return overlay.model_copy(update={"rendered": False, "render_status": "render_fallback"})


def _run_ffmpeg_clip_generation(
    source_path: Path,
    clip_path: Path,
    subtitle_path: Path,
    *,
    start_seconds: float,
    duration_seconds: float,
    export_settings: ExportSettings | None = None,
    overlay: OverlayDecision | None = None,
    overlay_asset_path: Path | None = None,
) -> None:
    if not shutil.which("ffmpeg"):
        raise ClippingError("ffmpeg is required to generate clips.", status_code=500)

    command = build_ffmpeg_clip_command(
        source_path,
        clip_path,
        subtitle_path,
        start_seconds=start_seconds,
        duration_seconds=duration_seconds,
        export_settings=export_settings,
        overlay=overlay,
        overlay_asset_path=overlay_asset_path,
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
        .select("id,storage_path,duration,export_mode,crop_mode,mobile_optimized,face_tracking_enabled")
        .eq("id", podcast_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    if not rows:
        raise ClippingError("Podcast was not found.", status_code=404)
    return rows[0]


from app.services.source_storage_service import materialize_source_media_path, SourceStorageError

def _resolve_source_media_path(podcast_row: dict[str, Any]) -> Path:
    storage_path = str(podcast_row.get("storage_path") or "").strip()
    if not storage_path:
        raise ClippingError("Podcast source media is missing, so clips cannot be generated.")
    
    try:
        source_path = materialize_source_media_path(storage_path)
    except SourceStorageError as exc:
        raise ClippingError(f"Podcast source media was not found or could not be downloaded: {exc}", status_code=404) from exc

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


def _resolve_export_settings(
    export_settings: ExportSettingsInput | ExportSettings | None,
    *,
    podcast_row: dict[str, Any] | None = None,
) -> ExportSettings:
    if isinstance(export_settings, ExportSettings):
        return export_settings
    if isinstance(export_settings, ExportSettingsInput):
        return export_settings.resolve()
    if podcast_row is not None:
        return _build_export_settings_from_row(podcast_row)
    return ExportSettings()


def _build_export_settings_from_row(row: dict[str, Any]) -> ExportSettings:
    return coerce_persisted_export_settings(row)


def _persist_podcast_export_settings(podcast_id: str, export_settings: ExportSettings) -> None:
    if isinstance(service_supabase, UnconfiguredSupabaseClient):
        return
    service_supabase.table("podcasts").update(
        {
            "export_mode": export_settings.export_mode,
            "crop_mode": export_settings.crop_mode,
            "mobile_optimized": export_settings.mobile_optimized,
            "face_tracking_enabled": export_settings.face_tracking_enabled,
        }
    ).eq("id", podcast_id).execute()


def _build_backend_download_path(clip_id: str) -> str:
    return f"/podcasts/clips/{clip_id}/download"






