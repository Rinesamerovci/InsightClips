"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  BarChart2,
  ChevronDown,
  Loader2,
  Moon,
  Sparkles,
  SunMedium,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import {
  getClipMetrics,
  getJson,
  type Podcast,
  type PodcastClipMetrics,
  type PodcastsResponse,
} from "@/lib/api";
import {
  AnalyticsMetricsDisplay,
  buildAnalyticsSnapshot,
  formatAnalyticsChange,
} from "@/lib/analytics-presentation";
import { studioTheme, THEME_STORAGE_KEY } from "@/lib/brand";

const T = studioTheme;

let cachedAnalyticsUserId: string | null = null;
let cachedAnalyticsPodcasts: Podcast[] | null = null;
let cachedAnalyticsMetrics: PodcastClipMetrics | null = null;
let cachedAnalyticsSelectedId: string | null = null;

function AnalyticsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, backendToken, loading: authLoading, syncBackendSession } = useAuth();

  const isCacheValid = Boolean(user?.id && user.id === cachedAnalyticsUserId);

  const [mounted, setMounted] = useState(false);
  const [dark, setDark] = useState(true);
  const [viewportWidth, setViewportWidth] = useState(1280);
  const [loading, setLoading] = useState(!isCacheValid || !cachedAnalyticsPodcasts);
  const [loadingMetrics, setLoadingMetrics] = useState(!isCacheValid || !cachedAnalyticsMetrics);
  const [error, setError] = useState("");
  const [podcasts, setPodcasts] = useState<Podcast[]>(isCacheValid ? (cachedAnalyticsPodcasts ?? []) : []);
  const [selectedPodcastId, setSelectedPodcastId] = useState(isCacheValid ? (cachedAnalyticsSelectedId ?? "") : "");
  const [metrics, setMetrics] = useState<PodcastClipMetrics | null>(isCacheValid ? cachedAnalyticsMetrics : null);

  const t = dark ? T.dark : T.light;
  const isMobile = viewportWidth < 960;
  const selectedPodcast =
    podcasts.find((podcast) => podcast.id === selectedPodcastId) ?? null;

  const analyticsSnapshot = useMemo(() => buildAnalyticsSnapshot(metrics), [metrics]);
  const topClip = analyticsSnapshot.topClip;
  const publishRate = analyticsSnapshot.publishRate;

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
    if (authLoading) {
      return;
    }

    const loadPodcasts = async () => {
      if (!isCacheValid || !cachedAnalyticsPodcasts) setLoading(true);
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

        const newSelectedId = preferredPodcast?.id ?? "";
        setSelectedPodcastId(newSelectedId);
        
        cachedAnalyticsUserId = user?.id ?? null;
        cachedAnalyticsPodcasts = podcastsResponse.podcasts;
        cachedAnalyticsSelectedId = newSelectedId;
        
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
      if (!isCacheValid || !cachedAnalyticsMetrics || cachedAnalyticsSelectedId !== selectedPodcastId) {
          setLoadingMetrics(true);
      }
      try {
        const token = backendToken ?? (await syncBackendSession());
        if (!token) {
          router.replace("/login");
          return;
        }

        const result = await getClipMetrics(selectedPodcastId, token);
        cachedAnalyticsMetrics = result;
        cachedAnalyticsSelectedId = selectedPodcastId;
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
          className="ic-premium-card"
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
                This analytics board shows the selected podcast&apos;s downloads, click trend, and top clip performance so publishing decisions stay visible.
              </p>

              {podcasts.length > 0 && (
                <div style={{ marginTop: 24 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: t.accent, marginBottom: 8 }}>
                    Select Podcast
                  </div>
                  <div style={{ position: "relative", maxWidth: 400 }}>
                    <select
                      value={selectedPodcastId}
                      onChange={(e) => {
                        setSelectedPodcastId(e.target.value);
                        router.push(`/analytics?podcastId=${e.target.value}`);
                      }}
                      style={{
                        width: "100%",
                        padding: "12px 44px 12px 16px",
                        borderRadius: 14,
                        border: "none",
                        background: `linear-gradient(135deg, ${t.accent}, ${t.accentLt})`,
                        color: "#fff",
                        fontSize: 15,
                        fontWeight: 600,
                        outline: "none",
                        cursor: "pointer",
                        appearance: "none",
                        boxShadow: `0 8px 24px ${t.accentGlow}`,
                      }}
                    >
                      {podcasts.map((p) => (
                        <option key={p.id} value={p.id} style={{ background: t.card, color: t.text }}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                    {/* Custom arrow indicator */}
                    <div style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#fff", display: "flex", alignItems: "center" }}>
                      <ChevronDown size={22} strokeWidth={2.5} />
                    </div>
                  </div>
                </div>
              )}
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
                { label: "Top Downloads", value: topClip?.downloads ?? 0, sub: "best clip reach" },
                { label: "Downloads", value: metrics?.total_downloads ?? 0, sub: "selected podcast total" },
                { label: "Trend", value: formatAnalyticsChange(metrics?.average_click_trend ?? 0), sub: "average click change" },
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
            gridTemplateColumns: "1fr",
            gap: 20,
            marginTop: 22,
          }}
        >
          <aside style={{ display: "none" }}>
            <section
              className="ic-premium-card"
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
              className="lift-card ic-premium-card"
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
                  `${publishRate}% of this podcast's clips are currently published.`,
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
              className="ic-premium-card"
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
                    ? `${metrics.total_clips} total clips / ${metrics.published_clips} published / ${metrics.total_downloads} downloads`
                      : "Select a podcast and load metrics to begin."}
                  </p>
                </div>
                {selectedPodcast ? (
                  <Link
                    href={`/clips/generated?podcastId=${selectedPodcast.id}`}
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

              <AnalyticsMetricsDisplay
                isMobile={isMobile}
                loadingMetrics={loadingMetrics}
                metrics={metrics}
                theme={{
                  card: t.card,
                  cardAlt: t.cardAlt,
                  border: t.border,
                  borderSub: t.borderSub,
                  text: t.text,
                  textSub: t.textSub,
                  textFaint: t.textFaint,
                  accent: t.accent,
                  chip: t.chip,
                  errorText: t.errorText,
                }}
              />
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={null}>
      <AnalyticsPageContent />
    </Suspense>
  );
}

