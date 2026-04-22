"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  BarChart2,
  Download,
  Eye,
  Loader2,
  Moon,
  Sparkles,
  SunMedium,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import {
  getClipMetrics,
  getJson,
  type Podcast,
  type PodcastClipMetrics,
  type PodcastsResponse,
} from "@/lib/api";

const T = {
  dark: {
    bg: "#070d06",
    shell: "rgba(9,14,8,.88)",
    card: "rgba(13,20,11,.88)",
    cardAlt: "rgba(16,24,13,.94)",
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

function formatChange(value: number): string {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)}%`;
}

export default function AnalyticsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { backendToken, loading: authLoading, syncBackendSession } = useAuth();

  const [mounted, setMounted] = useState(false);
  const [dark, setDark] = useState(true);
  const [viewportWidth, setViewportWidth] = useState(1280);
  const [loading, setLoading] = useState(true);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [error, setError] = useState("");
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [selectedPodcastId, setSelectedPodcastId] = useState("");
  const [metrics, setMetrics] = useState<PodcastClipMetrics | null>(null);

  const t = dark ? T.dark : T.light;
  const isMobile = viewportWidth < 960;
  const selectedPodcast =
    podcasts.find((podcast) => podcast.id === selectedPodcastId) ?? null;

  const topClip = metrics?.top_clips[0] ?? null;
  const totalVisibility = useMemo(
    () => (metrics ? metrics.total_views + metrics.total_downloads : 0),
    [metrics],
  );

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
          podcastsResponse.podcasts.find((podcast) => podcast.status === "done") ??
          podcastsResponse.podcasts[0];

        setSelectedPodcastId(preferredPodcast?.id ?? "");
        setError("");
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load analytics.",
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

    const loadMetrics = async () => {
      setLoadingMetrics(true);
      try {
        const token = backendToken ?? (await syncBackendSession());
        if (!token) {
          router.replace("/login");
          return;
        }

        const result = await getClipMetrics(selectedPodcastId, token);
        setMetrics(result);
        setError("");
      } catch (metricsError) {
        setMetrics(null);
        setError(
          metricsError instanceof Error
            ? metricsError.message
            : "Unable to load clip metrics.",
        );
      } finally {
        setLoadingMetrics(false);
      }
    };

    void loadMetrics();
  }, [authLoading, backendToken, router, selectedPodcastId, syncBackendSession]);

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
        position: "relative",
        overflow: "hidden",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display:ital@0;1&display=swap');
        * { box-sizing: border-box; }
        @keyframes floatOrb { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(24px,-16px) scale(1.04)} }
        @keyframes slideUp { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        .orbA { animation: floatOrb 16s ease-in-out infinite; }
        .orbB { animation: floatOrb 22s -4s ease-in-out infinite; }
        .lift-card { transition: transform .25s cubic-bezier(.22,1,.36,1), box-shadow .25s, border-color .25s; }
        .lift-card:hover { transform: translateY(-3px); box-shadow: 0 18px 40px ${t.accentGlow}; border-color: ${t.border}; }
      `}</style>

      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
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
              href="/clips"
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
              Clips
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

          <Link
            href="/clips"
            style={{
              borderRadius: 999,
              background: `linear-gradient(135deg, ${t.accent}, ${t.accentLt})`,
              color: "#fff",
              padding: "12px 18px",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontWeight: 700,
              textDecoration: "none",
              boxShadow: `0 14px 34px ${t.accentGlow}`,
            }}
          >
            <Sparkles size={16} />
            Open clip dashboard
          </Link>
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
                <BarChart2 size={14} />
                Performance Overview
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
                Track clip performance and ranking by podcast.
              </h1>
              <p style={{ fontSize: 15, lineHeight: 1.8, color: t.textSub, maxWidth: 700 }}>
                This analytics board shows the selected podcast&apos;s views, downloads, click trend, and top clip performance so publishing decisions stay visible.
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
                { label: "Podcasts", value: podcasts.length, sub: "available in analytics" },
                { label: "Top Views", value: topClip?.views ?? 0, sub: "best clip reach" },
                { label: "Downloads", value: metrics?.total_downloads ?? 0, sub: "selected podcast total" },
                { label: "Trend", value: formatChange(metrics?.average_click_trend ?? 0), sub: "average click change" },
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
          }}
        >
          <aside style={{ display: "grid", gap: 18, alignSelf: "start" }}>
            <section
              style={{
                borderRadius: 24,
                background: t.card,
                border: `1px solid ${t.border}`,
                padding: 18,
              }}
            >
              <div style={{ fontSize: 11, letterSpacing: ".2em", textTransform: "uppercase", color: t.textFaint, marginBottom: 14 }}>
                Podcasts
              </div>

              {loading || authLoading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "48px 0", color: t.textSub }}>
                  <Loader2 size={22} className="animate-spin" />
                </div>
              ) : podcasts.length === 0 ? (
                <div style={{ color: t.textSub, lineHeight: 1.75 }}>
                  No podcasts yet. Upload and generate clips to unlock this view.
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
                        <div style={{ fontWeight: 700, marginBottom: 6, lineHeight: 1.4 }}>
                          {podcast.title}
                        </div>
                        <div style={{ fontSize: 13, color: t.textSub }}>
                          {podcast.status.replaceAll("_", " ")}
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
                Signal Summary
              </div>
              {metrics?.estimated ? (
                <div style={{ color: t.textSub, lineHeight: 1.75 }}>
                  Showing estimated metrics derived from current clip scores while the dedicated metrics endpoint is not available yet.
                </div>
              ) : (
                <div style={{ color: t.textSub, lineHeight: 1.75 }}>
                  Live metrics are powering this view for the selected podcast.
                </div>
              )}
              <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                {[
                  `${metrics?.published_clips ?? 0} published clip${metrics?.published_clips === 1 ? "" : "s"} are currently active.`,
                  `${metrics?.unpublished_clips ?? 0} clip${metrics?.unpublished_clips === 1 ? "" : "s"} are still private.`,
                  topClip
                    ? `Clip ${topClip.clip_number} is the current leader for ${selectedPodcast?.title ?? "this podcast"}.`
                    : "Generate and publish clips to populate ranking insights.",
                ].map((line) => (
                  <div
                    key={line}
                    style={{
                      borderRadius: 16,
                      border: `1px solid ${t.borderSub}`,
                      background: t.cardAlt,
                      padding: 12,
                      color: t.textSub,
                      lineHeight: 1.7,
                    }}
                  >
                    {line}
                  </div>
                ))}
              </div>
            </section>
          </aside>

          <main style={{ display: "grid", gap: 18 }}>
            <section
              style={{
                borderRadius: 24,
                background: t.card,
                border: `1px solid ${t.border}`,
                padding: 20,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
                <div>
                  <div style={{ fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: t.textFaint, marginBottom: 6 }}>
                    Selected Podcast
                  </div>
                  <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 34, lineHeight: 1.08, margin: 0 }}>
                    {selectedPodcast?.title ?? "Choose a podcast"}
                  </h2>
                  <p style={{ marginTop: 8, color: t.textSub }}>
                    {metrics
                      ? `${metrics.total_clips} total clips / ${metrics.published_clips} published / ${metrics.total_views} views`
                      : "Select a podcast and load metrics to begin."}
                  </p>
                </div>
                {selectedPodcast ? (
                  <Link
                    href={`/clips?podcastId=${selectedPodcast.id}`}
                    style={{
                      borderRadius: 999,
                      padding: "11px 16px",
                      background: `linear-gradient(135deg, ${t.accent}, ${t.accentLt})`,
                      color: "#fff",
                      textDecoration: "none",
                      fontWeight: 700,
                    }}
                  >
                    Open clip actions
                  </Link>
                ) : null}
              </div>

              {loadingMetrics ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, color: t.textSub, padding: "32px 0" }}>
                  <Loader2 size={20} className="animate-spin" />
                  Loading clip metrics...
                </div>
              ) : !metrics ? (
                <div style={{ color: t.textSub, lineHeight: 1.8 }}>
                  No metrics yet for this podcast. Generate clips first to populate analytics.
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)", gap: 14 }}>
                  {[
                    { label: "Views", value: metrics.total_views, icon: Eye },
                    { label: "Downloads", value: metrics.total_downloads, icon: Download },
                    { label: "Published", value: metrics.published_clips, icon: Sparkles },
                    {
                      label: "Click Trend",
                      value: formatChange(metrics.average_click_trend),
                      icon: metrics.average_click_trend >= 0 ? TrendingUp : TrendingDown,
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="lift-card"
                      style={{
                        borderRadius: 18,
                        border: `1px solid ${t.borderSub}`,
                        background: t.cardAlt,
                        padding: 16,
                      }}
                    >
                      <item.icon size={18} color={t.accent} />
                      <div style={{ marginTop: 14, fontSize: 10, fontWeight: 700, letterSpacing: ".2em", textTransform: "uppercase", color: t.textFaint }}>
                        {item.label}
                      </div>
                      <div style={{ marginTop: 6, fontFamily: "'DM Serif Display', serif", fontSize: 30, fontStyle: "italic" }}>
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                gap: 18,
              }}
            >
              <div
                className="lift-card"
                style={{
                  borderRadius: 24,
                  background: t.card,
                  border: `1px solid ${t.border}`,
                  padding: 20,
                }}
              >
                <div style={{ fontSize: 11, letterSpacing: ".2em", textTransform: "uppercase", color: t.textFaint, marginBottom: 12 }}>
                  Reach Snapshot
                </div>
                <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 34, lineHeight: 1.04, marginBottom: 8 }}>
                  {totalVisibility}
                </div>
                <div style={{ color: t.textSub, lineHeight: 1.75 }}>
                  Combined views and downloads across the selected podcast&apos;s top clip set.
                </div>
              </div>

              <div
                className="lift-card"
                style={{
                  borderRadius: 24,
                  background: t.card,
                  border: `1px solid ${t.border}`,
                  padding: 20,
                }}
              >
                <div style={{ fontSize: 11, letterSpacing: ".2em", textTransform: "uppercase", color: t.textFaint, marginBottom: 12 }}>
                  Leading Clip
                </div>
                {topClip ? (
                  <>
                    <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, lineHeight: 1.04 }}>
                      Clip {topClip.clip_number}
                    </div>
                    <div style={{ marginTop: 8, color: t.textSub, lineHeight: 1.75 }}>
                      {topClip.title}
                    </div>
                    <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ borderRadius: 999, padding: "7px 10px", background: t.chip, color: t.accent, fontWeight: 700 }}>
                        {topClip.views} views
                      </span>
                      <span style={{ borderRadius: 999, padding: "7px 10px", background: t.cardAlt, border: `1px solid ${t.borderSub}`, color: t.textSub, fontWeight: 700 }}>
                        {topClip.downloads} downloads
                      </span>
                      <span style={{ borderRadius: 999, padding: "7px 10px", background: t.cardAlt, border: `1px solid ${t.borderSub}`, color: t.textSub, fontWeight: 700 }}>
                        {formatChange(topClip.click_trend)}
                      </span>
                    </div>
                  </>
                ) : (
                  <div style={{ color: t.textSub, lineHeight: 1.75 }}>
                    Once metrics are available, the strongest clip will surface here automatically.
                  </div>
                )}
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
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 11, letterSpacing: ".2em", textTransform: "uppercase", color: t.textFaint, marginBottom: 6 }}>
                    Top Clips Table
                  </div>
                  <h3 style={{ margin: 0, fontFamily: "'DM Serif Display', serif", fontSize: 30, lineHeight: 1.05 }}>
                    Views, downloads, and click trends
                  </h3>
                </div>
                {metrics?.estimated ? (
                  <div
                    style={{
                      borderRadius: 999,
                      padding: "10px 14px",
                      background: t.cardAlt,
                      border: `1px solid ${t.borderSub}`,
                      color: t.textSub,
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    Estimated metrics
                  </div>
                ) : null}
              </div>

              {loadingMetrics ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, color: t.textSub, padding: "20px 0" }}>
                  <Loader2 size={18} className="animate-spin" />
                  Building the ranking table...
                </div>
              ) : !metrics || metrics.top_clips.length === 0 ? (
                <div style={{ color: t.textSub, lineHeight: 1.8 }}>
                  No top clips available yet for this podcast.
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: t.textFaint, fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase" }}>
                        <th style={{ padding: "0 0 12px" }}>Clip</th>
                        <th style={{ padding: "0 0 12px" }}>Views</th>
                        <th style={{ padding: "0 0 12px" }}>Downloads</th>
                        <th style={{ padding: "0 0 12px" }}>Click Trend</th>
                        <th style={{ padding: "0 0 12px" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.top_clips.map((clip) => (
                        <tr key={clip.clip_id} style={{ borderTop: `1px solid ${t.borderSub}` }}>
                          <td style={{ padding: "14px 0", verticalAlign: "top" }}>
                            <div style={{ fontWeight: 700 }}>Clip {clip.clip_number}</div>
                            <div style={{ marginTop: 4, color: t.textSub, lineHeight: 1.65 }}>
                              {clip.title}
                            </div>
                          </td>
                          <td style={{ padding: "14px 0", fontWeight: 700 }}>{clip.views}</td>
                          <td style={{ padding: "14px 0", fontWeight: 700 }}>{clip.downloads}</td>
                          <td style={{ padding: "14px 0", fontWeight: 700, color: clip.click_trend >= 0 ? t.accent : t.errorText }}>
                            {formatChange(clip.click_trend)}
                          </td>
                          <td style={{ padding: "14px 0" }}>
                            <span
                              style={{
                                borderRadius: 999,
                                padding: "7px 10px",
                                background: clip.published ? t.chip : t.cardAlt,
                                border: `1px solid ${clip.published ? t.accent : t.borderSub}`,
                                color: clip.published ? t.accent : t.textSub,
                                fontWeight: 700,
                                fontSize: 12,
                              }}
                            >
                              {clip.published ? "Published" : "Private"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
