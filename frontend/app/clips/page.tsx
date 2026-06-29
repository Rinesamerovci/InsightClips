"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Clapperboard,
  Copy,
  Download,
  Loader2,
  Moon,
  PlayCircle,
  Search,
  Sparkles,
  SunMedium,
  Wand2,
  Lightbulb,
  CheckCircle2,
} from "lucide-react";

import GenerationSettingsPanel from "@/components/GenerationSettingsPanel";
import SubtitleStylePanel from "@/components/SubtitleStylePanel";
import ClipVideoPreview from "@/components/ClipVideoPreview";
import { useAuth } from "@/context/AuthContext";
import { MagicLoadingScreen } from "@/components/MagicLoadingScreen";
import {
  buildAuthenticatedBackendUrl,
  getContentCalendar,
  downloadClip,
  analyzePodcast,
  generateClips,
  getBackendBaseUrl,
  getClips,
  getJson,
  getRecommendations,
  publishClips,
  revokeClipDownload,
  searchClips,
  type ClipRecommendation,
  type ClipOverlay,
  type ClipResult,
  type ClipSearchResult,
  type ContentCalendarResponse,
  type ContentCalendarSuggestion,
  type ExportSettings,
  type GenerationSettings,
  type GenerationTemplateId,
  type Podcast,
  type PodcastsResponse,
  type ScoreSegment,
  type VisualOutputMode,
} from "@/lib/api";
import {
  buildGenerationRequestPayload,
  buildDefaultGenerationSettings,
  loadSavedGenerationPreferences,
  normalizeGenerationSettings,
  saveGenerationPreferences,
  applyGenerationTemplate,
} from "@/lib/generation-settings";
import {
  buildDiscoveryItem,
  type ClipStatusFilter,
} from "@/lib/clip-insights";
import { getAudioEnhancementFeedback } from "@/lib/audio-enhancement";
import {
  buildSubtitleStyleFromPreset,
  normalizeExportSettings,
} from "@/lib/subtitle-style";
import { studioTheme, THEME_STORAGE_KEY } from "@/lib/brand";

const T = studioTheme;

const FILTERS: Array<{ value: ClipStatusFilter; label: string }> = [
  { value: "all", label: "All clips" },
  { value: "published", label: "Published" },
  { value: "unpublished", label: "Private" },
  { value: "ready", label: "Ready" },
  { value: "processing", label: "Processing" },
  { value: "failed", label: "Failed" },
];

const VISUAL_OUTPUT_MODES: Array<{
  value: VisualOutputMode;
  label: string;
  title: string;
  description: string;
  badge: string;
}> = [
  {
    value: "original_people",
    label: "Original People",
    title: "Keep the talking-head video",
    description: "Preserves the source footage with subtitles and overlays rendered in the normal clip style.",
    badge: "Default",
  },
  {
    value: "book_like",
    label: "Book Like",
    title: "Editorial reading frame",
    description: "Uses a quieter subtitle rhythm and disables overlays so the clip feels more like a sourced explainer.",
    badge: "Editorial",
  },
  {
    value: "stylized_animated",
    label: "Stylized Animated",
    title: "Motion-forward social style",
    description: "Tuned for portrait output with stronger captions and limited overlays for a more animated presentation.",
    badge: "Portrait",
  },
];

const EMPTY_CALENDAR_SUGGESTIONS: ContentCalendarSuggestion[] = [];

function formatTime(seconds: number): string {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remaining = totalSeconds % 60;
  return `${minutes}:${remaining.toString().padStart(2, "0")}`;
}

function isPreviewable(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function getPreviewAspectRatio(exportSettings?: ClipResult["export_settings"] | null): string {
  return exportSettings?.export_mode === "portrait" ? "9 / 16" : "16 / 9";
}

function collectPlanningHashtags(suggestions: ContentCalendarSuggestion[]): string[] {
  const seen = new Set<string>();
  const hashtags: string[] = [];

  for (const suggestion of suggestions) {
    for (const hashtag of suggestion.hashtags) {
      const normalized = hashtag.trim();
      if (!normalized) {
        continue;
      }
      const key = normalized.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      hashtags.push(normalized);
    }
  }

  return hashtags.slice(0, 8);
}

function toDiscoveryClips(clips: ClipResult[], podcast: Podcast | null): ClipSearchResult[] {
  if (!podcast) {
    return [];
  }

  return clips.map((clip) => buildDiscoveryItem(clip, podcast));
}

function formatOverlayValue(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  return value
    .split(/[_-]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function mergeOverlayMetadata<T extends { id: string; overlay?: ClipOverlay | null }>(
  items: T[],
  overlayByClipId: Map<string, ClipOverlay | null>,
): T[] {
  return items.map((item) => {
    const overlay = item.overlay ?? overlayByClipId.get(item.id) ?? null;
    return overlay === item.overlay ? item : { ...item, overlay };
  });
}

function getOverlayState(overlay?: ClipOverlay | null): {
  variant: "enabled" | "disabled" | "info";
  badge: string;
  title: string;
  description: string;
  category: string | null;
  keyword: string | null;
  asset: string | null;
  matchedText: string | null;
} {
  if (!overlay) {
    return {
      variant: "info",
      badge: "Overlay info",
      title: "Auto-B-Roll status unavailable",
      description: "No overlay metadata is attached to this clip yet.",
      category: null,
      keyword: null,
      asset: null,
      matchedText: null,
    };
  }

  const category = formatOverlayValue(overlay.overlay_category);
  const keyword = overlay.keyword ?? null;
  const asset = formatOverlayValue(overlay.overlay_asset);
  const matchedText = overlay.matched_text ?? null;
  const renderStatus = overlay.render_status ?? null;
  const rendered = overlay.rendered ?? overlay.applied;

  if (rendered) {
    return {
      variant: "enabled",
      badge: "Auto-B-Roll on",
      title: category ? `${category} overlay applied` : "Overlay applied",
      description: keyword
        ? `Triggered by "${keyword}".`
        : category
          ? `Applied from the ${category} overlay set.`
          : "An overlay was applied to this clip.",
      category,
      keyword,
      asset,
      matchedText,
    };
  }

  if (overlay.applied && renderStatus === "missing_asset") {
    return {
      variant: "info",
      badge: "Asset missing",
      title: "Overlay matched but asset was unavailable",
      description: keyword
        ? `Matched "${keyword}", but the local overlay file could not be loaded.`
        : "Overlay metadata matched, but the local overlay file could not be loaded.",
      category,
      keyword,
      asset,
      matchedText,
    };
  }

  if (overlay.applied && renderStatus === "render_fallback") {
    return {
      variant: "info",
      badge: "Fallback export",
      title: "Overlay was skipped to keep export stable",
      description: keyword
        ? `Matched "${keyword}", but the clip was exported without the overlay after a render fallback.`
        : "The clip was exported without the overlay after a render fallback.",
      category,
      keyword,
      asset,
      matchedText,
    };
  }

  return {
    variant: "disabled",
    badge: "Auto-B-Roll off",
    title: "No overlay applied",
    description:
      keyword || category
        ? `Checked this clip${keyword ? ` for "${keyword}"` : ""}${category ? ` in ${category}` : ""}, but no overlay was used.`
        : "Checked this clip, but no matching overlay was used.",
    category,
    keyword,
    asset,
    matchedText,
  };
}

function formatGenerationFailureMessage(error: unknown): string {
  const baseMessage =
    error instanceof Error ? error.message : "Clip generation failed.";
  const normalized = baseMessage.toLowerCase();

  if (normalized.includes("topic_focus")) {
    return "Generation settings only support letters, numbers, spaces, and simple punctuation.";
  }
  if (normalized.includes("ffmpeg")) {
    return `${baseMessage} Try Quick setup first with fewer clips, 15s or 30s length, and Original People mode.`;
  }
  if (normalized.includes("no clips could be generated")) {
    return `${baseMessage} Try fewer clips, a shorter target length, or a simpler visual mode before retrying.`;
  }

  return baseMessage;
}

function estimateGenerationTimeoutMs(settings: GenerationSettings): number {
  const clipCount = Math.max(1, Math.min(settings.number_of_clips || 1, 10));
  const clipDuration = Math.max(8, Math.min(settings.clip_duration_seconds || 30, 90));
  const estimatedMinutes = 10 + clipCount * 2 + Math.ceil((clipCount * clipDuration) / 60);
  return Math.min(45, Math.max(15, estimatedMinutes)) * 60 * 1000;
}

function formatTimeoutMinutes(timeoutMs: number): number {
  return Math.round(timeoutMs / 60_000);
}

type ClipsPageMode = "results" | "generate";

type ClipsPageContentProps = {
  mode?: ClipsPageMode;
};

export function ClipsPageContent({ mode = "results" }: ClipsPageContentProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { backendToken, loading: authLoading, syncBackendSession } = useAuth();
  const lockedWorkspaceView: "setup" | "results" = mode === "generate" ? "setup" : "results";

  const [mounted, setMounted] = useState(false);
  const [dark, setDark] = useState(true);
  const [viewportWidth, setViewportWidth] = useState(1280);
  const [loading, setLoading] = useState(true);
  const [loadingClips, setLoadingClips] = useState(false);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [searching, setSearching] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [selectedPodcastId, setSelectedPodcastId] = useState("");
  const [clips, setClips] = useState<ClipResult[]>([]);
  const [searchResults, setSearchResults] = useState<ClipSearchResult[]>([]);
  const [recommendations, setRecommendations] = useState<ClipRecommendation[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<ClipStatusFilter>("all");
  const [searchEstimated, setSearchEstimated] = useState(false);
  const [recommendationsEstimated, setRecommendationsEstimated] = useState(false);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [downloadingClipId, setDownloadingClipId] = useState("");
  const [publishingClipIds, setPublishingClipIds] = useState<string[]>([]);
  const [revokingClipIds, setRevokingClipIds] = useState<string[]>([]);
  const [contentCalendar, setContentCalendar] = useState<ContentCalendarResponse | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{
    tone: "success" | "error" | "info";
    message: string;
  } | null>(null);
  const [workspaceView, setWorkspaceView] = useState<"setup" | "results">(lockedWorkspaceView);
  const [showAdvancedControls, setShowAdvancedControls] = useState(true);
  const [generationTemplateId, setGenerationTemplateId] =
    useState<GenerationTemplateId | null>("hook_spotlight");
  const [generationSettings, setGenerationSettings] = useState<GenerationSettings>(() =>
    buildDefaultGenerationSettings(),
  );
  const generationTemplateIdRef = useRef<GenerationTemplateId | null>("hook_spotlight");
  const generationSettingsRef = useRef<GenerationSettings>(buildDefaultGenerationSettings());
  const [generationExportSettings, setGenerationExportSettings] =
    useState<ExportSettings | null>(null);
  const [visualOutputMode, setVisualOutputMode] =
    useState<VisualOutputMode>("original_people");
  const autoGenerateRequested = searchParams.get("autogen") === "1";
  const pendingAutoGenerateScoreSegmentsRef = useRef<ScoreSegment[] | null>(null);
  const autoGenerateStartedRef = useRef(false);
  const [generationStartedAt, setGenerationStartedAt] = useState<number | null>(null);

  const t = dark ? T.dark : T.light;
  const isMobile = viewportWidth < 960;
  const selectedPodcast =
    podcasts.find((podcast) => podcast.id === selectedPodcastId) ?? null;
  const selectedPodcastNeedsPayment =
    selectedPodcast?.status === "awaiting_payment" && selectedPodcast?.payment_status === "pending";
  const paymentCheckoutHref = selectedPodcast
    ? `/checkout?podcastId=${encodeURIComponent(selectedPodcast.id)}&amount=${encodeURIComponent(String(selectedPodcast.price ?? 0))}&currency=USD`
    : "/upload";
  const generationPath = selectedPodcastId ? `/clips?podcastId=${selectedPodcastId}` : "/clips";
  const resultsPath = selectedPodcastId
    ? `/clips/generated?podcastId=${selectedPodcastId}`
    : "/clips/generated";
  const activeSearch = searchQuery.trim().length > 0 || filter !== "all";
  const overlayByClipId = useMemo(
    () => new Map(clips.map((clip) => [clip.id, clip.overlay ?? null])),
    [clips],
  );

  const visibleClips = useMemo(
    () =>
      mergeOverlayMetadata(
        activeSearch ? searchResults : toDiscoveryClips(clips, selectedPodcast),
        overlayByClipId,
      ),
    [activeSearch, clips, overlayByClipId, searchResults, selectedPodcast],
  );
  const visibleRecommendations = useMemo(
    () => mergeOverlayMetadata(recommendations, overlayByClipId),
    [overlayByClipId, recommendations],
  );
  const calendarSuggestions = contentCalendar?.suggestions ?? EMPTY_CALENDAR_SUGGESTIONS;
  const contentCalendarByClipId = useMemo(() => {
    const next = new Map<string, ContentCalendarSuggestion[]>();
    for (const suggestion of calendarSuggestions) {
      const existing = next.get(suggestion.clip_id) ?? [];
      existing.push(suggestion);
      next.set(suggestion.clip_id, existing);
    }
    return next;
  }, [calendarSuggestions]);
  const publishedCount = clips.filter((clip) => clip.published).length;
  const overlayEnabledCount = clips.filter(
    (clip) => (clip.overlay?.rendered ?? clip.overlay?.applied) === true,
  ).length;
  const averageScore =
    clips.length > 0
      ? clips.reduce((sum, clip) => sum + clip.virality_score, 0) / clips.length
      : 0;
  const activeGenerationExportSettings = normalizeExportSettings(
    generationExportSettings ?? selectedPodcast?.export_settings ?? null,
  );
  const activeSubtitleStyle =
    activeGenerationExportSettings.subtitle_style ?? buildSubtitleStyleFromPreset("classic");

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme) {
      setDark(savedTheme === "dark");
    }

    const handleResize = () => setViewportWidth(window.innerWidth);
    handleResize();
    window.addEventListener("resize", handleResize);
    setMounted(true);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    window.localStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light");
  }, [dark, mounted]);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    const savedPreferences = loadSavedGenerationPreferences();
    generationTemplateIdRef.current = savedPreferences.templateId;
    generationSettingsRef.current = savedPreferences.settings;
    setGenerationTemplateId(savedPreferences.templateId);
    setGenerationSettings(savedPreferences.settings);
    setGenerationExportSettings(
      savedPreferences.templateId
        ? applyGenerationTemplate(savedPreferences.templateId, null, savedPreferences.settings).exportSettings
        : savedPreferences.exportSettings,
    );
    setVisualOutputMode("original_people");
  }, [mounted]);

  useEffect(() => {
    generationTemplateIdRef.current = generationTemplateId;
  }, [generationTemplateId]);

  useEffect(() => {
    generationSettingsRef.current = generationSettings;
  }, [generationSettings]);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    saveGenerationPreferences(generationTemplateId, generationSettings, generationExportSettings);
  }, [generationSettings, generationTemplateId, generationExportSettings, mounted]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    const loadPodcasts = async () => {
      setLoading(true);
      try {
        const token = backendToken ?? (await syncBackendSession());
        if (!token) {
          router.replace("/login");
          return;
        }

        const podcastsResponse = await getJson<PodcastsResponse>("/podcasts", token);
        setPodcasts(podcastsResponse.podcasts);

        const queryPodcastId = searchParams.get("podcastId");
        const preferredPodcast =
          podcastsResponse.podcasts.find((podcast) => podcast.id === queryPodcastId) ??
          podcastsResponse.podcasts.find((podcast) =>
            ["done", "ready_for_processing", "processing"].includes(podcast.status),
          ) ??
          podcastsResponse.podcasts[0];

        setSelectedPodcastId(preferredPodcast?.id ?? "");
        setError("");
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load your podcasts.",
        );
      } finally {
        setLoading(false);
      }
    };

    void loadPodcasts();
  }, [authLoading, backendToken, router, searchParams, syncBackendSession]);

  useEffect(() => {
    if (!selectedPodcastId || authLoading) {
      return;
    }

    const loadClipData = async () => {
      setLoadingClips(true);
      setLoadingRecommendations(true);
      try {
        const token = backendToken ?? (await syncBackendSession());
        if (!token) {
          router.replace("/login");
          return;
        }

        const [clipsResult, recommendationsResult] = await Promise.allSettled([
          getClips(selectedPodcastId, token),
          getRecommendations(selectedPodcastId, token),
        ]);

        if (clipsResult.status === "fulfilled") {
          setClips(clipsResult.value.clips);
        } else if (
          clipsResult.reason instanceof Error &&
          clipsResult.reason.message.includes("No clips have been generated")
        ) {
          setClips([]);
        } else {
          throw clipsResult.reason;
        }

        if (recommendationsResult.status === "fulfilled") {
          setRecommendations(recommendationsResult.value.recommendations);
          setRecommendationsEstimated(
            Boolean(recommendationsResult.value.estimated),
          );
        } else {
          setRecommendations([]);
          setRecommendationsEstimated(false);
        }

        setError("");
      } catch (loadError) {
        setClips([]);
        setRecommendations([]);
        setContentCalendar(null);
        setError(
          loadError instanceof Error ? loadError.message : "Unable to load clips.",
        );
      } finally {
        setLoadingClips(false);
        setLoadingRecommendations(false);
      }
    };

    void loadClipData();
  }, [authLoading, backendToken, router, selectedPodcastId, syncBackendSession]);


  useEffect(() => {
    if (!selectedPodcast) {
      setGenerationExportSettings(null);
      return;
    }

    if (generationTemplateIdRef.current) {
      const applied = applyGenerationTemplate(
        generationTemplateIdRef.current,
        selectedPodcast.export_settings,
        generationSettingsRef.current,
      );
      setGenerationExportSettings(applied.exportSettings);
      return;
    }

    setGenerationExportSettings((current) => current ?? normalizeExportSettings(selectedPodcast.export_settings ?? null));
  }, [selectedPodcast]);

  useEffect(() => {
    setWorkspaceView(lockedWorkspaceView);
    setShowAdvancedControls(false);
  }, [lockedWorkspaceView, selectedPodcastId]);

  useEffect(() => {
    if (mode === "results" && clips.length > 0) {
      setWorkspaceView("results");
    }
  }, [clips, mode]);

  const syncClipEverywhere = (
    clipId: string,
    updater: (clip: ClipResult | ClipSearchResult | ClipRecommendation) => {
      published?: boolean;
      download_url?: string | null;
      published_at?: string | null;
    },
  ) => {
    setClips((current) =>
      current.map((clip) => (clip.id === clipId ? { ...clip, ...updater(clip) } : clip)),
    );
    setSearchResults((current) =>
      current.map((clip) => (clip.id === clipId ? { ...clip, ...updater(clip) } : clip)),
    );
    setRecommendations((current) =>
      current.map((clip) => (clip.id === clipId ? { ...clip, ...updater(clip) } : clip)),
    );
  };

  const handleGenerationSettingsChange = (
    changes: Partial<GenerationSettings>,
  ) => {
    setGenerationTemplateId(null);
    generationTemplateIdRef.current = null;
    setGenerationSettings((current) => {
      const normalized = normalizeGenerationSettings({
        ...current,
        ...changes,
      });

      return {
        ...normalized,
        topic_focus:
          typeof changes.topic_focus === "string"
            ? changes.topic_focus
            : normalized.topic_focus,
      };
    });
  };

  const handleTemplateSelect = (templateId: GenerationTemplateId) => {
    setGenerationTemplateId(templateId);
    const applied = applyGenerationTemplate(
      templateId,
      generationExportSettings ?? selectedPodcast?.export_settings ?? null,
      generationSettings,
    );
    generationTemplateIdRef.current = templateId;
    generationSettingsRef.current = applied.generationSettings;
    setGenerationSettings(applied.generationSettings);
    setGenerationExportSettings(applied.exportSettings);
    setVisualOutputMode("original_people");
  };

  const resolveGenerationExportSettings = useCallback(() => {
    const baseExportSettings = generationExportSettings ?? selectedPodcast?.export_settings ?? null;
    if (generationTemplateIdRef.current) {
      return applyGenerationTemplate(
        generationTemplateIdRef.current,
        baseExportSettings,
        generationSettingsRef.current,
      ).exportSettings;
    }

    return baseExportSettings ? normalizeExportSettings(baseExportSettings) : normalizeExportSettings(null);
  }, [generationExportSettings, selectedPodcast]);

  const handleVisualOutputModeChange = (mode: VisualOutputMode) => {
    setGenerationTemplateId(null);
    generationTemplateIdRef.current = null;
    setVisualOutputMode(mode);
    if (mode === "stylized_animated") {
      setGenerationExportSettings((current) => ({
        ...normalizeExportSettings(current ?? selectedPodcast?.export_settings ?? null),
        export_mode: "portrait",
        crop_mode: "smart_crop",
        mobile_optimized: true,
        face_tracking_enabled: true,
      }));
      setGenerationSettings((current) =>
        normalizeGenerationSettings({
          ...current,
          subtitles_enabled: true,
        }),
      );
    }
    if (mode === "book_like") {
      setGenerationSettings((current) =>
        normalizeGenerationSettings({
          ...current,
          subtitles_enabled: true,
        }),
      );
    }
  };

  const handleSubtitleStyleChange = (
    changes: Partial<
      Pick<
        NonNullable<ExportSettings["subtitle_style"]>,
        "font_family" | "primary_color" | "font_size" | "position"
      >
    >,
  ) => {
    setGenerationTemplateId(null);
    generationTemplateIdRef.current = null;
    setVisualOutputMode("original_people");
    setGenerationExportSettings((current) => {
      const resolved = normalizeExportSettings(current ?? selectedPodcast?.export_settings ?? null);
      return {
        ...resolved,
        subtitle_style: {
          ...(resolved.subtitle_style ?? buildSubtitleStyleFromPreset("classic")),
          ...changes,
        },
      };
    });
  };

  const handleGenerateClips = useCallback(async () => {
    if (!selectedPodcastId) {
      setActionFeedback({
        tone: "error",
        message: "Select a podcast before generating clips.",
      });
      return;
    }

    setGenerating(true);
    setGenerationStartedAt(Date.now());
    setError("");
    setActionFeedback({
      tone: "info",
      message:
        "Rendering clips now. This can take a few minutes while the video files are being created.",
    });
    let token: string | null = null;
    try {
      token = backendToken ?? (await syncBackendSession());
      if (!token) {
        router.replace("/login");
        return;
      }

      const generated = await generateClips(
        selectedPodcastId,
        {
          score_segments: pendingAutoGenerateScoreSegmentsRef.current ?? undefined,
          generation_settings: buildGenerationRequestPayload(generationSettings),
          export_settings: resolveGenerationExportSettings(),
          visual_output_mode: visualOutputMode,
          save_generation_settings: true,
          use_preferred_generation_settings: true,
          force_regenerate: true,
        },
        token,
      );
      const recommended = await getRecommendations(selectedPodcastId, token).catch(() => null);

      setClips(generated.clips);
      setSearchResults(
        selectedPodcast ? toDiscoveryClips(generated.clips, selectedPodcast) : [],
      );
      if (recommended) {
        setRecommendations(recommended.recommendations);
        setRecommendationsEstimated(Boolean(recommended.estimated));
      }
      setWorkspaceView("results");
      if (mode === "generate") {
        router.push(resultsPath);
      }
      setActionFeedback({
        tone: "success",
        message: `Generated ${generated.clips.length} clip${generated.clips.length === 1 ? "" : "s"} for ${selectedPodcast?.title ?? "this podcast"} using ${generationSettings.clip_duration_seconds}s targets.`,
      });
    } catch (generationError) {
      if (token) {
        const partialResult = await getClips(selectedPodcastId, token).catch(() => null);
        if (partialResult?.clips.length) {
          setClips(partialResult.clips);
          setSearchResults(
            selectedPodcast ? toDiscoveryClips(partialResult.clips, selectedPodcast) : [],
          );
          setWorkspaceView("results");
          if (mode === "generate") {
            router.push(resultsPath);
          }
          setActionFeedback({
            tone: "info",
            message: `Showing ${partialResult.clips.length} clip${partialResult.clips.length === 1 ? "" : "s"} that finished rendering. The rest may still need another generation run.`,
          });
          setGenerating(false);
          return;
        }
      }
      const message = formatGenerationFailureMessage(generationError);
      if (message.includes("already being processed") || message.includes("Failed to fetch")) {
        setActionFeedback({
          tone: "info",
          message: "Clips are rendering in the background. This usually takes a few minutes. Please wait...",
        });
        // Do not setGenerating(false) so the polling effect takes over
        return;
      }
      setError(message);
      setActionFeedback({
        tone: "error",
        message,
      });
      setGenerating(false);
    } finally {
      pendingAutoGenerateScoreSegmentsRef.current = null;
      setGenerationStartedAt(null);
    }
  }, [
    backendToken,
    generationSettings,
    selectedPodcast,
    selectedPodcastId,
    mode,
    resultsPath,
    router,
    resolveGenerationExportSettings,
    syncBackendSession,
    visualOutputMode,
  ]);

  const loadContentCalendar = useCallback(async () => {
    if (!selectedPodcastId || authLoading || loadingCalendar) {
      return;
    }

    setLoadingCalendar(true);
    setContentCalendar(null);

    try {
      const token = backendToken ?? (await syncBackendSession());
      if (!token) {
        router.replace("/login");
        return;
      }

      const calendar = await getContentCalendar(selectedPodcastId, token, generationSettings.target_platform);
      setContentCalendar(calendar);
      setError("");
    } catch (loadError) {
      setContentCalendar(null);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load the content calendar.",
      );
    } finally {
      setLoadingCalendar(false);
    }
  }, [
    authLoading,
    backendToken,
    generationSettings.target_platform,
    loadingCalendar,
    router,
    selectedPodcastId,
    syncBackendSession,
  ]);

  useEffect(() => {
    if (!autoGenerateRequested || mode !== "results") {
      return;
    }
    if (!selectedPodcastId || !selectedPodcast || loading || authLoading) {
      return;
    }
    if (clips.length > 0 || autoGenerateStartedRef.current) {
      return;
    }

    autoGenerateStartedRef.current = true;
    const storageKey = `insightclips:analysis-segments:${selectedPodcastId}`;

    const runAutoGenerate = async () => {
      setGenerating(true);
      setGenerationStartedAt(Date.now());
      setError("");
      setActionFeedback({
        tone: "info",
        message: "Preparing the podcast, then rendering clips automatically.",
      });

      try {
        const token = backendToken ?? (await syncBackendSession());
        if (!token) {
          return;
        }

        try {
          const stored = window.sessionStorage.getItem(storageKey);
          pendingAutoGenerateScoreSegmentsRef.current = stored ? (JSON.parse(stored) as ScoreSegment[]) : null;
          window.sessionStorage.removeItem(storageKey);
        } catch {
          pendingAutoGenerateScoreSegmentsRef.current = null;
        }

        if (!pendingAutoGenerateScoreSegmentsRef.current) {
          const analysis = await analyzePodcast(selectedPodcastId, {}, token);
          pendingAutoGenerateScoreSegmentsRef.current = analysis.top_scoring_segments ?? [];
          
          // Refresh podcasts list to get the updated import_metadata (which now contains key_takeaways)
          const updatedPodcasts = await getJson<PodcastsResponse>("/podcasts", token);
          setPodcasts(updatedPodcasts.podcasts);
        }

        const generated = await generateClips(
          selectedPodcastId,
          {
            score_segments: pendingAutoGenerateScoreSegmentsRef.current ?? undefined,
            generation_settings: buildGenerationRequestPayload(generationSettings),
            export_settings: resolveGenerationExportSettings(),
            visual_output_mode: visualOutputMode,
            save_generation_settings: true,
            use_preferred_generation_settings: true,
            force_regenerate: true,
          },
          token,
        );

        setClips(generated.clips);
        setSearchResults(toDiscoveryClips(generated.clips, selectedPodcast));
        setWorkspaceView("results");
        setActionFeedback({
          tone: "success",
          message: `Generated ${generated.clips.length} clip${generated.clips.length === 1 ? "" : "s"} for ${selectedPodcast.title}.`,
        });
        setGenerating(false);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to start automated clip rendering.";
        if (message.includes("already being processed") || message.includes("Failed to fetch")) {
          setActionFeedback({
            tone: "info",
            message: "Clips are rendering in the background. This usually takes a few minutes. Please wait...",
          });
          // Do not setGenerating(false) so the polling effect takes over
          return;
        }
        setActionFeedback({
          tone: "error",
          message,
        });
        setGenerating(false);
      } finally {
        pendingAutoGenerateScoreSegmentsRef.current = null;
      }
    };

    void runAutoGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authLoading,
    autoGenerateRequested,
    clips.length,
    loading,
    mode,
    selectedPodcastId,
  ]);

  const handleCopyPlanning = async (text: string, label: string) => {
    const value = text.trim();
    if (!value) {
      setActionFeedback({
        tone: "error",
        message: `No ${label.toLowerCase()} is available to copy yet.`,
      });
      return;
    }

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API is not available.");
      }
      await navigator.clipboard.writeText(value);
      setActionFeedback({
        tone: "success",
        message: `${label} copied to your clipboard.`,
      });
    } catch (copyError) {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "0";
      document.body.appendChild(textarea);
      textarea.select();

      const copied = document.execCommand("copy");
      document.body.removeChild(textarea);

      setActionFeedback({
        tone: copied ? "success" : "error",
        message: copied
          ? `${label} copied to your clipboard.`
          : copyError instanceof Error
            ? copyError.message
            : `Unable to copy ${label.toLowerCase()}.`,
      });
    }
  };

  const handleDownload = async (clip: ClipSearchResult | ClipResult) => {
    setDownloadingClipId(clip.id);
    setActionFeedback(null);
    try {
      const token = backendToken ?? (await syncBackendSession());
      if (!token) {
        router.replace("/login");
        return;
      }

      const backendBaseUrl = getBackendBaseUrl();
      const downloadUrl = new URL(
        `/podcasts/clips/${clip.id}/download`,
        backendBaseUrl.endsWith("/") ? backendBaseUrl : `${backendBaseUrl}/`,
      );
      downloadUrl.searchParams.set("access_token", token);

      const anchor = document.createElement("a");
      anchor.href = downloadUrl.toString();
      anchor.download = `clip-${clip.clip_number}.mp4`;
      anchor.rel = "noreferrer";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setActionFeedback({
        tone: "success",
        message: `Download started for clip ${clip.clip_number}.`,
      });
    } catch (downloadError) {
      try {
        const token = backendToken ?? (await syncBackendSession());
        if (!token) {
          router.replace("/login");
          return;
        }

        const blob = await downloadClip(clip.id, token);
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `clip-${clip.clip_number}.mp4`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        setActionFeedback({
          tone: "success",
          message: `Download started for clip ${clip.clip_number}.`,
        });
      } catch (fallbackError) {
        setActionFeedback({
          tone: "error",
          message:
            fallbackError instanceof Error
              ? fallbackError.message
              : downloadError instanceof Error
                ? downloadError.message
                : "Clip download failed.",
        });
        setError(
          fallbackError instanceof Error
            ? fallbackError.message
            : downloadError instanceof Error
              ? downloadError.message
              : "Clip download failed.",
        );
      }
    } finally {
      setDownloadingClipId("");
    }
  };

  const handlePublish = async (clip: ClipSearchResult | ClipResult) => {
    if (!selectedPodcastId) {
      return;
    }
    if (clip.published) {
      setActionFeedback({
        tone: "info",
        message: `Clip ${clip.clip_number} is already published. Revoke it before publishing again.`,
      });
      return;
    }

    setPublishingClipIds((current) => [...current, clip.id]);
    setError("");
    setActionFeedback(null);
    try {
      const token = backendToken ?? (await syncBackendSession());
      if (!token) {
        router.replace("/login");
        return;
      }

      const result = await publishClips(selectedPodcastId, [clip.id], token);
      const publication = result.published_clips.find((item) => item.clip_id === clip.id);
      if (!publication) {
        throw new Error("Publish result did not include the requested clip.");
      }

      syncClipEverywhere(clip.id, () => ({
        published: publication.published,
        download_url: publication.download_url ?? null,
        published_at: publication.published_at ?? null,
      }));
      setActionFeedback({
        tone: "success",
        message: `Clip ${clip.clip_number} is now published and ready for download.`,
      });
    } catch (publishError) {
      setActionFeedback({
        tone: "error",
        message:
          publishError instanceof Error ? publishError.message : "Clip publish failed.",
      });
      setError(
        publishError instanceof Error ? publishError.message : "Clip publish failed.",
      );
    } finally {
      setPublishingClipIds((current) => current.filter((item) => item !== clip.id));
    }
  };

  const handleRevoke = async (clip: ClipSearchResult | ClipResult) => {
    setRevokingClipIds((current) => [...current, clip.id]);
    setError("");
    setActionFeedback(null);
    try {
      const token = backendToken ?? (await syncBackendSession());
      if (!token) {
        router.replace("/login");
        return;
      }

      const result = await revokeClipDownload(clip.id, token);
      syncClipEverywhere(clip.id, () => ({
        published: result.published,
        download_url: null,
        published_at: null,
      }));
      setActionFeedback({
        tone: "success",
        message: `Clip ${clip.clip_number} is private again and downloads are disabled.`,
      });
    } catch (revokeError) {
      setActionFeedback({
        tone: "error",
        message:
          revokeError instanceof Error ? revokeError.message : "Clip revoke failed.",
      });
      setError(
        revokeError instanceof Error ? revokeError.message : "Clip revoke failed.",
      );
    } finally {
      setRevokingClipIds((current) => current.filter((item) => item !== clip.id));
    }
  };

  if (!mounted) {
    return null;
  }

  if (selectedPodcastNeedsPayment) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: t.bg,
          color: t.text,
          fontFamily: "'DM Sans', sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "28px 16px",
        }}
      >
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display:ital@0;1&display=swap');
        `}</style>
        <main
          style={{
            width: "100%",
            maxWidth: 720,
            borderRadius: 28,
            border: `1px solid ${t.border}`,
            background: t.card,
            padding: 28,
            boxShadow: "0 24px 60px rgba(0,0,0,.16)",
          }}
        >
          <div style={{ fontSize: 11, letterSpacing: ".2em", textTransform: "uppercase", color: t.textFaint, marginBottom: 10 }}>
            Payment required
          </div>
          <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 42, lineHeight: 1.02, margin: 0 }}>
            Complete payment before opening clips.
          </h1>
          <p style={{ marginTop: 12, color: t.textSub, lineHeight: 1.75, fontSize: 15, maxWidth: 620 }}>
            This podcast is still marked as awaiting payment, so clip generation is locked until checkout is complete.
            Once payment is confirmed, you can choose a template or style manually and then generate clips.
          </p>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 22 }}>
            <Link
              href={paymentCheckoutHref}
              style={{
                borderRadius: 999,
                padding: "12px 18px",
                background: `linear-gradient(135deg, ${t.accent}, ${t.accentLt})`,
                color: "#fff",
                textDecoration: "none",
                fontWeight: 800,
              }}
            >
              Continue to payment
            </Link>
            <Link
              href="/dashboard"
              style={{
                borderRadius: 999,
                padding: "12px 18px",
                border: `1px solid ${t.borderSub}`,
                background: t.cardAlt,
                color: t.textSub,
                textDecoration: "none",
                fontWeight: 700,
              }}
            >
              Back to dashboard
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: t.bg,
        color: t.text,
        fontFamily: "'DM Sans', sans-serif",
        transition: "background .35s, color .35s",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display:ital@0;1&display=swap');
        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; }
        @keyframes floatOrb { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(26px,-18px) scale(1.04)} }
        @keyframes slideUp { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        .orbA { animation: floatOrb 16s ease-in-out infinite; }
        .orbB { animation: floatOrb 22s -5s ease-in-out infinite; }
        .lift-card { transition: transform .25s cubic-bezier(.22,1,.36,1), box-shadow .25s, border-color .25s; }
        .lift-card:hover { transform: translateY(-3px); box-shadow: 0 18px 40px ${t.accentGlow}; border-color: ${t.border}; }
      `}</style>

      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div
          className="orbA"
          style={{
            position: "absolute",
            top: -140,
            right: -80,
            width: 460,
            height: 460,
            borderRadius: "50%",
            background: dark ? "rgba(24,68,14,.55)" : "rgba(184,232,152,.38)",
            filter: "blur(90px)",
          }}
        />
        <div
          className="orbB"
          style={{
            position: "absolute",
            bottom: -120,
            left: -70,
            width: 420,
            height: 420,
            borderRadius: "50%",
            background: dark ? "rgba(15,52,8,.46)" : "rgba(210,245,182,.34)",
            filter: "blur(84px)",
          }}
        />
      </div>

      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: 1360,
          margin: "0 auto",
          padding: "30px 22px 64px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Link
              href="/dashboard"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                textDecoration: "none",
                color: t.textSub,
                border: `1px solid ${t.border}`,
                borderRadius: 999,
                padding: "10px 16px",
                background: t.card,
              }}
            >
              <ArrowLeft size={16} />
              Dashboard
            </Link>
            <Link
              href="/analytics"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                textDecoration: "none",
                color: t.textSub,
                border: `1px solid ${t.border}`,
                borderRadius: 999,
                padding: "10px 16px",
                background: t.card,
              }}
            >
              Analytics
            </Link>
            <button
              type="button"
              onClick={() => setDark((value) => !value)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                border: `1px solid ${t.border}`,
                borderRadius: 999,
                padding: "10px 14px",
                background: t.card,
                color: t.textSub,
                cursor: "pointer",
              }}
            >
              {dark ? <SunMedium size={15} /> : <Moon size={15} />}
              {dark ? "Light mode" : "Dark mode"}
            </button>
          </div>

          <button
            type="button"
            onClick={() => router.push("/upload")}
            style={{
              border: "none",
              borderRadius: 999,
              background: `linear-gradient(135deg, ${t.accent}, ${t.accentLt})`,
              color: "#fff",
              padding: "12px 18px",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: `0 14px 34px ${t.accentGlow}`,
            }}
          >
            <Sparkles size={16} />
            Upload another podcast
          </button>
        </div>

        <section
          style={{
            borderRadius: 30,
            border: `1px solid ${t.border}`,
            background: t.shell,
            backdropFilter: "blur(24px)",
            padding: isMobile ? "24px 20px" : "30px 32px",
            animation: "slideUp .5s cubic-bezier(.22,1,.36,1) both",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.4fr) 320px",
              gap: 22,
            }}
          >
            <div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  borderRadius: 999,
                  padding: "7px 12px",
                  background: t.chip,
                  color: t.accentLt,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: ".18em",
                  textTransform: "uppercase",
                }}
              >
                <Clapperboard size={14} />
                Clip Studio
              </div>
              <h1
                style={{
                  marginTop: 16,
                  marginBottom: 12,
                  fontFamily: "'DM Serif Display', serif",
                  fontSize: "clamp(34px, 4vw, 58px)",
                  lineHeight: 1.02,
                  letterSpacing: "-.04em",
                }}
              >
                Generate, shape, and publish your strongest moments.
              </h1>
              <p style={{ fontSize: 15, lineHeight: 1.8, color: t.textSub, maxWidth: 700 }}>
                Upload is only the intake step. This workspace is where you fine-tune clip behavior, subtitle styling, visual direction, and final publishing decisions.
              </p>
            </div>

            <div
              className="lift-card"
              style={{
                borderRadius: 20,
                border: `1px solid ${t.borderSub}`,
                background: t.cardAlt,
                padding: "20px 22px",
                display: "grid",
                gap: 14,
              }}
            >
              {[
                { label: "Podcasts", value: podcasts.length, sub: "available to review" },
                { label: "Generated", value: clips.length, sub: "clips in selected show" },
                { label: "Published", value: publishedCount, sub: "live for download" },
                { label: "Avg Score", value: clips.length ? averageScore.toFixed(1) : "0.0", sub: "virality average" },
              ].map((item) => (
                <div key={item.label}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".2em", textTransform: "uppercase", color: t.textFaint, marginBottom: 4 }}>
                    {item.label}
                  </div>
                  <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, fontStyle: "italic", lineHeight: 1, marginBottom: 4 }}>
                    {item.value}
                  </div>
                  <div style={{ fontSize: 12, color: t.textSub }}>{item.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {error ? (
          <div
            style={{
              marginTop: 18,
              borderRadius: 18,
              padding: "14px 18px",
              background: t.errorBg,
              border: `1px solid ${t.errorBd}`,
              color: t.errorText,
            }}
          >
            {error}
          </div>
        ) : null}

        {actionFeedback ? (
          <div
            style={{
              marginTop: 18,
              borderRadius: 18,
              padding: "14px 18px",
              background:
                actionFeedback.tone === "success"
                  ? dark
                    ? "rgba(18,48,14,.8)"
                    : "rgba(228,251,220,.9)"
                  : actionFeedback.tone === "error"
                    ? t.errorBg
                    : t.chip,
              border: `1px solid ${
                actionFeedback.tone === "success"
                  ? dark
                    ? "rgba(90,158,58,.35)"
                    : "rgba(130,205,110,.5)"
                  : actionFeedback.tone === "error"
                    ? t.errorBd
                    : t.borderSub
              }`,
              color:
                actionFeedback.tone === "success"
                  ? dark
                    ? "#bfe4ab"
                    : "#25591a"
                  : actionFeedback.tone === "error"
                    ? t.errorText
                    : t.text,
            }}
          >
            {actionFeedback.message}
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "320px minmax(0, 1fr)",
            gap: 18,
            marginTop: 22,
            alignItems: "start",
          }}
        >
          <aside
            style={{
              display: "grid",
              gap: 18,
              alignSelf: "start",
            }}
          >
            <section
              className="ic-premium-card"
              style={{
                borderRadius: 24,
                background: t.card,
                border: `1px solid ${t.border}`,
                padding: 18,
                animation: "slideUp .55s .08s cubic-bezier(.22,1,.36,1) both",
              }}
            >
              <div style={{ fontSize: 11, letterSpacing: ".2em", textTransform: "uppercase", color: t.textFaint, marginBottom: 14 }}>
                Podcast Library
              </div>

              {loading || authLoading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "48px 0", color: t.textSub }}>
                  <Loader2 size={22} className="animate-spin" />
                </div>
              ) : podcasts.length === 0 ? (
                <div style={{ color: t.textSub, lineHeight: 1.75 }}>
                  No podcasts yet. Upload one first, then come back here to manage clips.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10, alignItems: "start" }}>
                  {podcasts.map((podcast) => {
                    const isSelected = podcast.id === selectedPodcastId;
                    return (
                      <button
                        key={podcast.id}
                        type="button"
                        onClick={() => setSelectedPodcastId(podcast.id)}
                        className="ic-premium-card"
                        style={{
                          textAlign: "left",
                          borderRadius: 18,
                          border: `1px solid ${isSelected ? t.accent : t.borderSub}`,
                          background: isSelected ? t.chip : t.cardAlt,
                          padding: "14px 14px 16px",
                          cursor: "pointer",
                          color: t.text,
                        }}
                      >
                        <div style={{ fontWeight: 700, marginBottom: 6, lineHeight: 1.4 }}>
                          {podcast.title}
                        </div>
                        <div style={{ fontSize: 13, color: t.textSub }}>
                          {formatTime(podcast.duration)} / {podcast.status.replaceAll("_", " ")}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {mode === "results" ? (
              <section
                className="lift-card ic-premium-card"
                style={{
                  borderRadius: 24,
                  background: t.card,
                  border: `1px solid ${t.border}`,
                  padding: 18,
                }}
              >
                <div style={{ fontSize: 11, letterSpacing: ".2em", textTransform: "uppercase", color: t.textFaint, marginBottom: 12 }}>
                  Recommendations
                </div>
                {loadingRecommendations ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, color: t.textSub }}>
                    <Loader2 size={18} className="animate-spin" />
                    Loading recommendations...
                  </div>
                ) : recommendations.length === 0 ? (
                  <div style={{ display: "grid", gap: 12 }}>
                    <div style={{ color: t.textSub, lineHeight: 1.75 }}>
                      Recommendations will appear here after clips are generated for the selected podcast.
                    </div>
                    {selectedPodcast ? (
                      <Link
                        href={`/analytics?podcastId=${selectedPodcast.id}`}
                        style={{
                          width: "fit-content",
                          borderRadius: 999,
                          padding: "10px 14px",
                          background: t.cardAlt,
                          border: `1px solid ${t.borderSub}`,
                          color: t.textSub,
                          textDecoration: "none",
                          fontWeight: 700,
                        }}
                      >
                        Open analytics context
                      </Link>
                    ) : null}
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {recommendationsEstimated ? (
                      <div style={{ fontSize: 12, color: t.textSub, lineHeight: 1.65 }}>
                        Showing estimated recommendations based on current clip scores while the dedicated endpoint is unavailable.
                      </div>
                    ) : null}
                    {visibleRecommendations.map((clip) => {
                      const overlayState = getOverlayState(clip.overlay);

                      return (
                        <article
                          key={clip.id}
                          className="ic-premium-card"
                          style={{
                            borderRadius: 18,
                            border: `1px solid ${t.borderSub}`,
                            background: t.cardAlt,
                            padding: 14,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                            <div>
                              <div style={{ fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: t.textFaint }}>
                                Clip {clip.clip_number}
                              </div>
                              <div style={{ marginTop: 4, fontWeight: 700 }}>{clip.recommendation_reason ?? "Recommended next"}</div>
                            </div>
                            <div style={{ borderRadius: 999, background: t.chip, color: t.accent, fontWeight: 700, padding: "7px 10px", height: "fit-content" }}>
                              {clip.virality_score.toFixed(1)}
                            </div>
                          </div>
                          <div style={{ color: t.textSub, fontSize: 13, lineHeight: 1.7 }}>
                            {clip.subtitle_text}
                          </div>
                          {overlayState.variant === "enabled" ? (
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                              <span
                                style={{
                                  borderRadius: 999,
                                  background: t.chip,
                                  border: `1px solid ${t.accent}`,
                                  color: t.accent,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  letterSpacing: ".08em",
                                  textTransform: "uppercase",
                                  padding: "6px 10px",
                                }}
                              >
                                {overlayState.badge}
                              </span>
                              {overlayState.category ? (
                                <span
                                  style={{
                                    borderRadius: 999,
                                    background: "transparent",
                                    border: `1px solid ${t.borderSub}`,
                                    color: t.textSub,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    letterSpacing: ".08em",
                                    textTransform: "uppercase",
                                    padding: "6px 10px",
                                  }}
                                >
                                  {overlayState.category}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            ) : null}
          </aside>

          <main
            style={{
              display: "grid",
              gap: 18,
              animation: "slideUp .55s .14s cubic-bezier(.22,1,.36,1) both",
            }}
          >
            <section
              className="ic-premium-card"
              style={{
                borderRadius: 20,
                background: t.card,
                border: `1px solid ${t.border}`,
                padding: 18,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 16,
                  flexWrap: "wrap",
                  alignItems: "center",
                  marginBottom: 18,
                }}
              >
                <div>
                  <div style={{ fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: t.textFaint, marginBottom: 6 }}>
                    Clip workspace
                  </div>
                  <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: isMobile ? 28 : 32, lineHeight: 1.08, margin: 0 }}>
                    {selectedPodcast?.title ?? "Choose a podcast"}
                  </h2>
                  <p style={{ marginTop: 8, color: t.textSub }}>
                    {selectedPodcast
                      ? `${formatTime(selectedPodcast.duration)} total length / ${clips.length} generated clip${clips.length === 1 ? "" : "s"} / ${overlayEnabledCount} Auto-B-Roll-enabled clip${overlayEnabledCount === 1 ? "" : "s"}`
                      : "Select a podcast from the left to begin."}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (mode === "results") {
                      router.push(generationPath);
                      return;
                    }
                    void handleGenerateClips();
                  }}
                  disabled={!selectedPodcastId || generating || loadingClips}
                  className="ic-action"
                  style={{
                    border: "none",
                    borderRadius: 18,
                    background: `linear-gradient(135deg, ${t.accent}, ${t.accentLt})`,
                    color: "#fff",
                    padding: "14px 18px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 10,
                    fontWeight: 700,
                    cursor: !selectedPodcastId || generating || loadingClips || clips.length > 0 ? "default" : "pointer",
                    opacity: !selectedPodcastId || generating || loadingClips || clips.length > 0 ? 0.72 : 1,
                    boxShadow: clips.length > 0 ? "none" : `0 14px 30px ${t.accentGlow}`,
                  }}
                >
                  {generating ? <Loader2 size={16} className="animate-spin" /> : clips.length > 0 ? <CheckCircle2 size={16} /> : <Wand2 size={16} />}
                  {generating
                    ? "Rendering clips..."
                    : clips.length > 0
                      ? "Clips generated"
                      : mode === "results"
                        ? "Open generation setup"
                        : "Generate clips"}
                </button>
              </div>

              {(!generating && clips.length === 0) ? (
                <>
                  <GenerationSettingsPanel
                    dark={dark}
                    settings={generationSettings}
                    onSettingsChange={handleGenerationSettingsChange}
                    selectedTemplateId={generationTemplateId ?? undefined}
                    onTemplateSelect={handleTemplateSelect}
                    storageHint="These preferences are reused across the upload and clips workflow on this device."
                    palette={{
                      border: t.border,
                      subBorder: t.borderSub,
                      muted: t.textSub,
                      hi: t.accent,
                      hi2: t.accentLt,
                    }}
                  />

                  <section
                    className="lift-card"
                    style={{
                      borderRadius: 20,
                      border: `1px solid ${t.border}`,
                      background: `linear-gradient(135deg, ${t.cardAlt} 0%, ${t.chip} 100%)`,
                      padding: "16px 20px",
                      marginBottom: 16,
                      boxShadow: `0 4px 12px rgba(0,0,0,0.05)`,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 10, letterSpacing: ".18em", textTransform: "uppercase", color: t.accent, marginBottom: 6, fontWeight: 800 }}>
                          Advanced controls
                        </div>
                        <div style={{ fontSize: 13, color: t.text, lineHeight: 1.65, fontWeight: 500 }}>
                          Open visual mode and subtitle styling only when you need deeper polishing.
                        </div>
                      </div>
                    </div>
                  </section>

              <section
                className="glass a2"
                style={{
                  borderRadius: 22,
                  border: `1px solid ${t.border}`,
                  background: dark ? "rgba(14,24,11,.88)" : "rgba(255,255,255,.9)",
                  padding: "24px 24px 22px",
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 16,
                    flexWrap: "wrap",
                    marginBottom: 16,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 10,
                        letterSpacing: ".26em",
                        textTransform: "uppercase",
                        color: t.accentLt,
                        fontWeight: 700,
                        marginBottom: 8,
                      }}
                    >
                      Visual output mode
                    </div>
                    <h2
                      style={{
                        fontFamily: "'DM Serif Display',serif",
                        fontStyle: "italic",
                        fontSize: 24,
                        fontWeight: 400,
                        marginBottom: 10,
                      }}
                    >
                      Choose how the rendered clip should feel
                    </h2>
                    <p style={{ fontSize: 13, color: t.textSub, lineHeight: 1.72, maxWidth: 620 }}>
                      The mode is sent with generation and controls overlay, subtitle, and fallback behavior in the render pipeline.
                    </p>
                  </div>
                  <div
                    style={{
                      borderRadius: 999,
                      border: `1px solid ${t.borderSub}`,
                      background: dark ? "rgba(90,158,58,.12)" : "rgba(90,158,58,.08)",
                      padding: "8px 12px",
                      color: t.accent,
                      fontSize: 11,
                      fontWeight: 800,
                    }}
                  >
                    {VISUAL_OUTPUT_MODES.find((mode) => mode.value === visualOutputMode)?.label}
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,210px),1fr))",
                    gap: 10,
                  }}
                >
                  {VISUAL_OUTPUT_MODES.map((mode) => {
                    const active = visualOutputMode === mode.value;
                    return (
                      <button
                        key={mode.value}
                        type="button"
                        onClick={() => handleVisualOutputModeChange(mode.value)}
                        style={{
                          textAlign: "left",
                          borderRadius: 18,
                          padding: "16px 16px 15px",
                          border: `1px solid ${active ? t.accent : t.borderSub}`,
                          background: active
                            ? dark
                              ? "rgba(90,158,58,.16)"
                              : "rgba(90,158,58,.1)"
                            : dark
                              ? "rgba(11,18,9,.55)"
                              : "rgba(248,252,245,.82)",
                          color: t.text,
                          cursor: "pointer",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 10,
                            marginBottom: 10,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              letterSpacing: ".16em",
                              textTransform: "uppercase",
                              color: active ? t.accent : t.accentLt,
                            }}
                          >
                            {mode.label}
                          </div>
                          <span
                            style={{
                              borderRadius: 999,
                              border: `1px solid ${active ? "rgba(255,255,255,.22)" : t.borderSub}`,
                              padding: "4px 8px",
                              fontSize: 9,
                              fontWeight: 800,
                              letterSpacing: ".14em",
                              textTransform: "uppercase",
                              color: active ? t.accent : t.textSub,
                            }}
                          >
                            {mode.badge}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>
                          {mode.title}
                        </div>
                        <div style={{ fontSize: 12, lineHeight: 1.6, color: t.textSub }}>
                          {mode.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              <SubtitleStylePanel
                dark={dark}
                exportMode={activeGenerationExportSettings.export_mode}
                styleValue={activeSubtitleStyle}
                onPresetChange={(preset) => {
                  setGenerationTemplateId(null);
                  generationTemplateIdRef.current = null;
                  setGenerationExportSettings((current) => ({
                    ...normalizeExportSettings(current ?? selectedPodcast?.export_settings ?? null),
                    subtitle_style: buildSubtitleStyleFromPreset(preset),
                  }));
                }}
                onFontFamilyChange={(fontFamily) =>
                  handleSubtitleStyleChange({ font_family: fontFamily })
                }
                onColorChange={(color) => handleSubtitleStyleChange({ primary_color: color })}
                onFontSizeChange={(size) => handleSubtitleStyleChange({ font_size: size })}
                onPositionChange={(position) => handleSubtitleStyleChange({ position })}
                disabled={!generationSettings.subtitles_enabled}
                disabledMessage={
                  generationSettings.subtitles_enabled
                    ? null
                    : "Subtitles are currently off for this generation run. Turn them back on above to style the text layer."
                }
                palette={{
                  border: t.border,
                  subBorder: t.borderSub,
                  muted: t.textSub,
                  hi: t.accent,
                  hi2: t.accentLt,
                }}
              />
                </>
              ) : null}

              {true ? (
                <div style={{ display: "grid", gap: 18 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.2fr) auto",
                  gap: 14,
                }}
              >
                <div
                  className="ic-premium-card"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    borderRadius: 18,
                    background: t.cardAlt,
                    border: `1px solid ${t.borderSub}`,
                    padding: "12px 14px",
                  }}
                >
                  <Search size={16} color={t.textSub} />
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search clips by transcript, clip number, or podcast"
                    style={{
                      flex: 1,
                      border: "none",
                      outline: "none",
                      background: "transparent",
                      color: t.text,
                      fontSize: 14,
                    }}
                  />
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {FILTERS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setFilter(option.value)}
                      className={filter === option.value ? "ic-action" : "ic-premium-card"}
                      style={{
                        border: filter === option.value ? "none" : `1px solid ${t.borderSub}`,
                        borderRadius: 999,
                        padding: "10px 14px",
                        background:
                          filter === option.value
                            ? `linear-gradient(135deg, ${t.accent}, ${t.accentLt})`
                            : t.cardAlt,
                        color: filter === option.value ? "#fff" : t.textSub,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                  {activeSearch ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery("");
                        setFilter("all");
                      }}
                      className="ic-premium-card"
                      style={{
                        border: `1px solid ${t.borderSub}`,
                        borderRadius: 999,
                        padding: "10px 14px",
                        background: "transparent",
                        color: t.textSub,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Clear search
                    </button>
                  ) : null}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 14, color: t.textSub, fontSize: 13 }}>
                <span>
                  {searching
                    ? "Searching clips..."
                    : `${visibleClips.length} clip${visibleClips.length === 1 ? "" : "s"} in view`}
                </span>
                <span>
                  {searchEstimated
                    ? "Search is using fallback matching from current clip data."
                    : activeSearch
                      ? `Search is powered by the clip discovery API${selectedPodcast ? ` for ${selectedPodcast.title}` : ""}.`
                      : "Browsing the full generated clip list."}
                </span>
              </div>

            <section
              className="ic-premium-card"
              style={{
                borderRadius: 20,
                background: t.card,
                border: `1px solid ${t.border}`,
                padding: 18,
              }}
            >
              {loadingClips ? (
                <div style={{ display: "grid", gap: 14 }}>
                  {[0, 1, 2].map((item) => (
                    <div
                      key={item}
                      style={{
                        borderRadius: 20,
                        border: `1px solid ${t.borderSub}`,
                        background: t.cardAlt,
                        padding: 16,
                      }}
                    >
                      <div className="ic-skeleton" style={{ height: 170, marginBottom: 14 }} />
                      <div className="ic-skeleton" style={{ height: 18, width: "62%", marginBottom: 10 }} />
                      <div className="ic-skeleton" style={{ height: 12, width: "86%" }} />
                    </div>
                  ))}
                </div>
              ) : !selectedPodcast ? (
                <div style={{ color: t.textSub, lineHeight: 1.8 }}>
                  Select a podcast from the left to view its clip dashboard.
                </div>
              ) : visibleClips.length === 0 ? (
                <div
                  className="ic-empty-state"
                  style={{
                    borderRadius: 22,
                    border: `1px dashed ${t.border}`,
                    padding: "48px 26px",
                    textAlign: "center",
                    color: t.textSub,
                  }}
                >
                  {generating ? (
                    <MagicLoadingScreen generating={generating} t={t} />
                  ) : (
                    <>
                      <Clapperboard size={32} style={{ margin: "0 auto 12px" }} />
                      <h3 style={{ margin: 0, fontFamily: "'DM Serif Display', serif", fontSize: 28, color: t.text }}>
                        {clips.length === 0
                          ? "No generated clips yet"
                          : "No clips match this search"}
                      </h3>
                      <p style={{ marginTop: 10, lineHeight: 1.8 }}>
                        {clips.length === 0
                          ? "Generate clips for this podcast to unlock discovery, recommendations, and publish actions. Use the settings above to choose the template, clip length, visual format, and subtitle behavior first."
                          : "Try another search or filter to surface different clip candidates."}
                      </p>
                    </>
                  )}
                  {clips.length > 0 && activeSearch ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery("");
                        setFilter("all");
                      }}
                      className="ic-action"
                      style={{
                        marginTop: 18,
                        border: `1px solid ${t.borderSub}`,
                        borderRadius: 999,
                        background: t.cardAlt,
                        color: t.textSub,
                        padding: "12px 18px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Reset search
                    </button>
                  ) : null}

                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
                    gap: 14,
                    alignItems: "start",
                  }}
                >
                  {visibleClips.map((clip) => {
                    const isPublishing = publishingClipIds.includes(clip.id);
                    const isRevoking = revokingClipIds.includes(clip.id);
                    const isDownloading = downloadingClipId === clip.id;
                    const overlayState = getOverlayState(clip.overlay);
                    const clipPlanningHashtags =
                      collectPlanningHashtags(contentCalendarByClipId.get(clip.id) ?? []);
                    const effectiveExportSettings =
                      clip.export_settings ?? selectedPodcast?.export_settings ?? null;
                    const previewUrl = buildAuthenticatedBackendUrl(
                      clip.video_url ?? "",
                      backendToken,
                    );
                    const isLocalSubtitle = !clip.subtitle_url || /^[A-Za-z]:[\/]/.test(clip.subtitle_url) || !clip.subtitle_url.startsWith("http");
                    const subtitlePreviewUrl = buildAuthenticatedBackendUrl(
                      isLocalSubtitle ? `/podcasts/clips/${clip.id}/subtitles` : (clip.subtitle_url ?? ""),
                      backendToken
                    );
                    const previewAspectRatio = getPreviewAspectRatio(
                      effectiveExportSettings,
                    );
                    const audioFeedback = getAudioEnhancementFeedback({
                      audioEnhancement: effectiveExportSettings?.audio_enhancement ?? null,
                      clipStatus: clip.status,
                      context: "clip",
                    });
                    const overlayBadgeColor =
                      overlayState.variant === "enabled" ? t.accent : t.textSub;
                    const overlayBadgeBorder =
                      overlayState.variant === "enabled" ? t.accent : t.borderSub;
                    const overlayBadgeBackground =
                      overlayState.variant === "enabled" ? t.chip : "transparent";
                    const audioBadgeColor =
                      audioFeedback.tone === "enabled"
                        ? t.accent
                        : audioFeedback.tone === "failed"
                          ? t.errorText
                          : t.textSub;
                    const audioBadgeBorder =
                      audioFeedback.tone === "enabled"
                        ? t.accent
                        : audioFeedback.tone === "failed"
                          ? t.errorBd
                          : t.borderSub;
                    const audioBadgeBackground =
                      audioFeedback.tone === "enabled"
                        ? t.chip
                        : audioFeedback.tone === "failed"
                          ? t.errorBg
                          : "transparent";

                    return (
                      <article
                        key={clip.id}
                        className="lift-card ic-premium-card ic-clip-card"
                        style={{
                          borderRadius: 18,
                          overflow: "hidden",
                          border: `1px solid ${t.border}`,
                          background: t.card,
                          alignSelf: "start",
                        }}
                      >
                        <div
                          className="ic-clip-media"
                          style={{
                            position: "relative",
                            background: dark ? "rgba(255,255,255,.025)" : "rgba(246,250,240,.82)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 12,
                            borderBottom: `1px solid ${t.borderSub}`,
                          }}
                        >
                          {clip.topic_matched ? (
                            <div
                              style={{
                                position: "absolute",
                                top: 16,
                                left: 16,
                                zIndex: 10,
                                background: "rgba(0,0,0,0.75)",
                                backdropFilter: "blur(4px)",
                                color: "#fff",
                                padding: "4px 10px",
                                borderRadius: 12,
                                fontSize: 11,
                                fontWeight: 700,
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                border: "1px solid rgba(255,255,255,0.15)",
                                boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                                pointerEvents: "none"
                              }}
                            >
                              <span>🎯</span>
                              <span>Topic Match</span>
                            </div>
                          ) : null}
                          {isPreviewable(previewUrl) ? (
                            <ClipVideoPreview
                              src={previewUrl}
                              subtitleUrl={subtitlePreviewUrl}
                              subtitleText={clip.subtitle_text}
                              subtitleStyle={effectiveExportSettings?.subtitle_style ?? null}
                              aspectRatio={previewAspectRatio}
                              dark={dark}
                            />
                          ) : (
                            <div style={{ textAlign: "center", color: dark ? "rgba(255,255,255,.88)" : "#365130" }}>
                              <PlayCircle size={34} />
                              <div style={{ marginTop: 10, fontWeight: 600 }}>Protected preview</div>
                              <div style={{ marginTop: 6, fontSize: 13, opacity: 0.72 }}>
                                Publish the clip to unlock its authenticated download.
                              </div>
                            </div>
                          )}
                        </div>

                        <div style={{ padding: 16 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12, alignItems: "flex-start" }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 12, color: t.textSub, marginBottom: 6 }}>
                                Clip {clip.clip_number}
                              </div>
                              <div
                                style={{
                                  fontSize: 15,
                                  fontWeight: 800,
                                  color: t.text,
                                  lineHeight: 1.35,
                                  display: "-webkit-box",
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: "vertical",
                                  overflow: "hidden",
                                }}
                              >
                                {clip.podcast_title}
                              </div>
                              <div style={{ fontSize: 12, color: t.textSub, marginTop: 7 }}>
                                {formatTime(clip.clip_start_seconds)} - {formatTime(clip.clip_end_seconds)} / {formatTime(clip.duration_seconds)}
                              </div>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                                <span
                                  style={{
                                    borderRadius: 999,
                                    background: clip.published ? t.chip : "transparent",
                                    border: `1px solid ${clip.published ? t.accent : t.borderSub}`,
                                    color: clip.published ? t.accent : t.textSub,
                                    fontSize: 10,
                                    fontWeight: 700,
                                    letterSpacing: ".08em",
                                    textTransform: "uppercase",
                                    padding: "5px 8px",
                                  }}
                                >
                                  {clip.published ? "Published" : "Private"}
                                </span>
                                <span
                                  style={{
                                    borderRadius: 999,
                                    background: audioBadgeBackground,
                                    border: `1px solid ${audioBadgeBorder}`,
                                    color: audioBadgeColor,
                                    fontSize: 10,
                                    fontWeight: 700,
                                    letterSpacing: ".08em",
                                    textTransform: "uppercase",
                                    padding: "5px 8px",
                                  }}
                                >
                                  {audioFeedback.badge}
                                </span>
                                <span
                                  style={{
                                    borderRadius: 999,
                                    background: overlayBadgeBackground,
                                    border: `1px solid ${overlayBadgeBorder}`,
                                    color: overlayBadgeColor,
                                    fontSize: 10,
                                    fontWeight: 700,
                                    letterSpacing: ".08em",
                                    textTransform: "uppercase",
                                    padding: "5px 8px",
                                  }}
                                >
                                  {overlayState.variant === "enabled" ? "B-roll" : clip.status}
                                </span>
                              </div>
                            </div>
                            <div
                              style={{
                                borderRadius: 14,
                                background: t.chip,
                                color: t.accent,
                                fontWeight: 700,
                                padding: "8px 10px",
                                height: "fit-content",
                                minWidth: 64,
                                textAlign: "center",
                              }}
                            >
                              <div style={{ fontSize: 17, lineHeight: 1 }}>{clip.virality_score.toFixed(1)}</div>
                              <div style={{ marginTop: 5 }} className="ic-score-bar">
                                <div
                                  className="ic-score-fill"
                                  style={{ width: `${Math.min(100, Math.max(0, clip.virality_score))}%` }}
                                />
                              </div>
                            </div>
                          </div>

                          <div style={{ marginTop: 2 }}>
                            <p
                              style={{
                                margin: 0,
                                color: t.textSub,
                                fontSize: 13,
                                lineHeight: 1.65,
                                display: "-webkit-box",
                                WebkitLineClamp: 3,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                              title={clip.subtitle_text}
                            >
                              {clip.subtitle_text}
                            </p>
                          </div>

                          <details
                            style={{
                              marginTop: 14,
                            }}
                            onToggle={(event) => {
                              const target = event.currentTarget;
                              if (target.open && !contentCalendar && !loadingCalendar) {
                                void loadContentCalendar();
                              }
                            }}
                          >
                            <summary
                              style={{
                                cursor: "pointer",
                                borderRadius: 999,
                                border: `1px solid ${t.borderSub}`,
                                background: dark ? "rgba(255,255,255,.025)" : "rgba(255,255,255,.64)",
                                color: t.textSub,
                                padding: "9px 12px",
                                fontSize: 12,
                                fontWeight: 800,
                                listStyle: "none",
                                width: "fit-content",
                              }}
                            >
                              Hashtags
                            </summary>
                          {loadingCalendar && !contentCalendar ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 8, color: t.textSub, fontSize: 12 }}>
                              <Loader2 size={14} className="animate-spin" />
                              Loading AI hashtags...
                            </div>
                          ) : (
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                              {clipPlanningHashtags.length > 0 ? (
                                clipPlanningHashtags.map((hashtag) => (
                                  <span
                                    key={hashtag}
                                    style={{
                                      borderRadius: 999,
                                      border: `1px solid ${t.borderSub}`,
                                      background: "transparent",
                                      color: t.textSub,
                                      fontSize: 11,
                                      fontWeight: 700,
                                      padding: "6px 10px",
                                    }}
                                  >
                                    {hashtag}
                                  </span>
                                ))
                              ) : (
                                <div style={{ fontSize: 12, color: t.textSub, lineHeight: 1.65 }}>
                                  No hashtags are available yet for this clip.
                                </div>
                              )}
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleCopyPlanning(clipPlanningHashtags.join(" "), "Hashtags")}
                            disabled={clipPlanningHashtags.length === 0}
                            style={{
                              border: `1px solid ${t.borderSub}`,
                              borderRadius: 999,
                              background: "transparent",
                              color: t.textSub,
                              padding: "8px 12px",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              fontWeight: 700,
                              cursor: clipPlanningHashtags.length === 0 ? "default" : "pointer",
                              opacity: clipPlanningHashtags.length === 0 ? 0.65 : 1,
                              width: "fit-content",
                            }}
                          >
                            <Copy size={13} />
                            Copy hashtags
                          </button>
                          </details>

                          {clip.smart_hooks && clip.smart_hooks.length > 0 ? (
                            <div
                              style={{
                                marginTop: 14,
                                borderRadius: 16,
                                background: dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                                border: `1px solid ${t.borderSub}`,
                                padding: "16px 20px",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                                <Lightbulb size={16} color={t.accent} />
                                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: t.text }}>
                                  Smart Hooks
                                </h4>
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                {clip.smart_hooks.map((hook, idx) => (
                                  <div key={idx} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                    <div style={{ flex: 1, fontSize: 13, color: t.textSub, lineHeight: 1.5 }}>
                                      {hook}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => void handleCopyPlanning(hook, "Smart Hook")}
                                      style={{
                                        border: `1px solid ${t.borderSub}`,
                                        borderRadius: 999,
                                        background: "transparent",
                                        color: t.textSub,
                                        padding: "6px 10px",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 6,
                                        fontWeight: 700,
                                        cursor: "pointer",
                                        fontSize: 11,
                                      }}
                                    >
                                      <Copy size={12} />
                                      Copy
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end", marginTop: 16 }}>
                            {clip.published ? (
                              <button
                                type="button"
                                onClick={() => void handleRevoke(clip)}
                                disabled={isRevoking}
                                className="ic-premium-card"
                                style={{
                                  border: `1px solid ${t.border}`,
                                  borderRadius: 14,
                                  background: "transparent",
                                  color: t.text,
                                  padding: "10px 14px",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 8,
                                  fontWeight: 700,
                                  cursor: isRevoking ? "default" : "pointer",
                                  opacity: isRevoking ? 0.75 : 1,
                                }}
                              >
                                {isRevoking ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                                {isRevoking ? "Making private..." : "Revoke"}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void handlePublish(clip)}
                                disabled={isPublishing}
                                className="ic-action"
                                style={{
                                  border: "none",
                                  borderRadius: 14,
                                  background: `linear-gradient(135deg, ${t.accent}, ${t.accentLt})`,
                                  color: "#fff",
                                  padding: "10px 14px",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 8,
                                  fontWeight: 700,
                                  cursor: isPublishing ? "default" : "pointer",
                                  opacity: isPublishing ? 0.75 : 1,
                                }}
                              >
                                {isPublishing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                {isPublishing ? "Publishing..." : "Publish"}
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => void handleDownload(clip)}
                              disabled={isDownloading || !clip.published}
                              className="ic-action"
                              style={{
                                border: "none",
                                borderRadius: 14,
                                background: dark ? "#20381a" : "#183311",
                                color: "#fff",
                                padding: "10px 14px",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 8,
                                fontWeight: 700,
                                cursor: isDownloading || !clip.published ? "default" : "pointer",
                                opacity: isDownloading || !clip.published ? 0.6 : 1,
                              }}
                            >
                              {isDownloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                              {isDownloading ? "Starting..." : "Download"}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
                </div>
              ) : mode === "generate" ? null : (
                <section
                  style={{
                    borderRadius: 24,
                    background: t.card,
                    border: `1px solid ${t.border}`,
                    padding: 20,
                  }}
                >
                  <div style={{ fontSize: 10, letterSpacing: ".22em", textTransform: "uppercase", color: t.accentLt, fontWeight: 700, marginBottom: 8 }}>
                    Results workspace
                  </div>
                  <h2
                    style={{
                      fontFamily: "'DM Serif Display',serif",
                      fontStyle: "italic",
                      fontSize: 24,
                      fontWeight: 400,
                      margin: 0,
                    }}
                  >
                    {generating ? "Rendering clips now" : "Results stay out of the way until you need them"}
                  </h2>
                  <p style={{ marginTop: 12, fontSize: 13, color: t.textSub, lineHeight: 1.72, maxWidth: 720 }}>
                    {generating
                      ? "The backend is creating MP4 files with ffmpeg. This can take a few minutes, and the ready clips will appear in Results as soon as they are saved."
                      : clips.length > 0
                      ? "Generated clips are ready. Open the results view for previews, planning, publishing, and download actions."
                      : "Generate clips first, then switch to the results view for previews, planning, publishing, and download actions. This keeps the main screen cleaner while you set things up."}
                  </p>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
                  <button
                    type="button"
                    onClick={() => {
                      void handleGenerateClips();
                    }}
                      disabled={!selectedPodcastId || generating || loadingClips}
                      style={{
                        border: "none",
                        borderRadius: 999,
                        background: `linear-gradient(135deg, ${t.accent}, ${t.accentLt})`,
                        color: "#fff",
                        padding: "12px 18px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        fontWeight: 700,
                        cursor: !selectedPodcastId || generating || loadingClips ? "default" : "pointer",
                        opacity: !selectedPodcastId || generating || loadingClips ? 0.72 : 1,
                      }}
                    >
                    {generating ? <Loader2 size={16} className="animate-spin" /> : clips.length > 0 ? <CheckCircle2 size={16} /> : <Wand2 size={16} />}
                    {generating ? "Rendering clips..." : clips.length > 0 ? "Regenerate clips" : "Generate clips"}
                  </button>
                    <button
                      type="button"
                      onClick={() => setShowAdvancedControls(true)}
                      style={{
                        border: `1px solid ${t.borderSub}`,
                        borderRadius: 999,
                        background: "transparent",
                        color: t.textSub,
                        padding: "12px 16px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Open advanced controls
                    </button>
                  </div>
                </section>
              )}
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}

export default function ClipsPage() {
  return (
    <Suspense fallback={null}>
      <ClipsPageContent mode="generate" />
    </Suspense>
  );
}







