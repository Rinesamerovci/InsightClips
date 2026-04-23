from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import app.services.search_service as search_service_module  # noqa: E402
from app.services.search_service import search_clips  # noqa: E402


class FakeSelectQuery:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self._rows = rows
        self._eq_filters: list[tuple[str, object]] = []
        self._limit: int | None = None
        self._order_key: str | None = None
        self._order_desc = False

    def eq(self, key: str, value: object) -> "FakeSelectQuery":
        self._eq_filters.append((key, value))
        return self

    def limit(self, value: int) -> "FakeSelectQuery":
        self._limit = value
        return self

    def order(self, key: str, desc: bool = False) -> "FakeSelectQuery":
        self._order_key = key
        self._order_desc = desc
        return self

    def execute(self) -> SimpleNamespace:
        rows = list(self._rows)
        for key, value in self._eq_filters:
            rows = [row for row in rows if row.get(key) == value]
        if self._order_key is not None:
            rows.sort(key=lambda row: row.get(self._order_key), reverse=self._order_desc)
        if self._limit is not None:
            rows = rows[: self._limit]
        return SimpleNamespace(data=rows)


class FakeTable:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self.rows = rows

    def select(self, _: str) -> FakeSelectQuery:
        return FakeSelectQuery(self.rows)


class FakeSupabase:
    def __init__(
        self,
        podcasts: list[dict[str, object]],
        clips: list[dict[str, object]],
        scores: list[dict[str, object]],
    ) -> None:
        self._tables = {
            "podcasts": FakeTable(podcasts),
            "clips": FakeTable(clips),
            "scores": FakeTable(scores),
        }

    def table(self, name: str) -> FakeTable:
        if name not in self._tables:
            raise AssertionError(f"Unexpected table requested: {name}")
        return self._tables[name]


class SearchServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.podcasts = [
            {"id": "pod-1", "title": "Growth Lab"},
        ]
        self.clips = [
            {
                "id": "clip-1",
                "podcast_id": "pod-1",
                "clip_number": 1,
                "clip_start_sec": 0.0,
                "clip_end_sec": 22.0,
                "virality_score": 91.0,
                "storage_url": "https://example.com/clip-1.mp4",
                "subtitle_text": "Retention playbook for creators who want repeat viewers",
                "status": "ready",
                "published": False,
                "download_url": None,
                "published_at": None,
            },
            {
                "id": "clip-2",
                "podcast_id": "pod-1",
                "clip_number": 2,
                "clip_start_sec": 24.0,
                "clip_end_sec": 54.0,
                "virality_score": 84.0,
                "storage_url": "https://example.com/clip-2.mp4",
                "subtitle_text": "How pricing experiments changed the funnel",
                "status": "ready",
                "published": True,
                "download_url": "/podcasts/clips/clip-2/download",
                "published_at": "2026-04-22T08:00:00+00:00",
            },
            {
                "id": "clip-3",
                "podcast_id": "pod-1",
                "clip_number": 3,
                "clip_start_sec": 58.0,
                "clip_end_sec": 75.0,
                "virality_score": 68.0,
                "storage_url": "https://example.com/clip-3.mp4",
                "subtitle_text": "A quick teaser before launch day",
                "status": "processing",
                "published": False,
                "download_url": None,
                "published_at": None,
            },
        ]
        self.scores = [
            {
                "podcast_id": "pod-1",
                "segment_start_sec": 0.0,
                "segment_end_sec": 22.0,
                "virality_score": 91.0,
                "transcript_snippet": "Creators keep more viewers when the hook promises a repeatable system",
                "keywords": ["retention", "repeat viewers", "creator playbook"],
            },
            {
                "podcast_id": "pod-1",
                "segment_start_sec": 24.0,
                "segment_end_sec": 54.0,
                "virality_score": 84.0,
                "transcript_snippet": "The team rebuilt the pricing offer and conversions jumped",
                "keywords": ["repositioning", "pricing", "offer"],
            },
            {
                "podcast_id": "pod-1",
                "segment_start_sec": 58.0,
                "segment_end_sec": 75.0,
                "virality_score": 68.0,
                "transcript_snippet": "Launch day teaser for the newsletter audience",
                "keywords": ["launch", "newsletter", "audience"],
            },
        ]

    def test_search_clips_matches_title_transcript_and_keywords(self) -> None:
        fake_supabase = FakeSupabase(self.podcasts, self.clips, self.scores)

        with patch.object(search_service_module, "service_supabase", fake_supabase):
            title_result = search_clips("pod-1", "retention", {})
            transcript_result = search_clips("pod-1", "repeatable", {})
            keyword_result = search_clips("pod-1", "repositioning", {})

        self.assertEqual(title_result.clips[0].id, "clip-1")
        self.assertIn("title", title_result.clips[0].matched_fields)

        self.assertEqual(transcript_result.clips[0].id, "clip-1")
        self.assertIn("transcript", transcript_result.clips[0].matched_fields)

        self.assertEqual(keyword_result.clips[0].id, "clip-2")
        self.assertIn("keywords", keyword_result.clips[0].matched_fields)

    def test_search_clips_applies_publish_duration_score_and_status_filters(self) -> None:
        fake_supabase = FakeSupabase(self.podcasts, self.clips, self.scores)

        with patch.object(search_service_module, "service_supabase", fake_supabase):
            filtered = search_clips(
                "pod-1",
                "",
                {
                    "published": False,
                    "min_duration": 20,
                    "max_duration": 30,
                    "min_score": 80,
                },
            )
            processing = search_clips("pod-1", "", {"status": "processing"})

        self.assertEqual([item.id for item in filtered.clips], ["clip-1"])
        self.assertEqual([item.id for item in processing.clips], ["clip-3"])


if __name__ == "__main__":
    unittest.main()
