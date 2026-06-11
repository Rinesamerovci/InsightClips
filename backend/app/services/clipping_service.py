from __future__ import annotations

import math
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
    GenerationSettings,
    SubtitleStyle,
    coerce_persisted_export_settings,
)
from app.models.media import SubtitleTimingContract, VisualOutputMode
from app.models.overlay import OverlayDecision, OverlayMappingResult
from app.models.transcription import TranscriptWord, TranscriptionResult
from app.services.media_service import build_render_contract, resolve_export_settings_for_render
from app.services.source_storage_service import SourceStorageError, materialize_source_media_path
from app.utils.reframing import CropWindow, build_portrait_video_filters, compute_portrait_crop_window
import app.services.overlay_mapping_service as overlay_mapping_service_module


GENERATED_CLIPS_ROOT = ROOT_DIR / ".generated" / "clips"
CLIP_STORAGE_BUCKET = "clips"
SIGNED_URL_TTL_SECONDS = 3600
MAX_GENERATED_CLIPS = 10
CLIP_LEAD_IN_SECONDS = 2.0
CLIP_LEAD_OUT_SECONDS = 1.0
OVERLAY_ASSETS_ROOT = BACKEND_DIR / "assets" / "overlays"
FFMPEG_PRESETS = {
    "ultrafast",
    "superfast",
    "veryfast",
    "faster",
    "fast",
    "medium",
    "slow",
    "slower",
    "veryslow",
}


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
    subtitle_path: Path | None,
    *,
    start_seconds: float,
    duration_seconds: float,
    export_settings: ExportSettings | None = None,
    visual_output_mode: VisualOutputMode = "original_people",
    crop_window: CropWindow | None = None,
    overlay: OverlayDecision | None = None,
    overlay_asset_path: Path | None = None,
) -> list[str]:
    ffmpeg_settings = _get_ffmpeg_render_settings()
    command = [
        "ffmpeg",
        "-v",
        "error",
        "-nostdin",
        "-y",
        "-ss",
        f"{start_seconds:.3f}",
        "-t",
        f"{duration_seconds:.3f}",
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
    if overlay is not None and overlay_asset_path is not None:
        command.extend(
            [
                "-filter_complex",
                _build_video_filter_graph(
                    subtitle_path,
                    overlay,
                    export_settings=export_settings,
                    visual_output_mode=visual_output_mode,
                    crop_window=crop_window,
                    clip_duration_seconds=duration_seconds,
                ),
                "-map",
                "[vout]",
                "-map",
                "0:a?",
            ]
        )
    else:
        command.extend(
            [
                "-vf",
                _build_video_filters(
                    subtitle_path,
                    export_settings=export_settings,
                    visual_output_mode=visual_output_mode,
                    crop_window=crop_window,
                    clip_duration_seconds=duration_seconds,
                ),
            ]
        )
    audio_filter = _build_audio_filter(export_settings)
    if audio_filter is not None:
        command.extend(["-af", audio_filter])
    command.extend(
        [
            "-c:v",
            "libx264",
            "-preset",
            ffmpeg_settings["preset"],
            "-crf",
            str(ffmpeg_settings["crf"]),
            "-threads",
            str(ffmpeg_settings["threads"]),
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


def _get_ffmpeg_render_settings() -> dict[str, int | str]:
    settings = get_settings()
    preset = settings.clip_ffmpeg_preset.strip().lower() or "veryfast"
    if preset not in FFMPEG_PRESETS:
        preset = "veryfast"
    crf = min(max(int(settings.clip_ffmpeg_crf), 18), 30)
    threads = min(max(int(settings.clip_ffmpeg_threads), 1), 4)
    timeout = min(max(int(settings.clip_ffmpeg_timeout_seconds), 60), 900)
    return {
        "preset": preset,
        "crf": crf,
        "threads": threads,
        "timeout": timeout,
    }


def build_srt_content(
    transcription: TranscriptionResult,
    *,
    clip_start_seconds: float,
    clip_end_seconds: float,
    export_settings: ExportSettings | None = None,
    visual_output_mode: VisualOutputMode = "original_people",
) -> tuple[str, str]:
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
        subtitle_timing=build_render_contract(
            export_settings,
            visual_output_mode=visual_output_mode,
            subtitles_available=True,
            clip_duration_seconds=round(clip_end_seconds - clip_start_seconds, 3),
        ).subtitle_timing,
    )
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
    generation_settings: GenerationSettings | None = None,
    visual_output_mode: VisualOutputMode = "original_people",
) -> list[ClipResult]:
    podcast_row = _get_podcast_row(podcast_id)
    source_path = _resolve_source_media_path(podcast_row)
    resolved_generation_settings = generation_settings or GenerationSettings()
    selected_segments = _select_segments(score_segments, generation_settings=resolved_generation_settings)
    if not selected_segments:
        raise ClippingError("No scored segments are available for clip generation.", status_code=404)

    resolved_export_settings = _resolve_export_settings(export_settings, podcast_row=podcast_row)
    persisted_export_settings = resolved_export_settings.model_copy(deep=True)
    output_dir = _prepare_output_directory(podcast_id)
    overlay_mapping_service_module.service_supabase = service_supabase
    generated_results: list[ClipResult] = []
    overlay_decisions: list[OverlayDecision] = []
    rows_to_persist: list[dict[str, Any]] = []
    last_generation_error: ClippingError | None = None

    for clip_number, segment in enumerate(selected_segments, start=1):
        clip_id = str(uuid.uuid4())
        clip_start, clip_end = _resolve_clip_window(
            segment,
            transcription,
            target_duration_seconds=resolved_generation_settings.clip_duration_seconds,
        )
        clip_duration = round(clip_end - clip_start, 3)
        if clip_duration <= 0:
            continue

        clip_filename = f"clip-{clip_number:02d}.mp4"
        subtitle_filename = f"clip-{clip_number:02d}.srt"
        clip_path = output_dir / clip_filename
        subtitle_path = output_dir / subtitle_filename

        try:
            clip_export_settings = resolve_export_settings_for_render(
                resolved_export_settings,
                visual_output_mode=visual_output_mode,
                subtitles_available=resolved_generation_settings.subtitles_enabled,
                clip_duration_seconds=clip_duration,
            )
            render_contract = build_render_contract(
                clip_export_settings,
                visual_output_mode=visual_output_mode,
                subtitles_available=resolved_generation_settings.subtitles_enabled,
                clip_duration_seconds=clip_duration,
            )
            if resolved_generation_settings.subtitles_enabled and transcription is not None:
                srt_content, subtitle_text = build_srt_content(
                    transcription,
                    clip_start_seconds=clip_start,
                    clip_end_seconds=clip_end,
                    export_settings=clip_export_settings,
                    visual_output_mode=visual_output_mode,
                )
            elif resolved_generation_settings.subtitles_enabled:
                srt_content, subtitle_text = build_segment_fallback_srt_content(
                    segment,
                    clip_duration_seconds=clip_duration,
                    export_settings=clip_export_settings,
                    visual_output_mode=visual_output_mode,
                )
            else:
                srt_content = None
                subtitle_text = ""
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
                export_settings=clip_export_settings,
                generation_settings=resolved_generation_settings,
                visual_output_mode=visual_output_mode,
                effective_visual_output_mode=render_contract.effective_visual_output_mode,
                render_fallback_reason=render_contract.render_fallback_reason,
            )
            overlay_decision = overlay_mapping_service_module.detect_overlay_decision(
                podcast_id,
                draft_clip,
                segment,
            )
            if srt_content is not None:
                subtitle_path.write_text(srt_content, encoding="utf-8")
            final_overlay, clip_export_settings = _render_clip_with_optional_overlay(
                source_path,
                clip_path,
                subtitle_path if srt_content is not None else None,
                start_seconds=clip_start,
                duration_seconds=clip_duration,
                export_settings=clip_export_settings,
                visual_output_mode=visual_output_mode,
                overlay=overlay_decision,
            )
            persisted_export_settings = _merge_runtime_export_settings(
                persisted_export_settings,
                clip_export_settings,
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
                        "export_settings": clip_export_settings,
                        "generation_settings": resolved_generation_settings,
                        "visual_output_mode": visual_output_mode,
                        "effective_visual_output_mode": render_contract.effective_visual_output_mode,
                        "render_fallback_reason": render_contract.render_fallback_reason,
                    }
                )
            )
            overlay_decisions.append(final_overlay)
            row_to_persist = {
                "id": clip_id,
                "podcast_id": podcast_id,
                "clip_number": clip_number,
                "clip_start_sec": clip_start,
                "clip_end_sec": clip_end,
                "virality_score": segment.virality_score,
                "storage_path": str(clip_path),
                "storage_url": storage_url,
                "subtitle_url": subtitle_url or (str(subtitle_path) if srt_content is not None else None),
                "subtitle_text": subtitle_text,
                "status": "ready",
                "preset_name": clip_export_settings.preset_name,
                "export_mode": clip_export_settings.export_mode,
                "crop_mode": clip_export_settings.crop_mode,
                "subtitle_timing_profile": clip_export_settings.subtitle_timing_profile,
                "mobile_optimized": clip_export_settings.mobile_optimized,
                "face_tracking_enabled": clip_export_settings.face_tracking_enabled,
                "subtitle_style": clip_export_settings.subtitle_style.model_dump(mode="json"),
                "audio_enhancement": clip_export_settings.audio_enhancement.model_dump(mode="json"),
                "generation_settings": resolved_generation_settings.model_dump(mode="json"),
                "visual_output_mode": visual_output_mode,
                "effective_visual_output_mode": render_contract.effective_visual_output_mode,
                "render_fallback_reason": render_contract.render_fallback_reason,
            }
            rows_to_persist.append(row_to_persist)
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
    _persist_podcast_export_settings(podcast_id, persisted_export_settings)
    overlay_result = OverlayMappingResult(
        podcast_id=podcast_id,
        total_segments_checked=len(selected_segments),
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
    generation_settings: GenerationSettings | None = None,
) -> ClipGenerationResult:
    resolved_export_settings = export_settings or (clips[0].export_settings if clips else ExportSettings())
    resolved_generation_settings = generation_settings or (
        clips[0].generation_settings if clips else resolved_export_settings.generation_settings
    )
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
            generation_settings=GenerationSettings.model_validate(
                row.get("generation_settings") or {}
            ),
            visual_output_mode=str(row.get("visual_output_mode") or "original_people"),  # type: ignore[arg-type]
            effective_visual_output_mode=str(row.get("effective_visual_output_mode") or row.get("visual_output_mode") or "original_people"),  # type: ignore[arg-type]
            render_fallback_reason=str(row.get("render_fallback_reason") or "").strip() or None,
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


def _select_segments(
    score_segments: list[ScoreSegment],
    *,
    generation_settings: GenerationSettings | None = None,
) -> list[ScoreSegment]:
    settings = generation_settings or GenerationSettings()
    sorted_segments = sorted(
        score_segments,
        key=lambda item: (
            -_score_segment_for_generation(item, settings.topic_focus),
            item.segment_start_seconds,
        ),
    )
    return sorted_segments[:min(settings.number_of_clips, MAX_GENERATED_CLIPS)]


def _score_segment_for_generation(segment: ScoreSegment, topic_focus: str | None) -> float:
    score = float(segment.virality_score)
    tokens = _topic_focus_tokens(topic_focus)
    if not tokens:
        return score
    haystack = " ".join([segment.transcript_snippet, " ".join(segment.keywords)]).lower()
    matches = sum(1 for token in tokens if token in haystack)
    return score + (matches * 7.5)


def _topic_focus_tokens(topic_focus: str | None) -> list[str]:
    if not topic_focus:
        return []
    return [
        token
        for token in (_normalize_token(item) for item in topic_focus.replace(",", " ").split())
        if len(token) >= 2
    ]


def _resolve_clip_window(
    segment: ScoreSegment,
    transcription: TranscriptionResult | None,
    *,
    target_duration_seconds: int | None = None,
) -> tuple[float, float]:
    if transcription is None:
        start, end = _expand_clip_window(
            segment.segment_start_seconds,
            segment.segment_end_seconds,
            max_duration=max(
                segment.segment_end_seconds,
                segment.segment_start_seconds + float(target_duration_seconds or 1.0),
            ),
        )
        return _apply_requested_duration(
            start,
            end,
            max_duration=max(end, segment.segment_start_seconds + float(target_duration_seconds or 1.0)),
            target_duration_seconds=target_duration_seconds,
        )

    matched_window = _match_segment_snippet_window(segment, transcription.words)
    if matched_window is not None:
        start, end = matched_window
        expanded_start, expanded_end = _expand_clip_window(
            start,
            end,
            max_duration=transcription.duration_seconds,
        )
        return _apply_requested_duration(
            expanded_start,
            expanded_end,
            max_duration=transcription.duration_seconds,
            target_duration_seconds=target_duration_seconds,
        )

    expanded_start, expanded_end = _expand_clip_window(
        segment.segment_start_seconds,
        segment.segment_end_seconds,
        max_duration=transcription.duration_seconds,
    )
    if not _collect_clip_words(
        transcription.words,
        clip_start_seconds=expanded_start,
        clip_end_seconds=expanded_end,
    ):
        return expanded_start, expanded_end
    return _apply_requested_duration(
        expanded_start,
        expanded_end,
        max_duration=transcription.duration_seconds,
        target_duration_seconds=target_duration_seconds,
    )


def _apply_requested_duration(
    start_seconds: float,
    end_seconds: float,
    *,
    max_duration: float,
    target_duration_seconds: int | None,
) -> tuple[float, float]:
    if target_duration_seconds is None:
        return start_seconds, end_seconds
    target_duration = float(target_duration_seconds)
    current_duration = round(end_seconds - start_seconds, 3)
    if current_duration >= target_duration:
        center = (start_seconds + end_seconds) / 2
        adjusted_start = max(0.0, center - (target_duration / 2))
        adjusted_end = min(max_duration, adjusted_start + target_duration)
    else:
        extra = target_duration - current_duration
        adjusted_start = max(0.0, start_seconds - (extra / 2))
        adjusted_end = min(max_duration, adjusted_start + target_duration)
    if adjusted_end - adjusted_start < min(target_duration, max_duration):
        adjusted_start = max(0.0, adjusted_end - target_duration)
    return round(adjusted_start, 3), round(adjusted_end, 3)


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
    subtitle_timing: SubtitleTimingContract,
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
                gap >= subtitle_timing.gap_seconds
                or cue_duration >= subtitle_timing.max_duration_seconds
                or len(current_words) >= subtitle_timing.max_words_per_cue
            ):
                cues.append(
                    _finalize_subtitle_cue(
                        current_words,
                        clip_start_seconds,
                        max_lines=subtitle_timing.max_lines,
                    )
                )
                current_words = []
        current_words.append(word)

    if current_words:
        cues.append(
            _finalize_subtitle_cue(
                current_words,
                clip_start_seconds,
                max_lines=subtitle_timing.max_lines,
            )
        )

    return cues


def _finalize_subtitle_cue(
    words: list[TranscriptWord],
    clip_start_seconds: float,
    *,
    max_lines: int,
) -> _SubtitleCue:
    start = max(0.0, round(words[0].start - clip_start_seconds, 3))
    end = max(start + 0.08, round(words[-1].end - clip_start_seconds, 3))
    tokens = [word.word for word in words]
    text = _format_subtitle_lines(tokens, max_lines=max_lines)
    return _SubtitleCue(start=start, end=end, text=text)


def build_segment_fallback_srt_content(
    segment: ScoreSegment,
    *,
    clip_duration_seconds: float,
    export_settings: ExportSettings | None = None,
    visual_output_mode: VisualOutputMode = "original_people",
) -> tuple[str, str]:
    subtitle_text = _join_transcript_tokens(segment.transcript_snippet.split())
    if not subtitle_text:
        raise ClippingError("Unable to build fallback subtitles for the requested clip.")

    subtitle_timing = build_render_contract(
        export_settings,
        visual_output_mode=visual_output_mode,
        subtitles_available=True,
        clip_duration_seconds=clip_duration_seconds,
    ).subtitle_timing
    tokens = subtitle_text.split()
    chunks: list[list[str]] = []
    current_tokens: list[str] = []
    for token in tokens:
        current_tokens.append(token)
        if len(current_tokens) >= subtitle_timing.max_words_per_cue:
            chunks.append(current_tokens)
            current_tokens = []
    if current_tokens:
        chunks.append(current_tokens)

    if not chunks:
        chunks = [tokens]

    lines = [_format_subtitle_lines(chunk, max_lines=subtitle_timing.max_lines) for chunk in chunks]
    cue_count = len(lines)
    duration_per_cue = min(
        subtitle_timing.max_duration_seconds,
        max(0.8, clip_duration_seconds / cue_count),
    )
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


def _format_subtitle_lines(tokens: list[str], *, max_lines: int) -> str:
    cleaned_tokens = [str(token).strip() for token in tokens if str(token).strip()]
    if not cleaned_tokens:
        return ""

    if max_lines <= 1 or len(cleaned_tokens) <= 4:
        return _join_transcript_tokens(cleaned_tokens)

    if max_lines >= 3:
        line_count = 3 if len(cleaned_tokens) >= 8 else 2
    else:
        line_count = 2 if len(cleaned_tokens) >= 7 else 1

    line_count = min(line_count, max_lines)
    if line_count <= 1:
        return _join_transcript_tokens(cleaned_tokens)

    base_size = len(cleaned_tokens) // line_count
    remainder = len(cleaned_tokens) % line_count
    lines: list[str] = []
    start_index = 0

    for line_index in range(line_count):
        chunk_size = base_size + (1 if line_index < remainder else 0)
        end_index = start_index + max(1, chunk_size)
        lines.append(_join_transcript_tokens(cleaned_tokens[start_index:end_index]))
        start_index = end_index

    return "\n".join(line for line in lines if line)


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


def _build_audio_filter(export_settings: ExportSettings | None = None) -> str | None:
    audio_enhancement = (export_settings or ExportSettings()).audio_enhancement
    if not audio_enhancement.enabled or not audio_enhancement.normalize_loudness:
        return None
    return (
        "loudnorm="
        f"I={audio_enhancement.target_lufs:.1f}:"
        f"TP={audio_enhancement.true_peak_db:.1f}:"
        "LRA=11.0"
    )


def _build_visual_mode_video_filter(render_contract: Any) -> str | None:
    if render_contract.effective_visual_output_mode == "book_like":
        return "eq=saturation=0.84:contrast=1.04:brightness=0.02"
    if render_contract.effective_visual_output_mode == "stylized_animated":
        return "eq=saturation=1.10:contrast=1.08:brightness=0.01"
    return None


def _build_video_filters(
    subtitle_path: Path | None,
    *,
    export_settings: ExportSettings | None = None,
    visual_output_mode: VisualOutputMode = "original_people",
    crop_window: CropWindow | None = None,
    clip_duration_seconds: float | None = None,
) -> str:
    render_contract = build_render_contract(
        export_settings,
        visual_output_mode=visual_output_mode,
        subtitles_available=subtitle_path is not None,
        clip_duration_seconds=clip_duration_seconds,
    )
    filters: list[str] = []
    if render_contract.export_mode == "portrait":
        portrait_crop = crop_window or CropWindow(
            source_width=1920,
            source_height=1080,
            crop_width=608,
            crop_height=1080,
            offset_x=656,
            offset_y=0,
        )
        filters.append(build_portrait_video_filters(portrait_crop))
    else:
        filters.append(
            (
                f"scale={render_contract.width}:{render_contract.height}:force_original_aspect_ratio=decrease,"
                f"pad={render_contract.width}:{render_contract.height}:(ow-iw)/2:(oh-ih)/2"
            )
        )
    visual_mode_filter = _build_visual_mode_video_filter(render_contract)
    if visual_mode_filter is not None:
        filters.append(visual_mode_filter)
    filters.append("setpts=PTS-STARTPTS")
    if subtitle_path is not None:
        filters.append(
            _build_subtitle_filter(
                subtitle_path,
                export_settings.subtitle_style if export_settings else None,
                export_mode=render_contract.export_mode,
            )
        )
    return ",".join(filters)


def _build_video_filter_graph(
    subtitle_path: Path | None,
    overlay: OverlayDecision,
    *,
    export_settings: ExportSettings | None = None,
    visual_output_mode: VisualOutputMode = "original_people",
    crop_window: CropWindow | None = None,
    clip_duration_seconds: float | None = None,
) -> str:
    subtitle_filter = _build_video_filters(
        subtitle_path,
        export_settings=export_settings,
        visual_output_mode=visual_output_mode,
        crop_window=crop_window,
        clip_duration_seconds=clip_duration_seconds,
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
    subtitle_path: Path | None,
    *,
    start_seconds: float,
    duration_seconds: float,
    export_settings: ExportSettings,
    visual_output_mode: VisualOutputMode = "original_people",
    overlay: OverlayDecision,
) -> tuple[OverlayDecision, ExportSettings]:
    crop_window = _resolve_crop_window(
        source_path,
        start_seconds=start_seconds,
        duration_seconds=duration_seconds,
        export_settings=export_settings,
    )
    render_contract = build_render_contract(
        export_settings,
        visual_output_mode=visual_output_mode,
        subtitles_available=subtitle_path is not None,
        clip_duration_seconds=duration_seconds,
    )
    if not overlay.applied:
        final_export_settings = _run_ffmpeg_clip_generation(
            source_path,
            clip_path,
            subtitle_path,
            start_seconds=start_seconds,
            duration_seconds=duration_seconds,
            export_settings=export_settings,
            visual_output_mode=visual_output_mode,
            crop_window=crop_window,
        )
        if final_export_settings is None:
            final_export_settings = export_settings
        return overlay.model_copy(update={"rendered": False, "render_status": "no_match"}), final_export_settings

    if render_contract.overlay_policy == "disabled":
        final_export_settings = _run_ffmpeg_clip_generation(
            source_path,
            clip_path,
            subtitle_path,
            start_seconds=start_seconds,
            duration_seconds=duration_seconds,
            export_settings=export_settings,
            visual_output_mode=visual_output_mode,
            crop_window=crop_window,
        )
        if final_export_settings is None:
            final_export_settings = export_settings
        return overlay.model_copy(update={"rendered": False, "render_status": "mode_disabled"}), final_export_settings

    overlay_for_render = overlay
    success_status = "rendered"
    if render_contract.overlay_policy == "limited":
        overlay_for_render = overlay.model_copy(
            update={
                "opacity": min(float(overlay.opacity or 0.9), 0.58),
                "scale": min(float(overlay.scale or 0.18), 0.14),
            }
        )
        success_status = "mode_limited"

    overlay_asset_path = _resolve_overlay_asset_path(overlay_for_render.asset_path)
    if overlay_asset_path is None:
        final_export_settings = _run_ffmpeg_clip_generation(
            source_path,
            clip_path,
            subtitle_path,
            start_seconds=start_seconds,
            duration_seconds=duration_seconds,
            export_settings=export_settings,
            visual_output_mode=visual_output_mode,
            crop_window=crop_window,
        )
        if final_export_settings is None:
            final_export_settings = export_settings
        return overlay.model_copy(update={"rendered": False, "render_status": "missing_asset"}), final_export_settings

    try:
        final_export_settings = _run_ffmpeg_clip_generation(
            source_path,
            clip_path,
            subtitle_path,
            start_seconds=start_seconds,
            duration_seconds=duration_seconds,
            export_settings=export_settings,
            visual_output_mode=visual_output_mode,
            crop_window=crop_window,
            overlay=overlay_for_render,
            overlay_asset_path=overlay_asset_path,
        )
        if final_export_settings is None:
            final_export_settings = export_settings
        return overlay_for_render.model_copy(update={"rendered": True, "render_status": success_status}), final_export_settings
    except ClippingError:
        final_export_settings = _run_ffmpeg_clip_generation(
            source_path,
            clip_path,
            subtitle_path,
            start_seconds=start_seconds,
            duration_seconds=duration_seconds,
            export_settings=export_settings,
            visual_output_mode=visual_output_mode,
            crop_window=crop_window,
        )
        if final_export_settings is None:
            final_export_settings = export_settings
        return overlay.model_copy(update={"rendered": False, "render_status": "render_fallback"}), final_export_settings


def _run_ffmpeg_clip_generation(
    source_path: Path,
    clip_path: Path,
    subtitle_path: Path | None,
    *,
    start_seconds: float,
    duration_seconds: float,
    export_settings: ExportSettings | None = None,
    visual_output_mode: VisualOutputMode = "original_people",
    crop_window: CropWindow | None = None,
    overlay: OverlayDecision | None = None,
    overlay_asset_path: Path | None = None,
) -> ExportSettings:
    if not shutil.which("ffmpeg"):
        raise ClippingError("ffmpeg is required to generate clips.", status_code=500)

    resolved_export_settings = export_settings.model_copy(deep=True) if export_settings is not None else ExportSettings()
    command = build_ffmpeg_clip_command(
        source_path,
        clip_path,
        subtitle_path,
        start_seconds=start_seconds,
        duration_seconds=duration_seconds,
        export_settings=resolved_export_settings,
        visual_output_mode=visual_output_mode,
        crop_window=crop_window,
        overlay=overlay,
        overlay_asset_path=overlay_asset_path,
    )
    try:
        _execute_ffmpeg_command(command, clip_path)
        return resolved_export_settings
    except ClippingError as exc:
        if _build_audio_filter(resolved_export_settings) is None:
            raise

        fallback_export_settings = _build_failed_audio_export_settings(resolved_export_settings)
        fallback_command = build_ffmpeg_clip_command(
            source_path,
            clip_path,
            subtitle_path,
            start_seconds=start_seconds,
            duration_seconds=duration_seconds,
            export_settings=fallback_export_settings,
            visual_output_mode=visual_output_mode,
            crop_window=crop_window,
            overlay=overlay,
            overlay_asset_path=overlay_asset_path,
        )
        try:
            _execute_ffmpeg_command(fallback_command, clip_path)
            return fallback_export_settings
        except ClippingError:
            raise exc


def _execute_ffmpeg_command(command: list[str], clip_path: Path) -> None:
    timeout_seconds = int(_get_ffmpeg_render_settings()["timeout"])
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise ClippingError("ffmpeg timed out while generating a clip.", status_code=504) from exc

    if result.returncode != 0 or not clip_path.exists():
        stderr = (result.stderr or result.stdout).strip()
        raise ClippingError(stderr or "ffmpeg failed to generate the clip.", status_code=502)

def _build_failed_audio_export_settings(export_settings: ExportSettings) -> ExportSettings:
    failed_audio = export_settings.audio_enhancement.model_copy(
        update={
            "enabled": True,
            "normalize_loudness": False,
            "status": "failed",
        }
    )
    return export_settings.model_copy(update={"audio_enhancement": failed_audio}, deep=True)


def _merge_runtime_export_settings(
    persisted_export_settings: ExportSettings,
    runtime_export_settings: ExportSettings,
) -> ExportSettings:
    return persisted_export_settings.model_copy(
        update={
            "audio_enhancement": runtime_export_settings.audio_enhancement.model_copy(deep=True),
        },
        deep=True,
    )


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
    try:
        source_path = materialize_source_media_path(
            storage_path,
            filename=str(podcast_row.get("source_filename") or "source.mp4"),
        )
    except SourceStorageError as exc:
        raise ClippingError(exc.detail, status_code=exc.status_code) from exc
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


def _persist_generated_clip_row(row: dict[str, Any]) -> None:
    if isinstance(service_supabase, UnconfiguredSupabaseClient):
        return
    try:
        service_supabase.table("clips").insert(row).execute()
    except Exception as exc:
        if not _clip_optional_columns_missing(exc):
            raise
        service_supabase.table("clips").insert(
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
        ).execute()


def _resolve_export_settings(
    export_settings: ExportSettingsInput | ExportSettings | None,
    *,
    podcast_row: dict[str, Any] | None = None,
) -> ExportSettings:
    if isinstance(export_settings, ExportSettings):
        return resolve_export_settings_for_render(export_settings)
    if isinstance(export_settings, ExportSettingsInput):
        return resolve_export_settings_for_render(export_settings)
    if podcast_row is not None:
        return resolve_export_settings_for_render(_build_export_settings_from_row(podcast_row))
    return resolve_export_settings_for_render(ExportSettings())


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
    return coerce_persisted_export_settings(row)


def _persist_podcast_export_settings(podcast_id: str, export_settings: ExportSettings) -> None:
    if isinstance(service_supabase, UnconfiguredSupabaseClient):
        return
    try:
        service_supabase.table("podcasts").update(
            {
                "preset_name": export_settings.preset_name,
                "export_mode": export_settings.export_mode,
                "crop_mode": export_settings.crop_mode,
                "subtitle_timing_profile": export_settings.subtitle_timing_profile,
                "mobile_optimized": export_settings.mobile_optimized,
                "face_tracking_enabled": export_settings.face_tracking_enabled,
                "subtitle_style": export_settings.subtitle_style.model_dump(mode="json"),
                "audio_enhancement": export_settings.audio_enhancement.model_dump(mode="json"),
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
                "id,podcast_id,clip_number,clip_start_sec,clip_end_sec,virality_score,storage_path,storage_url,subtitle_text,status,published,download_url,published_at,preset_name,export_mode,crop_mode,subtitle_timing_profile,mobile_optimized,face_tracking_enabled,subtitle_style,audio_enhancement,generation_settings,visual_output_mode,effective_visual_output_mode,render_fallback_reason"
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
            .select("id,storage_path,preset_name,export_mode,crop_mode,subtitle_timing_profile,mobile_optimized,face_tracking_enabled,subtitle_style,audio_enhancement")
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
            "preset_name",
            "export_mode",
            "crop_mode",
            "subtitle_timing_profile",
            "mobile_optimized",
            "face_tracking_enabled",
            "subtitle_style",
            "audio_enhancement",
            "generation_settings",
            "visual_output_mode",
            "effective_visual_output_mode",
            "render_fallback_reason",
            "42703",
        )
    )


def _podcast_export_columns_missing(exc: Exception) -> bool:
    message = str(exc).lower()
    return any(
        token in message
        for token in (
            "preset_name",
            "export_mode",
            "crop_mode",
            "subtitle_timing_profile",
            "mobile_optimized",
            "face_tracking_enabled",
            "subtitle_style",
            "audio_enhancement",
            "42703",
        )
    )
