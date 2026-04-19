"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BarChart2,
  Loader2,
  Moon,
  Sparkles,
  SunMedium,
  TrendingDown,
  TrendingUp,
  Waves,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import {
  getJson,
  getPodcastAnalysis,
  type AnalysisSummary,
  type Podcast,
  type PodcastsResponse,
  type ScoreSegment,
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

type PodcastWithAnalysis = Podcast & {
  analysis: AnalysisSummary | null;
};

function clipSnippet(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 150) return normalized;
  return `${normalized.slice(0, 147).trim()}...`;
}

function formatTime(seconds: number): string {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remaining = totalSeconds % 60;
  return `${minutes}:${remaining.toString().padStart(2, "0")}`;
}

export default function AnalyticsPage() {
  const router = useRouter();
  const { backendToken, loading: authLoading, syncBackendSession } = useAuth();

  const [mounted, setMounted] = useState(false);
  const [dark, setDark] = useState(true);
  const [viewportWidth, setViewportWidth] = useState(1280);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [podcasts, setPodcasts] = useState<PodcastWithAnalysis[]>([]);

  const t = dark ? T.dark : T.light;
  const isMobile = viewportWidth < 960;

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
        const withAnalysis = await Promise.all(
          podcastsResponse.podcasts.map(async (podcast) => {
            try {
              const analysis = await getPodcastAnalysis(podcast.id, token);
              return { ...podcast, analysis };
            } catch {
              return { ...podcast, analysis: null };
            }
          }),
        );

        setPodcasts(withAnalysis);
        setError("");
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load analytics.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [authLoading, backendToken, router, syncBackendSession]);

  const analyzedPodcasts = podcasts.filter((podcast) => podcast.analysis && podcast.analysis.total_scored_segments > 0);
  const allSegments = useMemo(
    () =>
      analyzedPodcasts.flatMap((podcast) =>
        (podcast.analysis?.top_segments ?? []).map((segment) => ({ podcast, segment })),
      ),
    [analyzedPodcasts],
  );

  const topMoments = [...allSegments]
    .sort((a, b) => b.segment.virality_score - a.segment.virality_score)
    .slice(0, 6);

  const averageTopScore =
    analyzedPodcasts.length > 0
      ? analyzedPodcasts.reduce((sum, podcast) => sum + (podcast.analysis?.highest_score ?? 0), 0) / analyzedPodcasts.length
      : 0;

  const sentimentMix = allSegments.reduce(
    (acc, item) => {
      acc[item.segment.sentiment] = (acc[item.segment.sentiment] ?? 0) + 1;
      return acc;
    },
    { positive: 0, neutral: 0, negative: 0 } as Record<ScoreSegment["sentiment"], number>,
  );
  const sentimentTotal = Math.max(1, sentimentMix.positive + sentimentMix.neutral + sentimentMix.negative);
  const sentimentBars = [
    { label: "Positive", value: sentimentMix.positive, color: t.accentLt },
    { label: "Neutral", value: sentimentMix.neutral, color: dark ? "#8ea286" : "#7f9277" },
    { label: "Negative", value: sentimentMix.negative, color: dark ? "#c96f6f" : "#b45d5d" },
  ];

  if (!mounted) return null;

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text, fontFamily: "'DM Sans', sans-serif", position: "relative", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display:ital@0;1&display=swap');
        * { box-sizing: border-box; }
        @keyframes floatOrb { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(24px,-16px) scale(1.04)} }
        @keyframes slideUp { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        .orbA { animation: floatOrb 16s ease-in-out infinite; }
        .orbB { animation: floatOrb 22s -4s ease-in-out infinite; }
        .lift-card { transition: transform .25s cubic-bezier(.22,1,.36,1), box-shadow .25s, border-color .25s; }
        .lift-card:hover { transform: translateY(-4px); box-shadow: 0 18px 40px ${t.accentGlow}; border-color: ${t.border}; }
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
            <button type="button" onClick={() => setDark((value) => !value)} style={{ display: "inline-flex", alignItems: "center", gap: 8, border: `1px solid ${t.border}`, borderRadius: 999, padding: "10px 14px", background: t.card, color: t.textSub, cursor: "pointer" }}>
              {dark ? <SunMedium size={15} /> : <Moon size={15} />}
              {dark ? "Light mode" : "Dark mode"}
            </button>
          </div>

          <Link href="/clips" style={{ borderRadius: 999, background: `linear-gradient(135deg, ${t.accent}, ${t.accentLt})`, color: "#fff", padding: "12px 18px", display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 700, textDecoration: "none", boxShadow: `0 14px 34px ${t.accentGlow}` }}>
            <Sparkles size={16} />
            View clips
          </Link>
        </div>

        <section style={{ borderRadius: 30, border: `1px solid ${t.border}`, background: t.shell, backdropFilter: "blur(24px)", padding: isMobile ? "24px 20px" : "30px 32px", animation: "slideUp .5s cubic-bezier(.22,1,.36,1) both" }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.4fr) 320px", gap: 22 }}>
            <div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 999, padding: "7px 12px", background: dark ? "rgba(90,158,58,.14)" : "rgba(90,158,58,.08)", color: t.accentLt, fontSize: 11, fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase" }}>
                <BarChart2 size={14} />
                Analysis Board
              </div>
              <h1 style={{ marginTop: 16, marginBottom: 12, fontFamily: "'DM Serif Display', serif", fontSize: "clamp(34px, 4vw, 58px)", lineHeight: 1.02, letterSpacing: "-.04em" }}>
                See what your strongest moments are actually saying.
              </h1>
              <p style={{ fontSize: 15, lineHeight: 1.8, color: t.textSub, maxWidth: 700 }}>
                This view summarizes scored segments, strongest episodes, and the moments most likely to turn into clips.
              </p>
            </div>

            <div className="lift-card" style={{ borderRadius: 24, border: `1px solid ${t.borderSub}`, background: t.cardAlt, padding: "20px 22px", display: "grid", gap: 14 }}>
              {[
                { label: "Analyzed", value: analyzedPodcasts.length, sub: "episodes with results" },
                { label: "Top Score", value: topMoments[0]?.segment.virality_score.toFixed(1) ?? "0.0", sub: "best highlight found" },
                { label: "Avg Peak", value: averageTopScore.toFixed(1), sub: "average best score" },
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

        {error ? (
          <div style={{ marginTop: 18, borderRadius: 18, padding: "14px 18px", background: dark ? "rgba(82,24,24,.72)" : "rgba(255,238,238,.88)", border: `1px solid ${dark ? "rgba(170,84,84,.34)" : "rgba(215,165,165,.5)"}`, color: dark ? "#efaaaa" : "#9d3a3a" }}>
            {error}
          </div>
        ) : null}

        {loading || authLoading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "80px 0", color: t.textSub }}>
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : (
          <>
            <section style={{ marginTop: 20, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)", gap: 16 }}>
              {[
                { label: "Positive", value: sentimentMix.positive, icon: TrendingUp },
                { label: "Neutral", value: sentimentMix.neutral, icon: Waves },
                { label: "Negative", value: sentimentMix.negative, icon: TrendingDown },
                { label: "Moments", value: allSegments.length, icon: Sparkles },
              ].map((item) => (
                <div key={item.label} className="lift-card" style={{ borderRadius: 22, background: t.card, border: `1px solid ${t.border}`, padding: 18 }}>
                  <item.icon size={18} color={t.accent} />
                  <div style={{ marginTop: 14, fontSize: 10, fontWeight: 700, letterSpacing: ".2em", textTransform: "uppercase", color: t.textFaint }}>{item.label}</div>
                  <div style={{ marginTop: 6, fontFamily: "'DM Serif Display', serif", fontSize: 30, fontStyle: "italic" }}>{item.value}</div>
                </div>
              ))}
            </section>

            <section style={{ marginTop: 20, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20 }}>
              <div className="lift-card" style={{ borderRadius: 24, background: t.card, border: `1px solid ${t.border}`, padding: 20 }}>
                <div style={{ fontSize: 11, letterSpacing: ".2em", textTransform: "uppercase", color: t.textFaint, marginBottom: 12 }}>Score Ladder</div>
                {topMoments.length === 0 ? (
                  <div style={{ color: t.textSub, lineHeight: 1.8 }}>Top highlights will appear here after analysis is complete.</div>
                ) : (
                  <div style={{ display: "grid", gap: 12 }}>
                    {topMoments.slice(0, 5).map(({ podcast, segment }, index) => {
                      const width = `${Math.max(18, Math.min(100, segment.virality_score))}%`;
                      return (
                        <div key={`${podcast.id}-bar-${index}`} style={{ display: "grid", gap: 7 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
                            <span style={{ color: t.text }}>{podcast.title}</span>
                            <span style={{ color: t.accent, fontWeight: 700 }}>{segment.virality_score.toFixed(1)}</span>
                          </div>
                          <div style={{ height: 10, borderRadius: 999, background: dark ? "rgba(90,158,58,.10)" : "rgba(90,158,58,.08)", overflow: "hidden" }}>
                            <div style={{ width, height: "100%", borderRadius: 999, background: `linear-gradient(90deg, ${t.accent}, ${t.accentLt})` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="lift-card" style={{ borderRadius: 24, background: t.card, border: `1px solid ${t.border}`, padding: 20 }}>
                <div style={{ fontSize: 11, letterSpacing: ".2em", textTransform: "uppercase", color: t.textFaint, marginBottom: 12 }}>What This Means</div>
                <div style={{ display: "grid", gap: 12 }}>
                  {[
                    `Your strongest highlight score right now is ${topMoments[0]?.segment.virality_score.toFixed(1) ?? "0.0"}.`,
                    `${analyzedPodcasts.length} analyzed episode${analyzedPodcasts.length === 1 ? "" : "s"} are feeding this board.`,
                    allSegments.length
                      ? `Most detected moments currently lean ${sentimentMix.positive >= sentimentMix.neutral && sentimentMix.positive >= sentimentMix.negative ? "positive" : sentimentMix.negative > sentimentMix.neutral ? "negative" : "neutral"}.`
                      : "Run analysis on an episode to start building this signal board.",
                  ].map((text, index) => (
                    <div key={index} style={{ borderRadius: 18, background: t.cardAlt, border: `1px solid ${t.borderSub}`, padding: 14, color: t.textSub, lineHeight: 1.75 }}>
                      {text}
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section style={{ marginTop: 20, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20 }}>
              <div className="lift-card" style={{ borderRadius: 24, background: t.card, border: `1px solid ${t.border}`, padding: 20 }}>
                <div style={{ fontSize: 11, letterSpacing: ".2em", textTransform: "uppercase", color: t.textFaint, marginBottom: 12 }}>
                  Sentiment Mix
                </div>
                <div style={{ display: "grid", gap: 12 }}>
                  {sentimentBars.map((item) => {
                    const percent = Math.round((item.value / sentimentTotal) * 100);
                    return (
                      <div key={item.label}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8, fontSize: 13 }}>
                          <span style={{ color: t.text }}>{item.label}</span>
                          <span style={{ color: t.textSub }}>{percent}%</span>
                        </div>
                        <div style={{ height: 10, borderRadius: 999, background: t.cardAlt, border: `1px solid ${t.borderSub}`, overflow: "hidden" }}>
                          <div style={{ width: `${Math.max(8, percent)}%`, height: "100%", borderRadius: 999, background: item.color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="lift-card" style={{ borderRadius: 24, background: t.card, border: `1px solid ${t.border}`, padding: 20 }}>
                <div style={{ fontSize: 11, letterSpacing: ".2em", textTransform: "uppercase", color: t.textFaint, marginBottom: 12 }}>
                  Clip Readiness
                </div>
                <div style={{ display: "grid", gap: 12 }}>
                  {[
                    `Top ${topMoments.length} moments are already ranked and ready for clip review.`,
                    analyzedPodcasts.length
                      ? `${Math.round((analyzedPodcasts.length / Math.max(1, podcasts.length)) * 100)}% of your uploaded episodes have analysis coverage.`
                      : "No analyzed coverage yet.",
                    topMoments[0]
                      ? `"${topMoments[0].podcast.title}" is your current best clip candidate.`
                      : "Analyze an episode to see your first clip candidate.",
                  ].map((text, index) => (
                    <div key={index} style={{ borderRadius: 18, background: t.cardAlt, border: `1px solid ${t.borderSub}`, padding: 14, color: t.textSub, lineHeight: 1.75 }}>
                      {text}
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section style={{ marginTop: 20, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.1fr .9fr", gap: 20 }}>
              <div className="lift-card" style={{ borderRadius: 24, background: t.card, border: `1px solid ${t.border}`, padding: 20 }}>
                <div style={{ fontSize: 11, letterSpacing: ".2em", textTransform: "uppercase", color: t.textFaint, marginBottom: 12 }}>Top Moments</div>
                {topMoments.length === 0 ? (
                  <div style={{ color: t.textSub, lineHeight: 1.8 }}>No analysis results yet. Run podcast analysis first to populate this board.</div>
                ) : (
                  <div style={{ display: "grid", gap: 12 }}>
                    {topMoments.map(({ podcast, segment }, index) => (
                      <article key={`${podcast.id}-${index}`} style={{ borderRadius: 18, border: `1px solid ${t.borderSub}`, background: t.cardAlt, padding: 16 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                          <div>
                            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".16em", color: t.textFaint }}>#{index + 1} Highlight</div>
                            <div style={{ marginTop: 5, fontWeight: 700 }}>{podcast.title}</div>
                          </div>
                          <div style={{ borderRadius: 999, background: dark ? "rgba(90,158,58,.14)" : "rgba(90,158,58,.08)", color: t.accent, fontWeight: 700, padding: "7px 10px", height: "fit-content" }}>
                            {segment.virality_score.toFixed(1)}
                          </div>
                        </div>
                        <p style={{ margin: 0, lineHeight: 1.8, color: t.text }}>{clipSnippet(segment.transcript_snippet)}</p>
                        <div style={{ marginTop: 10, fontSize: 13, color: t.textSub }}>
                          {formatTime(segment.segment_start_seconds)} - {formatTime(segment.segment_end_seconds)} • {segment.sentiment}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>

              <div className="lift-card" style={{ borderRadius: 24, background: t.card, border: `1px solid ${t.border}`, padding: 20 }}>
                <div style={{ fontSize: 11, letterSpacing: ".2em", textTransform: "uppercase", color: t.textFaint, marginBottom: 12 }}>Top Episodes</div>
                <div style={{ display: "grid", gap: 12 }}>
                  {[...analyzedPodcasts]
                    .sort((a, b) => (b.analysis?.highest_score ?? 0) - (a.analysis?.highest_score ?? 0))
                    .slice(0, 5)
                    .map((podcast) => (
                      <article key={podcast.id} style={{ borderRadius: 18, border: `1px solid ${t.borderSub}`, background: t.cardAlt, padding: 16 }}>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>{podcast.title}</div>
                        <div style={{ fontSize: 13, color: t.textSub, marginBottom: 10 }}>
                          {podcast.analysis?.total_scored_segments ?? 0} segments • peak {podcast.analysis?.highest_score.toFixed(1) ?? "0.0"}
                        </div>
                        <Link href={`/clips?podcastId=${podcast.id}`} style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", color: t.accent, fontWeight: 700 }}>
                          Open clips
                        </Link>
                      </article>
                    ))}
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
