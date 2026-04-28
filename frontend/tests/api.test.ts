import assert from "node:assert/strict";

import {
  buildAuthenticatedBackendUrl,
  getClipMetrics,
  getRecommendations,
  prepareUpload,
  publishClips,
  revokeClipDownload,
  searchClips,
} from "../lib/api";

type FetchCall = {
  url: string;
  init?: RequestInit;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function withMockFetch(
  handler: (url: string, init?: RequestInit) => Promise<Response>,
): { calls: FetchCall[]; restore: () => void } {
  const calls: FetchCall[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;

  return {
    calls,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

export async function runApiTests(): Promise<void> {
  testBuildAuthenticatedBackendUrlSignsProtectedDownloads();
  testBuildAuthenticatedBackendUrlLeavesPublicUrlsUntouched();
  await testPrepareUploadPostsExportSettings();
  await testSearchClipsUsesBackendDiscoveryRoute();
  await testSearchClipsFallsBackToCurrentClipData();
  await testPublishClipsPostsPublicationPayload();
  await testRevokeClipDownloadPostsRevocationRequest();
  await testRecommendationsFallbackProducesEstimatedResults();
  await testMetricsFallbackProducesEstimatedSummary();
}

function testBuildAuthenticatedBackendUrlSignsProtectedDownloads(): void {
  const url = buildAuthenticatedBackendUrl("/podcasts/clips/clip-7/download", "token-123");

  assert.equal(
    url,
    "http://localhost:8000/podcasts/clips/clip-7/download?access_token=token-123",
  );
}

function testBuildAuthenticatedBackendUrlLeavesPublicUrlsUntouched(): void {
  const url = buildAuthenticatedBackendUrl("https://example.com/clip-1.mp4", "token-123");

  assert.equal(url, "https://example.com/clip-1.mp4");
}

async function testPrepareUploadPostsExportSettings(): Promise<void> {
  const { calls, restore } = withMockFetch(async (url, init) => {
    if (url.endsWith("/upload/prepare")) {
      return jsonResponse({
        podcast_id: "pod-portrait",
        status: "ready_for_processing",
        storage_ready: true,
        checkout_required: false,
        payment_status: "not_required",
        price: 0,
        currency: "USD",
        export_settings: {
          export_mode: "portrait",
          crop_mode: "smart_crop",
          mobile_optimized: true,
          face_tracking_enabled: true,
        },
      });
    }

    throw new Error(`Unexpected URL ${url} (${init?.method ?? "GET"})`);
  });

  try {
    const result = await prepareUpload(
      {
        title: "Portrait Episode",
        filename: "portrait.mp4",
        filesize_bytes: 100,
        duration_seconds: 1800,
        price: 0,
        status: "free_ready",
        export_settings: {
          export_mode: "portrait",
          crop_mode: "smart_crop",
          mobile_optimized: true,
          face_tracking_enabled: true,
        },
      },
      { token: "token-123" },
    );

    assert.equal(result.podcast_id, "pod-portrait");
    assert.equal(result.export_settings?.export_mode, "portrait");
    assert.equal(calls[0]?.init?.method, "POST");
    assert.equal(
      calls[0]?.init?.body,
      JSON.stringify({
        title: "Portrait Episode",
        filename: "portrait.mp4",
        filesize_bytes: 100,
        duration_seconds: 1800,
        price: 0,
        status: "free_ready",
        export_settings: {
          export_mode: "portrait",
          crop_mode: "smart_crop",
          mobile_optimized: true,
          face_tracking_enabled: true,
        },
      }),
    );
  } finally {
    restore();
  }
}

async function testSearchClipsUsesBackendDiscoveryRoute(): Promise<void> {
  const { calls, restore } = withMockFetch(async (url) => {
    if (url.includes("/clips/search?")) {
      return jsonResponse({
        query: "retention hooks",
        total_results: 1,
        clips: [
          {
            id: "clip-1",
            podcast_id: "pod-1",
            podcast_title: "Growth Lab",
            title: "Clip 1: Retention hooks that convert",
            clip_number: 1,
            clip_start_seconds: 0,
            clip_end_seconds: 24,
            duration_seconds: 24,
            virality_score: 92,
            video_url: "https://example.com/clip-1.mp4",
            subtitle_text: "Retention hooks that convert",
            keywords: ["retention", "hooks"],
            status: "ready",
            published: true,
            download_url: "/podcasts/clips/clip-1/download",
            published_at: "2026-04-23T09:00:00Z",
            overlay: {
              clip_id: "clip-1",
              podcast_id: "pod-1",
              keyword: "retention",
              overlay_category: "education",
              overlay_asset: "viewer_retention_curve",
              asset_path: "education/viewer_retention_curve.png",
              applied: true,
              rendered: true,
              render_status: "rendered",
              confidence: 0.9,
            },
            search_score: 58,
            matched_fields: ["title", "keywords"],
            match_reason: "Matched clip title",
          },
        ],
      });
    }

    throw new Error(`Unexpected URL ${url}`);
  });

  try {
    const result = await searchClips(
      {
        query: "retention hooks",
        podcastId: "pod-1",
        status: "published",
      },
      "token-123",
    );

    assert.equal(result.total_results, 1);
    assert.equal(result.clips[0]?.id, "clip-1");
    assert.equal(result.estimated, undefined);
    assert.ok(calls[0]?.url.includes("/clips/search?query=retention+hooks"));
    assert.ok(calls[0]?.url.includes("podcast_id=pod-1"));
    assert.ok(calls[0]?.url.includes("status=published"));
    assert.equal(calls[0]?.init?.method, "GET");
    assert.equal((calls[0]?.init?.headers as Record<string, string>)?.Authorization, "Bearer token-123");
    assert.equal(result.clips[0]?.overlay?.rendered, true);
  } finally {
    restore();
  }
}

async function testSearchClipsFallsBackToCurrentClipData(): Promise<void> {
  const { restore } = withMockFetch(async (url) => {
    if (url.includes("/clips/search")) {
      return jsonResponse({ detail: "search unavailable" }, 503);
    }
    if (url.endsWith("/podcasts")) {
      return jsonResponse({
        podcasts: [{ id: "pod-1", title: "Growth Lab", user_id: "user-1", duration: 1200, status: "done", created_at: null, updated_at: null }],
        is_mock: false,
      });
    }
    if (url.endsWith("/podcasts/pod-1/clips")) {
      return jsonResponse({
        podcast_id: "pod-1",
        total_clips_generated: 2,
        processing_time_seconds: 0,
        download_folder_url: "/podcasts/pod-1/clips",
        clips: [
          {
            id: "clip-1",
            clip_number: 1,
            clip_start_seconds: 0,
            clip_end_seconds: 18,
            duration_seconds: 18,
            virality_score: 87,
            video_url: "https://example.com/clip-1.mp4",
            subtitle_text: "Retention hooks that bring viewers back",
            status: "ready",
            published: false,
            download_url: null,
            published_at: null,
            overlay: {
              clip_id: "clip-1",
              podcast_id: "pod-1",
              keyword: "retention",
              overlay_category: "education",
              overlay_asset: "viewer_retention_curve",
              matched_text: "Retention hooks",
              applied: true,
              confidence: 0.88,
            },
          },
          {
            id: "clip-2",
            clip_number: 2,
            clip_start_seconds: 20,
            clip_end_seconds: 42,
            duration_seconds: 22,
            virality_score: 74,
            video_url: "https://example.com/clip-2.mp4",
            subtitle_text: "Pricing experiments for creators",
            status: "ready",
            published: true,
            download_url: "/podcasts/clips/clip-2/download",
            published_at: "2026-04-22T08:00:00Z",
          },
        ],
      });
    }

    throw new Error(`Unexpected URL ${url}`);
  });

  try {
    const result = await searchClips(
      {
        query: "retention",
        podcastId: "pod-1",
        status: "unpublished",
      },
      "token-123",
    );

    assert.equal(result.estimated, true);
    assert.equal(result.total_results, 1);
    assert.equal(result.clips[0]?.id, "clip-1");
    assert.equal(result.clips[0]?.match_reason, "Matched clip transcript");
    assert.equal(result.clips[0]?.overlay?.keyword, "retention");
    assert.equal(result.clips[0]?.overlay?.overlay_category, "education");
  } finally {
    restore();
  }
}

async function testPublishClipsPostsPublicationPayload(): Promise<void> {
  const { calls, restore } = withMockFetch(async (url) => {
    if (url.endsWith("/podcasts/pod-1/publish-clips")) {
      return jsonResponse({
        podcast_id: "pod-1",
        total_clips_published: 1,
        published_clips: [
          {
            clip_id: "clip-1",
            published: true,
            download_url: "/podcasts/clips/clip-1/download",
            published_at: "2026-04-23T09:15:00Z",
          },
        ],
        processing_time_seconds: 0.11,
      });
    }

    throw new Error(`Unexpected URL ${url}`);
  });

  try {
    const result = await publishClips("pod-1", ["clip-1"], "token-123");

    assert.equal(result.total_clips_published, 1);
    assert.equal(result.published_clips[0]?.clip_id, "clip-1");
    assert.equal(calls[0]?.init?.method, "POST");
    assert.equal(calls[0]?.init?.body, JSON.stringify({ clip_ids: ["clip-1"] }));
  } finally {
    restore();
  }
}

async function testRevokeClipDownloadPostsRevocationRequest(): Promise<void> {
  const { calls, restore } = withMockFetch(async (url) => {
    if (url.endsWith("/clips/clip-1/revoke-download")) {
      return jsonResponse({
        clip_id: "clip-1",
        revoked: true,
        published: false,
      });
    }

    throw new Error(`Unexpected URL ${url}`);
  });

  try {
    const result = await revokeClipDownload("clip-1", "token-123");

    assert.equal(result.revoked, true);
    assert.equal(result.published, false);
    assert.equal(calls[0]?.init?.method, "POST");
    assert.equal(calls[0]?.init?.body, JSON.stringify({}));
  } finally {
    restore();
  }
}

async function testRecommendationsFallbackProducesEstimatedResults(): Promise<void> {
  const { restore } = withMockFetch(async (url) => {
    if (url.includes("/recommendations")) {
      return jsonResponse({ detail: "recommendations unavailable" }, 503);
    }
    if (url.endsWith("/podcasts")) {
      return jsonResponse({
        podcasts: [{ id: "pod-1", title: "Growth Lab", user_id: "user-1", duration: 1200, status: "done", created_at: null, updated_at: null }],
        is_mock: false,
      });
    }
    if (url.endsWith("/podcasts/pod-1/clips")) {
      return jsonResponse({
        podcast_id: "pod-1",
        total_clips_generated: 3,
        processing_time_seconds: 0,
        download_folder_url: "/podcasts/pod-1/clips",
        clips: [
          {
            id: "clip-1",
            clip_number: 1,
            clip_start_seconds: 0,
            clip_end_seconds: 20,
            duration_seconds: 20,
            virality_score: 91,
            video_url: "https://example.com/clip-1.mp4",
            subtitle_text: "High-upside private clip",
            status: "ready",
            published: false,
          },
          {
            id: "clip-2",
            clip_number: 2,
            clip_start_seconds: 25,
            clip_end_seconds: 47,
            duration_seconds: 22,
            virality_score: 87,
            video_url: "https://example.com/clip-2.mp4",
            subtitle_text: "Another private angle",
            status: "ready",
            published: false,
          },
          {
            id: "clip-3",
            clip_number: 3,
            clip_start_seconds: 50,
            clip_end_seconds: 74,
            duration_seconds: 24,
            virality_score: 93,
            video_url: "https://example.com/clip-3.mp4",
            subtitle_text: "Published winner",
            status: "ready",
            published: true,
            download_url: "/podcasts/clips/clip-3/download",
            published_at: "2026-04-22T08:00:00Z",
          },
        ],
      });
    }

    throw new Error(`Unexpected URL ${url}`);
  });

  try {
    const result = await getRecommendations("pod-1", "token-123");

    assert.equal(result.estimated, true);
    assert.equal(result.recommendations.length, 3);
    assert.equal(result.recommendations[0]?.id, "clip-1");
    assert.equal(result.recommendations[0]?.recommendation_reason, "Highest upside right now");
  } finally {
    restore();
  }
}

async function testMetricsFallbackProducesEstimatedSummary(): Promise<void> {
  const { restore } = withMockFetch(async (url) => {
    if (url.includes("/metrics")) {
      return jsonResponse({ detail: "metrics unavailable" }, 503);
    }
    if (url.endsWith("/podcasts")) {
      return jsonResponse({
        podcasts: [{ id: "pod-9", title: "Insight Weekly", user_id: "user-1", duration: 1600, status: "done", created_at: null, updated_at: null }],
        is_mock: false,
      });
    }
    if (url.endsWith("/podcasts/pod-9/clips")) {
      return jsonResponse({
        podcast_id: "pod-9",
        total_clips_generated: 2,
        processing_time_seconds: 0,
        download_folder_url: "/podcasts/pod-9/clips",
        clips: [
          {
            id: "clip-a",
            clip_number: 1,
            clip_start_seconds: 0,
            clip_end_seconds: 22,
            duration_seconds: 22,
            virality_score: 88,
            video_url: "https://example.com/clip-a.mp4",
            subtitle_text: "Published clip with strong reach",
            status: "ready",
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
            subtitle_text: "Private clip with upside",
            status: "ready",
            published: false,
          },
        ],
      });
    }

    throw new Error(`Unexpected URL ${url}`);
  });

  try {
    const result = await getClipMetrics("pod-9", "token-123");

    assert.equal(result.estimated, true);
    assert.equal(result.total_clips, 2);
    assert.equal(result.published_clips, 1);
    assert.ok(result.total_views > 0);
    assert.equal(result.top_clips[0]?.clip_id, "clip-a");
  } finally {
    restore();
  }
}
