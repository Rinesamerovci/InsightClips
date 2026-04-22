import assert from "node:assert/strict";

import {
  buildEstimatedMetricRow,
  buildEstimatedPodcastMetrics,
} from "../lib/clip-insights";

const podcast = {
  id: "pod-9",
  title: "Insight Weekly",
};

const clips = [
  {
    id: "clip-a",
    clip_number: 1,
    clip_start_seconds: 0,
    clip_end_seconds: 22,
    duration_seconds: 22,
    virality_score: 88,
    subtitle_text: "The audience clicked because the hook landed instantly",
    status: "ready" as const,
    published: true,
    published_at: "2026-04-22T10:00:00Z",
  },
  {
    id: "clip-b",
    clip_number: 2,
    clip_start_seconds: 25,
    clip_end_seconds: 48,
    duration_seconds: 23,
    virality_score: 74,
    subtitle_text: "This clip is still private but has strong upside",
    status: "ready" as const,
    published: false,
  },
  {
    id: "clip-c",
    clip_number: 3,
    clip_start_seconds: 50,
    clip_end_seconds: 76,
    duration_seconds: 26,
    virality_score: 93,
    subtitle_text: "A breakout moment with a strong download profile",
    status: "ready" as const,
    published: true,
  },
];

export function runAnalyticsTests(): void {
  const metric = buildEstimatedMetricRow(clips[0]);

  assert.ok(metric.views > 0);
  assert.ok(metric.downloads > 0);
  assert.equal(metric.published, true);
  assert.equal(metric.estimated, true);

  const metrics = buildEstimatedPodcastMetrics(podcast, clips);

  assert.equal(metrics.total_clips, 3);
  assert.equal(metrics.published_clips, 2);
  assert.equal(metrics.unpublished_clips, 1);
  assert.ok(metrics.total_views > metrics.top_clips[0]!.views);
  assert.equal(metrics.top_clips[0]?.clip_id, "clip-c");
  assert.ok(metrics.average_click_trend > 0);
  assert.equal(metrics.estimated, true);
}
