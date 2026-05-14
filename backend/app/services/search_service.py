from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass
from typing import Any

from app.database import UnconfiguredSupabaseClient, service_supabase
from app.models.clip_insights import RankingFactor
from app.models.overlay import OverlayDecision
from app.models.search import ClipSearchHit, ClipSearchResult
import app.services.overlay_mapping_service as overlay_mapping_service_module

CLIP_COLUMNS = (
    "id,podcast_id,clip_number,clip_start_sec,clip_end_sec,virality_score,"
    "storage_url,subtitle_text,status,published,download_url,published_at"
)
SCORE_COLUMNS = "segment_start_sec,segment_end_sec,virality_score,transcript_snippet,keywords"
STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "in", "into", "is",
    "it", "its", "of", "on", "or", "that", "the", "their", "them", "this", "to", "was", "we",
    "with", "you", "your",
}
HOOK_TERMS = {
    "audit", "before", "biggest", "boost", "build", "change", "convert", "conversion", "conversions",
    "fix", "faster", "framework", "growth", "hook", "hooks", "how", "improve", "lesson", "lessons",
    "mistake", "mistakes", "pricing", "repeatable", "retention", "secret", "steps", "system", "trust",
    "why", "wins",
}
SECOND_PERSON_TERMS = {"you", "your", "yours"}


class SearchServiceError(Exception):
    def __init__(self, detail: str, *, status_code: int = 422) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


@dataclass(frozen=True)
class ClipDiscoveryContext:
    clip_id: str
    podcast_id: str
    podcast_title: str
    title: str
    clip_number: int
    clip_start_seconds: float
    clip_end_seconds: float
    duration_seconds: float
    virality_score: float
    video_url: str
    subtitle_text: str
    transcript_text: str
    keywords: tuple[str, ...]
    status: str
    published: bool
    download_url: str | None
    published_at: Any
    overlay: OverlayDecision | None


@dataclass(frozen=True)
class SearchFilters:
    status: str = "all"
    published: bool | None = None
    min_duration: float | None = None
    max_duration: float | None = None
    min_score: float | None = None
    max_score: float | None = None


@dataclass(frozen=True)
class ClipInsightEvaluation:
    score: float
    summary: str
    factors: tuple[RankingFactor, ...]


def search_clips(
    podcast_id: str,
    query: str,
    filters: dict[str, Any] | None,
) -> ClipSearchResult:
    cleaned_query = " ".join(query.split())
    normalized_query = cleaned_query.lower()
    normalized_filters = _normalize_filters(filters or {})
    contexts = load_discovery_context(podcast_id)

    hits: list[ClipSearchHit] = []
    for context in contexts:
        if not _matches_filters(context, normalized_filters):
            continue

        insight = build_clip_insight(context)
        if normalized_query:
            search_score, matched_fields, ranking_factors = _score_context(
                context,
                normalized_query,
                insight,
            )
            if search_score <= 0:
                continue
        else:
            search_score = round(insight.score, 2)
            matched_fields = []
            ranking_factors = list(insight.factors[:4])

        hits.append(
            ClipSearchHit(
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
                insight_score=insight.score,
                insight_summary=insight.summary,
                ranking_factors=ranking_factors,
                search_score=search_score,
                matched_fields=matched_fields,
                match_reason=_resolve_match_reason(matched_fields),
            )
        )

    hits.sort(
        key=lambda item: (
            -item.search_score,
            -(item.insight_score or 0.0),
            -item.virality_score,
            item.clip_number,
            item.id,
        )
    )
    ranked_hits = [
        item.model_copy(update={"rank_position": index + 1})
        for index, item in enumerate(hits)
    ]
    return ClipSearchResult(query=cleaned_query, total_results=len(ranked_hits), clips=ranked_hits)


def load_discovery_context(podcast_id: str) -> list[ClipDiscoveryContext]:
    cleaned_podcast_id = podcast_id.strip()
    if not cleaned_podcast_id:
        raise SearchServiceError("podcast_id is required.", status_code=400)
    if isinstance(service_supabase, UnconfiguredSupabaseClient):
        raise SearchServiceError("Supabase must be configured before clip discovery can run.", status_code=503)

    podcast_rows = (
        service_supabase.table("podcasts")
        .select("id,title")
        .eq("id", cleaned_podcast_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not podcast_rows:
        raise SearchServiceError("Podcast not found.", status_code=404)

    podcast_title = str(podcast_rows[0].get("title") or "").strip()
    clip_rows = (
        service_supabase.table("clips")
        .select(CLIP_COLUMNS)
        .eq("podcast_id", cleaned_podcast_id)
        .order("clip_number")
        .execute()
        .data
        or []
    )
    score_rows = _load_score_rows(cleaned_podcast_id)
    overlay_mapping_service_module.service_supabase = service_supabase
    overlays_by_clip_id = overlay_mapping_service_module.get_overlay_decisions_for_podcast(cleaned_podcast_id)

    return [
        _build_context(
            cleaned_podcast_id,
            podcast_title,
            row,
            score_rows,
            overlays_by_clip_id.get(str(row["id"])),
        )
        for row in clip_rows
    ]


def tokenize_text(value: str) -> list[str]:
    return re.findall(r"[a-z0-9]+(?:'[a-z0-9]+)?", value.lower())


def build_clip_insight(context: ClipDiscoveryContext) -> ClipInsightEvaluation:
    informative_tokens = _informative_tokens(context.transcript_text)
    unique_tokens = set(informative_tokens)
    keyword_count = len(context.keywords)
    duration_fit = _duration_fit(context.duration_seconds)
    hook_strength = _hook_strength(context.title, context.transcript_text)
    transcript_depth = min(len(unique_tokens), 18) / 18 if unique_tokens else 0.0
    keyword_strength = min(keyword_count, 6) / 6 if keyword_count else 0.0
    readiness_strength = _readiness_strength(context)
    metadata_strength = _metadata_strength(context)

    virality_component = context.virality_score * 0.5
    duration_component = duration_fit * 14.0
    hook_component = hook_strength * 13.0
    transcript_component = transcript_depth * 10.0
    keyword_component = keyword_strength * 7.0
    readiness_component = readiness_strength * 4.0
    metadata_component = metadata_strength * 2.0

    score = min(
        100.0,
        round(
            virality_component
            + duration_component
            + hook_component
            + transcript_component
            + keyword_component
            + readiness_component
            + metadata_component,
            2,
        ),
    )
    factors = _select_top_factors(
        [
            _build_factor(
                "Virality signal",
                f"{context.virality_score:.1f}/100",
                round((context.virality_score - 50.0) / 4.0, 2),
                "performance",
                evidence="Baseline model score for this clip.",
            ),
            _build_factor(
                "Duration fit",
                f"{context.duration_seconds:.1f}s",
                _duration_impact(context.duration_seconds),
                "metadata",
                evidence=_duration_evidence(context.duration_seconds),
            ),
            _build_factor(
                "Transcript hook",
                _hook_value_summary(context.title, context.transcript_text),
                round((hook_strength * 10.0) - 1.0, 2),
                "transcript",
                evidence="Looks for numbers, direct-address phrasing, and high-signal hook terms.",
            ),
            _build_factor(
                "Transcript depth",
                f"{len(unique_tokens)} informative terms",
                round((transcript_depth * 6.0) - 1.0, 2),
                "transcript",
                evidence="Measures whether the clip carries enough distinct ideas to feel substantial.",
            ),
            _build_factor(
                "Keyword coverage",
                f"{keyword_count} keyword{'s' if keyword_count != 1 else ''}",
                round((keyword_strength * 5.0) - 0.5, 2),
                "metadata",
                evidence="Keyword variety improves searchability and recommendation explanations.",
            ),
            _build_factor(
                "Publish readiness",
                _readiness_label(context),
                _readiness_impact(context),
                "metadata",
                evidence="Ready unpublished clips get the most upside for next-action ranking.",
            ),
            _build_factor(
                "Metadata proof",
                _metadata_label(context),
                round(metadata_strength * 3.0, 2),
                "metadata",
                evidence="Published/download/overlay metadata adds confidence to surfaced results.",
            ),
        ]
    )
    return ClipInsightEvaluation(score=score, summary=_build_insight_summary(context, duration_fit, hook_strength), factors=tuple(factors))


def _load_score_rows(podcast_id: str) -> list[dict[str, Any]]:
    try:
        return (
            service_supabase.table("scores")
            .select(SCORE_COLUMNS)
            .eq("podcast_id", podcast_id)
            .order("virality_score", desc=True)
            .execute()
            .data
            or []
        )
    except Exception:
        return []


def _build_context(
    podcast_id: str,
    podcast_title: str,
    row: dict[str, Any],
    score_rows: list[dict[str, Any]],
    overlay: OverlayDecision | None,
) -> ClipDiscoveryContext:
    clip_start_seconds = float(row.get("clip_start_sec") or 0.0)
    clip_end_seconds = float(row.get("clip_end_sec") or 0.0)
    duration_seconds = round(max(0.001, clip_end_seconds - clip_start_seconds), 3)
    subtitle_text = str(row.get("subtitle_text") or "").strip() or f"Clip {int(row.get('clip_number') or 0)}"
    overlapping_scores = [
        score_row
        for score_row in score_rows
        if _ranges_overlap(
            clip_start_seconds,
            clip_end_seconds,
            float(score_row.get("segment_start_sec") or 0.0),
            float(score_row.get("segment_end_sec") or 0.0),
        )
    ]
    snippets = _dedupe_strings(
        [subtitle_text, *[str(item.get("transcript_snippet") or "").strip() for item in overlapping_scores]]
    )
    keywords = _dedupe_strings(
        [
            *[str(keyword).strip().lower() for item in overlapping_scores for keyword in item.get("keywords") or []],
            *_extract_keywords_from_text(subtitle_text),
        ]
    )
    clip_id = str(row["id"])

    return ClipDiscoveryContext(
        clip_id=clip_id,
        podcast_id=podcast_id,
        podcast_title=podcast_title or "Untitled Podcast",
        title=_build_clip_title(int(row.get("clip_number") or 0), subtitle_text),
        clip_number=int(row.get("clip_number") or 0),
        clip_start_seconds=clip_start_seconds,
        clip_end_seconds=clip_end_seconds,
        duration_seconds=duration_seconds,
        virality_score=float(row.get("virality_score") or 0.0),
        video_url=str(row.get("storage_url") or "").strip() or f"/podcasts/clips/{clip_id}/download",
        subtitle_text=subtitle_text,
        transcript_text=" ".join(snippets).strip(),
        keywords=tuple(keywords),
        status=str(row.get("status") or "ready"),
        published=bool(row.get("published")),
        download_url=str(row.get("download_url") or "").strip() or None,
        published_at=row.get("published_at"),
        overlay=overlay,
    )


def _normalize_filters(filters: dict[str, Any]) -> SearchFilters:
    return SearchFilters(
        status=str(filters.get("status") or "all").strip().lower() or "all",
        published=_coerce_bool(filters.get("published")),
        min_duration=_coerce_float(filters.get("min_duration_seconds", filters.get("min_duration"))),
        max_duration=_coerce_float(filters.get("max_duration_seconds", filters.get("max_duration"))),
        min_score=_coerce_float(filters.get("min_score")),
        max_score=_coerce_float(filters.get("max_score")),
    )


def _matches_filters(context: ClipDiscoveryContext, filters: SearchFilters) -> bool:
    if filters.published is not None and context.published is not filters.published:
        return False
    if filters.status != "all":
        if filters.status == "published" and not context.published:
            return False
        elif filters.status == "unpublished" and context.published:
            return False
        elif filters.status not in {"published", "unpublished"} and context.status.strip().lower() != filters.status:
            return False
    if filters.min_duration is not None and context.duration_seconds < filters.min_duration:
        return False
    if filters.max_duration is not None and context.duration_seconds > filters.max_duration:
        return False
    if filters.min_score is not None and context.virality_score < filters.min_score:
        return False
    if filters.max_score is not None and context.virality_score > filters.max_score:
        return False
    return True


def _score_context(
    context: ClipDiscoveryContext,
    normalized_query: str,
    insight: ClipInsightEvaluation,
) -> tuple[float, list[str], list[RankingFactor]]:
    matched_fields: list[str] = []
    score = 0.0
    query_tokens = tokenize_text(normalized_query)
    if not query_tokens:
        return 0.0, matched_fields, []

    query_factors: list[RankingFactor] = []
    score += _add_field_match(
        matched_fields,
        query_factors,
        field="title",
        label="Title match",
        text=context.title,
        normalized_query=normalized_query,
        query_tokens=query_tokens,
        exact_points=44.0,
        token_points=12.0,
    )
    score += _add_field_match(
        matched_fields,
        query_factors,
        field="keywords",
        label="Keyword match",
        text=" ".join(context.keywords),
        normalized_query=normalized_query,
        query_tokens=query_tokens,
        exact_points=38.0,
        token_points=10.0,
    )
    score += _add_field_match(
        matched_fields,
        query_factors,
        field="transcript",
        label="Transcript match",
        text=context.transcript_text,
        normalized_query=normalized_query,
        query_tokens=query_tokens,
        exact_points=30.0,
        token_points=8.0,
    )
    score += _add_field_match(
        matched_fields,
        query_factors,
        field="podcast_title",
        label="Podcast title match",
        text=context.podcast_title,
        normalized_query=normalized_query,
        query_tokens=query_tokens,
        exact_points=16.0,
        token_points=4.0,
    )
    score += _add_field_match(
        matched_fields,
        query_factors,
        field="clip_number",
        label="Clip number match",
        text=f"clip {context.clip_number}",
        normalized_query=normalized_query,
        query_tokens=query_tokens,
        exact_points=12.0,
        token_points=6.0,
    )

    if not matched_fields:
        return 0.0, [], []

    coverage_ratio = _query_coverage_ratio(context, query_tokens)
    query_factors.append(
        _build_factor(
            "Query coverage",
            f"{round(coverage_ratio * 100)}%",
            round((coverage_ratio * 10.0) - 1.0, 2),
            "search",
            evidence="How much of the query vocabulary appears across title, transcript, keywords, and metadata.",
        )
    )
    score += coverage_ratio * 18.0
    score += round(insight.score * 0.12, 2)
    ranking_factors = _merge_ranking_factors(query_factors, list(insight.factors), limit=5)
    return round(score, 2), matched_fields, ranking_factors


def _resolve_match_reason(matched_fields: list[str]) -> str | None:
    priorities = [
        ("title", "Matched clip title"),
        ("keywords", "Matched clip keywords"),
        ("transcript", "Matched clip transcript"),
        ("podcast_title", "Matched podcast title"),
        ("clip_number", "Matched clip number"),
    ]
    matched = set(matched_fields)
    for field, reason in priorities:
        if field in matched:
            return reason
    return None


def _build_clip_title(clip_number: int, subtitle_text: str) -> str:
    cleaned = " ".join(subtitle_text.split()).strip()
    if not cleaned:
        return f"Clip {clip_number}"
    if len(cleaned) <= 72:
        return cleaned
    return f"{cleaned[:69].rstrip()}..."


def _extract_keywords_from_text(text: str) -> list[str]:
    tokens = [token for token in tokenize_text(text) if len(token) > 2 and token not in STOPWORDS]
    if not tokens:
        return []
    return [item for item, _ in Counter(tokens).most_common(5)]


def _dedupe_strings(items: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for item in items:
        cleaned = " ".join(item.split()).strip()
        lowered = cleaned.lower()
        if cleaned and lowered not in seen:
            normalized.append(cleaned)
            seen.add(lowered)
    return normalized


def _ranges_overlap(start_a: float, end_a: float, start_b: float, end_b: float) -> bool:
    return max(start_a, start_b) <= min(end_a, end_b)


def _informative_tokens(text: str) -> list[str]:
    return [token for token in tokenize_text(text) if len(token) > 2 and token not in STOPWORDS]


def _duration_fit(duration_seconds: float) -> float:
    if 18.0 <= duration_seconds <= 42.0:
        return 1.0
    if 12.0 <= duration_seconds < 18.0 or 42.0 < duration_seconds <= 55.0:
        return 0.72
    if 8.0 <= duration_seconds < 12.0 or 55.0 < duration_seconds <= 70.0:
        return 0.38
    return 0.12


def _duration_impact(duration_seconds: float) -> float:
    if 18.0 <= duration_seconds <= 42.0:
        return 8.0
    if 12.0 <= duration_seconds < 18.0 or 42.0 < duration_seconds <= 55.0:
        return 4.0
    if 8.0 <= duration_seconds < 12.0 or 55.0 < duration_seconds <= 70.0:
        return -2.5
    return -6.0


def _duration_evidence(duration_seconds: float) -> str:
    if 18.0 <= duration_seconds <= 42.0:
        return "Falls inside the strongest social-clip duration band."
    if 12.0 <= duration_seconds < 18.0 or 42.0 < duration_seconds <= 55.0:
        return "Still close to the preferred duration window."
    return "Length is more likely to hurt retention or completion rate."


def _hook_strength(title: str, transcript_text: str) -> float:
    combined = f"{title} {transcript_text}".strip()
    tokens = tokenize_text(combined)
    if not tokens:
        return 0.0

    hook_hits = sum(1 for token in tokens if token in HOOK_TERMS)
    second_person_hits = sum(1 for token in tokens if token in SECOND_PERSON_TERMS)
    numeric_hit = any(char.isdigit() for char in combined)
    question_hit = "?" in combined

    score = min(hook_hits, 5) * 0.14
    score += min(second_person_hits, 2) * 0.08
    if numeric_hit:
        score += 0.16
    if question_hit:
        score += 0.14
    return min(score, 1.0)


def _hook_value_summary(title: str, transcript_text: str) -> str:
    combined = f"{title} {transcript_text}".strip()
    tokens = tokenize_text(combined)
    hook_hits = sum(1 for token in tokens if token in HOOK_TERMS)
    has_digits = any(char.isdigit() for char in combined)
    if hook_hits >= 3 and has_digits:
        return "Strong hook language + numbers"
    if hook_hits >= 3:
        return "Strong hook language"
    if has_digits:
        return "Specific numeric promise"
    if "?" in combined:
        return "Curiosity-led framing"
    return "Light hook framing"


def _readiness_strength(context: ClipDiscoveryContext) -> float:
    status = context.status.strip().lower()
    if status == "failed":
        return 0.0
    if status == "processing":
        return 0.35
    if not context.published and status == "ready":
        return 1.0
    if context.published:
        return 0.74
    return 0.6


def _readiness_impact(context: ClipDiscoveryContext) -> float:
    status = context.status.strip().lower()
    if status == "failed":
        return -12.0
    if status == "processing":
        return -4.5
    if not context.published and status == "ready":
        return 7.0
    if context.published:
        return 3.5
    return 1.5


def _readiness_label(context: ClipDiscoveryContext) -> str:
    status = context.status.strip().lower() or "ready"
    if not context.published and status == "ready":
        return "Ready and unpublished"
    if context.published:
        return "Published"
    return status.replace("_", " ").title()


def _metadata_strength(context: ClipDiscoveryContext) -> float:
    score = 0.0
    if context.overlay is not None:
        score += 0.45
    if context.published_at or context.download_url:
        score += 0.35
    if len(context.keywords) >= 3:
        score += 0.2
    return min(score, 1.0)


def _metadata_label(context: ClipDiscoveryContext) -> str:
    labels: list[str] = []
    if context.overlay is not None:
        labels.append("overlay mapped")
    if context.download_url:
        labels.append("download ready")
    if context.published_at:
        labels.append("publish timestamp")
    if not labels:
        return "Basic metadata only"
    return ", ".join(labels[:2])


def _build_insight_summary(
    context: ClipDiscoveryContext,
    duration_fit: float,
    hook_strength: float,
) -> str:
    parts: list[str] = []
    if context.virality_score >= 85.0:
        parts.append("strong virality signal")
    elif context.virality_score >= 72.0:
        parts.append("solid virality baseline")

    if hook_strength >= 0.55:
        parts.append("clear transcript hook")

    if duration_fit >= 0.9:
        parts.append("platform-friendly length")
    elif duration_fit <= 0.2:
        parts.append("length risk")

    if not context.published and context.status.strip().lower() == "ready":
        parts.append("ready to publish")
    elif context.published:
        parts.append("already validated in publishing")

    if not parts:
        parts.append("balanced transcript and metadata signals")
    if len(parts) == 1:
        return parts[0].capitalize() + "."
    return f"{', '.join(parts[:-1]).capitalize()}, and {parts[-1]}."


def _select_top_factors(factors: list[RankingFactor], *, limit: int = 4) -> list[RankingFactor]:
    return sorted(
        factors,
        key=lambda factor: (-abs(factor.impact), factor.label.lower(), factor.value.lower()),
    )[:limit]


def _build_factor(
    label: str,
    value: str,
    impact: float,
    category: str,
    *,
    evidence: str | None = None,
) -> RankingFactor:
    return RankingFactor(
        label=label,
        value=value,
        impact=round(impact, 2),
        category=category,
        evidence=evidence,
    )


def _add_field_match(
    matched_fields: list[str],
    query_factors: list[RankingFactor],
    *,
    field: str,
    label: str,
    text: str,
    normalized_query: str,
    query_tokens: list[str],
    exact_points: float,
    token_points: float,
) -> float:
    normalized_text = text.lower()
    token_set = set(tokenize_text(text))
    exact_match = bool(normalized_query and normalized_query in normalized_text)
    token_hits = len(set(query_tokens) & token_set)
    if not exact_match and token_hits == 0:
        return 0.0

    score = 0.0
    if exact_match:
        score += exact_points
    if token_hits:
        score += min(token_hits, len(query_tokens)) * token_points
    matched_fields.append(field)
    match_value = "Exact phrase" if exact_match else f"{token_hits}/{len(query_tokens)} tokens"
    query_factors.append(
        _build_factor(
            label,
            match_value,
            round(score / 6.0, 2),
            "search",
            evidence=f"Matched against the clip {field.replace('_', ' ')} field.",
        )
    )
    return score


def _query_coverage_ratio(context: ClipDiscoveryContext, query_tokens: list[str]) -> float:
    searchable_tokens = set(tokenize_text(context.title))
    searchable_tokens.update(tokenize_text(context.transcript_text))
    searchable_tokens.update(tokenize_text(context.podcast_title))
    searchable_tokens.update(token for keyword in context.keywords for token in tokenize_text(keyword))
    searchable_tokens.update(tokenize_text(f"clip {context.clip_number}"))
    return len(set(query_tokens) & searchable_tokens) / len(set(query_tokens))


def _merge_ranking_factors(
    primary: list[RankingFactor],
    secondary: list[RankingFactor],
    *,
    limit: int,
) -> list[RankingFactor]:
    merged: list[RankingFactor] = []
    seen: set[tuple[str, str]] = set()
    for factor in [*primary, *secondary]:
        key = (factor.label.lower(), factor.value.lower())
        if key in seen:
            continue
        merged.append(factor)
        seen.add(key)
        if len(merged) >= limit:
            break
    return merged


def _coerce_bool(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if value is None:
        return None
    lowered = str(value).strip().lower()
    if lowered in {"true", "1", "yes"}:
        return True
    if lowered in {"false", "0", "no"}:
        return False
    return None


def _coerce_float(value: Any) -> float | None:
    if value in {None, ""}:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        raise SearchServiceError("Search filters must use numeric duration and score values.", status_code=400)
