"use client";
// Importimi i Next.js routing dhe hooks
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
// Ikonat nga lucide-react për UI
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
  deletePodcast,
  getJson,
  getPodcastAnalytics,
  getPodcastAnalysis,
  type AnalysisSummary,
  type Podcast,
  type PodcastAnalyticsSummary,
  type PodcastsResponse,
} from "@/lib/api";
import { studioTheme, THEME_STORAGE_KEY } from "@/lib/brand";

const T = studioTheme;
/**
 * Formaton kohën e podcast-it (sekonda → minuta/orë)
 */
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
/**
 * CACHE global (që mos me bo fetch çdo herë)
 */
let cachedPodcastsUserId: string | null = null;
let cachedPodcastsList: Podcast[] | null = null;
let cachedPodcastsAnalytics: Record<string, PodcastAnalyticsSummary> | null = null;
let cachedPodcastsAnalysis: Record<string, AnalysisSummary | null> | null = null;

export default function PodcastsPage() {
  const router = useRouter();
  const { user, backendToken, loading: authLoading, syncBackendSession } = useAuth();

  const isCacheValid = Boolean(user?.id && user.id === cachedPodcastsUserId);

  const [mounted, setMounted] = useState(false);
  const [dark, setDark] = useState(true);
  const [viewportWidth, setViewportWidth] = useState(1280);
  const [loading, setLoading] = useState(!isCacheValid || !cachedPodcastsList);
  const [error, setError] = useState("");
  const [podcasts, setPodcasts] = useState<Podcast[]>(isCacheValid ? (cachedPodcastsList ?? []) : []);
  const [analysisByPodcast, setAnalysisByPodcast] = useState<Record<string, AnalysisSummary | null>>(isCacheValid ? (cachedPodcastsAnalysis ?? {}) : {});
  const [analysisLoadingByPodcast, setAnalysisLoadingByPodcast] = useState<Record<string, boolean>>({});
  const [analyticsByPodcastId, setAnalyticsByPodcastId] = useState<Record<string, PodcastAnalyticsSummary>>(isCacheValid ? (cachedPodcastsAnalytics ?? {}) : {});
  const [deletingByPodcast, setDeletingByPodcast] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "processing" | "payments" | "done">("all");

  const t = dark ? T.dark : T.light;
  const isMobile = viewportWidth < 900;

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme) setDark(savedTheme === "dark");
    const handleResize = () => setViewportWidth(window.innerWidth);
    handleResize();
    window.addEventListener("resize", handleResize);
    setMounted(true);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    window.localStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light");
  }, [dark, mounted]);

  useEffect(() => {
    if (authLoading) return;

    const load = async () => {
      if (!isCacheValid || !cachedPodcastsList) setLoading(true);
      try {
        const token = backendToken ?? (await syncBackendSession());
        if (!token) {
          router.replace("/login");
          return;
        }

        const [podcastsResponse, analyticsResponse] = await Promise.all([
          getJson<PodcastsResponse>("/podcasts", token),
          getPodcastAnalytics(token).catch(() => null),
        ]);
        setPodcasts(podcastsResponse.podcasts);
        const parsedAnalyticsSummary = Object.fromEntries(
            (analyticsResponse?.podcasts ?? []).map((podcast) => [podcast.podcast_id, podcast]),
          ) as Record<string, PodcastAnalyticsSummary>;
          
        setAnalyticsByPodcastId(parsedAnalyticsSummary);

        const analysisEntries = await Promise.all(
          podcastsResponse.podcasts.map(async (podcast) => {
            if (!["done", "completed"].includes(podcast.status)) {
              return [podcast.id, null] as const;
            }

            try {
              const summary = await getPodcastAnalysis(podcast.id, token);
              return [podcast.id, summary] as const;
            } catch {
              return [podcast.id, null] as const;
            }
          }),
        );

        const parsedAnalysis = Object.fromEntries(analysisEntries);
        
        cachedPodcastsUserId = user?.id ?? null;
        cachedPodcastsList = podcastsResponse.podcasts;
        cachedPodcastsAnalytics = parsedAnalyticsSummary;
        cachedPodcastsAnalysis = parsedAnalysis;
        
        setAnalysisByPodcast(parsedAnalysis);
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
      const analysis = analysisByPodcast[podcast.id];
      const searchFields = [
        podcast.title,
        podcast.source_type === "youtube" ? "youtube import" : "uploaded file",
        podcast.source_url ?? "",
        podcast.status.replaceAll("_", " "),
        getEffectivePodcastStatus(
          podcast,
          analysis,
          Boolean(analysisLoadingByPodcast[podcast.id]),
        ).replaceAll("_", " "),
        fmtDur(podcast.duration || 0),
        analysis?.total_scored_segments
          ? `${analysis.total_scored_segments} scored segments ready for clips`
          : "",
        analysis?.highest_score ? `peak score ${analysis.highest_score.toFixed(1)}` : "",
      ]
        .join(" ")
        .toLowerCase();
      const matchesQuery = !normalizedQuery || searchFields.includes(normalizedQuery);
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
  }, [analysisByPodcast, analysisLoadingByPodcast, filter, podcastsWithStatus, query]);

  const doneCount = podcastsWithStatus.filter((podcast) => ["done", "completed"].includes(podcast.status)).length;
  const processingCount = podcastsWithStatus.filter((podcast) => ["processing", "queued"].includes(podcast.status)).length;
  const totalDuration = podcasts.reduce((sum, podcast) => sum + (podcast.duration || 0), 0);
  const hasActiveDiscoveryFilters = query.trim().length > 0 || filter !== "all";
  const strongestPodcast = [...podcastsWithStatus]
    .filter((podcast) => analysisByPodcast[podcast.id]?.highest_score)
    .sort(
      (a, b) =>
        (analysisByPodcast[b.id]?.highest_score ?? 0) -
        (analysisByPodcast[a.id]?.highest_score ?? 0),
    )[0];

  const runAnalysis = async (podcastId: string, language?: string, force?: boolean) => {
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

      const result = await analyzePodcast(podcastId, { language, force }, token);
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

  const handleDeletePodcast = async (podcast: Podcast) => {
    try {
      setDeletingByPodcast((current) => ({ ...current, [podcast.id]: true }));
      setError("");

      const token = backendToken ?? (await syncBackendSession());
      if (!token) {
        router.replace("/login");
        return;
      }

      await deletePodcast(podcast.id, token);
      setPodcasts((current) => current.filter((item) => item.id !== podcast.id));
      setAnalysisByPodcast((current) => {
        const next = { ...current };
        delete next[podcast.id];
        return next;
      });
      setAnalysisLoadingByPodcast((current) => {
        const next = { ...current };
        delete next[podcast.id];
        return next;
      });
      setAnalyticsByPodcastId((current) => {
        const next = { ...current };
        delete next[podcast.id];
        return next;
      });
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete podcast.");
    } finally {
      setDeletingByPodcast((current) => ({ ...current, [podcast.id]: false }));
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

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
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
              Upload file
            </Link>
            <Link
              href="/upload/youtube"
              style={{
                borderRadius: 999,
                border: `1px solid ${t.border}`,
                background: t.card,
                color: t.textSub,
                padding: "12px 16px",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              <Radio size={16} />
              YouTube import
            </Link>
          </div>
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
                Browse uploads and YouTube imports, rerun analysis, and jump straight into clips without hunting through the dashboard.
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
              title: "Processing status",
              text: processingCount
                ? `${processingCount} episode${processingCount > 1 ? "s are" : " is"} actively processing right now.`
                : "No episodes are waiting to be processed right now.",
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



        <section style={{ marginTop: 20, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.2fr .8fr", gap: 16 }}>
          <div style={{ borderRadius: 22, background: t.card, border: `1px solid ${t.border}`, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, borderRadius: 16, background: t.cardAlt, border: `1px solid ${t.borderSub}`, padding: "12px 14px" }}>
              <Search size={16} color={t.textSub} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by title, status, duration, or clip readiness"
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

          {hasActiveDiscoveryFilters ? (
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16, color: t.textSub, fontSize: 13 }}>
              <span>
                {filtered.length} match{filtered.length === 1 ? "" : "es"} for your current discovery view
              </span>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
                className="pill-btn"
                style={{
                  border: "none",
                  borderRadius: 999,
                  padding: "9px 13px",
                  background: t.cardAlt,
                  color: t.textSub,
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Clear search
              </button>
            </div>
          ) : null}

          {loading || authLoading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "64px 0", color: t.textSub }}>
              <Loader2 size={24} className="animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="ic-empty-state" style={{ borderRadius: 22, border: `1px dashed ${t.border}`, padding: "54px 24px", textAlign: "center", color: t.textSub }}>
              <Clapperboard size={32} style={{ margin: "0 auto 12px" }} />
              <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: t.text, margin: 0 }}>No podcasts match this view</h2>
              <p style={{ marginTop: 10, lineHeight: 1.8 }}>
                {hasActiveDiscoveryFilters
                  ? "Try clearing the current search or changing the filter to surface more episodes."
                  : "Upload a new episode to grow your library."}
              </p>
              {hasActiveDiscoveryFilters ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                  className="pill-btn ic-action"
                  style={{
                    marginTop: 18,
                    border: "none",
                    borderRadius: 999,
                    padding: "11px 16px",
                    background: `linear-gradient(135deg, ${t.accent}, ${t.accentLt})`,
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  Reset discovery
                </button>
              ) : null}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(min(100%, 280px), 1fr))", gap: 16 }}>
              {filtered.map((podcast) => (
                <PodcastCard
                  key={podcast.id}
                  podcast={podcast}
                  analysis={analysisByPodcast[podcast.id]}
                  analysisLoading={Boolean(analysisLoadingByPodcast[podcast.id])}
                  onAnalyze={(lang, force) => void runAnalysis(podcast.id, lang, force)}
                  onDelete={
                    deletingByPodcast[podcast.id]
                      ? undefined
                      : () => void handleDeletePodcast(podcast)
                  }
                  generatedClipsCount={analyticsByPodcastId[podcast.id]?.total_clips ?? 0}
                  dark={dark}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
