"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Clapperboard,
  Loader2,
  Moon,
  Radio,
  Search,
  Sparkles,
  SunMedium,
  Waves,
} from "lucide-react";

import { PodcastCard } from "@/components/PodcastCard";
import { useAuth } from "@/context/AuthContext";
import {
  analyzePodcast,
  getJson,
  getPodcastAnalysis,
  type AnalysisSummary,
  type Podcast,
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
  },
};

function fmtDur(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function getEffectivePodcastStatus(
  podcast: Podcast,
  analysis: AnalysisSummary | null | undefined,
  analysisLoading: boolean,
) {
  if (analysisLoading) return "processing";
  if (analysis && analysis.total_scored_segments > 0) return "done";
  return podcast.status;
}

export default function PodcastsPage() {
  const router = useRouter();
  const { backendToken, loading: authLoading, syncBackendSession } = useAuth();

  const [mounted, setMounted] = useState(false);
  const [dark, setDark] = useState(true);
  const [viewportWidth, setViewportWidth] = useState(1280);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [analysisByPodcast, setAnalysisByPodcast] = useState<Record<string, AnalysisSummary | null>>({});
  const [analysisLoadingByPodcast, setAnalysisLoadingByPodcast] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "processing" | "payments" | "done">("all");

  const t = dark ? T.dark : T.light;
  const isMobile = viewportWidth < 900;

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("insightclips-theme");
    if (savedTheme) setDark(savedTheme === "dark");
    const handleResize = () => setViewportWidth(window.innerWidth);
    handleResize();
    window.addEventListener("resize", handleResize);
    setMounted(true);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    window.localStorage.setItem("insightclips-theme", dark ? "dark" : "light");
  }, [dark, mounted]);

  useEffect(() => {
    if (authLoading) return;

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

        const analysisEntries = await Promise.all(
          podcastsResponse.podcasts.map(async (podcast) => {
            try {
              const summary = await getPodcastAnalysis(podcast.id, token);
              return [podcast.id, summary] as const;
            } catch {
              return [podcast.id, null] as const;
            }
          }),
        );

        setAnalysisByPodcast(Object.fromEntries(analysisEntries));
        setError("");
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load library.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [authLoading, backendToken, router, syncBackendSession]);

  const podcastsWithStatus = podcasts.map((podcast) => ({
    ...podcast,
    status: getEffectivePodcastStatus(
      podcast,
      analysisByPodcast[podcast.id],
      Boolean(analysisLoadingByPodcast[podcast.id]),
    ),
  }));

  const filtered = useMemo(() => {
    return podcastsWithStatus.filter((podcast) => {
      const normalizedQuery = query.trim().toLowerCase();
      const matchesQuery = !normalizedQuery || podcast.title.toLowerCase().includes(normalizedQuery);
      const matchesFilter =
        filter === "all"
          ? true
          : filter === "processing"
            ? ["processing", "queued"].includes(podcast.status)
            : filter === "payments"
              ? ["awaiting_payment"].includes(podcast.status)
              : ["done", "completed"].includes(podcast.status);
      return matchesQuery && matchesFilter;
    });
  }, [filter, podcastsWithStatus, query]);

  const doneCount = podcastsWithStatus.filter((podcast) => ["done", "completed"].includes(podcast.status)).length;
  const processingCount = podcastsWithStatus.filter((podcast) => ["processing", "queued"].includes(podcast.status)).length;
  const totalDuration = podcasts.reduce((sum, podcast) => sum + (podcast.duration || 0), 0);
  const strongestPodcast = [...podcastsWithStatus]
    .filter((podcast) => analysisByPodcast[podcast.id]?.highest_score)
    .sort(
      (a, b) =>
        (analysisByPodcast[b.id]?.highest_score ?? 0) -
        (analysisByPodcast[a.id]?.highest_score ?? 0),
    )[0];

  const runAnalysis = async (podcastId: string) => {
    try {
      setAnalysisLoadingByPodcast((current) => ({ ...current, [podcastId]: true }));
      setPodcasts((current) =>
        current.map((podcast) =>
          podcast.id === podcastId ? { ...podcast, status: "processing" } : podcast,
        ),
      );
      setError("");

      const token = backendToken ?? (await syncBackendSession());
      if (!token) {
        router.replace("/login");
        return;
      }

      const result = await analyzePodcast(podcastId, {}, token);
      setAnalysisByPodcast((current) => ({
        ...current,
        [podcastId]: {
          podcast_id: result.podcast_id,
          total_scored_segments: result.total_segments_analyzed,
          highest_score: result.top_scoring_segments[0]?.virality_score ?? 0,
          top_segments: result.top_scoring_segments,
        },
      }));
      setPodcasts((current) =>
        current.map((podcast) =>
          podcast.id === podcastId ? { ...podcast, status: "done" } : podcast,
        ),
      );
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "Unable to analyze podcast.");
      setPodcasts((current) =>
        current.map((podcast) =>
          podcast.id === podcastId ? { ...podcast, status: "ready_for_processing" } : podcast,
        ),
      );
    } finally {
      setAnalysisLoadingByPodcast((current) => ({ ...current, [podcastId]: false }));
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
        .lift-card:hover { transform: translateY(-4px); box-shadow: 0 18px 40px ${t.accentGlow}; border-color: ${t.border}; }
        .pill-btn { transition: transform .2s cubic-bezier(.22,1,.36,1), box-shadow .2s; }
        .pill-btn:hover { transform: translateY(-2px); box-shadow: 0 10px 24px ${t.accentGlow}; }
        .hero-grid-bar { overflow: hidden; }
        .hero-grid-bar span { display:block; height:100%; border-radius:999px; background: linear-gradient(90deg, ${t.accent}, ${t.accentLt}); }
      `}</style>

      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
        <div className="orbA" style={{ position: "absolute", top: -140, right: -80, width: 460, height: 460, borderRadius: "50%", background: dark ? "rgba(24,68,14,.55)" : "rgba(184,232,152,.38)", filter: "blur(90px)" }} />
        <div className="orbB" style={{ position: "absolute", bottom: -120, left: -70, width: 420, height: 420, borderRadius: "50%", background: dark ? "rgba(15,52,8,.46)" : "rgba(210,245,182,.34)", filter: "blur(84px)" }} />
      </div>

      <div style={{ position: "relative", zIndex: 1, maxWidth: 1320, margin: "0 auto", padding: "30px 22px 64px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Link href="/dashboard" style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", color: t.textSub, border: `1px solid ${t.border}`, borderRadius: 999, padding: "10px 16px", background: t.card }}>
              <ArrowLeft size={16} />
              Dashboard
            </Link>
            <button
              type="button"
              onClick={() => setDark((value) => !value)}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, border: `1px solid ${t.border}`, borderRadius: 999, padding: "10px 14px", background: t.card, color: t.textSub, cursor: "pointer" }}
            >
              {dark ? <SunMedium size={15} /> : <Moon size={15} />}
              {dark ? "Light mode" : "Dark mode"}
            </button>
          </div>

          <Link
            href="/upload"
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
            Upload episode
          </Link>
        </div>

        <section style={{ borderRadius: 30, border: `1px solid ${t.border}`, background: t.shell, backdropFilter: "blur(24px)", padding: isMobile ? "24px 20px" : "30px 32px", animation: "slideUp .5s cubic-bezier(.22,1,.36,1) both" }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.4fr) 320px", gap: 22 }}>
            <div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 999, padding: "7px 12px", background: dark ? "rgba(90,158,58,.14)" : "rgba(90,158,58,.08)", color: t.accentLt, fontSize: 11, fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase" }}>
                <BookOpen size={14} />
                Podcast Library
              </div>
              <h1 style={{ marginTop: 16, marginBottom: 12, fontFamily: "'DM Serif Display', serif", fontSize: "clamp(34px, 4vw, 58px)", lineHeight: 1.02, letterSpacing: "-.04em" }}>
                Every episode in one calm, searchable space.
              </h1>
              <p style={{ fontSize: 15, lineHeight: 1.8, color: t.textSub, maxWidth: 700 }}>
                Browse uploads, rerun analysis, and jump straight into clips without hunting through the dashboard.
              </p>
            </div>

            <div className="lift-card" style={{ borderRadius: 24, border: `1px solid ${t.borderSub}`, background: t.cardAlt, padding: "20px 22px", display: "grid", gap: 14 }}>
              {[
                { label: "Episodes", value: podcasts.length, sub: "in your workspace" },
                { label: "Analyzed", value: doneCount, sub: "ready for clips" },
                { label: "Duration", value: fmtDur(totalDuration || 0), sub: "total uploaded audio" },
                { label: "Processing", value: processingCount, sub: "currently running" },
              ].map((item) => (
                <div key={item.label}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".2em", textTransform: "uppercase", color: t.textFaint, marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, fontStyle: "italic", lineHeight: 1, marginBottom: 4 }}>{item.value}</div>
                  <div style={{ fontSize: 12, color: t.textSub }}>{item.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          style={{
            marginTop: 20,
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1.05fr .95fr .95fr",
            gap: 16,
          }}
        >
          {[
            {
              icon: Radio,
              title: "Workspace rhythm",
              text: processingCount
                ? `${processingCount} episode${processingCount > 1 ? "s are" : " is"} actively processing right now.`
                : "Everything is calm right now with no pending processing queue.",
            },
            {
              icon: Sparkles,
              title: "Clip-ready focus",
              text: doneCount
                ? `${doneCount} episode${doneCount > 1 ? "s already have" : " already has"} analysis ready for clips.`
                : "Run analysis on a few episodes to unlock clip generation faster.",
            },
            {
              icon: Waves,
              title: "Library purpose",
              text: "Use this page to search, re-analyze, and move from episode library into clips with less friction.",
            },
          ].map((item) => (
            <article
              key={item.title}
              className="lift-card"
              style={{
                borderRadius: 22,
                background: t.card,
                border: `1px solid ${t.border}`,
                padding: 18,
                display: "grid",
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 14,
                  background: dark ? "rgba(90,158,58,.14)" : "rgba(90,158,58,.08)",
                  border: `1px solid ${t.borderSub}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <item.icon size={18} color={t.accent} />
              </div>
              <div>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{item.title}</div>
                <p style={{ margin: 0, color: t.textSub, lineHeight: 1.7, fontSize: 14 }}>{item.text}</p>
              </div>
            </article>
          ))}
        </section>

        <section style={{ marginTop: 20, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.15fr .85fr", gap: 16 }}>
          <div className="lift-card" style={{ borderRadius: 24, background: t.card, border: `1px solid ${t.border}`, padding: 20 }}>
            <div style={{ fontSize: 11, letterSpacing: ".2em", textTransform: "uppercase", color: t.textFaint, marginBottom: 12 }}>
              Library Health
            </div>
            <div style={{ display: "grid", gap: 14 }}>
              {[
                { label: "Analyzed coverage", current: doneCount, total: Math.max(1, podcasts.length) },
                { label: "Processing queue", current: processingCount, total: Math.max(1, podcasts.length) },
                { label: "Visible in filter", current: filtered.length, total: Math.max(1, podcastsWithStatus.length) },
              ].map((item) => {
                const percent = Math.round((item.current / item.total) * 100);
                return (
                  <div key={item.label}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, marginBottom: 8 }}>
                      <span style={{ color: t.text }}>{item.label}</span>
                      <span style={{ color: t.textSub }}>{percent}%</span>
                    </div>
                    <div className="hero-grid-bar" style={{ height: 10, borderRadius: 999, background: t.cardAlt, border: `1px solid ${t.borderSub}` }}>
                      <span style={{ width: `${Math.max(10, percent)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="lift-card" style={{ borderRadius: 24, background: t.card, border: `1px solid ${t.border}`, padding: 20 }}>
            <div style={{ fontSize: 11, letterSpacing: ".2em", textTransform: "uppercase", color: t.textFaint, marginBottom: 12 }}>
              Strongest Episode
            </div>
            {strongestPodcast ? (
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, lineHeight: 1.05 }}>
                  {strongestPodcast.title}
                </div>
                <div style={{ fontSize: 14, color: t.textSub, lineHeight: 1.7 }}>
                  Peak score {analysisByPodcast[strongestPodcast.id]?.highest_score.toFixed(1)} with{" "}
                  {analysisByPodcast[strongestPodcast.id]?.total_scored_segments ?? 0} scored segments.
                </div>
                <Link
                  href={`/clips?podcastId=${strongestPodcast.id}`}
                  className="pill-btn"
                  style={{
                    width: "fit-content",
                    borderRadius: 999,
                    padding: "11px 15px",
                    background: `linear-gradient(135deg, ${t.accent}, ${t.accentLt})`,
                    color: "#fff",
                    textDecoration: "none",
                    fontWeight: 700,
                  }}
                >
                  Open best clips
                </Link>
              </div>
            ) : (
              <div style={{ color: t.textSub, lineHeight: 1.8 }}>
                Run analysis on at least one episode and the strongest candidate will surface here.
              </div>
            )}
          </div>
        </section>

        <section style={{ marginTop: 20, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.2fr .8fr", gap: 16 }}>
          <div style={{ borderRadius: 22, background: t.card, border: `1px solid ${t.border}`, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, borderRadius: 16, background: t.cardAlt, border: `1px solid ${t.borderSub}`, padding: "12px 14px" }}>
              <Search size={16} color={t.textSub} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search podcasts by title"
                style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: t.text, fontSize: 14 }}
              />
            </div>
          </div>

          <div style={{ borderRadius: 22, background: t.card, border: `1px solid ${t.border}`, padding: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(["all", "processing", "payments", "done"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className="pill-btn"
                style={{
                  border: "none",
                  borderRadius: 999,
                  padding: "10px 14px",
                  background: filter === value ? `linear-gradient(135deg, ${t.accent}, ${t.accentLt})` : t.cardAlt,
                  color: filter === value ? "#fff" : t.textSub,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {value.charAt(0).toUpperCase() + value.slice(1)}
              </button>
            ))}
          </div>
        </section>

        {error ? (
          <div style={{ marginTop: 18, borderRadius: 18, padding: "14px 18px", background: dark ? "rgba(82,24,24,.72)" : "rgba(255,238,238,.88)", border: `1px solid ${dark ? "rgba(170,84,84,.34)" : "rgba(215,165,165,.5)"}`, color: dark ? "#efaaaa" : "#9d3a3a" }}>
            {error}
          </div>
        ) : null}

        <section className="lift-card" style={{ marginTop: 20, borderRadius: 24, background: t.card, border: `1px solid ${t.border}`, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: ".2em", textTransform: "uppercase", color: t.textFaint, marginBottom: 6 }}>
                Episode Grid
              </div>
              <h2 style={{ margin: 0, fontFamily: "'DM Serif Display', serif", fontSize: 30, lineHeight: 1.05 }}>
                {filtered.length} episode{filtered.length === 1 ? "" : "s"} in view
              </h2>
            </div>
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
              Filter: {filter.charAt(0).toUpperCase() + filter.slice(1)}
            </div>
          </div>

          {loading || authLoading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "64px 0", color: t.textSub }}>
              <Loader2 size={24} className="animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ borderRadius: 22, border: `1px dashed ${t.border}`, padding: "54px 24px", textAlign: "center", color: t.textSub }}>
              <Clapperboard size={32} style={{ margin: "0 auto 12px" }} />
              <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: t.text, margin: 0 }}>No podcasts match this view</h2>
              <p style={{ marginTop: 10, lineHeight: 1.8 }}>Try another filter or upload a new episode to grow your library.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
              {filtered.map((podcast) => (
                <PodcastCard
                  key={podcast.id}
                  podcast={podcast}
                  analysis={analysisByPodcast[podcast.id]}
                  analysisLoading={Boolean(analysisLoadingByPodcast[podcast.id])}
                  onAnalyze={() => void runAnalysis(podcast.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
