from __future__ import annotations

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
    confidence: float


OVERLAY_RULES: tuple[_OverlayRule, ...] = (
    _OverlayRule(("bitcoin", "crypto", "blockchain"), "finance", "bitcoin_icon", 0.94),
    _OverlayRule(("ai", "artificial intelligence", "gpt", "machine learning"), "technology", "ai_chip", 0.93),
    _OverlayRule(("marketing", "brand", "audience", "growth"), "business", "marketing_graph", 0.9),
    _OverlayRule(("money", "cash", "revenue", "income"), "finance", "money_stack", 0.91),
    _OverlayRule(("startup", "founder", "pitch", "venture"), "business", "startup_rocket", 0.89),
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
        decisions.append(
            _detect_overlay_decision(
                podcast_id=cleaned_podcast_id,
                clip_id=clip.id,
                segment=segment,
            )
        )

    return OverlayMappingResult(
        podcast_id=cleaned_podcast_id,
        total_segments_checked=checked_segments,
        overlay_decisions=decisions,
    )


def persist_overlay_mappings(result: OverlayMappingResult) -> None:
    if isinstance(service_supabase, UnconfiguredSupabaseClient):
        return

    service_supabase.table("clip_overlays").delete().eq("podcast_id", result.podcast_id).execute()
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
            "matched_text": decision.matched_text,
            "applied": decision.applied,
            "confidence": decision.confidence,
        }
        for decision in result.overlay_decisions
    ]
    service_supabase.table("clip_overlays").insert(payload).execute()


def get_overlay_decisions_for_podcast(podcast_id: str) -> dict[str, OverlayDecision]:
    if isinstance(service_supabase, UnconfiguredSupabaseClient):
        return {}

    try:
        response = (
            service_supabase.table("clip_overlays")
            .select("clip_id,podcast_id,keyword,overlay_category,overlay_asset,matched_text,applied,confidence")
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
            matched_text=row.get("matched_text"),
            applied=bool(row.get("applied") or False),
            confidence=float(row["confidence"]) if row.get("confidence") is not None else None,
        )
        decisions[decision.clip_id] = decision
    return decisions


def _detect_overlay_decision(*, podcast_id: str, clip_id: str, segment: ScoreSegment) -> OverlayDecision:
    searchable_values = _build_search_candidates(segment)

    for rule in OVERLAY_RULES:
        matched_keyword = _find_matching_keyword(searchable_values, rule.keywords)
        if matched_keyword is None:
            continue
        return OverlayDecision(
            clip_id=clip_id,
            podcast_id=podcast_id,
            keyword=matched_keyword,
            overlay_category=rule.category,
            overlay_asset=rule.asset,
            matched_text=segment.transcript_snippet,
            applied=True,
            confidence=rule.confidence,
        )

    return OverlayDecision(
        clip_id=clip_id,
        podcast_id=podcast_id,
        matched_text=segment.transcript_snippet,
        applied=False,
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
