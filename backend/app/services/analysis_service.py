from __future__ import annotations

from pathlib import Path
import re
import time
import uuid
from collections import Counter
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from app.models.clip_insights import ReferenceMention, ReferenceMentionType
from app.database import service_supabase
from app.models.analysis import AnalysisResult, AnalysisSummary, ScoreSegment
from app.models.transcription import TranscriptWord, TranscriptionResult
from app.services.podcast_service import get_podcast_for_user
from app.services.transcription_service import TranscriptionError, transcribe_media

try:
    import spacy
except ImportError:  # pragma: no cover - optional dependency
    spacy = None


STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "been", "being", "but", "by", "for", "from",
    "had", "has", "have", "he", "her", "hers", "him", "his", "i", "if", "in", "into", "is",
    "it", "its", "me", "my", "of", "on", "or", "our", "ours", "she", "so", "than", "that",
    "the", "their", "theirs", "them", "there", "these", "they", "this", "to", "too", "us",
    "was", "we", "were", "what", "when", "where", "which", "who", "why", "will", "with",
    "you", "your", "yours",
}
POSITIVE_TERMS = {
    "amazing", "authentic", "best", "boost", "breakthrough", "epic", "exciting", "free",
    "genius", "great", "growth", "huge", "impressive", "incredible", "love", "massive",
    "powerful", "smart", "success", "viral", "win", "wow",
}
NEGATIVE_TERMS = {
    "angry", "awful", "bad", "boring", "broken", "crisis", "difficult", "fail", "hate",
    "hard", "mistake", "pain", "problem", "regret", "risk", "sad", "scared", "stuck",
    "terrible", "wrong",
}
VIRAL_TERMS = {
    "algorithm", "audience", "behind", "crazy", "founder", "growth", "hook", "mistake",
    "nobody", "podcast", "secret", "story", "trend", "truth", "viral", "watch",
}
QUESTION_TERMS = {"how", "why", "what", "when"}
DIRECT_ADDRESS_TERMS = {"you", "your", "yours"}
MAX_SEGMENT_DURATION = 45.0
MIN_SEGMENT_DURATION = 6.0
PAUSE_BREAK_SECONDS = 1.4
TOP_SEGMENT_COUNT = 5
REFERENCE_BOOK_CUES = {"book", "books"}
REFERENCE_SOURCE_CUES = {"article", "paper", "study", "report", "source", "podcast", "episode"}
REFERENCE_CONCEPT_CUES = {"concept", "framework", "principle", "theory", "law", "effect", "method"}
IGNORED_REFERENCE_LABELS = {
    "because",
    "for the audience",
    "for the entire team",
    "for the whole team",
    "the audience",
    "the founder",
    "the whole team",
    "the team",
    "this episode",
    "this podcast",
    "this story",
}
REFERENCE_LEXICON: dict[str, tuple[ReferenceMentionType, tuple[str, ...]]] = {
    "atomic habits": ("book", ("habits", "productivity", "growth")),
    "deep work": ("book", ("productivity", "focus")),
    "first principles": ("concept", ("product", "strategy")),
    "good to great": ("book", ("leadership", "business", "growth")),
    "harvard business review": ("source", ("business", "leadership", "strategy")),
    "jobs to be done": ("concept", ("product", "customer", "strategy")),
    "lean startup": ("book", ("startup", "product", "growth")),
    "network effects": ("concept", ("growth", "product", "strategy")),
    "openai": ("source", ("ai", "technology")),
    "pareto principle": ("concept", ("productivity", "strategy")),
    "product market fit": ("concept", ("startup", "product", "growth")),
    "zero to one": ("book", ("startup", "innovation", "strategy")),
}
TOPIC_KEYWORD_MAP: dict[str, tuple[str, ...]] = {
    "ai": ("ai", "artificial intelligence", "gpt", "machine learning", "openai"),
    "finance": ("bitcoin", "blockchain", "cash", "crypto", "finance", "income", "money", "revenue"),
    "growth": ("audience", "creator", "growth", "retention", "viral"),
    "marketing": ("brand", "campaign", "marketing", "positioning"),
    "startup": ("founder", "startup", "venture"),
    "product": ("customer", "jobs to be done", "product", "product market fit"),
    "leadership": ("culture", "leadership", "management", "team"),
    "productivity": ("atomic habits", "deep work", "focus", "habit", "habits", "productivity"),
    "research": ("article", "paper", "report", "research", "source", "study"),
    "storytelling": ("hook", "lesson", "story", "stories"),
}


class AnalysisError(Exception):
    def __init__(self, detail: str, *, status_code: int = 422) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


@dataclass(frozen=True)
class _SegmentCandidate:
    words: list[TranscriptWord]
    snippet: str

    @property
    def start(self) -> float:
        return self.words[0].start

    @property
    def end(self) -> float:
        return self.words[-1].end

    @property
    def duration(self) -> float:
        return round(self.end - self.start, 3)


@dataclass(frozen=True)
class _ReferenceCandidate:
    label: str
    normalized_label: str
    mention_type: ReferenceMentionType
    confidence: float
    topic_hints: tuple[str, ...]


def analyze_and_score(podcast_id: str, transcription: TranscriptionResult) -> list[ScoreSegment]:
    podcast_id = podcast_id.strip()
    if not podcast_id:
        raise AnalysisError("Podcast id is required.", status_code=400)
    if not transcription.words:
        raise AnalysisError("Transcription must include word-level timestamps.")

    segments = _build_segment_candidates(transcription)
    if not segments:
        raise AnalysisError("Transcription did not contain enough coherent speech to analyze.")

    scored_segments = [_score_segment(segment) for segment in segments]
    scored_segments.sort(
        key=lambda item: (
            -item.virality_score,
            item.segment_start_seconds,
            item.segment_end_seconds,
        )
    )
    return scored_segments


def build_analysis_result(
    podcast_id: str,
    scored_segments: list[ScoreSegment],
    *,
    processing_time_seconds: float,
) -> AnalysisResult:
    top_segments = scored_segments[:TOP_SEGMENT_COUNT]
    average_score = round(
        sum(item.virality_score for item in scored_segments) / len(scored_segments),
        2,
    ) if scored_segments else 0.0
    return AnalysisResult(
        podcast_id=podcast_id,
        total_segments_analyzed=len(scored_segments),
        top_scoring_segments=top_segments,
        all_scored_segments=scored_segments,
        average_score=average_score,
        processing_time_seconds=processing_time_seconds,
    )


def persist_analysis_result(result: AnalysisResult) -> None:
    all_segments = result.all_scored_segments or result.top_scoring_segments
    service_supabase.table("scores").delete().eq("podcast_id", result.podcast_id).execute()
    payload = [
        {
            "id": str(uuid.uuid4()),
            "podcast_id": result.podcast_id,
            "segment_start_sec": segment.segment_start_seconds,
            "segment_end_sec": segment.segment_end_seconds,
            "virality_score": segment.virality_score,
            "transcript_snippet": segment.transcript_snippet,
            "sentiment": segment.sentiment,
            "keywords": segment.keywords,
        }
        for segment in all_segments
    ]
    if not payload:
        return
    service_supabase.table("scores").insert(payload).execute()


def podcast_belongs_to_user(podcast_id: str, user_id: str) -> bool:
    return get_podcast_for_user(podcast_id, user_id) is not None


def transcribe_podcast_media_for_user(podcast_id: str, user_id: str, *, model: str = "base") -> TranscriptionResult:
    podcast = get_podcast_for_user(podcast_id, user_id)
    if podcast is None:
        raise AnalysisError("Podcast not found for the current user.", status_code=404)
    if not podcast.storage_path:
        raise AnalysisError(
            "This podcast does not have a staged media file available for transcription.",
            status_code=422,
        )
    try:
        return transcribe_media(Path(podcast.storage_path), model=model)
    except TranscriptionError as exc:
        raise AnalysisError(exc.detail, status_code=exc.status_code) from exc


def get_analysis_summary_for_podcast(podcast_id: str) -> AnalysisSummary | None:
    response = (
        service_supabase.table("scores")
        .select("podcast_id,segment_start_sec,segment_end_sec,virality_score,transcript_snippet,sentiment,keywords")
        .eq("podcast_id", podcast_id)
        .order("virality_score", desc=True)
        .execute()
    )
    rows = response.data or []
    if not rows:
        return None

    segments = [
        ScoreSegment(
            segment_start_seconds=float(item["segment_start_sec"]),
            segment_end_seconds=float(item["segment_end_sec"]),
            duration_seconds=round(float(item["segment_end_sec"]) - float(item["segment_start_sec"]), 3),
            virality_score=float(item["virality_score"]),
            transcript_snippet=str(item["transcript_snippet"]),
            sentiment=str(item["sentiment"]),
            keywords=list(item.get("keywords") or []),
        )
        for item in rows
    ]
    highest_score = max((segment.virality_score for segment in segments), default=0.0)
    return AnalysisSummary(
        podcast_id=podcast_id,
        total_scored_segments=len(segments),
        highest_score=round(highest_score, 2),
        top_segments=segments[:5],
    )


def get_scored_segments_for_podcast(podcast_id: str, *, limit: int | None = None) -> list[ScoreSegment]:
    query = (
        service_supabase.table("scores")
        .select("podcast_id,segment_start_sec,segment_end_sec,virality_score,transcript_snippet,sentiment,keywords")
        .eq("podcast_id", podcast_id)
        .order("virality_score", desc=True)
    )
    if limit is not None:
        query = query.limit(limit)
    response = query.execute()
    rows = response.data or []
    return [
        ScoreSegment(
            segment_start_seconds=float(item["segment_start_sec"]),
            segment_end_seconds=float(item["segment_end_sec"]),
            duration_seconds=round(float(item["segment_end_sec"]) - float(item["segment_start_sec"]), 3),
            virality_score=float(item["virality_score"]),
            transcript_snippet=str(item["transcript_snippet"]),
            sentiment=str(item["sentiment"]),
            keywords=list(item.get("keywords") or []),
        )
        for item in rows
    ]


def score_segments_need_refresh(score_segments: list[ScoreSegment]) -> bool:
    if not score_segments:
        return True
    return any(
        segment.duration_seconds <= 0 or segment.duration_seconds > MAX_SEGMENT_DURATION
        for segment in score_segments
    )


def _build_segment_candidates(transcription: TranscriptionResult) -> list[_SegmentCandidate]:
    candidates: list[_SegmentCandidate] = []
    current_words: list[TranscriptWord] = []

    for word in sorted(transcription.words, key=lambda item: (item.start, item.end)):
        if current_words:
            previous = current_words[-1]
            gap = round(word.start - previous.end, 3)
            segment_duration = word.end - current_words[0].start
            should_split = (
                gap >= PAUSE_BREAK_SECONDS
                or segment_duration >= MAX_SEGMENT_DURATION
                or _is_sentence_break(previous.word)
            )
            if should_split:
                candidate = _finalize_candidate(current_words)
                if candidate:
                    candidates.append(candidate)
                current_words = []
        current_words.append(word)

    candidate = _finalize_candidate(current_words)
    if candidate:
        candidates.append(candidate)

    return _merge_short_neighbors(candidates)


def _finalize_candidate(words: list[TranscriptWord]) -> _SegmentCandidate | None:
    if not words:
        return None
    start = words[0].start
    end = words[-1].end
    if end - start < MIN_SEGMENT_DURATION:
        return _SegmentCandidate(words=words, snippet=_join_words(words))
    return _SegmentCandidate(words=words, snippet=_join_words(words))


def _merge_short_neighbors(candidates: list[_SegmentCandidate]) -> list[_SegmentCandidate]:
    merged: list[_SegmentCandidate] = []
    for candidate in candidates:
        if not merged:
            merged.append(candidate)
            continue
        previous = merged[-1]
        combined_duration = round(candidate.end - previous.start, 3)
        if (
            (previous.duration < MIN_SEGMENT_DURATION or candidate.duration < MIN_SEGMENT_DURATION)
            and combined_duration <= MAX_SEGMENT_DURATION
        ):
            combined_words = previous.words + candidate.words
            merged[-1] = _SegmentCandidate(words=combined_words, snippet=_join_words(combined_words))
            continue
        merged.append(candidate)
    return merged


def _join_words(words: list[TranscriptWord]) -> str:
    pieces: list[str] = []
    for item in words:
        token = item.word.strip()
        if not token:
            continue
        if pieces and token not in {".", ",", "!", "?", ":", ";"} and not token.startswith("'"):
            pieces.append(" ")
        pieces.append(token)
    return "".join(pieces).strip()


def _is_sentence_break(token: str) -> bool:
    return token.strip().endswith((".", "!", "?"))


def _score_segment(segment: _SegmentCandidate) -> ScoreSegment:
    snippet = segment.snippet
    terms = _extract_terms(snippet)
    sentiment = _resolve_sentiment(terms)
    keywords = _extract_keywords(snippet, terms)
    score = _calculate_virality_score(snippet, terms, sentiment, segment.duration)
    return ScoreSegment(
        segment_start_seconds=round(segment.start, 3),
        segment_end_seconds=round(segment.end, 3),
        duration_seconds=round(segment.duration, 3),
        virality_score=score,
        transcript_snippet=snippet,
        sentiment=sentiment,
        keywords=keywords,
    )


def _extract_terms(text: str) -> list[str]:
    doc_terms = _extract_terms_with_spacy(text)
    if doc_terms:
        return doc_terms
    return re.findall(r"[a-zA-Z][a-zA-Z0-9'-]*", text.lower())


@lru_cache(maxsize=1)
def _get_spacy_nlp():
    if spacy is None:
        return None
    try:
        return spacy.load("en_core_web_sm")
    except Exception:
        try:
            nlp = spacy.blank("en")
            if "sentencizer" not in nlp.pipe_names:
                nlp.add_pipe("sentencizer")
            return nlp
        except Exception:
            return None


def _extract_terms_with_spacy(text: str) -> list[str]:
    nlp = _get_spacy_nlp()
    if nlp is None:
        return []
    doc = nlp(text)
    normalized_terms: list[str] = []
    for token in doc:
        if not token.is_alpha or token.is_stop:
            continue
        lemma = getattr(token, "lemma_", "") or token.text
        normalized_terms.append(lemma.lower())
    return normalized_terms


def _resolve_sentiment(terms: list[str]) -> str:
    positive_hits = sum(1 for term in terms if term in POSITIVE_TERMS)
    negative_hits = sum(1 for term in terms if term in NEGATIVE_TERMS)
    if positive_hits > negative_hits:
        return "positive"
    if negative_hits > positive_hits:
        return "negative"
    return "neutral"


def _extract_keywords(text: str, terms: list[str]) -> list[str]:
    spacy_keywords = _extract_keywords_with_spacy(text)
    if spacy_keywords:
        return spacy_keywords[:5]
    frequency = Counter(term for term in terms if term not in STOPWORDS and len(term) > 2)
    if not frequency:
        return []
    ranked = [term for term, _ in frequency.most_common(6)]
    return ranked[:5]


def _extract_keywords_with_spacy(text: str) -> list[str]:
    nlp = _get_spacy_nlp()
    if nlp is None:
        return []

    doc = nlp(text)
    candidates: list[str] = []

    for ent in getattr(doc, "ents", ()):
        value = ent.text.strip().lower()
        if value and len(value) > 2:
            candidates.append(value)

    try:
        for chunk in doc.noun_chunks:
            value = chunk.text.strip().lower()
            if value and len(value) > 2:
                candidates.append(value)
    except Exception:
        pass

    if not candidates:
        return []

    ranked = [item for item, _ in Counter(candidates).most_common(6)]
    return ranked[:5]


def _calculate_virality_score(
    snippet: str,
    terms: list[str],
    sentiment: str,
    duration: float,
) -> float:
    score = 32.0
    score += min(18.0, sum(1 for term in terms if term in VIRAL_TERMS) * 4.5)
    score += min(12.0, sum(1 for term in terms if term in DIRECT_ADDRESS_TERMS) * 2.5)
    score += min(10.0, sum(1 for term in terms if term in QUESTION_TERMS) * 3.0)
    score += 8.0 if any(char.isdigit() for char in snippet) else 0.0
    score += 10.0 if "?" in snippet else 0.0
    score += 6.0 if "!" in snippet else 0.0
    score += 8.0 if sentiment != "neutral" else 0.0
    if 12.0 <= duration <= 35.0:
        score += 8.0
    elif duration < 8.0 or duration > 55.0:
        score -= 6.0
    unique_ratio = (len(set(terms)) / len(terms)) if terms else 0.0
    score += round(unique_ratio * 12.0, 2)
    return round(max(0.0, min(100.0, score)), 2)


def detect_reference_mentions(
    text: str,
    *,
    segment_start_seconds: float = 0.0,
    segment_end_seconds: float | None = None,
    keywords: list[str] | tuple[str, ...] | None = None,
) -> list[ReferenceMention]:
    cleaned_text = " ".join(text.split()).strip()
    if not cleaned_text:
        return []

    normalized_keywords = tuple(
        cleaned
        for item in (keywords or [])
        if (cleaned := str(item).strip().lower())
    )
    candidates: dict[str, _ReferenceCandidate] = {}
    lowered_text = cleaned_text.lower()

    def register_candidate(
        label: str,
        mention_type: ReferenceMentionType,
        confidence: float,
        *,
        topic_hints: tuple[str, ...] = (),
    ) -> None:
        normalized_label = _normalize_reference_label(label)
        if not normalized_label or normalized_label in IGNORED_REFERENCE_LABELS:
            return
        candidate = _ReferenceCandidate(
            label=" ".join(label.split()).strip(),
            normalized_label=normalized_label,
            mention_type=mention_type,
            confidence=confidence,
            topic_hints=topic_hints,
        )
        existing = candidates.get(normalized_label)
        if existing is None or (
            candidate.confidence,
            candidate.mention_type,
            candidate.label.lower(),
        ) > (
            existing.confidence,
            existing.mention_type,
            existing.label.lower(),
        ):
            candidates[normalized_label] = candidate

    for phrase, (mention_type, topic_hints) in REFERENCE_LEXICON.items():
        if phrase in lowered_text:
            register_candidate(
                phrase.title() if mention_type == "book" else phrase,
                mention_type,
                0.97 if mention_type in {"book", "source"} else 0.95,
                topic_hints=topic_hints,
            )

    cue_patterns = (
        re.compile(
            r"\b(?P<cue>book|books|article|paper|study|report|source|podcast|episode|concept|framework|principle|theory|law|effect|method)\s+"
            r"(?:called|named|titled|about|like)?\s*[\"“'](?P<label>[^\"”']{3,80})[\"”']",
            flags=re.IGNORECASE,
        ),
        re.compile(
            r"\b(?P<cue>book|books|article|paper|study|report|source|podcast|episode|concept|framework|principle|theory|law|effect|method)\s+"
            r"(?:called|named|titled|about|like)?\s*(?P<label>[A-Z][A-Za-z0-9&'/-]+(?:\s+[A-Z][A-Za-z0-9&'/-]+){0,5})",
            flags=re.IGNORECASE,
        ),
        re.compile(
            r"\b(?:according to|from|citing|referencing|in)\s+(?P<label>[A-Z][A-Za-z0-9&'/-]+(?:\s+[A-Z][A-Za-z0-9&'/-]+){1,5})",
            flags=re.IGNORECASE,
        ),
    )
    for pattern in cue_patterns:
        for match in pattern.finditer(cleaned_text):
            label = match.group("label")
            cue = (match.groupdict().get("cue") or "").lower()
            mention_type = _resolve_reference_type(cue, label)
            confidence = 0.94 if cue else 0.86
            register_candidate(label, mention_type, confidence)

    for quoted_match in re.finditer(r"[\"“'](?P<label>[A-Za-z0-9][^\"”']{2,80})[\"”']", cleaned_text):
        label = quoted_match.group("label")
        mention_type = _resolve_reference_type("", label)
        register_candidate(label, mention_type, 0.84)

    segment_end = _resolve_reference_segment_end(
        cleaned_text,
        segment_start_seconds=segment_start_seconds,
        segment_end_seconds=segment_end_seconds,
    )
    mentions: list[ReferenceMention] = []
    for candidate in sorted(
        candidates.values(),
        key=lambda item: (-item.confidence, item.normalized_label, item.label.lower()),
    ):
        mention_start, mention_end = _estimate_reference_window(
            cleaned_text,
            segment_start_seconds=segment_start_seconds,
            segment_end_seconds=segment_end,
            phrase=candidate.label,
        )
        topic_labels = _extract_topic_labels(
            cleaned_text,
            normalized_keywords,
            reference_labels=(candidate.normalized_label,),
            topic_hints=candidate.topic_hints,
        )
        mentions.append(
            ReferenceMention(
                label=candidate.label,
                normalized_label=candidate.normalized_label,
                mention_type=candidate.mention_type,
                confidence=round(candidate.confidence, 3),
                evidence_text=cleaned_text,
                topic_labels=topic_labels,
                start_seconds=mention_start,
                end_seconds=mention_end,
            )
        )

    return mentions


def extract_topic_labels(
    text: str,
    *,
    keywords: list[str] | tuple[str, ...] | None = None,
    reference_mentions: list[ReferenceMention] | None = None,
) -> list[str]:
    reference_labels = tuple(
        mention.normalized_label
        for mention in (reference_mentions or [])
        if mention.normalized_label
    )
    topic_hints = tuple(
        topic
        for mention in (reference_mentions or [])
        for topic in mention.topic_labels
    )
    return _extract_topic_labels(
        text,
        tuple(str(item).strip().lower() for item in (keywords or []) if str(item).strip()),
        reference_labels=reference_labels,
        topic_hints=topic_hints,
    )


def _extract_topic_labels(
    text: str,
    keywords: tuple[str, ...],
    *,
    reference_labels: tuple[str, ...] = (),
    topic_hints: tuple[str, ...] = (),
) -> list[str]:
    cleaned_text = " ".join(text.split()).strip().lower()
    searchable_text = " ".join(
        part
        for part in (
            cleaned_text,
            " ".join(keywords),
            " ".join(reference_labels),
            " ".join(topic_hints),
        )
        if part
    )
    topics: list[str] = []
    seen: set[str] = set()

    for hint in topic_hints:
        cleaned_hint = hint.strip().lower()
        if cleaned_hint and cleaned_hint not in seen:
            topics.append(cleaned_hint)
            seen.add(cleaned_hint)

    for label, cues in TOPIC_KEYWORD_MAP.items():
        if label in seen:
            continue
        if any(_text_contains_phrase(searchable_text, cue) for cue in cues):
            topics.append(label)
            seen.add(label)
        if len(topics) >= 6:
            break

    return topics[:6]


def _resolve_reference_type(cue: str, label: str) -> ReferenceMentionType:
    normalized_label = _normalize_reference_label(label)
    if normalized_label in REFERENCE_LEXICON:
        return REFERENCE_LEXICON[normalized_label][0]
    if cue in REFERENCE_BOOK_CUES:
        return "book"
    if cue in REFERENCE_SOURCE_CUES:
        return "source"
    if cue in REFERENCE_CONCEPT_CUES:
        return "concept"
    if _looks_like_concept(label):
        return "concept"
    return "named_reference"


def _normalize_reference_label(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()
    cleaned = " ".join(cleaned.split())
    return cleaned


def _looks_like_concept(label: str) -> bool:
    lowered = label.lower()
    return any(
        phrase in lowered
        for phrase in (
            "effect",
            "first principles",
            "framework",
            "jobs to be done",
            "law",
            "network effects",
            "product market fit",
            "principle",
            "theory",
        )
    )


def _resolve_reference_segment_end(
    text: str,
    *,
    segment_start_seconds: float,
    segment_end_seconds: float | None,
) -> float:
    if segment_end_seconds is not None:
        return max(segment_start_seconds + 0.6, segment_end_seconds)
    estimated_duration = max(0.6, len(tokenize_text(text)) * 0.42)
    return round(segment_start_seconds + estimated_duration, 3)


def _estimate_reference_window(
    text: str,
    *,
    segment_start_seconds: float,
    segment_end_seconds: float,
    phrase: str,
) -> tuple[float, float]:
    snippet_tokens = tokenize_text(text)
    phrase_tokens = tokenize_text(phrase)
    if not snippet_tokens:
        return round(segment_start_seconds, 3), round(min(segment_end_seconds, segment_start_seconds + 1.0), 3)

    match_index = 0
    if phrase_tokens:
        match_index = _find_token_sequence(snippet_tokens, phrase_tokens)
        if match_index < 0:
            focus_token = phrase_tokens[0]
            match_index = next(
                (index for index, token in enumerate(snippet_tokens) if focus_token in token),
                0,
            )

    segment_duration = max(0.6, segment_end_seconds - segment_start_seconds)
    focus_ratio = match_index / max(len(snippet_tokens) - 1, 1)
    mention_start = segment_start_seconds + (segment_duration * focus_ratio)
    mention_duration = min(2.8, max(0.9, len(phrase_tokens) * 0.42))
    mention_end = min(segment_end_seconds, mention_start + mention_duration)
    if mention_end - mention_start < 0.6:
        mention_end = min(segment_end_seconds, mention_start + 0.6)
    return round(mention_start, 3), round(mention_end, 3)


def _find_token_sequence(tokens: list[str], phrase_tokens: list[str]) -> int:
    if not tokens or not phrase_tokens or len(phrase_tokens) > len(tokens):
        return -1
    for index in range(len(tokens) - len(phrase_tokens) + 1):
        if tokens[index:index + len(phrase_tokens)] == phrase_tokens:
            return index
    return -1


def _text_contains_phrase(text: str, phrase: str) -> bool:
    normalized_phrase = " ".join(phrase.lower().split()).strip()
    if not normalized_phrase:
        return False
    if " " in normalized_phrase:
        return normalized_phrase in text
    return bool(re.search(rf"\b{re.escape(normalized_phrase)}\b", text))


def tokenize_text(value: str) -> list[str]:
    return re.findall(r"[a-z0-9]+(?:'[a-z0-9]+)?", value.lower())
