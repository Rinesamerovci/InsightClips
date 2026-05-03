from __future__ import annotations

import shutil
import subprocess
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.config import BACKEND_DIR, ROOT_DIR
from app.database import UnconfiguredSupabaseClient, service_supabase
from app.models.analysis import ScoreSegment
from app.models.clipping import ClipGenerationResult, ClipResult
from app.models.export_settings import ExportSettings, ExportSettingsInput, SubtitleStyle
from app.models.overlay import OverlayDecision, OverlayMappingResult
from app.models.transcription import TranscriptWord, TranscriptionResult
from app.utils.reframing import CropWindow, build_portrait_video_filters, compute_portrait_crop_window
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
OVERLAY_ASSETS_ROOT = BACKEND_DIR / "assets" / "overlays"


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


@dataclass(frozen=True)
class _SubtitleRenderTuning:
    outline: int
    shadow: int
    outline_opacity: float
    margin_v_bottom: int
    margin_v_other: int
    margin_h: int
    force_border_style: int | None = None
    minimum_background_opacity: float = 0.0


SUBTITLE_PRESET_RENDER_TUNING: dict[str, _SubtitleRenderTuning] = {
    "classic": _SubtitleRenderTuning(
        outline=2,
        shadow=0,
        outline_opacity=0.82,
        margin_v_bottom=44,
        margin_v_other=32,
        margin_h=32,
    ),
    "bold": _SubtitleRenderTuning(
        outline=3,
        shadow=1,
        outline_opacity=0.92,
        margin_v_bottom=52,
        margin_v_other=38,
        margin_h=38,
    ),
    "minimal": _SubtitleRenderTuning(
        outline=2,
        shadow=1,
        outline_opacity=0.75,
        margin_v_bottom=42,
        margin_v_other=28,
        margin_h=28,
    ),
    "boxed": _SubtitleRenderTuning(
        outline=0,
        shadow=0,
        outline_opacity=0.88,
        margin_v_bottom=48,
        margin_v_other=36,
        margin_h=36,
        force_border_style=3,
        minimum_background_opacity=0.45,
    ),
}


def build_ffmpeg_clip_command(
    source_path: Path,
    output_path: Path,
    subtitle_path: Path,
    *,
    start_seconds: float,
    duration_seconds: float,
    export_settings: ExportSettings | None = None,
    crop_window: CropWindow | None = None,
    overlay: OverlayDecision | None = None,
    overlay_asset_path: Path | None = None,
) -> list[str]:
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
                _build_video_filter_graph(
                    subtitle_path,
                    overlay,
                    export_settings=export_settings,
                    crop_window=crop_window,
                ),
                "-map",
                "[vout]",
                "-map",
                "0:a?",
            ]
        )
    else:
        command.extend(["-vf", _build_video_filters(subtitle_path, export_settings=export_settings, crop_window=crop_window)])
    command.extend(
        [
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
    )
    return command


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
    transcription: TranscriptionResult | None,
    export_settings: ExportSettingsInput | ExportSettings | None = None,
) -> list[ClipResult]:
    podcast_row = _get_podcast_row(podcast_id)
    source_path = _resolve_source_media_path(podcast_row)
    selected_segments = _select_segments(score_segments)
    if not selected_segments:
        raise ClippingError("No scored segments are available for clip generation.", status_code=404)

    resolved_export_settings = _resolve_export_settings(export_settings, podcast_row=podcast_row)
    output_dir = _prepare_output_directory(podcast_id)
    overlay_mapping_service_module.service_supabase = service_supabase
    generated_results: list[ClipResult] = []
    overlay_decisions: list[OverlayDecision] = []
    rows_to_persist: list[dict[str, Any]] = []
    last_generation_error: ClippingError | None = None

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
            if transcription is not None:
                srt_content, subtitle_text = build_srt_content(
                    transcription,
                    clip_start_seconds=clip_start,
                    clip_end_seconds=clip_end,
                )
            else:
                srt_content, subtitle_text = build_segment_fallback_srt_content(
                    segment,
                    clip_duration_seconds=clip_duration,
                )
            draft_clip = ClipResult(
                id=clip_id,
                clip_number=clip_number,
                clip_start_seconds=clip_start,
                clip_end_seconds=clip_end,
                duration_seconds=clip_duration,
                virality_score=segment.virality_score,
                video_url=_build_backend_download_path(clip_id),
                subtitle_text=subtitle_text,
                status="ready",
                export_settings=resolved_export_settings,
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
            # Keep generation responsive by returning locally rendered clips immediately.
            # Uploading generated assets to remote storage is deferred to the publish flow.
            storage_url = None
            subtitle_url = None
            video_url = _build_backend_download_path(clip_id)
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
                    "mobile_optimized": resolved_export_settings.mobile_optimized,
                    "face_tracking_enabled": resolved_export_settings.face_tracking_enabled,
                    "subtitle_style": resolved_export_settings.subtitle_style.model_dump(mode="json"),
                }
            )
        except ClippingError as exc:
            last_generation_error = exc
            continue

    if not generated_results:
        if last_generation_error is not None:
            raise ClippingError(
                f"No clips could be generated from the selected segments. {last_generation_error.detail}",
                status_code=last_generation_error.status_code,
            )
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


def build_clip_generation_result(
    podcast_id: str,
    clips: list[ClipResult],
    *,
    processing_time_seconds: float,
    export_settings: ExportSettings | None = None,
) -> ClipGenerationResult:
    resolved_export_settings = export_settings or (clips[0].export_settings if clips else ExportSettings())
    return ClipGenerationResult(
        podcast_id=podcast_id,
        total_clips_generated=len(clips),
        clips=clips,
        processing_time_seconds=round(processing_time_seconds, 3),
        download_folder_url=f"/podcasts/{podcast_id}/clips",
        export_settings=resolved_export_settings,
    )


def get_clips_for_podcast(podcast_id: str) -> ClipGenerationResult | None:
    if isinstance(service_supabase, UnconfiguredSupabaseClient):
        return None

    response = _select_clip_rows_for_podcast(podcast_id)
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
            export_settings=_build_export_settings_from_row(row),
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


def _select_segments(score_segments: list[ScoreSegment]) -> list[ScoreSegment]:
    return sorted(
        score_segments,
        key=lambda item: (-item.virality_score, item.segment_start_seconds),
    )[:MAX_GENERATED_CLIPS]


def _resolve_clip_window(
    segment: ScoreSegment,
    transcription: TranscriptionResult | None,
) -> tuple[float, float]:
    if transcription is None:
        return _expand_clip_window(
            segment.segment_start_seconds,
            segment.segment_end_seconds,
            max_duration=max(segment.segment_end_seconds, segment.segment_start_seconds + 1.0),
        )

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


def build_segment_fallback_srt_content(
    segment: ScoreSegment,
    *,
    clip_duration_seconds: float,
) -> tuple[str, str]:
    subtitle_text = _join_transcript_tokens(segment.transcript_snippet.split())
    if not subtitle_text:
        raise ClippingError("Unable to build fallback subtitles for the requested clip.")

    tokens = subtitle_text.split()
    lines: list[str] = []
    current_tokens: list[str] = []
    for token in tokens:
        current_tokens.append(token)
        if len(current_tokens) >= MAX_SUBTITLE_WORDS_PER_CUE:
            lines.append(" ".join(current_tokens))
            current_tokens = []
    if current_tokens:
        lines.append(" ".join(current_tokens))

    if not lines:
        lines = [subtitle_text]

    cue_count = len(lines)
    duration_per_cue = max(0.8, clip_duration_seconds / cue_count)
    srt_lines: list[str] = []
    for index, line in enumerate(lines, start=1):
        start_seconds = min(clip_duration_seconds, (index - 1) * duration_per_cue)
        end_seconds = clip_duration_seconds if index == cue_count else min(
            clip_duration_seconds,
            index * duration_per_cue,
        )
        if end_seconds <= start_seconds:
            end_seconds = min(clip_duration_seconds, start_seconds + 0.8)
        srt_lines.extend(
            [
                str(index),
                f"{_format_srt_timestamp(start_seconds)} --> {_format_srt_timestamp(end_seconds)}",
                line,
                "",
            ]
        )

    return "\n".join(srt_lines).strip(), subtitle_text


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


def _build_subtitle_filter(
    subtitle_path: Path,
    subtitle_style: SubtitleStyle | None = None,
    *,
    export_mode: str = "landscape",
) -> str:
    normalized = subtitle_path.resolve().as_posix().replace(":", r"\:")
    safe_path = normalized.replace("'", r"\'")
    style = _build_subtitle_force_style(subtitle_style or SubtitleStyle(), export_mode=export_mode)
    return f"subtitles='{safe_path}':force_style='{style}'"


def _build_subtitle_force_style(
    subtitle_style: SubtitleStyle,
    *,
    export_mode: str = "landscape",
) -> str:
    alignment_by_position = {
        "top": 8,
        "center": 5,
        "bottom": 2,
    }
    tuning = SUBTITLE_PRESET_RENDER_TUNING.get(subtitle_style.preset, SUBTITLE_PRESET_RENDER_TUNING["classic"])
    background_opacity = max(0.0, min(float(subtitle_style.background_opacity), 1.0))
    if tuning.force_border_style == 3:
        background_opacity = max(background_opacity, tuning.minimum_background_opacity)
    border_style = tuning.force_border_style or (3 if background_opacity > 0 else 1)
    margin_v = tuning.margin_v_bottom if subtitle_style.position == "bottom" else tuning.margin_v_other
    margin_h = tuning.margin_h
    if export_mode == "portrait":
        margin_v += 12 if subtitle_style.position == "bottom" else 8
        margin_h += 20
    style_parts = {
        "FontName": subtitle_style.font_family,
        "Fontsize": str(subtitle_style.font_size),
        "PrimaryColour": _hex_to_ass_color(subtitle_style.primary_color, opacity=1),
        "OutlineColour": _hex_to_ass_color(subtitle_style.outline_color, opacity=tuning.outline_opacity),
        "BackColour": _hex_to_ass_color(subtitle_style.background_color, opacity=background_opacity),
        "BorderStyle": str(border_style),
        "Outline": str(tuning.outline),
        "Shadow": str(tuning.shadow),
        "Alignment": str(alignment_by_position[subtitle_style.position]),
        "MarginL": str(margin_h),
        "MarginR": str(margin_h),
        "MarginV": str(margin_v),
        "WrapStyle": "2",
        "Bold": "-1" if subtitle_style.bold else "0",
        "Italic": "-1" if subtitle_style.italic else "0",
    }
    return ",".join(f"{key}={value}" for key, value in style_parts.items())


def _hex_to_ass_color(hex_color: str, *, opacity: float) -> str:
    cleaned = hex_color.lstrip("#")
    red = cleaned[0:2]
    green = cleaned[2:4]
    blue = cleaned[4:6]
    alpha = round((1 - max(0.0, min(opacity, 1.0))) * 255)
    return f"&H{alpha:02X}{blue}{green}{red}"


def _build_video_filters(
    subtitle_path: Path,
    *,
    export_settings: ExportSettings | None = None,
    crop_window: CropWindow | None = None,
) -> str:
    filters: list[str] = []
    if export_settings is not None and export_settings.export_mode == "portrait":
        portrait_crop = crop_window or CropWindow(
            source_width=1920,
            source_height=1080,
            crop_width=608,
            crop_height=1080,
            offset_x=656,
            offset_y=0,
        )
        filters.append(build_portrait_video_filters(portrait_crop))
    filters.append(
        _build_subtitle_filter(
            subtitle_path,
            export_settings.subtitle_style if export_settings else None,
            export_mode=export_settings.export_mode if export_settings else "landscape",
        )
    )
    return ",".join(filters)


def _build_video_filter_graph(
    subtitle_path: Path,
    overlay: OverlayDecision,
    *,
    export_settings: ExportSettings | None = None,
    crop_window: CropWindow | None = None,
) -> str:
    subtitle_filter = _build_video_filters(
        subtitle_path,
        export_settings=export_settings,
        crop_window=crop_window,
    )
    opacity = max(0.0, min(float(overlay.opacity or 1.0), 1.0))
    scale = max(0.05, min(float(overlay.scale or 0.18), 0.95))
    start = max(0.0, float(overlay.render_start_seconds or 0.0))
    end = max(start + 0.6, float(overlay.render_end_seconds or (start + 2.0)))
    x_expr, y_expr = _resolve_overlay_coordinates(overlay)
    return (
        f"[0:v]{subtitle_filter}[base];"
        f"[1:v]format=rgba,colorchannelmixer=aa={opacity:.3f}[ovsrc];"
        f"[ovsrc][base]scale2ref=w=oh*mdar:h=trunc(main_h*{scale:.3f}/2)*2[ov][base2];"
        f"[base2][ov]overlay=x='{x_expr}':y='{y_expr}':enable='between(t,{start:.3f},{end:.3f})'[vout]"
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
    crop_window = _resolve_crop_window(
        source_path,
        start_seconds=start_seconds,
        duration_seconds=duration_seconds,
        export_settings=export_settings,
    )
    if not overlay.applied:
        _run_ffmpeg_clip_generation(
            source_path,
            clip_path,
            subtitle_path,
            start_seconds=start_seconds,
            duration_seconds=duration_seconds,
            export_settings=export_settings,
            crop_window=crop_window,
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
            crop_window=crop_window,
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
            crop_window=crop_window,
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
            crop_window=crop_window,
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
    crop_window: CropWindow | None = None,
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
        crop_window=crop_window,
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

    response = _select_podcast_row(podcast_id)
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
        try:
            service_supabase.table("clips").insert(rows).execute()
        except Exception as exc:
            if not _clip_optional_columns_missing(exc):
                raise
            base_rows = [
                {
                    "id": row["id"],
                    "podcast_id": row["podcast_id"],
                    "clip_number": row["clip_number"],
                    "clip_start_sec": row["clip_start_sec"],
                    "clip_end_sec": row["clip_end_sec"],
                    "virality_score": row["virality_score"],
                    "storage_path": row["storage_path"],
                    "storage_url": row["storage_url"],
                    "subtitle_url": row["subtitle_url"],
                    "subtitle_text": row["subtitle_text"],
                    "status": row["status"],
                }
                for row in rows
            ]
            service_supabase.table("clips").insert(base_rows).execute()


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


def _resolve_crop_window(
    source_path: Path,
    *,
    start_seconds: float,
    duration_seconds: float,
    export_settings: ExportSettings,
) -> CropWindow | None:
    if export_settings.export_mode != "portrait":
        return None
    return compute_portrait_crop_window(
        source_path,
        clip_start_seconds=start_seconds,
        clip_duration_seconds=duration_seconds,
        prefer_face_detection=export_settings.crop_mode == "smart_crop",
    )


def _build_export_settings_from_row(row: dict[str, Any]) -> ExportSettings:
    export_mode = str(row.get("export_mode") or "landscape").strip() or "landscape"
    crop_mode = str(row.get("crop_mode") or ("center_crop" if export_mode == "portrait" else "none")).strip()
    return ExportSettings(
        export_mode=export_mode,  # type: ignore[arg-type]
        crop_mode=crop_mode,  # type: ignore[arg-type]
        mobile_optimized=bool(row.get("mobile_optimized") or False),
        face_tracking_enabled=bool(row.get("face_tracking_enabled") or False),
        subtitle_style=row.get("subtitle_style") or SubtitleStyle(),
    )


def _persist_podcast_export_settings(podcast_id: str, export_settings: ExportSettings) -> None:
    if isinstance(service_supabase, UnconfiguredSupabaseClient):
        return
    try:
        service_supabase.table("podcasts").update(
            {
                "export_mode": export_settings.export_mode,
                "crop_mode": export_settings.crop_mode,
                "mobile_optimized": export_settings.mobile_optimized,
                "face_tracking_enabled": export_settings.face_tracking_enabled,
                "subtitle_style": export_settings.subtitle_style.model_dump(mode="json"),
            }
        ).eq("id", podcast_id).execute()
    except Exception as exc:
        if not _podcast_export_columns_missing(exc):
            raise


def _build_backend_download_path(clip_id: str) -> str:
    return f"/podcasts/clips/{clip_id}/download"


def _select_clip_rows_for_podcast(podcast_id: str) -> Any:
    try:
        return (
            service_supabase.table("clips")
            .select(
                "id,podcast_id,clip_number,clip_start_sec,clip_end_sec,virality_score,storage_path,storage_url,subtitle_text,status,published,download_url,published_at,export_mode,crop_mode,mobile_optimized,face_tracking_enabled,subtitle_style"
            )
            .eq("podcast_id", podcast_id)
            .order("clip_number")
            .execute()
        )
    except Exception as exc:
        if not _clip_optional_columns_missing(exc):
            raise
        return (
            service_supabase.table("clips")
            .select(
                "id,podcast_id,clip_number,clip_start_sec,clip_end_sec,virality_score,storage_path,storage_url,subtitle_text,status"
            )
            .eq("podcast_id", podcast_id)
            .order("clip_number")
            .execute()
        )


def _select_podcast_row(podcast_id: str) -> Any:
    try:
        return (
            service_supabase.table("podcasts")
            .select("id,storage_path,export_mode,crop_mode,mobile_optimized,face_tracking_enabled,subtitle_style")
            .eq("id", podcast_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        if not _podcast_export_columns_missing(exc):
            raise
        return (
            service_supabase.table("podcasts")
            .select("id,storage_path")
            .eq("id", podcast_id)
            .limit(1)
            .execute()
        )


def _clip_optional_columns_missing(exc: Exception) -> bool:
    message = str(exc).lower()
    return any(
        token in message
        for token in (
            "published",
            "download_url",
            "published_at",
            "export_mode",
            "crop_mode",
            "mobile_optimized",
            "face_tracking_enabled",
            "subtitle_style",
            "42703",
        )
    )


def _podcast_export_columns_missing(exc: Exception) -> bool:
    message = str(exc).lower()
    return any(
        token in message
        for token in (
            "export_mode",
            "crop_mode",
            "mobile_optimized",
            "face_tracking_enabled",
            "subtitle_style",
            "42703",
        )
    )
