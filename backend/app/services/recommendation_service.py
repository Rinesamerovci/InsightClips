from __future__ import annotations

from typing import Iterable

from app.models.search import RecommendationItem, RecommendationResult
from app.services.search_service import (
    ClipDiscoveryContext,
    SearchServiceError,
    load_discovery_context,
    tokenize_text,
)


class RecommendationServiceError(Exception):
    def __init__(self, detail: str, *, status_code: int = 422) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


def recommend_clips(podcast_id: str, limit: int = 5) -> RecommendationResult:
    cleaned_podcast_id = podcast_id.strip()
    if not cleaned_podcast_id:
        raise RecommendationServiceError("podcast_id is required.", status_code=400)

    normalized_limit = max(1, min(int(limit), 10))
    try:
        contexts = load_discovery_context(cleaned_podcast_id)
    except SearchServiceError as exc:
        raise RecommendationServiceError(exc.detail, status_code=exc.status_code) from exc

    remaining = _dedupe_by_clip_id(contexts)
    selected: list[tuple[ClipDiscoveryContext, float, str]] = []

    while remaining and len(selected) < normalized_limit:
        best_context = max(
            remaining,
            key=lambda candidate: _recommendation_score(candidate, [item[0] for item in selected]),
        )
        score = _recommendation_score(best_context, [item[0] for item in selected])
        reason = _recommendation_reason(best_context, [item[0] for item in selected])
        selected.append((best_context, score, reason))
        remaining = [item for item in remaining if item.clip_id != best_context.clip_id]

    return RecommendationResult(
        podcast_id=cleaned_podcast_id,
        recommendations=[
            RecommendationItem(
                id=context.clip_id,
                podcast_id=context.podcast_id,
                podcast_title=context.podcast_title,
                title=context.title,
                clip_number=context.clip_number,
                clip_start_seconds=context.clip_start_seconds,
                clip_end_seconds=context.clip_end_seconds,
                duration_seconds=context.duration_seconds,
                virality_score=context.virality_score,
                video_url=context.video_url,
                subtitle_text=context.subtitle_text,
                keywords=list(context.keywords),
                status=context.status,
                published=context.published,
                download_url=context.download_url,
                published_at=context.published_at,
                overlay=context.overlay,
                recommendation_score=round(score, 2),
                recommendation_reason=reason,
            )
            for context, score, reason in selected
        ],
    )


def _recommendation_score(
    context: ClipDiscoveryContext,
    selected: list[ClipDiscoveryContext],
) -> float:
    score = context.virality_score
    if not context.published:
        score += 12.0
    if context.status.strip().lower() == "ready":
        score += 4.0
    elif context.status.strip().lower() == "failed":
        score -= 16.0

    if 15.0 <= context.duration_seconds <= 45.0:
        score += 3.5
    elif context.duration_seconds < 8.0 or context.duration_seconds > 60.0:
        score -= 4.0

    score += min(len(context.keywords), 5) * 1.2
    score -= _novelty_penalty(context, selected)
    return round(score, 2)


def _recommendation_reason(
    context: ClipDiscoveryContext,
    selected: list[ClipDiscoveryContext],
) -> str:
    penalty = _novelty_penalty(context, selected)
    if not selected and not context.published:
        return "Highest upside right now"
    if penalty <= 4.0 and context.keywords:
        return "Covers a fresh angle for this podcast"
    if context.published:
        return "Already published and still worth amplifying"
    if 15.0 <= context.duration_seconds <= 45.0:
        return "Balanced duration with strong discovery potential"
    return "Strong discovery score with low overlap"


def _novelty_penalty(
    context: ClipDiscoveryContext,
    selected: list[ClipDiscoveryContext],
) -> float:
    if not selected:
        return 0.0

    penalties: list[float] = []
    context_keyword_set = set(context.keywords)
    context_transcript_tokens = {
        token
        for token in tokenize_text(context.transcript_text)
        if len(token) > 2
    }

    for item in selected:
        shared_keyword_ratio = _overlap_ratio(context_keyword_set, set(item.keywords))
        shared_transcript_ratio = _overlap_ratio(
            context_transcript_tokens,
            {
                token
                for token in tokenize_text(item.transcript_text)
                if len(token) > 2
            },
        )
        penalties.append((shared_keyword_ratio * 18.0) + (shared_transcript_ratio * 14.0))

    return max(penalties, default=0.0)


def _overlap_ratio(left: set[str], right: set[str]) -> float:
    if not left or not right:
        return 0.0
    return len(left & right) / len(left | right)


def _dedupe_by_clip_id(items: Iterable[ClipDiscoveryContext]) -> list[ClipDiscoveryContext]:
    deduped: list[ClipDiscoveryContext] = []
    seen: set[str] = set()
    for item in items:
        if item.clip_id in seen:
            continue
        deduped.append(item)
        seen.add(item.clip_id)
    return deduped
