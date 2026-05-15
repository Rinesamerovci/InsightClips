from __future__ import annotations

from typing import Iterable

from app.models.clip_insights import (
    ClipPlanningInsight,
    HashtagSuggestion,
    RankingFactor,
    ReferenceMention,
)
from app.models.search import RecommendationItem, RecommendationResult
from app.services.analysis_service import detect_reference_mentions, extract_topic_labels
from app.services.search_service import (
    ClipInsightEvaluation,
    ClipDiscoveryContext,
    SearchServiceError,
    build_clip_insight,
    load_discovery_context,
    tokenize_text,
)

HASHTAG_TOPIC_MAP: dict[str, tuple[str, str, float]] = {
    "ai": ("#AI", "Detected an AI or technology angle in the clip.", 0.94),
    "finance": ("#Finance", "Clip language points to money, revenue, or finance topics.", 0.93),
    "growth": ("#Growth", "Growth-oriented keywords appear in the transcript.", 0.95),
    "leadership": ("#Leadership", "Leadership or team-building language is present.", 0.9),
    "marketing": ("#Marketing", "Marketing and audience-building signals are present.", 0.91),
    "product": ("#ProductStrategy", "Product strategy language is present in the clip.", 0.89),
    "productivity": ("#Productivity", "The clip references habits, focus, or productivity ideas.", 0.9),
    "research": ("#Research", "A study, paper, or source reference was detected.", 0.88),
    "startup": ("#Startups", "The clip references startup or founder topics.", 0.92),
    "storytelling": ("#Storytelling", "The clip uses story or hook-driven framing.", 0.86),
}


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
    insights_by_clip_id = {
        context.clip_id: build_clip_insight(context)
        for context in remaining
    }
    planning_by_clip_id = {
        context.clip_id: build_clip_planning_insight(context)
        for context in remaining
    }
    selected: list[tuple[ClipDiscoveryContext, float, str]] = []

    while remaining and len(selected) < normalized_limit:
        best_context = max(
            remaining,
            key=lambda candidate: (
                _recommendation_score(
                    candidate,
                    [item[0] for item in selected],
                    insights_by_clip_id[candidate.clip_id],
                ),
                insights_by_clip_id[candidate.clip_id].score,
                candidate.virality_score,
                -candidate.clip_number,
            ),
        )
        insight = insights_by_clip_id[best_context.clip_id]
        score = _recommendation_score(best_context, [item[0] for item in selected], insight)
        reason = _recommendation_reason(best_context, [item[0] for item in selected], insight)
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
                planning_insight=planning_by_clip_id[context.clip_id],
                insight_score=insights_by_clip_id[context.clip_id].score,
                insight_summary=insights_by_clip_id[context.clip_id].summary,
                ranking_factors=_build_recommendation_factors(
                    context,
                    [item[0] for item in selected[:index]],
                    insights_by_clip_id[context.clip_id],
                ),
                rank_position=index + 1,
                recommendation_score=round(score, 2),
                recommendation_reason=reason,
            )
            for index, (context, score, reason) in enumerate(selected)
        ],
    )


def build_clip_planning_insight(context: ClipDiscoveryContext) -> ClipPlanningInsight:
    reference_mentions = detect_reference_mentions(
        context.transcript_text,
        segment_start_seconds=context.clip_start_seconds,
        segment_end_seconds=context.clip_end_seconds,
        keywords=list(context.keywords),
    )
    topic_labels = extract_topic_labels(
        context.transcript_text,
        keywords=list(context.keywords),
        reference_mentions=reference_mentions,
    )
    return ClipPlanningInsight(
        clip_id=context.clip_id,
        podcast_id=context.podcast_id,
        topic_labels=topic_labels,
        reference_mentions=reference_mentions,
        hashtags=_build_hashtag_suggestions(context, topic_labels, reference_mentions),
    )


def _recommendation_score(
    context: ClipDiscoveryContext,
    selected: list[ClipDiscoveryContext],
    insight: ClipInsightEvaluation,
) -> float:
    score = insight.score
    if not context.published:
        score += 8.0
    else:
        score += 2.5
    if context.status.strip().lower() == "ready":
        score += 4.0
    elif context.status.strip().lower() == "processing":
        score -= 8.0
    elif context.status.strip().lower() == "failed":
        score -= 20.0

    if context.overlay is not None:
        score += 2.0
    score += min(len(context.keywords), 5) * 0.8
    score -= _novelty_penalty(context, selected)
    return round(score, 2)


def _recommendation_reason(
    context: ClipDiscoveryContext,
    selected: list[ClipDiscoveryContext],
    insight: ClipInsightEvaluation,
) -> str:
    penalty = _novelty_penalty(context, selected)
    if not selected and not context.published:
        return "Highest upside right now"
    if context.published and insight.score >= 82.0:
        return "Already validated and still worth resurfacing"
    if penalty <= 4.0 and context.keywords:
        return "Fresh angle with low topic overlap"
    if insight.score >= 85.0:
        return "Strong engagement signals across transcript and metadata"
    if 18.0 <= context.duration_seconds <= 42.0:
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


def _build_recommendation_factors(
    context: ClipDiscoveryContext,
    selected: list[ClipDiscoveryContext],
    insight: ClipInsightEvaluation,
) -> list[RankingFactor]:
    factors = list(insight.factors)
    factors.insert(
        0,
        RankingFactor(
            label="Recommendation strategy",
            value="Promote unpublished upside" if not context.published else "Keep proven clip visible",
            impact=8.0 if not context.published else 2.5,
            category="recommendation",
            evidence="Recommendation ranking prefers clips that are either ready to publish or already validated.",
        ),
    )
    novelty_penalty = _novelty_penalty(context, selected)
    factors.insert(
        1,
        RankingFactor(
            label="Novelty balance",
            value=f"{max(0.0, 100.0 - (novelty_penalty * 4.0)):.0f}% distinct",
            impact=round(-novelty_penalty, 2),
            category="recommendation",
            evidence="Penalizes clips that repeat the same keywords and transcript patterns already selected.",
        ),
    )
    deduped: list[RankingFactor] = []
    seen: set[tuple[str, str]] = set()
    for factor in factors:
        key = (factor.label.lower(), factor.value.lower())
        if key in seen:
            continue
        deduped.append(factor)
        seen.add(key)
        if len(deduped) >= 5:
            break
    return deduped


def _build_hashtag_suggestions(
    context: ClipDiscoveryContext,
    topic_labels: list[str],
    reference_mentions: list[ReferenceMention],
) -> list[HashtagSuggestion]:
    candidates: dict[str, HashtagSuggestion] = {}

    def add_candidate(tag: str, confidence: float, reason: str) -> None:
        suggestion = HashtagSuggestion(tag=tag, confidence=confidence, reason=reason)
        key = suggestion.tag.lower()
        existing = candidates.get(key)
        if existing is None or (
            suggestion.confidence,
            suggestion.tag.lower(),
        ) > (
            existing.confidence,
            existing.tag.lower(),
        ):
            candidates[key] = suggestion

    add_candidate("#InsightClips", 0.99, "Base publishing tag for generated podcast clips.")
    add_candidate("#PodcastClips", 0.98, "Signals that the clip is a short podcast highlight.")

    for topic in topic_labels:
        mapped = HASHTAG_TOPIC_MAP.get(topic)
        if mapped is None:
            continue
        tag, reason, confidence = mapped
        add_candidate(tag, confidence, reason)

    for keyword in context.keywords:
        if len(keyword) < 4:
            continue
        hashtag = _keyword_to_hashtag(keyword)
        if hashtag is None:
            continue
        add_candidate(
            hashtag,
            0.82,
            "Derived from a high-signal keyword already attached to the clip transcript.",
        )

    for mention in reference_mentions:
        hashtag = _reference_to_hashtag(mention.label)
        if hashtag is not None:
            add_candidate(
                hashtag,
                min(0.96, max(0.84, mention.confidence)),
                f"Derived directly from the detected {mention.mention_type.replace('_', ' ')} mention.",
            )
        mention_type_tag = _reference_type_hashtag(mention)
        if mention_type_tag is not None:
            add_candidate(
                mention_type_tag,
                0.87,
                "Helps package the clip around the type of reference being discussed.",
            )

    return sorted(
        candidates.values(),
        key=lambda item: (-item.confidence, item.tag.lower()),
    )[:6]


def _keyword_to_hashtag(keyword: str) -> str | None:
    cleaned = "".join(character for character in keyword.title() if character.isalnum())
    if len(cleaned) < 4:
        return None
    return f"#{cleaned}"


def _reference_to_hashtag(label: str) -> str | None:
    parts = [
        "".join(character for character in word if character.isalnum())
        for word in label.split()
    ]
    cleaned_parts = [part for part in parts if part]
    if not cleaned_parts or len(cleaned_parts) > 4:
        return None
    combined = "".join(part[:1].upper() + part[1:] for part in cleaned_parts)
    if len(combined) < 4 or len(combined) > 28:
        return None
    return f"#{combined}"


def _reference_type_hashtag(mention: ReferenceMention) -> str | None:
    return {
        "book": "#BookInsights",
        "concept": "#BigIdeas",
        "named_reference": "#ReferencedIdeas",
        "source": "#SourceBacked",
    }.get(mention.mention_type)
