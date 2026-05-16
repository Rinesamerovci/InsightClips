import assert from "node:assert/strict";

import {
  buildAuthenticatedBackendUrl,
  generateClips,
  getClipMetrics,
  getContentCalendar,
  getPodcastAnalytics,
  getUserExportSettings,
  getUserProfile,
  importYouTubePodcast,
  getRecommendations,
  prepareUpload,
  publishClips,
  revokeClipDownload,
  searchClips,
  submitFeedback,
  updateUserExportSettings,
  updateUserProfile,
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
  await testGetUserProfileUsesProtectedEndpoint();
  await testUpdateUserProfilePatchesProfileFields();
  await testGetUserExportSettingsUsesProtectedEndpoint();
  await testUpdateUserExportSettingsPersistsPreferences();
  await testSubmitFeedbackPostsProtectedMessage();
  await testPrepareUploadPostsExportSettings();
  await testImportYouTubePodcastPostsSourcePayload();
  await testGenerateClipsPostsGenerationSettingsPayload();
  await testGenerateClipsFallsBackToLegacyPayloadWhenBackendRejectsNewFields();
  await testGetContentCalendarUsesBackendRoute();
  await testContentCalendarFallbackProducesEstimatedSuggestions();
  await testGetPodcastAnalyticsUsesBackendRoute();
  await testSearchClipsUsesBackendDiscoveryRoute();
  await testSearchClipsFallsBackToCurrentClipData();
  await testPublishClipsPostsPublicationPayload();
  await testRevokeClipDownloadPostsRevocationRequest();
  await testRecommendationsFallbackProducesEstimatedResults();
  await testPodcastAnalyticsFallbackProducesEstimatedSummary();
  await testGetClipMetricsUsesBackendMetricsRoute();
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

async function testGetUserProfileUsesProtectedEndpoint(): Promise<void> {
  const { calls, restore } = withMockFetch(async (url) => {
    if (url.endsWith("/users/profile")) {
      return jsonResponse({
        id: "user-1",
        email: "creator@example.com",
        free_trial_used: false,
        full_name: "Creator One",
        profile_picture_url: "https://example.com/avatar.png",
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
        created_at: "2026-04-23T09:00:00Z",
        updated_at: "2026-04-24T09:00:00Z",
      });
    }

    throw new Error(`Unexpected URL ${url}`);
  });

  try {
    const result = await getUserProfile("token-123");

    assert.equal(result.id, "user-1");
    assert.equal(result.full_name, "Creator One");
    assert.equal(result.export_settings.export_mode, "portrait");
    assert.equal(calls[0]?.init?.method, "GET");
    assert.equal(
      (calls[0]?.init?.headers as Record<string, string>)?.Authorization,
      "Bearer token-123",
    );
  } finally {
    restore();
  }
}

async function testUpdateUserProfilePatchesProfileFields(): Promise<void> {
  const { calls, restore } = withMockFetch(async (url) => {
    if (url.endsWith("/users/profile")) {
      return jsonResponse({
        id: "user-1",
        email: "creator@example.com",
        free_trial_used: false,
        full_name: "Updated Creator",
        profile_picture_url: "https://example.com/new-avatar.png",
        export_settings: {
          export_mode: "landscape",
          crop_mode: "none",
          mobile_optimized: false,
          face_tracking_enabled: false,
          subtitle_style: {
            preset: "classic",
            font_family: "Arial",
            font_size: 18,
            primary_color: "#FFFFFF",
            outline_color: "#000000",
            background_color: "#000000",
            background_opacity: 0.2,
            position: "bottom",
            bold: false,
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
        created_at: "2026-04-23T09:00:00Z",
        updated_at: "2026-04-24T09:00:00Z",
      });
    }

    throw new Error(`Unexpected URL ${url}`);
  });

  try {
    const result = await updateUserProfile(
      {
        full_name: "Updated Creator",
        profile_picture_url: "https://example.com/new-avatar.png",
      },
      "token-123",
    );

    assert.equal(result.full_name, "Updated Creator");
    assert.equal(result.profile_picture_url, "https://example.com/new-avatar.png");
    assert.equal(calls[0]?.init?.method, "PATCH");
    assert.equal(
      calls[0]?.init?.body,
      JSON.stringify({
        full_name: "Updated Creator",
        profile_picture_url: "https://example.com/new-avatar.png",
      }),
    );
  } finally {
    restore();
  }
}

async function testGetUserExportSettingsUsesProtectedEndpoint(): Promise<void> {
  const { calls, restore } = withMockFetch(async (url) => {
    if (url.endsWith("/users/export-settings")) {
      return jsonResponse({
        user_id: "user-1",
        export_settings: {
          export_mode: "portrait",
          crop_mode: "smart_crop",
          mobile_optimized: true,
          face_tracking_enabled: true,
          subtitle_style: {
            preset: "boxed",
            font_family: "Arial",
            font_size: 20,
            primary_color: "#FFFFFF",
            outline_color: "#000000",
            background_color: "#000000",
            background_opacity: 0.55,
            position: "bottom",
            bold: true,
            italic: false,
          },
          audio_enhancement: {
            enabled: false,
            normalize_loudness: false,
            target_lufs: -16,
            true_peak_db: -1.5,
            status: "disabled",
          },
        },
      });
    }

    throw new Error(`Unexpected URL ${url}`);
  });

  try {
    const result = await getUserExportSettings("token-123");

    assert.equal(result.user_id, "user-1");
    assert.equal(result.export_settings.subtitle_style?.preset, "boxed");
    assert.equal(calls[0]?.init?.method, "GET");
  } finally {
    restore();
  }
}

async function testUpdateUserExportSettingsPersistsPreferences(): Promise<void> {
  const { calls, restore } = withMockFetch(async (url) => {
    if (url.endsWith("/users/export-settings")) {
      return jsonResponse({
        user_id: "user-1",
        export_settings: {
          export_mode: "portrait",
          crop_mode: "smart_crop",
          mobile_optimized: true,
          face_tracking_enabled: true,
          subtitle_style: {
            preset: "minimal",
            font_family: "Arial",
            font_size: 16,
            primary_color: "#F8FAFC",
            outline_color: "#222222",
            background_color: "#000000",
            background_opacity: 0,
            position: "top",
            bold: false,
            italic: false,
          },
          audio_enhancement: {
            enabled: true,
            normalize_loudness: false,
            target_lufs: -15,
            true_peak_db: -1,
            status: "disabled",
          },
        },
      });
    }

    throw new Error(`Unexpected URL ${url}`);
  });

  try {
    const result = await updateUserExportSettings(
      {
        export_mode: "portrait",
        crop_mode: "smart_crop",
        mobile_optimized: true,
        face_tracking_enabled: true,
        subtitle_style: {
          preset: "minimal",
          font_family: "Arial",
          font_size: 16,
          primary_color: "#F8FAFC",
          outline_color: "#222222",
          background_color: "#000000",
          background_opacity: 0,
          position: "top",
          bold: false,
          italic: false,
        },
        audio_enhancement: {
          enabled: true,
          normalize_loudness: false,
          target_lufs: -15,
          true_peak_db: -1,
          status: "disabled",
        },
      },
      "token-123",
    );

    assert.equal(result.export_settings.export_mode, "portrait");
    assert.equal(result.export_settings.subtitle_style?.preset, "minimal");
    assert.equal(calls[0]?.init?.method, "PATCH");
    assert.equal(
      calls[0]?.init?.body,
      JSON.stringify({
        export_settings: {
          export_mode: "portrait",
          crop_mode: "smart_crop",
          mobile_optimized: true,
          face_tracking_enabled: true,
          subtitle_style: {
            preset: "minimal",
            font_family: "Arial",
            font_size: 16,
            primary_color: "#F8FAFC",
            outline_color: "#222222",
            background_color: "#000000",
            background_opacity: 0,
            position: "top",
            bold: false,
            italic: false,
          },
          audio_enhancement: {
            enabled: true,
            normalize_loudness: false,
            target_lufs: -15,
            true_peak_db: -1,
            status: "disabled",
          },
        },
      }),
    );
  } finally {
    restore();
  }
}

async function testSubmitFeedbackPostsProtectedMessage(): Promise<void> {
  const { calls, restore } = withMockFetch(async (url) => {
    if (url.endsWith("/users/feedback")) {
      return jsonResponse({
        id: "message-1",
        user_id: "user-1",
        message_type: "feedback",
        category: "feature_request",
        subject: "Planning board",
        message: "Please add easier reuse for planned captions and hashtags.",
        contact_email: "creator@example.com",
        status: "received",
        created_at: "2026-05-15T10:00:00Z",
      });
    }

    throw new Error(`Unexpected URL ${url}`);
  });

  try {
    const result = await submitFeedback(
      {
        category: "feature_request",
        subject: "Planning board",
        message: "Please add easier reuse for planned captions and hashtags.",
        contact_email: "creator@example.com",
      },
      "token-123",
    );

    assert.equal(result.message_type, "feedback");
    assert.equal(result.category, "feature_request");
    assert.equal(calls[0]?.init?.method, "POST");
    assert.equal(
      calls[0]?.init?.body,
      JSON.stringify({
        category: "feature_request",
        subject: "Planning board",
        message: "Please add easier reuse for planned captions and hashtags.",
        contact_email: "creator@example.com",
        message_type: "feedback",
      }),
    );
  } finally {
    restore();
  }
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
          subtitle_style: {
            preset: "bold",
            font_family: "Arial",
            font_size: 26,
            primary_color: "#F8FAFC",
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
            target_lufs: -14,
            true_peak_db: -1,
            status: "enabled",
          },
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
          subtitle_style: {
            preset: "bold",
            font_family: "Arial",
            font_size: 26,
            primary_color: "#F8FAFC",
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
            target_lufs: -14,
            true_peak_db: -1,
            status: "enabled",
          },
        },
      },
      { token: "token-123" },
    );

    assert.equal(result.podcast_id, "pod-portrait");
    assert.equal(result.export_settings?.export_mode, "portrait");
    assert.equal(result.export_settings?.subtitle_style?.preset, "bold");
    assert.equal(result.export_settings?.audio_enhancement?.status, "enabled");
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
          subtitle_style: {
            preset: "bold",
            font_family: "Arial",
            font_size: 26,
            primary_color: "#F8FAFC",
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
            target_lufs: -14,
            true_peak_db: -1,
            status: "enabled",
          },
        },
      }),
    );
  } finally {
    restore();
  }
}

async function testImportYouTubePodcastPostsSourcePayload(): Promise<void> {
  const { calls, restore } = withMockFetch(async (url, init) => {
    if (url.endsWith("/upload/youtube")) {
      return jsonResponse({
        podcast_id: "pod-youtube",
        status: "ready_for_processing",
        source_type: "youtube",
        source_url: "https://www.youtube.com/watch?v=abcDEF123_4",
        video_id: "abcDEF123_4",
        title: "Founder interview",
        storage_path: ".generated/youtube-imports/user-1/abcDEF123_4.mp4",
        duration_seconds: 1824,
        metadata: {
          channel: "Insight Lab",
          normalized_url: "https://www.youtube.com/watch?v=abcDEF123_4",
        },
        export_settings: {
          export_mode: "landscape",
          crop_mode: "none",
          mobile_optimized: false,
          face_tracking_enabled: false,
        },
      });
    }

    throw new Error(`Unexpected URL ${url} (${init?.method ?? "GET"})`);
  });

  try {
    const result = await importYouTubePodcast(
      {
        url: "https://youtu.be/abcDEF123_4",
        title: "Founder interview",
        export_settings: {
          export_mode: "landscape",
          crop_mode: "none",
          mobile_optimized: false,
          face_tracking_enabled: false,
        },
      },
      { token: "token-123" },
    );

    assert.equal(result.podcast_id, "pod-youtube");
    assert.equal(result.source_type, "youtube");
    assert.equal(result.video_id, "abcDEF123_4");
    assert.equal(calls[0]?.init?.method, "POST");
    assert.equal(
      calls[0]?.init?.body,
      JSON.stringify({
        url: "https://youtu.be/abcDEF123_4",
        title: "Founder interview",
        export_settings: {
          export_mode: "landscape",
          crop_mode: "none",
          mobile_optimized: false,
          face_tracking_enabled: false,
        },
      }),
    );
  } finally {
    restore();
  }
}

async function testGenerateClipsPostsGenerationSettingsPayload(): Promise<void> {
  const { calls, restore } = withMockFetch(async (url) => {
    if (url.endsWith("/podcasts/pod-77/generate-clips")) {
      return jsonResponse({
        podcast_id: "pod-77",
        total_clips_generated: 2,
        processing_time_seconds: 1.2,
        download_folder_url: "/podcasts/pod-77/clips",
        export_settings: {
          export_mode: "portrait",
          crop_mode: "smart_crop",
          mobile_optimized: true,
          face_tracking_enabled: true,
          subtitle_style: {
            preset: "bold",
            font_family: "DM Sans",
            font_size: 26,
            primary_color: "#F8FAFC",
            outline_color: "#000000",
            background_color: "#000000",
            background_opacity: 0.25,
            position: "center",
            bold: true,
            italic: false,
          },
        },
        clips: [],
      });
    }

    throw new Error(`Unexpected URL ${url}`);
  });

  try {
    const result = await generateClips(
      "pod-77",
      {
        generation_settings: {
          clip_duration_seconds: 30,
          number_of_clips: 4,
          topic_focus: "Prioritize strong opening hooks.",
          subtitles_enabled: true,
        },
        visual_output_mode: "stylized_animated",
        save_generation_settings: true,
        use_preferred_generation_settings: true,
        export_settings: {
          export_mode: "portrait",
          crop_mode: "smart_crop",
          mobile_optimized: true,
          face_tracking_enabled: true,
          subtitle_style: {
            preset: "bold",
            font_family: "DM Sans",
            font_size: 26,
            primary_color: "#F8FAFC",
            outline_color: "#000000",
            background_color: "#000000",
            background_opacity: 0.25,
            position: "center",
            bold: true,
            italic: false,
          },
        },
      },
      "token-123",
    );

    assert.equal(result.podcast_id, "pod-77");
    assert.equal(calls[0]?.init?.method, "POST");
    assert.deepEqual(
      JSON.parse(String(calls[0]?.init?.body)),
      {
        generation_settings: {
          clip_duration_seconds: 30,
          number_of_clips: 4,
          topic_focus: "Prioritize strong opening hooks.",
          subtitles_enabled: true,
        },
        visual_output_mode: "stylized_animated",
        save_generation_settings: true,
        use_preferred_generation_settings: true,
        export_settings: {
          export_mode: "portrait",
          crop_mode: "smart_crop",
          mobile_optimized: true,
          face_tracking_enabled: true,
          subtitle_style: {
            preset: "bold",
            font_family: "DM Sans",
            font_size: 26,
            primary_color: "#F8FAFC",
            outline_color: "#000000",
            background_color: "#000000",
            background_opacity: 0.25,
            position: "center",
            bold: true,
            italic: false,
          },
        },
      },
    );
  } finally {
    restore();
  }
}

async function testGenerateClipsFallsBackToLegacyPayloadWhenBackendRejectsNewFields(): Promise<void> {
  const { calls, restore } = withMockFetch(async (url, init) => {
    if (!url.endsWith("/podcasts/pod-legacy/generate-clips")) {
      throw new Error(`Unexpected URL ${url}`);
    }

    if (String(init?.body).includes("generation_settings")) {
      return jsonResponse({ detail: "Request failed." }, 422);
    }

    return jsonResponse({
      podcast_id: "pod-legacy",
      total_clips_generated: 1,
      processing_time_seconds: 0.9,
      download_folder_url: "/podcasts/pod-legacy/clips",
      clips: [],
      export_settings: JSON.parse(String(init?.body)).export_settings,
    });
  });

  try {
    const result = await generateClips(
      "pod-legacy",
      {
        generation_settings: {
          clip_duration_seconds: 45,
          number_of_clips: 3,
          topic_focus: "Keep setup and payoff together.",
          subtitles_enabled: false,
        },
        export_settings: {
          export_mode: "landscape",
          crop_mode: "none",
          mobile_optimized: false,
          face_tracking_enabled: false,
          subtitle_style: {
            preset: "minimal",
            font_family: "Trebuchet MS",
            font_size: 18,
            primary_color: "#F8FAFC",
            outline_color: "#222222",
            background_color: "#000000",
            background_opacity: 0,
            position: "top",
            bold: false,
            italic: false,
          },
        },
      },
      "token-123",
    );

    assert.equal(result.podcast_id, "pod-legacy");
    assert.equal(calls.length, 3);
    assert.deepEqual(
      JSON.parse(String(calls[2]?.init?.body)),
      {
        export_settings: {
          export_mode: "landscape",
          crop_mode: "none",
          mobile_optimized: false,
          face_tracking_enabled: false,
          subtitle_style: {
            preset: "minimal",
            font_family: "Trebuchet MS",
            font_size: 18,
            primary_color: "#F8FAFC",
            outline_color: "#222222",
            background_color: "#000000",
            background_opacity: 0,
            position: "top",
            bold: false,
            italic: false,
          },
        },
      },
    );
  } finally {
    restore();
  }
}

async function testGetContentCalendarUsesBackendRoute(): Promise<void> {
  const { calls, restore } = withMockFetch(async (url) => {
    if (url.endsWith("/podcasts/pod-1/content-calendar")) {
      return jsonResponse({
        podcast_id: "pod-1",
        total_suggestions: 2,
        suggestions: [
          {
            clip_id: "clip-1",
            clip_number: 1,
            platform: "tiktok",
            scheduled_day: 1,
            best_time_local: "19:30",
            title: "Strong hook",
            caption: "Strong hook Watch until the end for the key takeaway.",
            hashtags: ["#PodcastClips", "#CreatorTips"],
            call_to_action: "Follow for more short podcast takeaways.",
            repurpose_angle: "Lead with the strongest hook in the first two seconds.",
          },
          {
            clip_id: "clip-1",
            clip_number: 1,
            platform: "youtube",
            scheduled_day: 2,
            best_time_local: "17:00",
            title: "Strong hook | Podcast Clip",
            caption: "Watch this highlight and save the full episode for later.",
            hashtags: ["#Podcast", "#Shorts"],
            call_to_action: "Subscribe for more clips from this podcast.",
            repurpose_angle: "Package the clip as a searchable highlight from the episode.",
          },
        ],
      });
    }

    throw new Error(`Unexpected URL ${url}`);
  });

  try {
    const result = await getContentCalendar("pod-1", "token-123");

    assert.equal(result.total_suggestions, 2);
    assert.equal(result.suggestions[0]?.platform, "tiktok");
    assert.equal(result.suggestions[0]?.hashtags[0], "#PodcastClips");
    assert.equal(calls[0]?.init?.method, "GET");
  } finally {
    restore();
  }
}

async function testContentCalendarFallbackProducesEstimatedSuggestions(): Promise<void> {
  const { restore } = withMockFetch(async (url) => {
    if (url.endsWith("/podcasts/pod-2/content-calendar")) {
      return jsonResponse({ detail: "calendar unavailable" }, 503);
    }
    if (url.endsWith("/podcasts/pod-2/clips")) {
      return jsonResponse({
        podcast_id: "pod-2",
        total_clips_generated: 2,
        processing_time_seconds: 0,
        download_folder_url: "/podcasts/pod-2/clips",
        clips: [
          {
            id: "clip-1",
            clip_number: 1,
            clip_start_seconds: 0,
            clip_end_seconds: 22,
            duration_seconds: 22,
            virality_score: 94,
            video_url: "https://example.com/clip-1.mp4",
            subtitle_text: "How leaders turn audience trust into consistent growth",
            status: "ready",
            published: false,
          },
          {
            id: "clip-2",
            clip_number: 2,
            clip_start_seconds: 24,
            clip_end_seconds: 48,
            duration_seconds: 24,
            virality_score: 71,
            video_url: "https://example.com/clip-2.mp4",
            subtitle_text: "Processing draft clip",
            status: "processing",
            published: false,
          },
        ],
      });
    }

    throw new Error(`Unexpected URL ${url}`);
  });

  try {
    const result = await getContentCalendar("pod-2", "token-123");

    assert.equal(result.estimated, true);
    assert.equal(result.total_suggestions, 3);
    assert.equal(result.suggestions[0]?.clip_id, "clip-1");
    assert.ok(result.suggestions[0]?.hashtags.includes("#PodcastClips"));
  } finally {
    restore();
  }
}

async function testGetPodcastAnalyticsUsesBackendRoute(): Promise<void> {
  const { calls, restore } = withMockFetch(async (url) => {
    if (url.endsWith("/podcasts/analytics")) {
      return jsonResponse({
        user_id: "user-1",
        total_podcasts: 2,
        total_clips: 6,
        published_clips: 4,
        private_clips: 2,
        total_views: 940,
        total_downloads: 180,
        average_virality_score: 84.5,
        publish_rate: 66.67,
        top_clips: [
          {
            clip_id: "clip-9",
            podcast_id: "pod-1",
            podcast_title: "Growth Lab",
            clip_number: 3,
            virality_score: 94,
            views: 340,
            downloads: 68,
            published: true,
            published_at: "2026-04-24T08:30:00Z",
          },
        ],
        podcasts: [
          {
            podcast_id: "pod-1",
            title: "Growth Lab",
            status: "done",
            duration: 1800,
            total_clips: 4,
            published_clips: 3,
            total_views: 640,
            total_downloads: 132,
            average_virality_score: 88.2,
            latest_published_at: "2026-04-24T08:30:00Z",
          },
          {
            podcast_id: "pod-2",
            title: "Creator Office Hours",
            status: "processing",
            duration: 1200,
            total_clips: 2,
            published_clips: 1,
            total_views: 300,
            total_downloads: 48,
            average_virality_score: 76.8,
            latest_published_at: "2026-04-23T11:15:00Z",
          },
        ],
      });
    }

    throw new Error(`Unexpected URL ${url}`);
  });

  try {
    const result = await getPodcastAnalytics("token-123");

    assert.equal(result.user_id, "user-1");
    assert.equal(result.total_podcasts, 2);
    assert.equal(result.total_views, 940);
    assert.equal(result.top_clips[0]?.clip_id, "clip-9");
    assert.equal(result.podcasts[1]?.podcast_id, "pod-2");
    assert.equal(result.estimated, undefined);
    assert.equal(calls[0]?.init?.method, "GET");
    assert.equal(
      (calls[0]?.init?.headers as Record<string, string>)?.Authorization,
      "Bearer token-123",
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

async function testPodcastAnalyticsFallbackProducesEstimatedSummary(): Promise<void> {
  const { restore } = withMockFetch(async (url) => {
    if (url.endsWith("/podcasts/analytics")) {
      return jsonResponse({ detail: "analytics unavailable" }, 503);
    }
    if (url.endsWith("/podcasts")) {
      return jsonResponse({
        podcasts: [
          { id: "pod-1", title: "Growth Lab", user_id: "user-1", duration: 1200, status: "done", created_at: null, updated_at: null },
          { id: "pod-2", title: "Creator Office Hours", user_id: "user-1", duration: 1800, status: "processing", created_at: null, updated_at: null },
        ],
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
            clip_start_seconds: 24,
            clip_end_seconds: 50,
            duration_seconds: 26,
            virality_score: 93,
            video_url: "https://example.com/clip-2.mp4",
            subtitle_text: "Published winner",
            status: "ready",
            published: true,
            published_at: "2026-04-22T08:00:00Z",
          },
        ],
      });
    }
    if (url.endsWith("/podcasts/pod-2/clips")) {
      return jsonResponse({
        podcast_id: "pod-2",
        total_clips_generated: 1,
        processing_time_seconds: 0,
        download_folder_url: "/podcasts/pod-2/clips",
        clips: [
          {
            id: "clip-3",
            clip_number: 1,
            clip_start_seconds: 0,
            clip_end_seconds: 18,
            duration_seconds: 18,
            virality_score: 74,
            video_url: "https://example.com/clip-3.mp4",
            subtitle_text: "Processing episode teaser",
            status: "processing",
            published: false,
          },
        ],
      });
    }

    throw new Error(`Unexpected URL ${url}`);
  });

  try {
    const result = await getPodcastAnalytics("token-123");

    assert.equal(result.estimated, true);
    assert.equal(result.total_podcasts, 2);
    assert.equal(result.total_clips, 3);
    assert.equal(result.published_clips, 1);
    assert.equal(result.private_clips, 2);
    assert.equal(result.top_clips[0]?.podcast_id, "pod-1");
    assert.equal(result.podcasts[0]?.estimated, true);
  } finally {
    restore();
  }
}

async function testGetClipMetricsUsesBackendMetricsRoute(): Promise<void> {
  const { calls, restore } = withMockFetch(async (url) => {
    if (url.endsWith("/podcasts/pod-9/metrics")) {
      return jsonResponse({
        podcast_id: "pod-9",
        podcast_title: "Insight Weekly",
        total_clips: 3,
        published_clips: 2,
        unpublished_clips: 1,
        total_views: 1180,
        total_downloads: 204,
        average_click_trend: 9.4,
        top_clips: [
          {
            clip_id: "clip-a",
            clip_number: 1,
            title: "Published clip with strong reach",
            views: 470,
            downloads: 82,
            click_trend: 11.2,
            published: true,
            published_at: "2026-04-22T10:00:00Z",
            virality_score: 88,
            estimated: false,
          },
        ],
      });
    }

    throw new Error(`Unexpected URL ${url}`);
  });

  try {
    const result = await getClipMetrics("pod-9", "token-123");

    assert.equal(result.total_clips, 3);
    assert.equal(result.total_downloads, 204);
    assert.equal(result.top_clips[0]?.clip_id, "clip-a");
    assert.equal(result.top_clips[0]?.estimated, false);
    assert.equal(result.estimated, undefined);
    assert.equal(calls[0]?.init?.method, "GET");
    assert.equal(
      (calls[0]?.init?.headers as Record<string, string>)?.Authorization,
      "Bearer token-123",
    );
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
