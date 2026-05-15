from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.models.analysis import ScoreSegment  # noqa: E402
from app.models.clipping import ClipResult  # noqa: E402
from app.models.export_settings import ExportSettingsInput  # noqa: E402
from app.services.overlay_mapping_service import (  # noqa: E402
    build_overlay_mappings,
    get_overlay_decisions_for_podcast,
    persist_overlay_mappings,
    validate_overlay_assets,
)


class FakeOverlayTable:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self.rows = rows
        self.insert_payload: list[dict[str, object]] | None = None
        self.eq_filters: list[tuple[str, object]] = []

    def delete(self) -> "FakeOverlayTable":
        return self

    def select(self, _: str) -> "FakeOverlayTable":
        return self

    def eq(self, key: str, value: object) -> "FakeOverlayTable":
        self.eq_filters.append((key, value))
        return self

    def insert(self, payload: list[dict[str, object]]) -> "FakeOverlayTable":
        self.insert_payload = payload
        self.rows = list(payload)
        return self

    def execute(self) -> SimpleNamespace:
        filtered = list(self.rows)
        for key, value in self.eq_filters:
            filtered = [row for row in filtered if row.get(key) == value]
        self.eq_filters = []
        return SimpleNamespace(data=filtered)


class FakeSupabase:
    def __init__(self, overlay_rows: list[dict[str, object]] | None = None) -> None:
        self.overlay_table = FakeOverlayTable(overlay_rows or [])

    def table(self, name: str) -> FakeOverlayTable:
        if name != "clip_overlays":
            raise AssertionError(f"Unexpected table requested: {name}")
        return self.overlay_table


class OverlayMappingServiceTests(unittest.TestCase):
    def _build_clip(self, clip_id: str = "clip-1") -> ClipResult:
        return ClipResult(
            id=clip_id,
            clip_number=1,
            clip_start_seconds=0.0,
            clip_end_seconds=15.0,
            duration_seconds=15.0,
            virality_score=82.5,
            video_url="https://example.com/clip.mp4",
            subtitle_text="AI can completely change startup growth.",
            status="ready",
            export_settings=ExportSettingsInput(export_mode="portrait").resolve(),
        )

    def test_build_overlay_mappings_detects_known_keyword(self) -> None:
        clip = self._build_clip()
        segment = ScoreSegment(
            segment_start_seconds=0.0,
            segment_end_seconds=15.0,
            duration_seconds=15.0,
            virality_score=82.5,
            transcript_snippet="AI can completely change startup growth.",
            sentiment="positive",
            keywords=["ai", "startup"],
        )

        result = build_overlay_mappings("podcast-1", [(clip, segment)])

        self.assertEqual(result.total_segments_checked, 1)
        self.assertTrue(result.overlay_decisions[0].applied)
        self.assertEqual(result.overlay_decisions[0].keyword, "ai")
        self.assertEqual(result.overlay_decisions[0].overlay_category, "technology")
        self.assertEqual(result.overlay_decisions[0].asset_path, "technology/ai_chip.png")
        self.assertEqual(result.overlay_decisions[0].render_status, "mapped")
        self.assertEqual(result.overlay_decisions[0].position, "top_right")

    def test_build_overlay_mappings_falls_back_safely_when_no_keyword_matches(self) -> None:
        clip = self._build_clip()
        segment = ScoreSegment(
            segment_start_seconds=0.0,
            segment_end_seconds=15.0,
            duration_seconds=15.0,
            virality_score=55.0,
            transcript_snippet="We had a long conversation about consistency and discipline.",
            sentiment="neutral",
            keywords=["conversation", "consistency"],
        )

        result = build_overlay_mappings("podcast-1", [(clip, segment)])

        self.assertFalse(result.overlay_decisions[0].applied)
        self.assertIsNone(result.overlay_decisions[0].keyword)
        self.assertEqual(result.overlay_decisions[0].confidence, 0.0)

    def test_build_overlay_mappings_detects_reference_mentions_and_times_overlay(self) -> None:
        clip = self._build_clip()
        segment = ScoreSegment(
            segment_start_seconds=0.0,
            segment_end_seconds=15.0,
            duration_seconds=15.0,
            virality_score=84.0,
            transcript_snippet="In Atomic Habits, James Clear explains why small habits compound into audience growth.",
            sentiment="positive",
            keywords=["audience", "growth", "habits"],
        )

        result = build_overlay_mappings("podcast-1", [(clip, segment)])
        decision = result.overlay_decisions[0]

        self.assertTrue(decision.applied)
        self.assertEqual(decision.reference_label, "Atomic Habits")
        self.assertEqual(decision.reference_type, "book")
        self.assertEqual(decision.overlay_asset, "marketing_graph")
        self.assertIn("growth", decision.topic_labels)
        self.assertLess(decision.render_start_seconds or 0.0, 4.0)
        self.assertGreater((decision.render_end_seconds or 0.0), (decision.render_start_seconds or 0.0))

    def test_overlay_selection_is_deterministic_for_category_keywords(self) -> None:
        clip = self._build_clip()
        segment = ScoreSegment(
            segment_start_seconds=0.0,
            segment_end_seconds=15.0,
            duration_seconds=15.0,
            virality_score=88.0,
            transcript_snippet="Bitcoin revenue and crypto growth all spike together.",
            sentiment="positive",
            keywords=["revenue", "crypto", "bitcoin"],
        )

        first = build_overlay_mappings("podcast-1", [(clip, segment)]).overlay_decisions[0]
        second = build_overlay_mappings("podcast-1", [(clip, segment)]).overlay_decisions[0]

        self.assertEqual(first.overlay_category, "finance")
        self.assertEqual(first.overlay_asset, "bitcoin_icon")
        self.assertEqual(first.keyword, "bitcoin")
        self.assertEqual(first.asset_path, second.asset_path)
        self.assertEqual(first.position, second.position)

    def test_persist_overlay_mappings_writes_overlay_rows(self) -> None:
        clip = self._build_clip()
        segment = ScoreSegment(
            segment_start_seconds=0.0,
            segment_end_seconds=15.0,
            duration_seconds=15.0,
            virality_score=82.5,
            transcript_snippet="Bitcoin and money are discussed heavily.",
            sentiment="positive",
            keywords=["bitcoin", "money"],
        )
        result = build_overlay_mappings("podcast-1", [(clip, segment)])
        fake_supabase = FakeSupabase()

        with patch("app.services.overlay_mapping_service.service_supabase", fake_supabase):
            persist_overlay_mappings(result)

        self.assertIsNotNone(fake_supabase.overlay_table.insert_payload)
        self.assertEqual(fake_supabase.overlay_table.insert_payload[0]["clip_id"], "clip-1")
        self.assertEqual(fake_supabase.overlay_table.insert_payload[0]["overlay_category"], "finance")

    def test_get_overlay_decisions_for_podcast_returns_clip_mapping(self) -> None:
        fake_supabase = FakeSupabase(
            [
                {
                    "clip_id": "clip-1",
                    "podcast_id": "podcast-1",
                    "keyword": "marketing",
                    "overlay_category": "business",
                    "overlay_asset": "marketing_graph",
                    "matched_text": "Marketing drives growth.",
                    "applied": True,
                    "confidence": 0.9,
                }
            ]
        )

        with patch("app.services.overlay_mapping_service.service_supabase", fake_supabase):
            decisions = get_overlay_decisions_for_podcast("podcast-1")

        self.assertIn("clip-1", decisions)
        self.assertEqual(decisions["clip-1"].overlay_asset, "marketing_graph")

    def test_validate_overlay_assets_confirms_required_inventory(self) -> None:
        inventory = validate_overlay_assets()

        self.assertIn("technology/ai_chip.png", inventory)
        self.assertIn("finance/bitcoin_icon.png", inventory)
        self.assertIn("business/startup_rocket.png", inventory)


if __name__ == "__main__":
    unittest.main()
