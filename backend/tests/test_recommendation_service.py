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
from app.services.recommendation_service import recommend_clips  # noqa: E402


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


class RecommendationServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.podcasts = [{"id": "pod-1", "title": "Growth Lab"}]
        self.clips = [
            {
                "id": "clip-1",
                "podcast_id": "pod-1",
                "clip_number": 1,
                "clip_start_sec": 0.0,
                "clip_end_sec": 24.0,
                "virality_score": 95.0,
                "storage_url": "https://example.com/clip-1.mp4",
                "subtitle_text": "Retention hooks that bring viewers back again",
                "status": "ready",
                "published": False,
                "download_url": None,
                "published_at": None,
            },
            {
                "id": "clip-2",
                "podcast_id": "pod-1",
                "clip_number": 2,
                "clip_start_sec": 26.0,
                "clip_end_sec": 50.0,
                "virality_score": 93.0,
                "storage_url": "https://example.com/clip-2.mp4",
                "subtitle_text": "Another retention hook with nearly the same angle",
                "status": "ready",
                "published": False,
                "download_url": None,
                "published_at": None,
            },
            {
                "id": "clip-3",
                "podcast_id": "pod-1",
                "clip_number": 3,
                "clip_start_sec": 52.0,
                "clip_end_sec": 82.0,
                "virality_score": 90.0,
                "storage_url": "https://example.com/clip-3.mp4",
                "subtitle_text": "Pricing lessons that improved conversions fast",
                "status": "ready",
                "published": False,
                "download_url": None,
                "published_at": None,
            },
            {
                "id": "clip-4",
                "podcast_id": "pod-1",
                "clip_number": 4,
                "clip_start_sec": 84.0,
                "clip_end_sec": 110.0,
                "virality_score": 88.0,
                "storage_url": "https://example.com/clip-4.mp4",
                "subtitle_text": "Guest stories that deepen community trust",
                "status": "ready",
                "published": False,
                "download_url": None,
                "published_at": None,
            },
            {
                "id": "clip-5",
                "podcast_id": "pod-1",
                "clip_number": 5,
                "clip_start_sec": 112.0,
                "clip_end_sec": 140.0,
                "virality_score": 92.0,
                "storage_url": "https://example.com/clip-5.mp4",
                "subtitle_text": "A published clip that already has momentum",
                "status": "ready",
                "published": True,
                "download_url": "/podcasts/clips/clip-5/download",
                "published_at": "2026-04-22T08:00:00+00:00",
            },
        ]
        self.scores = [
            {
                "podcast_id": "pod-1",
                "segment_start_sec": 0.0,
                "segment_end_sec": 24.0,
                "virality_score": 95.0,
                "transcript_snippet": "Retention hooks and viewer loops keep audiences returning",
                "keywords": ["retention", "hooks", "viewer loops"],
            },
            {
                "podcast_id": "pod-1",
                "segment_start_sec": 26.0,
                "segment_end_sec": 50.0,
                "virality_score": 93.0,
                "transcript_snippet": "Another take on retention hooks and viewer loops",
                "keywords": ["retention", "hooks", "viewer loops"],
            },
            {
                "podcast_id": "pod-1",
                "segment_start_sec": 52.0,
                "segment_end_sec": 82.0,
                "virality_score": 90.0,
                "transcript_snippet": "Pricing experiments helped the team improve conversions",
                "keywords": ["pricing", "conversions", "offers"],
            },
            {
                "podcast_id": "pod-1",
                "segment_start_sec": 84.0,
                "segment_end_sec": 110.0,
                "virality_score": 88.0,
                "transcript_snippet": "Guest stories and community trust create a different angle",
                "keywords": ["guest stories", "community", "trust"],
            },
            {
                "podcast_id": "pod-1",
                "segment_start_sec": 112.0,
                "segment_end_sec": 140.0,
                "virality_score": 92.0,
                "transcript_snippet": "This published clip already has social momentum",
                "keywords": ["published", "social", "momentum"],
            },
        ]

    def test_recommend_clips_returns_diverse_non_duplicate_results(self) -> None:
        fake_supabase = FakeSupabase(self.podcasts, self.clips, self.scores)

        with patch.object(search_service_module, "service_supabase", fake_supabase):
            result = recommend_clips("pod-1", limit=3)

        self.assertEqual([item.id for item in result.recommendations], ["clip-1", "clip-3", "clip-4"])
        self.assertEqual(len({item.id for item in result.recommendations}), 3)
        self.assertEqual(result.recommendations[0].recommendation_reason, "Highest upside right now")

    def test_recommend_clips_honors_requested_limit(self) -> None:
        fake_supabase = FakeSupabase(self.podcasts, self.clips, self.scores)

        with patch.object(search_service_module, "service_supabase", fake_supabase):
            result = recommend_clips("pod-1", limit=2)

        self.assertEqual(len(result.recommendations), 2)
        self.assertTrue(all(item.recommendation_score > 0 for item in result.recommendations))


if __name__ == "__main__":
    unittest.main()
