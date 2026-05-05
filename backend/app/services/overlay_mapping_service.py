from __future__ import annotations

import re
import uuid
from collections.abc import Iterable
from dataclasses import dataclass

from app.database import UnconfiguredSupabaseClient, service_supabase
from app.models.analysis import ScoreSegment
from app.models.clipping import ClipResult
from app.models.overlay import OverlayDecision, OverlayMappingResult


@dataclass(frozen=True)
class _OverlayRule:
    keywords: tuple[str, ...]
    category: str
    asset: str
    position: str
    scale: float
    opacity: float
    confidence: float


OVERLAY_RULES: tuple[_OverlayRule, ...] = (
    _OverlayRule(("bitcoin", "crypto", "blockchain"), "finance", "bitcoin_icon", "top_right", 0.18, 0.94, 0.94),
    _OverlayRule(("ai", "artificial intelligence", "gpt", "machine learning"), "technology", "ai_chip", "bottom_right", 0.2, 0.95, 0.93),
    _OverlayRule(("marketing", "brand", "audience", "growth"), "business", "marketing_graph", "top_left", 0.2, 0.92, 0.9),
    _OverlayRule(("money", "cash", "revenue", "income"), "finance", "money_stack", "bottom_left", 0.2, 0.94, 0.91),
    _OverlayRule(("startup", "founder", "pitch", "venture"), "business", "startup_rocket", "top_center", 0.18, 0.96, 0.89),
)


class OverlayMappingError(Exception):
    def __init__(self, detail: str, *, status_code: int = 422) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


def build_overlay_mappings(
    podcast_id: str,
    clip_segment_pairs: Iterable[tuple[ClipResult, ScoreSegment]],
) -> OverlayMappingResult:
    cleaned_podcast_id = podcast_id.strip()
    if not cleaned_podcast_id:
        raise OverlayMappingError("Podcast id is required.", status_code=400)

    decisions: list[OverlayDecision] = []
    checked_segments = 0

    for clip, segment in clip_segment_pairs:
        checked_segments += 1
        decisions.append(detect_overlay_decision(cleaned_podcast_id, clip, segment))

    return OverlayMappingResult(
        podcast_id=cleaned_podcast_id,
        total_segments_checked=checked_segments,
        overlay_decisions=decisions,
    )


def persist_overlay_mappings(result: OverlayMappingResult) -> None:
    if isinstance(service_supabase, UnconfiguredSupabaseClient):
        return

    try:
        service_supabase.table("clip_overlays").delete().eq("podcast_id", result.podcast_id).execute()
    except Exception:
        return
    if not result.overlay_decisions:
        return

    payload = [
        {
            "id": str(uuid.uuid4()),
            "clip_id": decision.clip_id,
            "podcast_id": decision.podcast_id,
            "keyword": decision.keyword,
            "overlay_category": decision.overlay_category,
            "overlay_asset": decision.overlay_asset,
            "asset_path": decision.asset_path,
            "matched_text": decision.matched_text,
            "position": decision.position,
            "scale": decision.scale,
            "opacity": decision.opacity,
            "margin_x": decision.margin_x,
            "margin_y": decision.margin_y,
            "render_start_seconds": decision.render_start_seconds,
            "render_end_seconds": decision.render_end_seconds,
            "applied": decision.applied,
            "rendered": decision.rendered,
            "render_status": decision.render_status,
            "confidence": decision.confidence,
        }
        for decision in result.overlay_decisions
    ]
    try:
        service_supabase.table("clip_overlays").insert(payload).execute()
    except Exception:
        return


def get_overlay_decisions_for_podcast(podcast_id: str) -> dict[str, OverlayDecision]:
    if isinstance(service_supabase, UnconfiguredSupabaseClient):
        return {}

    try:
        response = (
            service_supabase.table("clip_overlays")
            .select(
                "clip_id,podcast_id,keyword,overlay_category,overlay_asset,asset_path,"
                "matched_text,position,scale,opacity,margin_x,margin_y,render_start_seconds,"
                "render_end_seconds,applied,rendered,render_status,confidence"
            )
            .eq("podcast_id", podcast_id)
            .execute()
        )
    except Exception:
        return {}
    rows = response.data or []
    decisions: dict[str, OverlayDecision] = {}
    for row in rows:
        decision = OverlayDecision(
            clip_id=str(row["clip_id"]),
            podcast_id=str(row["podcast_id"]),
            keyword=row.get("keyword"),
            overlay_category=row.get("overlay_category"),
            overlay_asset=row.get("overlay_asset"),
            asset_path=row.get("asset_path"),
            matched_text=row.get("matched_text"),
            position=row.get("position"),
            scale=float(row["scale"]) if row.get("scale") is not None else None,
            opacity=float(row["opacity"]) if row.get("opacity") is not None else None,
            margin_x=int(row["margin_x"]) if row.get("margin_x") is not None else None,
            margin_y=int(row["margin_y"]) if row.get("margin_y") is not None else None,
            render_start_seconds=float(row["render_start_seconds"]) if row.get("render_start_seconds") is not None else None,
            render_end_seconds=float(row["render_end_seconds"]) if row.get("render_end_seconds") is not None else None,
            applied=bool(row.get("applied") or False),
            rendered=bool(row.get("rendered") or False),
            render_status=row.get("render_status"),
            confidence=float(row["confidence"]) if row.get("confidence") is not None else None,
        )
        decisions[decision.clip_id] = decision
    return decisions


def detect_overlay_decision(
    podcast_id: str,
    clip: ClipResult,
    segment: ScoreSegment,
) -> OverlayDecision:
    return _detect_overlay_decision(podcast_id=podcast_id, clip=clip, segment=segment)


def _detect_overlay_decision(*, podcast_id: str, clip: ClipResult, segment: ScoreSegment) -> OverlayDecision:
    searchable_values = _build_search_candidates(segment)

    for rule in OVERLAY_RULES:
        matched_keyword = _find_matching_keyword(searchable_values, rule.keywords)
        if matched_keyword is None:
            continue
        render_start_seconds, render_end_seconds = _estimate_render_window(clip, segment, matched_keyword)
        return OverlayDecision(
            clip_id=clip.id,
            podcast_id=podcast_id,
            keyword=matched_keyword,
            overlay_category=rule.category,
            overlay_asset=rule.asset,
            asset_path=_build_asset_path(rule),
            matched_text=segment.transcript_snippet,
            position=rule.position,
            scale=rule.scale,
            opacity=rule.opacity,
            margin_x=32,
            margin_y=32,
            render_start_seconds=render_start_seconds,
            render_end_seconds=render_end_seconds,
            applied=True,
            rendered=False,
            render_status="mapped",
            confidence=rule.confidence,
        )

    return OverlayDecision(
        clip_id=clip.id,
        podcast_id=podcast_id,
        matched_text=segment.transcript_snippet,
        applied=False,
        rendered=False,
        render_status="no_match",
        confidence=0.0,
    )


def _build_search_candidates(segment: ScoreSegment) -> set[str]:
    values = {segment.transcript_snippet.lower()}
    values.update(keyword.lower() for keyword in segment.keywords)
    return values


def _find_matching_keyword(searchable_values: set[str], rule_keywords: tuple[str, ...]) -> str | None:
    for candidate in rule_keywords:
        lowered = candidate.lower()
        for value in searchable_values:
            if lowered in value:
                return lowered
    return None


def _build_asset_path(rule: _OverlayRule) -> str:
    return f"{rule.category}/{rule.asset}.png"


def _estimate_render_window(
    clip: ClipResult,
    segment: ScoreSegment,
    matched_keyword: str,
) -> tuple[float, float]:
    snippet_tokens = re.findall(r"[a-z0-9]+(?:'[a-z0-9]+)?", segment.transcript_snippet.lower())
    keyword_tokens = re.findall(r"[a-z0-9]+(?:'[a-z0-9]+)?", matched_keyword.lower())
    focus_index = None

    if snippet_tokens and keyword_tokens:
        focus_token = keyword_tokens[0]
        focus_index = next(
            (index for index, token in enumerate(snippet_tokens) if focus_token in token),
            None,
        )

    focus_ratio = 0.35 if focus_index is None else focus_index / max(len(snippet_tokens) - 1, 1)
    absolute_focus = segment.segment_start_seconds + (segment.duration_seconds * focus_ratio)
    display_duration = min(3.2, max(1.8, segment.duration_seconds * 0.28))
    absolute_start = max(segment.segment_start_seconds, absolute_focus - 0.35)
    absolute_end = min(segment.segment_end_seconds, absolute_start + display_duration)
    if absolute_end - absolute_start < 0.6:
        absolute_end = min(segment.segment_end_seconds, absolute_start + 0.6)

    clip_relative_start = max(0.0, round(absolute_start - clip.clip_start_seconds, 3))
    clip_relative_end = min(
        clip.duration_seconds,
        round(max(absolute_end - clip.clip_start_seconds, clip_relative_start + 0.6), 3),
    )
    return clip_relative_start, clip_relative_end
