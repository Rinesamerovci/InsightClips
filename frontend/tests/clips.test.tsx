import assert from "node:assert/strict";

import {
  applyGenerationTemplate,
  CLIP_COUNT_OPTIONS,
  CLIP_DURATION_OPTIONS,
  describeGenerationSettings,
  GENERATION_TEMPLATES,
  normalizeGenerationSettings,
} from "../lib/generation-settings";
import { buildEstimatedContentCalendar, type ClipResult } from "../lib/api";
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

  const normalizedGeneration = normalizeGenerationSettings({
    clip_duration_seconds: 999,
    number_of_clips: 99,
    topic_focus: "   audience retention moments   ",
    subtitles_enabled: false,
  });

  assert.equal(normalizedGeneration.clip_duration_seconds, 30);
  assert.equal(normalizedGeneration.number_of_clips, 4);
  assert.equal(normalizedGeneration.topic_focus, "audience retention moments");
  assert.equal(normalizedGeneration.subtitles_enabled, false);
  assert.equal(
    describeGenerationSettings(normalizedGeneration),
    "4 clips | 30s | Subtitles off",
  );
  assert.equal(
    describeGenerationSettings({
      clip_duration_seconds: 15,
      number_of_clips: 1,
      topic_focus: "",
      subtitles_enabled: true,
    }),
    "1 clip | 15s | Subtitles on",
  );

  const template = applyGenerationTemplate("story_arc", discoveryItems[0]?.export_settings);

  assert.equal(template.generationSettings.clip_duration_seconds, 45);
  assert.equal(template.generationSettings.number_of_clips, 3);
  assert.equal(template.exportSettings.export_mode, "portrait");
  assert.equal(template.exportSettings.subtitle_style?.preset, "boxed");
  assert.equal(template.exportSettings.generation_settings?.number_of_clips, 3);

  const templateWithPrompt = applyGenerationTemplate("tiktok_viral", null, {
    topic_focus: "   strongest audience hook   ",
    subtitles_enabled: false,
  });

  assert.equal(templateWithPrompt.generationSettings.clip_duration_seconds, 15);
  assert.equal(templateWithPrompt.generationSettings.topic_focus, "strongest audience hook");
  assert.equal(templateWithPrompt.generationSettings.subtitles_enabled, true);
  assert.equal(templateWithPrompt.exportSettings.export_mode, "portrait");
  assert.equal(templateWithPrompt.exportSettings.crop_mode, "smart_crop");
  assert.equal(templateWithPrompt.exportSettings.face_tracking_enabled, true);
  assert.equal(templateWithPrompt.exportSettings.generation_settings?.topic_focus, "strongest audience hook");

  const singleGem = applyGenerationTemplate("single_gem", null, {
    topic_focus: "one decisive quote",
  });

  assert.equal(singleGem.generationSettings.number_of_clips, 1);
  assert.equal(singleGem.generationSettings.clip_duration_seconds, 15);
  assert.equal(singleGem.exportSettings.subtitle_style?.preset, "boxed");

  const highlightPair = applyGenerationTemplate("highlight_pair");

  assert.equal(highlightPair.generationSettings.number_of_clips, 2);
  assert.equal(highlightPair.generationSettings.clip_duration_seconds, 30);

  for (const templateDefinition of GENERATION_TEMPLATES) {
    const applied = applyGenerationTemplate(templateDefinition.id);
    const subtitleStyle = applied.exportSettings.subtitle_style;

    assert.ok(
      CLIP_DURATION_OPTIONS.includes(
        applied.generationSettings.clip_duration_seconds as (typeof CLIP_DURATION_OPTIONS)[number],
      ),
      `${templateDefinition.id} duration must be selectable`,
    );
    assert.ok(
      CLIP_COUNT_OPTIONS.includes(
        applied.generationSettings.number_of_clips as (typeof CLIP_COUNT_OPTIONS)[number],
      ),
      `${templateDefinition.id} clip count must be selectable`,
    );
    assert.equal(applied.exportSettings.generation_settings?.number_of_clips, applied.generationSettings.number_of_clips);
    assert.equal(
      applied.exportSettings.generation_settings?.clip_duration_seconds,
      applied.generationSettings.clip_duration_seconds,
    );
    assert.equal(Boolean(subtitleStyle), true);
    assert.match(subtitleStyle?.primary_color ?? "", /^#[0-9A-F]{6}$/i);
    assert.match(subtitleStyle?.outline_color ?? "", /^#[0-9A-F]{6}$/i);
    assert.match(subtitleStyle?.background_color ?? "", /^#[0-9A-F]{6}$/i);
    assert.ok((subtitleStyle?.font_family ?? "").length > 0);
    assert.ok((subtitleStyle?.font_size ?? 0) >= 16);
  }

  const clipCalendarSeed: ClipResult[] = [
    {
      id: "clip-1",
      clip_number: 1,
      clip_start_seconds: 0,
      clip_end_seconds: 30,
      duration_seconds: 30,
      virality_score: 82,
      video_url: "https://example.com/clip-1.mp4",
      subtitle_text: "How creators turn attention into revenue",
      status: "ready",
      published: false,
    },
    {
      id: "clip-2",
      clip_number: 2,
      clip_start_seconds: 35,
      clip_end_seconds: 60,
      duration_seconds: 25,
      virality_score: 91,
      video_url: "https://example.com/clip-2.mp4",
      subtitle_text: "A published clip with strong retention",
      status: "ready",
      published: true,
    },
    {
      id: "clip-3",
      clip_number: 3,
      clip_start_seconds: 65,
      clip_end_seconds: 90,
      duration_seconds: 25,
      virality_score: 67,
      video_url: "https://example.com/clip-3.mp4",
      subtitle_text: "Processing another experiment for the feed",
      status: "processing",
      published: false,
    },
  ];
  const calendar = buildEstimatedContentCalendar("pod-1", clipCalendarSeed);
  const clipOneTikTok = calendar.suggestions.find(
    (suggestion) => suggestion.clip_id === "clip-1" && suggestion.platform === "tiktok",
  );

  assert.equal(calendar.estimated, true);
  assert.equal(calendar.total_suggestions, 6);
  assert.equal(
    calendar.suggestions.every((suggestion) => suggestion.clip_id !== "clip-3"),
    true,
  );
  assert.equal(clipOneTikTok?.best_time_local, "19:30");
  assert.ok(clipOneTikTok?.hashtags.includes("#PodcastClips"));
  assert.ok(
    calendar.suggestions.some(
      (suggestion) =>
        suggestion.clip_id === "clip-2" &&
        suggestion.caption.length > 0 &&
        suggestion.repurpose_angle.length > 0,
    ),
  );
}
