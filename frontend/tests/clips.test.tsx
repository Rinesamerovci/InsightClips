import assert from "node:assert/strict";

import {
  buildDiscoveryItem,
  filterDiscoveryItems,
  rankRecommendedItems,
} from "../lib/clip-insights";

const podcast = {
  id: "pod-1",
  title: "Growth Lab",
};

const discoveryItems = [
  buildDiscoveryItem(
    {
      id: "clip-1",
      clip_number: 1,
      clip_start_seconds: 0,
      clip_end_seconds: 30,
      duration_seconds: 30,
      virality_score: 82,
      subtitle_text: "How creators turn attention into revenue",
      status: "ready",
      published: false,
      overlay: {
        clip_id: "clip-1",
        podcast_id: "pod-1",
        keyword: "revenue",
        overlay_category: "business",
        overlay_asset: "growth_chart",
        matched_text: "turn attention into revenue",
        applied: true,
        confidence: 0.91,
      },
    },
    podcast,
  ),
  buildDiscoveryItem(
    {
      id: "clip-2",
      clip_number: 2,
      clip_start_seconds: 35,
      clip_end_seconds: 60,
      duration_seconds: 25,
      virality_score: 91,
      subtitle_text: "A published clip with strong retention",
      status: "ready",
      published: true,
    },
    podcast,
  ),
  buildDiscoveryItem(
    {
      id: "clip-3",
      clip_number: 3,
      clip_start_seconds: 65,
      clip_end_seconds: 90,
      duration_seconds: 25,
      virality_score: 67,
      subtitle_text: "Processing another experiment for the feed",
      status: "processing",
      published: false,
    },
    podcast,
  ),
];

export function runClipsTests(): void {
  const result = filterDiscoveryItems(discoveryItems, {
    query: "retention",
    status: "published",
    podcastId: podcast.id,
  });

  assert.equal(result.length, 1);
  assert.equal(result[0]?.id, "clip-2");
  assert.equal(result[0]?.subtitle_text.includes("retention"), true);

  const ranked = rankRecommendedItems(discoveryItems, 3);

  assert.deepEqual(
    ranked.map((item) => item.id),
    ["clip-1", "clip-3", "clip-2"],
  );
  assert.equal(ranked[0]?.recommendation_reason, "Highest upside right now");
  assert.equal(discoveryItems[0]?.overlay?.applied, true);
  assert.equal(discoveryItems[0]?.overlay?.overlay_category, "business");
}
