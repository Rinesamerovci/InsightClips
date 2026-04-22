"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Clapperboard,
  Download,
  Film,
  Loader2,
  Moon,
  PlayCircle,
  Sparkles,
  SunMedium,
  Wand2,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import {
  downloadClip,
  generateClips,
  getClips,
  getJson,
  publishClips,
  revokeClipDownload,
  type ClipGenerationResult,
  type ClipResult,
  type Podcast,
  type PodcastsResponse,
} from "@/lib/api";

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
    errorBg: "rgba(82,24,24,.72)",
    errorBd: "rgba(170,84,84,.34)",
    errorText: "#efaaaa",
    chip: "rgba(90,158,58,.12)",
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
    errorBg: "rgba(255,238,238,.88)",
    errorBd: "rgba(215,165,165,.5)",
    errorText: "#9d3a3a",
    chip: "rgba(90,158,58,.08)",
  },
};

function formatTime(seconds: number): string {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remaining = totalSeconds % 60;
  return `${minutes}:${remaining.toString().padStart(2, "0")}`;
}

function isPreviewable(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export default function ClipsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { backendToken, loading: authLoading, syncBackendSession } = useAuth();

  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [selectedPodcastId, setSelectedPodcastId] = useState<string>("");
  const [clipsResult, setClipsResult] = useState<ClipGenerationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingClips, setLoadingClips] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [downloadingClipId, setDownloadingClipId] = useState<string>("");
  const [publishingClipIds, setPublishingClipIds] = useState<string[]>([]);
  const [revokingClipIds, setRevokingClipIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [dark, setDark] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(1280);

  const t = dark ? T.dark : T.light;
  const isMobile = viewportWidth < 960;
  const selectedPodcast = podcasts.find((podcast) => podcast.id === selectedPodcastId) ?? null;
  const clipCount = clipsResult?.total_clips_generated ?? 0;
  const averageScore = useMemo(() => {
    if (!clipsResult?.clips.length) {
      return 0;
    }
    const total = clipsResult.clips.reduce((sum, clip) => sum + clip.virality_score, 0);
    return total / clipsResult.clips.length;
  }, [clipsResult]);

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

    const load = async () => {
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
            ["done", "ready_for_processing", "processing"].includes(podcast.status)
          ) ??
          podcastsResponse.podcasts[0];

        if (preferredPodcast) {
          setSelectedPodcastId(preferredPodcast.id);
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load your podcasts.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [authLoading, backendToken, router, searchParams, syncBackendSession]);

  useEffect(() => {
    if (!selectedPodcastId || authLoading) {
      return;
    }

    const loadClips = async () => {
      setLoadingClips(true);
      try {
        const token = backendToken ?? (await syncBackendSession());
        if (!token) {
          router.replace("/login");
          return;
        }

        const result = await getClips(selectedPodcastId, token);
        setClipsResult(result);
        setError("");
      } catch (loadError) {
        setClipsResult(null);
        if (loadError instanceof Error && loadError.message.includes("No clips have been generated")) {
          setError("");
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "Unable to load clips.");
      } finally {
        setLoadingClips(false);
      }
    };

    void loadClips();
  }, [authLoading, backendToken, router, selectedPodcastId, syncBackendSession]);

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

      const result = await generateClips(selectedPodcastId, token);
      setClipsResult(result);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Clip generation failed.");
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async (clip: ClipResult) => {
    setDownloadingClipId(clip.id);
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
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Clip download failed.");
    } finally {
      setDownloadingClipId("");
    }
  };

  const handlePublish = async (clip: ClipResult) => {
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

      setClipsResult((current) => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          clips: current.clips.map((item) =>
            item.id === clip.id
              ? {
                  ...item,
                  published: publication.published,
                  download_url: publication.download_url ?? null,
                  published_at: publication.published_at ?? null,
                }
              : item
          ),
        };
      });
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Clip publish failed.");
    } finally {
      setPublishingClipIds((current) => current.filter((item) => item !== clip.id));
    }
  };

  const handleRevoke = async (clip: ClipResult) => {
    setRevokingClipIds((current) => [...current, clip.id]);
    setError("");
    try {
      const token = backendToken ?? (await syncBackendSession());
      if (!token) {
        router.replace("/login");
        return;
      }

      const result = await revokeClipDownload(clip.id, token);
      setClipsResult((current) => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          clips: current.clips.map((item) =>
            item.id === clip.id
              ? {
                  ...item,
                  published: result.published,
                  download_url: null,
                  published_at: null,
                }
              : item
          ),
        };
      });
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "Clip revoke failed.");
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
        @keyframes shimmer { 0%{background-position:220% center} 100%{background-position:-220% center} }
        .orbA { animation: floatOrb 16s ease-in-out infinite; }
        .orbB { animation: floatOrb 22s -5s ease-in-out infinite; }
        .shimmer {
          background: linear-gradient(90deg, ${t.text} 0%, ${t.accent} 35%, ${t.accentLt} 55%, ${t.text} 100%);
          background-size: 220% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer 4s linear infinite;
        }
      `}</style>

      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
        }}
      >
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

      <div style={{ position: "relative", zIndex: 1, maxWidth: 1320, margin: "0 auto", padding: "30px 22px 64px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
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
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.4fr) 320px", gap: 22, alignItems: "stretch" }}>
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
                Final Output Stage
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
                Browse, preview, and download your <span className="shimmer">best moments.</span>
              </h1>
              <p style={{ fontSize: 15, lineHeight: 1.8, color: t.textSub, maxWidth: 700 }}>
                Pick a processed podcast, regenerate cleaner clips when needed, and manage subtitle-burned exports from one polished workspace.
              </p>
            </div>

            <div
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
                { label: "Podcasts", value: podcasts.length, sub: "ready for clip review" },
                { label: "Clips Ready", value: clipCount, sub: "available now" },
                { label: "Avg Score", value: clipCount ? averageScore.toFixed(1) : "0.0", sub: "virality average" },
              ].map((item) => (
                <div key={item.label}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".2em", textTransform: "uppercase", color: t.textFaint, marginBottom: 4 }}>
                    {item.label}
                  </div>
                  <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 32, fontStyle: "italic", lineHeight: 1, marginBottom: 4 }}>
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
          }}
        >
          <aside
            style={{
              borderRadius: 24,
              background: t.card,
              border: `1px solid ${t.border}`,
              padding: 18,
              minHeight: 520,
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
                No podcasts yet. Upload one first, then come back here to generate your clips.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
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
                      <div style={{ fontWeight: 700, marginBottom: 6, lineHeight: 1.4 }}>{podcast.title}</div>
                      <div style={{ fontSize: 13, color: t.textSub }}>
                        {formatTime(podcast.duration)} • {podcast.status.replaceAll("_", " ")}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </aside>

          <main
            style={{
              borderRadius: 24,
              background: t.card,
              border: `1px solid ${t.border}`,
              padding: 20,
              animation: "slideUp .55s .14s cubic-bezier(.22,1,.36,1) both",
            }}
          >
            {selectedPodcast ? (
              <>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 16,
                    flexWrap: "wrap",
                    alignItems: "center",
                    marginBottom: 20,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: t.textFaint, marginBottom: 6 }}>
                      Selected Podcast
                    </div>
                    <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 34, lineHeight: 1.08, margin: 0 }}>
                      {selectedPodcast.title}
                    </h2>
                    <p style={{ marginTop: 8, color: t.textSub }}>
                      {formatTime(selectedPodcast.duration)} total length
                      {clipsResult?.processing_time_seconds ? ` • generated in ${clipsResult.processing_time_seconds.toFixed(1)}s` : ""}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleGenerateClips()}
                    disabled={generating || loadingClips}
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
                      cursor: generating || loadingClips ? "default" : "pointer",
                      opacity: generating || loadingClips ? 0.72 : 1,
                      boxShadow: `0 14px 30px ${t.accentGlow}`,
                    }}
                  >
                    {generating ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                    {generating ? "Generating clips..." : "Generate clips"}
                  </button>
                </div>

                {loadingClips ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, color: t.textSub, padding: "32px 0" }}>
                    <Loader2 size={20} className="animate-spin" />
                    Loading generated clips...
                  </div>
                ) : clipsResult?.clips.length ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 16 }}>
                    {clipsResult.clips.map((clip) => (
                      <article
                        key={clip.id}
                        style={{
                          borderRadius: 22,
                          overflow: "hidden",
                          border: `1px solid ${t.borderSub}`,
                          background: t.cardAlt,
                        }}
                      >
                        <div
                          style={{
                            minHeight: 180,
                            background: dark
                              ? "linear-gradient(135deg, #152412, #385530)"
                              : "linear-gradient(135deg, #dfead7, #c9ddbd)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {isPreviewable(clip.video_url) ? (
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
                                Download to open this clip locally.
                              </div>
                            </div>
                          )}
                        </div>

                        <div style={{ padding: 16 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
                            <div>
                              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".18em", color: t.textFaint }}>
                                Clip {clip.clip_number}
                              </div>
                              <div style={{ fontSize: 13, color: t.textSub, marginTop: 6 }}>
                                {formatTime(clip.clip_start_seconds)} - {formatTime(clip.clip_end_seconds)}
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
                                  {clip.published ? "Published" : "Unpublished"}
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

                          <p style={{ margin: 0, color: t.text, lineHeight: 1.75, minHeight: 98 }}>
                            {clip.subtitle_text}
                          </p>

                          <div
                            style={{
                              marginTop: 14,
                              borderRadius: 16,
                              border: `1px solid ${t.borderSub}`,
                              background: t.chip,
                              padding: "12px 14px",
                            }}
                          >
                            <div style={{ fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: t.textFaint, marginBottom: 6 }}>
                              Publishing
                            </div>
                            <div style={{ fontSize: 13, color: t.textSub, lineHeight: 1.65 }}>
                              {clip.published
                                ? `This clip is published and has a download route${clip.published_at ? ` since ${new Date(clip.published_at).toLocaleString()}` : ""}.`
                                : "This clip is still private and not yet published for download."}
                            </div>
                          </div>

                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 16 }}>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: t.textSub, fontSize: 13 }}>
                              <Film size={14} />
                              {formatTime(clip.duration_seconds)}
                            </div>

                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                              {clip.published ? (
                                <button
                                  type="button"
                                  onClick={() => void handleRevoke(clip)}
                                  disabled={revokingClipIds.includes(clip.id)}
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
                                    cursor: revokingClipIds.includes(clip.id) ? "default" : "pointer",
                                    opacity: revokingClipIds.includes(clip.id) ? 0.75 : 1,
                                  }}
                                >
                                  {revokingClipIds.includes(clip.id) ? (
                                    <Loader2 size={14} className="animate-spin" />
                                  ) : (
                                    <Wand2 size={14} />
                                  )}
                                  Revoke
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => void handlePublish(clip)}
                                  disabled={publishingClipIds.includes(clip.id)}
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
                                    cursor: publishingClipIds.includes(clip.id) ? "default" : "pointer",
                                    opacity: publishingClipIds.includes(clip.id) ? 0.75 : 1,
                                  }}
                                >
                                  {publishingClipIds.includes(clip.id) ? (
                                    <Loader2 size={14} className="animate-spin" />
                                  ) : (
                                    <Sparkles size={14} />
                                  )}
                                  Publish
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => void handleDownload(clip)}
                                disabled={downloadingClipId === clip.id || !clip.published}
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
                                  cursor: downloadingClipId === clip.id || !clip.published ? "default" : "pointer",
                                  opacity: downloadingClipId === clip.id || !clip.published ? 0.6 : 1,
                                }}
                              >
                                {downloadingClipId === clip.id ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  <Download size={14} />
                                )}
                                Download
                              </button>
                            </div>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div
                    style={{
                      borderRadius: 22,
                      border: `1px dashed ${t.border}`,
                      padding: "44px 26px",
                      textAlign: "center",
                      color: t.textSub,
                    }}
                  >
                    <Clapperboard size={32} style={{ margin: "0 auto 12px" }} />
                    <h3 style={{ margin: 0, fontFamily: "'DM Serif Display', serif", fontSize: 28, color: t.text }}>
                      No generated clips yet
                    </h3>
                    <p style={{ marginTop: 10, lineHeight: 1.8 }}>
                      Generate clips for this podcast to create subtitle-burned MP4 exports ready for preview and download.
                    </p>
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
                  </div>
                )}
              </>
            ) : (
              <div style={{ color: t.textSub, lineHeight: 1.8 }}>
                Select a podcast from the left to view or generate clips.
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
