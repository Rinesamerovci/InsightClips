from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass
from typing import Any

from app.database import UnconfiguredSupabaseClient, service_supabase
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

        if normalized_query:
            search_score, matched_fields = _score_context(context, normalized_query)
            if search_score <= 0:
                continue
        else:
            search_score = round(context.virality_score, 2)
            matched_fields = []

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
                search_score=search_score,
                matched_fields=matched_fields,
                match_reason=_resolve_match_reason(matched_fields),
            )
        )

    hits.sort(key=lambda item: (-item.search_score, -item.virality_score, item.clip_number))
    return ClipSearchResult(query=cleaned_query, total_results=len(hits), clips=hits)


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


def _score_context(context: ClipDiscoveryContext, normalized_query: str) -> tuple[float, list[str]]:
    matched_fields: list[str] = []
    score = 0.0
    query_tokens = tokenize_text(normalized_query)
    if not query_tokens:
        return 0.0, matched_fields

    title_tokens = set(tokenize_text(context.title))
    transcript_tokens = tokenize_text(context.transcript_text)
    transcript_token_set = set(transcript_tokens)
    keyword_tokens = {token for keyword in context.keywords for token in tokenize_text(keyword)}
    podcast_tokens = set(tokenize_text(context.podcast_title))
    clip_number_text = f"clip {context.clip_number}"

    def add_match(field: str, amount: float) -> None:
        nonlocal score
        score += amount
        if field not in matched_fields:
            matched_fields.append(field)

    if normalized_query in context.title.lower():
        add_match("title", 44.0)
    if normalized_query in context.transcript_text.lower():
        add_match("transcript", 30.0)
    if any(normalized_query in keyword for keyword in context.keywords):
        add_match("keywords", 38.0)
    if normalized_query in context.podcast_title.lower():
        add_match("podcast_title", 16.0)
    if normalized_query in clip_number_text:
        add_match("clip_number", 12.0)

    for token in query_tokens:
        if token in title_tokens:
            add_match("title", 12.0)
        if token in transcript_token_set:
            add_match("transcript", 8.0)
        if token in keyword_tokens:
            add_match("keywords", 10.0)
        if token in podcast_tokens:
            add_match("podcast_title", 4.0)
        if token.isdigit() and int(token) == context.clip_number:
            add_match("clip_number", 6.0)

    if not matched_fields:
        return 0.0, []

    score += round(context.virality_score * 0.12, 2)
    return round(score, 2), matched_fields


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
