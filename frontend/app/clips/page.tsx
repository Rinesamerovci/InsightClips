"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Clapperboard,
  Download,
  Loader2,
  Moon,
  PlayCircle,
  Search,
  Sparkles,
  SunMedium,
  Wand2,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import {
  downloadClip,
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
  type Podcast,
  type PodcastsResponse,
} from "@/lib/api";
import {
  buildDiscoveryItem,
  type ClipStatusFilter,
} from "@/lib/clip-insights";

const T = {
  dark: {
    bg: "#070d06",
    shell: "rgba(9,14,8,.88)",
    card: "rgba(13,20,11,.88)",
    cardAlt: "rgba(16,24,13,.95)",
    border: "rgba(60,105,40,.34)",
    borderSub: "rgba(60,105,40,.18)",
    text: "#dff0d8",
    textSub: "rgba(163,210,128,.68)",
    textFaint: "rgba(100,148,72,.42)",
    accent: "#5a9e3a",
    accentLt: "#7ab55c",
    accentGlow: "rgba(90,158,58,.22)",
    chip: "rgba(90,158,58,.12)",
    errorBg: "rgba(82,24,24,.72)",
    errorBd: "rgba(170,84,84,.34)",
    errorText: "#efaaaa",
  },
  light: {
    bg: "#eef6e9",
    shell: "rgba(244,249,239,.94)",
    card: "rgba(255,255,255,.92)",
    cardAlt: "rgba(247,251,242,.95)",
    border: "rgba(140,200,110,.38)",
    borderSub: "rgba(140,200,110,.22)",
    text: "#142210",
    textSub: "rgba(55,100,35,.66)",
    textFaint: "rgba(100,148,72,.52)",
    accent: "#4a8e2a",
    accentLt: "#6aa845",
    accentGlow: "rgba(90,158,58,.18)",
    chip: "rgba(90,158,58,.08)",
    errorBg: "rgba(255,238,238,.88)",
    errorBd: "rgba(215,165,165,.5)",
    errorText: "#9d3a3a",
  },
};

const FILTERS: Array<{ value: ClipStatusFilter; label: string }> = [
  { value: "all", label: "All clips" },
  { value: "published", label: "Published" },
  { value: "unpublished", label: "Private" },
  { value: "ready", label: "Ready" },
  { value: "processing", label: "Processing" },
  { value: "failed", label: "Failed" },
];

function formatTime(seconds: number): string {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remaining = totalSeconds % 60;
  return `${minutes}:${remaining.toString().padStart(2, "0")}`;
}

function formatDate(value?: string | null): string {
  if (!value) {
    return "Not published yet";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not published yet";
  }

  return date.toLocaleString();
}

function truncateText(value: string, maxLength: number): string {
  const normalized = String(value ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ")
    .trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function isPreviewable(url: string): boolean {
  return /^https?:\/\//i.test(url);
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

function ClipsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { backendToken, loading: authLoading, syncBackendSession } = useAuth();

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
  const [downloadingClipId, setDownloadingClipId] = useState("");
  const [publishingClipIds, setPublishingClipIds] = useState<string[]>([]);
  const [revokingClipIds, setRevokingClipIds] = useState<string[]>([]);

  const t = dark ? T.dark : T.light;
  const isMobile = viewportWidth < 960;
  const selectedPodcast =
    podcasts.find((podcast) => podcast.id === selectedPodcastId) ?? null;
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

  const publishedCount = clips.filter((clip) => clip.published).length;
  const overlayEnabledCount = clips.filter(
    (clip) => (clip.overlay?.rendered ?? clip.overlay?.applied) === true,
  ).length;
  const averageScore =
    clips.length > 0
      ? clips.reduce((sum, clip) => sum + clip.virality_score, 0) / clips.length
      : 0;

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("insightclips-theme");
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

    window.localStorage.setItem("insightclips-theme", dark ? "dark" : "light");
  }, [dark, mounted]);

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
    if (!selectedPodcastId || !selectedPodcast) {
      return;
    }

    if (!activeSearch) {
      setSearchResults(toDiscoveryClips(clips, selectedPodcast));
      setSearchEstimated(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const runSearch = async () => {
        setSearching(true);
        try {
          const token = backendToken ?? (await syncBackendSession());
          if (!token || controller.signal.aborted) {
            return;
          }

          const result = await searchClips(
            {
              query: searchQuery,
              podcastId: selectedPodcastId,
              status: filter,
            },
            token,
          );

          if (controller.signal.aborted) {
            return;
          }

          setSearchResults(result.clips);
          setSearchEstimated(Boolean(result.estimated));
        } catch (searchError) {
          if (!controller.signal.aborted) {
            setError(
              searchError instanceof Error
                ? searchError.message
                : "Unable to search clips.",
            );
          }
        } finally {
          if (!controller.signal.aborted) {
            setSearching(false);
          }
        }
      };

      void runSearch();
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [
    activeSearch,
    backendToken,
    clips,
    filter,
    searchQuery,
    selectedPodcast,
    selectedPodcastId,
    syncBackendSession,
  ]);

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

  const handleGenerateClips = async () => {
    if (!selectedPodcastId) {
      return;
    }

    setGenerating(true);
    setError("");
    try {
      const token = backendToken ?? (await syncBackendSession());
      if (!token) {
        router.replace("/login");
        return;
      }

      const [generated, recommended] = await Promise.all([
        generateClips(selectedPodcastId, token),
        getRecommendations(selectedPodcastId, token).catch(() => null),
      ]);

      setClips(generated.clips);
      setSearchResults(
        selectedPodcast ? toDiscoveryClips(generated.clips, selectedPodcast) : [],
      );
      if (recommended) {
        setRecommendations(recommended.recommendations);
        setRecommendationsEstimated(Boolean(recommended.estimated));
      }
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "Clip generation failed.",
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async (clip: ClipSearchResult | ClipResult) => {
    setDownloadingClipId(clip.id);
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
      } catch (fallbackError) {
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

    setPublishingClipIds((current) => [...current, clip.id]);
    setError("");
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
    } catch (publishError) {
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
    } catch (revokeError) {
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
                Clip Discovery
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
                Search, publish, and ship your strongest moments.
              </h1>
              <p style={{ fontSize: 15, lineHeight: 1.8, color: t.textSub, maxWidth: 700 }}>
                This board brings clip discovery, publish controls, and recommendation signals into one workflow for Sprint 4.
              </p>
            </div>

            <div
              className="lift-card"
              style={{
                borderRadius: 24,
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

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "320px minmax(0, 1fr)",
            gap: 20,
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

            <section
              className="lift-card"
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
                <div style={{ color: t.textSub, lineHeight: 1.75 }}>
                  Recommendations will appear here after clips are generated for the selected podcast.
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
          </aside>

          <main
            style={{
              display: "grid",
              gap: 18,
              animation: "slideUp .55s .14s cubic-bezier(.22,1,.36,1) both",
            }}
          >
            <section
              style={{
                borderRadius: 24,
                background: t.card,
                border: `1px solid ${t.border}`,
                padding: 20,
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
                    Selected Podcast
                  </div>
                  <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 34, lineHeight: 1.08, margin: 0 }}>
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
                  onClick={() => void handleGenerateClips()}
                  disabled={!selectedPodcastId || generating || loadingClips}
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
                    cursor: !selectedPodcastId || generating || loadingClips ? "default" : "pointer",
                    opacity: !selectedPodcastId || generating || loadingClips ? 0.72 : 1,
                    boxShadow: `0 14px 30px ${t.accentGlow}`,
                  }}
                >
                  {generating ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                  {generating ? "Generating clips..." : "Generate clips"}
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.2fr) auto",
                  gap: 14,
                }}
              >
                <div
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
                      style={{
                        border: "none",
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
                      ? "Search is powered by the clip discovery API."
                      : "Browsing the full generated clip list."}
                </span>
              </div>
            </section>

            <section
              style={{
                borderRadius: 24,
                background: t.card,
                border: `1px solid ${t.border}`,
                padding: 20,
              }}
            >
              {loadingClips ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, color: t.textSub, padding: "32px 0" }}>
                  <Loader2 size={20} className="animate-spin" />
                  Loading generated clips...
                </div>
              ) : !selectedPodcast ? (
                <div style={{ color: t.textSub, lineHeight: 1.8 }}>
                  Select a podcast from the left to view its clip dashboard.
                </div>
              ) : visibleClips.length === 0 ? (
                <div
                  style={{
                    borderRadius: 22,
                    border: `1px dashed ${t.border}`,
                    padding: "48px 26px",
                    textAlign: "center",
                    color: t.textSub,
                  }}
                >
                  <Clapperboard size={32} style={{ margin: "0 auto 12px" }} />
                  <h3 style={{ margin: 0, fontFamily: "'DM Serif Display', serif", fontSize: 28, color: t.text }}>
                    {clips.length === 0 ? "No generated clips yet" : "No clips match this search"}
                  </h3>
                  <p style={{ marginTop: 10, lineHeight: 1.8 }}>
                    {clips.length === 0
                      ? "Generate clips for this podcast to unlock discovery, recommendations, and publish actions."
                      : "Try another search or filter to surface different clip candidates."}
                  </p>
                  {clips.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => void handleGenerateClips()}
                      disabled={generating}
                      style={{
                        marginTop: 18,
                        border: "none",
                        borderRadius: 999,
                        background: `linear-gradient(135deg, ${t.accent}, ${t.accentLt})`,
                        color: "#fff",
                        padding: "12px 18px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        fontWeight: 700,
                        cursor: generating ? "default" : "pointer",
                        opacity: generating ? 0.7 : 1,
                      }}
                    >
                      {generating ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                      Generate now
                    </button>
                  ) : null}
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                    gap: 16,
                    alignItems: "start",
                  }}
                >
                  {visibleClips.map((clip) => {
                    const isPublishing = publishingClipIds.includes(clip.id);
                    const isRevoking = revokingClipIds.includes(clip.id);
                    const isDownloading = downloadingClipId === clip.id;
                    const overlayState = getOverlayState(clip.overlay);
                    const overlayBadgeColor =
                      overlayState.variant === "enabled" ? t.accent : t.textSub;
                    const overlayBadgeBorder =
                      overlayState.variant === "enabled" ? t.accent : t.borderSub;
                    const overlayBadgeBackground =
                      overlayState.variant === "enabled" ? t.chip : "transparent";

                    return (
                      <article
                        key={clip.id}
                        className="lift-card"
                        style={{
                          borderRadius: 22,
                          overflow: "hidden",
                          border: `1px solid ${t.borderSub}`,
                          background: t.cardAlt,
                          alignSelf: "start",
                        }}
                      >
                        <div
                          style={{
                            minHeight: 190,
                            background: dark
                              ? "linear-gradient(135deg, #152412, #385530)"
                              : "linear-gradient(135deg, #dfead7, #c9ddbd)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {isPreviewable(clip.video_url ?? "") ? (
                            <video
                              controls
                              preload="metadata"
                              src={clip.video_url}
                              style={{ width: "100%", height: 220, objectFit: "cover" }}
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
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
                            <div>
                              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".18em", color: t.textFaint }}>
                                {clip.podcast_title} / Clip {clip.clip_number}
                              </div>
                              <div style={{ fontSize: 13, color: t.textSub, marginTop: 6 }}>
                                {formatTime(clip.clip_start_seconds)} - {formatTime(clip.clip_end_seconds)} / {formatTime(clip.duration_seconds)}
                              </div>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                                <span
                                  style={{
                                    borderRadius: 999,
                                    background: clip.published ? t.chip : "transparent",
                                    border: `1px solid ${clip.published ? t.accent : t.borderSub}`,
                                    color: clip.published ? t.accent : t.textSub,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    letterSpacing: ".1em",
                                    textTransform: "uppercase",
                                    padding: "6px 10px",
                                  }}
                                >
                                  {clip.published ? "Published" : "Private"}
                                </span>
                                <span
                                  style={{
                                    borderRadius: 999,
                                    background: overlayBadgeBackground,
                                    border: `1px solid ${overlayBadgeBorder}`,
                                    color: overlayBadgeColor,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    letterSpacing: ".1em",
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
                                      letterSpacing: ".1em",
                                      textTransform: "uppercase",
                                      padding: "6px 10px",
                                    }}
                                  >
                                    {overlayState.category}
                                  </span>
                                ) : null}
                                <span
                                  style={{
                                    borderRadius: 999,
                                    background: "transparent",
                                    border: `1px solid ${t.borderSub}`,
                                    color: t.textSub,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    letterSpacing: ".1em",
                                    textTransform: "uppercase",
                                    padding: "6px 10px",
                                  }}
                                >
                                  {clip.status}
                                </span>
                              </div>
                            </div>
                            <div
                              style={{
                                borderRadius: 999,
                                background: t.chip,
                                color: t.accent,
                                fontWeight: 700,
                                padding: "8px 10px",
                                height: "fit-content",
                              }}
                            >
                              {clip.virality_score.toFixed(1)}
                            </div>
                          </div>

                          <div style={{ marginTop: 2 }}>
                            <div
                              style={{
                                fontSize: 11,
                                letterSpacing: ".16em",
                                textTransform: "uppercase",
                                color: t.textFaint,
                                marginBottom: 8,
                              }}
                            >
                              Clip Preview
                            </div>
                            <p
                              style={{
                                margin: 0,
                                color: t.text,
                                lineHeight: 1.7,
                                display: "-webkit-box",
                                WebkitLineClamp: 5,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                              title={clip.subtitle_text}
                            >
                              {clip.subtitle_text}
                            </p>
                          </div>

                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                              gap: 12,
                              marginTop: 14,
                            }}
                          >
                            <div
                              style={{
                                borderRadius: 16,
                                border: `1px solid ${t.borderSub}`,
                                background: t.chip,
                                padding: "12px 14px",
                              }}
                            >
                              <div style={{ fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: t.textFaint, marginBottom: 6 }}>
                                Publish State
                              </div>
                              <div style={{ fontSize: 13, color: t.textSub, lineHeight: 1.65 }}>
                                {clip.published
                                  ? `Published ${formatDate(clip.published_at)}.`
                                  : "Private. Publish to enable downloads."}
                              </div>
                              {clip.match_reason ? (
                                <div style={{ marginTop: 8, fontSize: 12, color: t.textSub }}>
                                  Search: {clip.match_reason}
                                </div>
                              ) : null}
                            </div>

                            <div
                              style={{
                                borderRadius: 16,
                                border: `1px solid ${t.borderSub}`,
                                background: overlayState.variant === "enabled" ? t.chip : "transparent",
                                padding: "12px 14px",
                              }}
                            >
                              <div style={{ fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: t.textFaint, marginBottom: 6 }}>
                                Overlay Status
                              </div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: overlayState.variant === "enabled" ? t.accent : t.text, lineHeight: 1.55 }}>
                                {overlayState.title}
                              </div>
                              <div style={{ marginTop: 4, fontSize: 13, color: t.textSub, lineHeight: 1.65 }}>
                                {overlayState.description}
                              </div>
                              {overlayState.keyword || overlayState.category || overlayState.asset ? (
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                                  {overlayState.keyword ? (
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
                                      Keyword: {overlayState.keyword}
                                    </span>
                                  ) : null}
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
                                      Category: {overlayState.category}
                                    </span>
                                  ) : null}
                                  {overlayState.asset ? (
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
                                      Asset: {overlayState.asset}
                                    </span>
                                  ) : null}
                                </div>
                              ) : null}
                              {overlayState.matchedText ? (
                                <div
                                  style={{
                                    marginTop: 8,
                                    fontSize: 12,
                                    color: t.textSub,
                                    lineHeight: 1.6,
                                    display: "-webkit-box",
                                    WebkitLineClamp: 3,
                                    WebkitBoxOrient: "vertical",
                                    overflow: "hidden",
                                  }}
                                  title={overlayState.matchedText}
                                >
                                  Matched text: {truncateText(overlayState.matchedText, 120)}
                                </div>
                              ) : null}
                            </div>
                          </div>

                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end", marginTop: 16 }}>
                            {clip.published ? (
                              <button
                                type="button"
                                onClick={() => void handleRevoke(clip)}
                                disabled={isRevoking}
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
                                Revoke
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void handlePublish(clip)}
                                disabled={isPublishing}
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
                                Publish
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => void handleDownload(clip)}
                              disabled={isDownloading || !clip.published}
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
                              Download
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
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
      <ClipsPageContent />
    </Suspense>
  );
}
