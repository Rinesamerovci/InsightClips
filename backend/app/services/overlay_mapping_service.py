from __future__ import annotations

import re
import uuid
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

from app.config import BACKEND_DIR
from app.database import UnconfiguredSupabaseClient, service_supabase
from app.models.analysis import ScoreSegment
from app.models.clipping import ClipResult
from app.models.clip_insights import ReferenceMention
from app.models.overlay import OverlayDecision, OverlayMappingResult
from app.services.analysis_service import detect_reference_mentions, extract_topic_labels
from app.services.media_service import build_render_contract


@dataclass(frozen=True)
class _OverlayRule:
    keywords: tuple[str, ...]
    category: str
    asset: str
    portrait_position: str
    landscape_position: str
    portrait_scale: float
    landscape_scale: float
    opacity: float
    confidence: float


OVERLAY_RULES: tuple[_OverlayRule, ...] = (
    _OverlayRule(
        ("bitcoin", "crypto", "blockchain"),
        "finance",
        "bitcoin_icon",
        "top_center",
        "top_right",
        0.15,
        0.18,
        0.94,
        0.97,
    ),
    _OverlayRule(
        ("ai", "artificial intelligence", "gpt", "machine learning"),
        "technology",
        "ai_chip",
        "top_right",
        "bottom_right",
        0.16,
        0.2,
        0.95,
        0.95,
    ),
    _OverlayRule(
        ("marketing", "brand", "audience", "growth"),
        "business",
        "marketing_graph",
        "top_left",
        "top_left",
        0.16,
        0.2,
        0.92,
        0.92,
    ),
    _OverlayRule(
        ("money", "cash", "revenue", "income"),
        "finance",
        "money_stack",
        "top_left",
        "bottom_left",
        0.16,
        0.2,
        0.94,
        0.93,
    ),
    _OverlayRule(
        ("startup", "founder", "pitch", "venture"),
        "business",
        "startup_rocket",
        "center",
        "top_center",
        0.14,
        0.18,
        0.96,
        0.9,
    ),
)
OVERLAY_RULES_BY_ASSET = {rule.asset: rule for rule in OVERLAY_RULES}
OVERLAY_ASSETS_ROOT = BACKEND_DIR / "assets" / "overlays"
ASSET_EXTENSION = ".png"


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
        matched_text = str(row.get("matched_text") or "").strip()
        reference_mentions = detect_reference_mentions(
            matched_text,
            segment_start_seconds=float(row["render_start_seconds"]) if row.get("render_start_seconds") is not None else 0.0,
            segment_end_seconds=float(row["render_end_seconds"]) if row.get("render_end_seconds") is not None else None,
            keywords=[str(row.get("keyword") or "").strip()] if row.get("keyword") else [],
        )
        matched_reference = next(
            (
                mention
                for mention in reference_mentions
                if str(row.get("keyword") or "").strip().lower() in {mention.normalized_label, *mention.topic_labels}
            ),
            reference_mentions[0] if reference_mentions else None,
        )
        topic_labels = extract_topic_labels(
            matched_text,
            keywords=[str(row.get("keyword") or "").strip()] if row.get("keyword") else [],
            reference_mentions=reference_mentions,
        )
        decision = OverlayDecision(
            clip_id=str(row["clip_id"]),
            podcast_id=str(row["podcast_id"]),
            keyword=row.get("keyword"),
            reference_label=matched_reference.label if matched_reference is not None else None,
            reference_type=matched_reference.mention_type if matched_reference is not None else None,
            overlay_category=row.get("overlay_category"),
            overlay_asset=row.get("overlay_asset"),
            asset_path=row.get("asset_path"),
            matched_text=row.get("matched_text"),
            topic_labels=matched_reference.topic_labels if matched_reference is not None else topic_labels,
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
    reference_mentions = detect_reference_mentions(
        segment.transcript_snippet,
        segment_start_seconds=segment.segment_start_seconds,
        segment_end_seconds=segment.segment_end_seconds,
        keywords=segment.keywords,
    )
    topic_labels = extract_topic_labels(
        segment.transcript_snippet,
        keywords=segment.keywords,
        reference_mentions=reference_mentions,
    )
    searchable_values = _build_search_candidates(segment, reference_mentions, topic_labels)
    asset_inventory = validate_overlay_assets()
    candidates: list[tuple[float, _OverlayRule, str, ReferenceMention | None]] = []

    for index, rule in enumerate(OVERLAY_RULES):
        matched_keyword = _find_matching_keyword(searchable_values, segment, rule.keywords)
        if matched_keyword is None:
            continue
        matched_reference = _select_reference_for_keyword(matched_keyword, reference_mentions)
        score = _score_rule_match(
            rule,
            matched_keyword,
            segment,
            rule_order=index,
            matched_reference=matched_reference,
        )
        candidates.append((score, rule, matched_keyword, matched_reference))

    if not candidates and reference_mentions:
        fallback_rule, fallback_keyword = _resolve_reference_fallback(reference_mentions[0], topic_labels)
        score = _score_rule_match(
            fallback_rule,
            fallback_keyword,
            segment,
            rule_order=len(OVERLAY_RULES),
            matched_reference=reference_mentions[0],
        )
        candidates.append((score, fallback_rule, fallback_keyword, reference_mentions[0]))

    if candidates:
        _, rule, matched_keyword, matched_reference = max(
            candidates,
            key=lambda item: (item[0], item[1].category, item[1].asset, item[2], item[3].label if item[3] else ""),
        )
        render_contract = build_render_contract(
            clip.export_settings,
            visual_output_mode=clip.visual_output_mode or "original_people",
            subtitles_available=bool(clip.subtitle_text),
            clip_duration_seconds=clip.duration_seconds,
        )
        overlay_position, overlay_scale, overlay_opacity = _adapt_overlay_for_render_context(
            rule,
            clip,
            render_contract,
        )
        trigger_phrase = matched_reference.label if matched_reference is not None else matched_keyword
        render_start_seconds, render_end_seconds = _estimate_render_window(clip, segment, trigger_phrase)
        asset_path = _build_asset_path(rule)
        asset_exists = asset_path in asset_inventory
        return OverlayDecision(
            clip_id=clip.id,
            podcast_id=podcast_id,
            keyword=matched_keyword,
            reference_label=matched_reference.label if matched_reference is not None else None,
            reference_type=matched_reference.mention_type if matched_reference is not None else None,
            overlay_category=rule.category,
            overlay_asset=rule.asset,
            asset_path=asset_path,
            matched_text=segment.transcript_snippet,
            topic_labels=matched_reference.topic_labels if matched_reference is not None else topic_labels,
            position=overlay_position,
            scale=overlay_scale,
            opacity=overlay_opacity,
            margin_x=render_contract.overlay_safe_margin_x,
            margin_y=render_contract.overlay_safe_margin_y,
            render_start_seconds=render_start_seconds,
            render_end_seconds=render_end_seconds,
            applied=asset_exists,
            rendered=False,
            render_status="mapped" if asset_exists else "missing_asset",
            confidence=round(rule.confidence if asset_exists else max(rule.confidence - 0.08, 0.0), 3),
        )

    return OverlayDecision(
        clip_id=clip.id,
        podcast_id=podcast_id,
        matched_text=segment.transcript_snippet,
        topic_labels=topic_labels,
        applied=False,
        rendered=False,
        render_status="no_match",
        confidence=0.0,
    )


def _build_search_candidates(
    segment: ScoreSegment,
    reference_mentions: list[ReferenceMention],
    topic_labels: list[str],
) -> set[str]:
    values = {_normalize_search_text(segment.transcript_snippet)}
    values.update(_normalize_search_text(keyword) for keyword in segment.keywords)
    values.update(mention.normalized_label for mention in reference_mentions)
    values.update(topic_labels)
    return values


def _find_matching_keyword(
    searchable_values: set[str],
    segment: ScoreSegment,
    rule_keywords: tuple[str, ...],
) -> str | None:
    segment_keywords = {_normalize_search_text(keyword) for keyword in segment.keywords}
    searchable_tokens = {
        token
        for value in searchable_values
        for token in re.findall(r"[a-z0-9]+(?:'[a-z0-9]+)?", value.lower())
    }
    for candidate in rule_keywords:
        lowered = _normalize_search_text(candidate)
        if lowered in segment_keywords:
            return lowered
        if " " in lowered:
            if any(lowered in _normalize_search_text(value) for value in searchable_values):
                return lowered
            continue
        if lowered in searchable_tokens:
            return lowered
    return None


def _adapt_overlay_for_render_context(
    rule: _OverlayRule,
    clip: ClipResult,
    render_contract,
) -> tuple[str, float, float]:
    is_portrait = render_contract.export_mode == "portrait"
    position = rule.portrait_position if is_portrait else rule.landscape_position
    scale = rule.portrait_scale if is_portrait else rule.landscape_scale
    opacity = rule.opacity
    subtitle_position = clip.export_settings.subtitle_style.position if clip.export_settings is not None else "bottom"

    position = _avoid_subtitle_lane(
        position,
        subtitle_position,
        export_mode=render_contract.export_mode,
        subtitle_policy=render_contract.subtitle_policy,
    )
    if render_contract.overlay_policy == "limited":
        scale = min(scale, 0.14 if is_portrait else 0.16)
        opacity = min(opacity, 0.58)
        if position == "center":
            position = "top_center" if is_portrait else "top_right"

    return position, round(scale, 3), round(opacity, 3)


def _avoid_subtitle_lane(
    position: str,
    subtitle_position: str,
    *,
    export_mode: str,
    subtitle_policy: str,
) -> str:
    if subtitle_position == "top" and position.startswith("top_"):
        return _swap_vertical_overlay_lane(position, "bottom")
    if subtitle_position == "bottom" and position.startswith("bottom_"):
        return _swap_vertical_overlay_lane(position, "top")
    if position == "center" and (
        subtitle_position == "center" or subtitle_policy in {"narrative_cards", "stylized_captions"}
    ):
        return "top_center" if export_mode == "portrait" else "top_right"
    return position


def _swap_vertical_overlay_lane(position: str, target_lane: str) -> str:
    lane_suffix = position.split("_", maxsplit=1)[1] if "_" in position else "right"
    return f"{target_lane}_{lane_suffix}"


def _normalize_search_text(value: str) -> str:
    cleaned = " ".join(value.split()).strip().lower()
    cleaned = re.sub(r"[^a-z0-9\s'-]+", " ", cleaned)
    return " ".join(cleaned.split())


def _score_rule_match(
    rule: _OverlayRule,
    matched_keyword: str,
    segment: ScoreSegment,
    *,
    rule_order: int,
    matched_reference: ReferenceMention | None = None,
) -> float:
    transcript = segment.transcript_snippet.lower()
    segment_keywords = set(segment.keywords)
    exact_keyword_bonus = 0.04 if matched_keyword in segment_keywords else 0.0
    transcript_bonus = 0.02 if matched_keyword in transcript else 0.0
    reference_bonus = 0.03 if matched_reference is not None else 0.0
    position_penalty = rule_order * 0.0001
    return round(rule.confidence + exact_keyword_bonus + transcript_bonus + reference_bonus - position_penalty, 4)


def _build_asset_path(rule: _OverlayRule) -> str:
    return f"{rule.category}/{rule.asset}{ASSET_EXTENSION}"


def validate_overlay_assets() -> dict[str, Path]:
    inventory: dict[str, Path] = {}
    for rule in OVERLAY_RULES:
        asset_path = _build_asset_path(rule)
        resolved = (OVERLAY_ASSETS_ROOT / asset_path).resolve()
        if resolved.exists() and resolved.is_file():
            inventory[asset_path] = resolved
    return inventory


def _estimate_render_window(
    clip: ClipResult,
    segment: ScoreSegment,
    matched_phrase: str,
) -> tuple[float, float]:
    snippet_tokens = re.findall(r"[a-z0-9]+(?:'[a-z0-9]+)?", segment.transcript_snippet.lower())
    keyword_tokens = re.findall(r"[a-z0-9]+(?:'[a-z0-9]+)?", matched_phrase.lower())
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


def _select_reference_for_keyword(
    matched_keyword: str,
    reference_mentions: list[ReferenceMention],
) -> ReferenceMention | None:
    for mention in reference_mentions:
        if matched_keyword in mention.normalized_label or matched_keyword in mention.topic_labels:
            return mention
    return reference_mentions[0] if reference_mentions else None


def _resolve_reference_fallback(
    reference: ReferenceMention,
    topic_labels: list[str],
) -> tuple[_OverlayRule, str]:
    combined_topics = {topic.lower() for topic in [*reference.topic_labels, *topic_labels]}
    normalized_label = reference.normalized_label

    if any(topic in combined_topics for topic in {"ai", "technology"}) or any(
        token in normalized_label for token in ("ai", "gpt", "openai")
    ):
        return OVERLAY_RULES_BY_ASSET["ai_chip"], "ai"
    if any(topic in combined_topics for topic in {"finance"}) or any(
        token in normalized_label for token in ("bitcoin", "crypto", "blockchain")
    ):
        if any(token in normalized_label for token in ("bitcoin", "crypto", "blockchain")):
            return OVERLAY_RULES_BY_ASSET["bitcoin_icon"], "bitcoin"
        return OVERLAY_RULES_BY_ASSET["money_stack"], "revenue"
    if any(topic in combined_topics for topic in {"growth", "marketing", "storytelling"}) or reference.mention_type == "concept":
        return OVERLAY_RULES_BY_ASSET["marketing_graph"], "growth"
    return OVERLAY_RULES_BY_ASSET["startup_rocket"], normalized_label.split()[0]
