import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import { buildEstimatedUserAnalytics, type PodcastClipMetrics } from "../lib/api";
import {
  AnalyticsMetricsDisplay,
  buildAnalyticsSnapshot,
  defaultAnalyticsTheme,
} from "../lib/analytics-presentation";
import {
  buildEstimatedMetricRow,
  buildEstimatedPodcastMetrics,
} from "../lib/clip-insights";

const podcast = {
  id: "pod-9",
  title: "Insight Weekly",
  user_id: "user-1",
  duration: 1600,
  status: "done",
  created_at: null,
  updated_at: null,
};

const clips = [
  {
    id: "clip-a",
    clip_number: 1,
    clip_start_seconds: 0,
    clip_end_seconds: 22,
    duration_seconds: 22,
    virality_score: 88,
    video_url: "https://example.com/clip-a.mp4",
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
    video_url: "https://example.com/clip-b.mp4",
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
    video_url: "https://example.com/clip-c.mp4",
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

  const overview = buildEstimatedUserAnalytics("user-1", [podcast], { "pod-9": clips });

  assert.equal(overview.user_id, "user-1");
  assert.equal(overview.total_podcasts, 1);
  assert.equal(overview.total_clips, 3);
  assert.equal(overview.published_clips, 2);
  assert.equal(overview.private_clips, 1);
  assert.ok(overview.publish_rate > 60);
  assert.equal(overview.top_clips[0]?.clip_id, "clip-c");
  assert.equal(overview.podcasts[0]?.podcast_id, "pod-9");
  assert.equal(overview.podcasts[0]?.latest_published_at, "2026-04-22T10:00:00Z");
  assert.equal(overview.podcasts[0]?.average_virality_score, 85);
  assert.equal(overview.estimated, true);

  const snapshot = buildAnalyticsSnapshot(metrics);

  assert.equal(snapshot.totalVisibility, metrics.total_downloads);
  assert.equal(snapshot.publishRate, 67);
  assert.equal(snapshot.averageDownloadsPerClip, Math.round(metrics.total_downloads / metrics.total_clips));
  assert.equal(snapshot.topClip?.clip_id, "clip-c");

  const metricsMarkup = renderToStaticMarkup(
    <AnalyticsMetricsDisplay
      isMobile={false}
      loadingMetrics={false}
      metrics={metrics as PodcastClipMetrics}
      theme={defaultAnalyticsTheme}
    />,
  );

  assert.match(metricsMarkup, /Downloads/);
  assert.match(metricsMarkup, /Leading Clip/);
  assert.match(metricsMarkup, /Clip 3/);
  assert.match(metricsMarkup, /A breakout moment with a strong download profile/);
  assert.match(metricsMarkup, /Top Clips Table/);
  assert.match(metricsMarkup, /Published/);

  const emptyMarkup = renderToStaticMarkup(
    <AnalyticsMetricsDisplay
      isMobile={false}
      loadingMetrics={false}
      metrics={null}
      theme={defaultAnalyticsTheme}
    />,
  );

  assert.match(emptyMarkup, /No metrics yet for this podcast/);
  assert.match(emptyMarkup, /No top clips available yet for this podcast/);

  const loadingMarkup = renderToStaticMarkup(
    <AnalyticsMetricsDisplay
      isMobile={false}
      loadingMetrics={true}
      metrics={null}
      theme={defaultAnalyticsTheme}
    />,
  );

  assert.match(loadingMarkup, /Loading clip metrics/);
  assert.match(loadingMarkup, /Building the ranking table/);
}
