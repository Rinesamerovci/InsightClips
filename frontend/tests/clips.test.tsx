import assert from "node:assert/strict";

import {
  buildDiscoveryItem,
  filterDiscoveryItems,
  rankRecommendedItems,
} from "../lib/clip-insights";
import { normalizeExportSettings } from "../lib/subtitle-style";

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
      export_settings: {
        export_mode: "portrait",
        crop_mode: "smart_crop",
        mobile_optimized: true,
        face_tracking_enabled: true,
        subtitle_style: {
          preset: "bold",
          font_family: "Arial",
          font_size: 24,
          primary_color: "#FFFFFF",
          outline_color: "#000000",
          background_color: "#000000",
          background_opacity: 0.25,
          position: "center",
          bold: true,
          italic: false,
        },
        audio_enhancement: {
          enabled: true,
          normalize_loudness: true,
          target_lufs: -16,
          true_peak_db: -1.5,
          status: "enabled",
        },
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

  const unpublished = filterDiscoveryItems(discoveryItems, {
    status: "unpublished",
    podcastId: podcast.id,
  });

  assert.deepEqual(
    unpublished.map((item) => item.id),
    ["clip-1", "clip-3"],
  );

  const ranked = rankRecommendedItems(discoveryItems, 3);

  assert.deepEqual(
    ranked.map((item) => item.id),
    ["clip-1", "clip-3", "clip-2"],
  );
  assert.equal(ranked[0]?.recommendation_reason, "Highest upside right now");
  assert.equal(discoveryItems[0]?.overlay?.applied, true);
  assert.equal(discoveryItems[0]?.overlay?.overlay_category, "business");
  assert.equal(ranked[0]?.export_settings?.export_mode, "portrait");

  const normalized = normalizeExportSettings(discoveryItems[0]?.export_settings ?? null);

  assert.equal(normalized.crop_mode, "smart_crop");
  assert.equal(normalized.face_tracking_enabled, true);
}
