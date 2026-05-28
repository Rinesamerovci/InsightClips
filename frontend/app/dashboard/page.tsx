"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LogOut, Moon, Plus, SunMedium, Mic2, Download,
  Sparkles, Settings, Bell, ChevronRight, Play,
  Activity, Zap, TrendingUp,
  Radio, LayoutDashboard, Library, BarChart2,
  User, ArrowUpRight,
} from "lucide-react";

import { PodcastCard } from "@/components/PodcastCard";
import { useAuth } from "@/context/AuthContext";
import {
  analyzePodcast,
  getJson,
  getPodcastAnalytics,
  getPodcastAnalysis,
  type AnalysisSummary,
  type Podcast,
  type PodcastsResponse,
  type ProfileResponse,
  type UserPodcastAnalytics,
} from "@/lib/api";
import { studioTheme, THEME_STORAGE_KEY } from "@/lib/brand";

function isDoneStatus(status: string) {
  return ["done", "completed"].includes(status);
}

function isProcessingStatus(status: string) {
  return ["processing", "queued"].includes(status);
}

function isPaymentStatus(status: string) {
  return ["awaiting_payment"].includes(status);
}

function getEffectivePodcastStatus(
  podcast: Podcast,
  analysis: AnalysisSummary | null | undefined,
  analysisLoading: boolean,
) {
  if (analysisLoading) {
    return "processing";
  }

  if (analysis && analysis.total_scored_segments > 0) {
    return "done";
  }

  return podcast.status;
}

/* ─────────────────────── design tokens ─────────────────────── */
const T = studioTheme;
type DashboardTheme = (typeof T)[keyof typeof T];

/* ─────────────────────── helpers ─────────────────────── */
function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

/* ─────────────────────── nav item ─────────────────────── */
function NavItem({ icon: Icon, label, href, active, t, collapsed }:
  { icon: React.ElementType; label: string; href: string; active?: boolean; t: DashboardTheme; collapsed: boolean }) {
  return (
    <Link href={href} style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: collapsed ? "11px 14px" : "10px 14px",
      borderRadius: 12, textDecoration: "none",
      justifyContent: collapsed ? "center" : "flex-start",
      background: active ? `rgba(90,158,58,.12)` : "transparent",
      border: `1px solid ${active ? `rgba(90,158,58,.22)` : "transparent"}`,
      transition: "all .2s",
      position: "relative",
    }}>
      <Icon size={17} color={active ? t.accent : t.textSub} strokeWidth={active ? 2.2 : 1.8}/>
      {!collapsed && (
        <span style={{
          fontSize: 13, fontWeight: active ? 600 : 400,
          color: active ? t.text : t.textSub,
          letterSpacing: "-.01em",
        }}>{label}</span>
      )}
      {active && !collapsed && (
        <div style={{
          position: "absolute", right: 12,
          width: 5, height: 5, borderRadius: "50%",
          background: t.accent,
        }}/>
      )}
    </Link>
  );
}

/* ─────────────────────── stat card ─────────────────────── */
function StatCard({ icon: Icon, label, value, sub, accent, t, delay }:
  { icon: React.ElementType; label: string; value: string|number; sub: string; accent: string; t: DashboardTheme; delay: number }) {
  return (
    <div style={{
      padding: "22px 24px", borderRadius: 18,
      border: `1px solid ${t.border}`,
      background: t.card,
      backdropFilter: "blur(20px)",
      position: "relative", overflow: "hidden",
      animation: `slideUp .55s ${delay}s cubic-bezier(.22,1,.36,1) both`,
    }}>
      <div style={{
        position: "absolute", top: -30, right: -30,
        width: 100, height: 100, borderRadius: "50%",
        background: `${accent}18`, filter: "blur(24px)",
        pointerEvents: "none",
      }}/>
      <div style={{
        width: 38, height: 38, borderRadius: 11,
        background: `${accent}16`,
        border: `1px solid ${accent}28`,
        display: "flex", alignItems: "center", justifyContent: "center",
        marginBottom: 16,
      }}>
        <Icon size={17} color={accent} strokeWidth={1.8}/>
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".2em", textTransform: "uppercase", color: t.textFaint, marginBottom: 6 }}>{label}</div>
      <div style={{
        fontFamily: "'DM Serif Display', serif",
        fontSize: 32, fontStyle: "italic",
        color: t.text, lineHeight: 1, marginBottom: 4,
      }}>{value}</div>
      <div style={{ fontSize: 12, color: t.textSub }}>{sub}</div>
    </div>
  );
}

function SignalPill({
  label,
  value,
  accent,
  border,
  dark,
}: {
  label: string;
  value: string;
  accent: string;
  border: string;
  dark: boolean;
}) {
  return (
    <div
      style={{
        borderRadius: 18,
        border: `1px solid ${border}`,
        background: dark ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.72)",
        padding: "14px 14px 13px",
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase", color: accent, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.6, color: dark ? "#edf4e4" : "#1e3418" }}>
        {value}
      </div>
    </div>
  );
}



/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════ */
export default function DashboardPage() {
  const router  = useRouter();
  const { backendToken, loading: authLoading, signOut, syncBackendSession } = useAuth();

  const [profile,   setProfile]   = useState<ProfileResponse | null>(null);
  const [podcasts,  setPodcasts]  = useState<Podcast[]>([]);
  const [analytics, setAnalytics] = useState<UserPodcastAnalytics | null>(null);
  const [isMock,    setIsMock]    = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");
  const [dark,      setDark]      = useState(true);
  const [mounted,   setMounted]   = useState(false);
  const [activeTab, setActiveTab] = useState<"all"|"processing"|"payments"|"done">("all");
  const [collapsed, setCollapsed] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(1280);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [analysisByPodcast, setAnalysisByPodcast] = useState<Record<string, AnalysisSummary | null>>({});
  const [analysisLoadingByPodcast, setAnalysisLoadingByPodcast] = useState<Record<string, boolean>>({});
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsSeen, setNotificationsSeen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement | null>(null);

  const t = dark ? T.dark : T.light;
  const isMobile = viewportWidth < 900;
  const isTablet = viewportWidth < 1180;

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
    if (!isMobile) setMobileNavOpen(false);
  }, [isMobile]);

  useEffect(() => {
    if (authLoading) return;
    const load = async () => {
      setLoading(true);
      try {
        const token = backendToken ?? (await syncBackendSession());
        if (!token) { router.replace("/login"); return; }
        const [p, pod, overview] = await Promise.all([
          getJson<ProfileResponse>("/users/profile", token),
          getJson<PodcastsResponse>("/podcasts", token),
          getPodcastAnalytics(token),
        ]);
        const loadedPodcasts = Array.isArray(pod?.podcasts) ? pod.podcasts : [];
        setProfile(p); setPodcasts(loadedPodcasts); setIsMock(Boolean(pod?.is_mock)); setAnalytics(overview);
        const analysisEntries = await Promise.all(
          loadedPodcasts.map(async (podcast) => {
            try {
              const summary = await getPodcastAnalysis(podcast.id, token);
              return [podcast.id, summary] as const;
            } catch {
              return [podcast.id, null] as const;
            }
          })
        );
        setAnalysisByPodcast(Object.fromEntries(analysisEntries));
      } catch (e) { setError(e instanceof Error ? e.message : "Unable to load."); }
      finally { setLoading(false); }
    };
    void load();
  }, [authLoading, backendToken, router, syncBackendSession]);

  const safePodcasts = Array.isArray(podcasts) ? podcasts : [];

  const podcastsWithEffectiveStatus = safePodcasts.map((podcast) => ({
    ...podcast,
    status: getEffectivePodcastStatus(
      podcast,
      analysisByPodcast[podcast.id],
      Boolean(analysisLoadingByPodcast[podcast.id]),
    ),
  }));

  const processing = podcastsWithEffectiveStatus.filter(p => isProcessingStatus(p.status)).length;
  const payments   = podcastsWithEffectiveStatus.filter(p => isPaymentStatus(p.status)).length;
  const done       = podcastsWithEffectiveStatus.filter(p => isDoneStatus(p.status)).length;
  const filtered   = podcastsWithEffectiveStatus.filter(p =>
    activeTab === "all"
      ? true
      : activeTab === "processing"
        ? isProcessingStatus(p.status)
        : activeTab === "payments"
          ? isPaymentStatus(p.status)
        : isDoneStatus(p.status)
  );

  const firstName = profile?.full_name?.split(" ")[0] ?? null;
  const workspaceEpisodes = safePodcasts.length;
  const pendingActions = processing + payments;
  const readinessRate = workspaceEpisodes > 0 ? (done / workspaceEpisodes) * 100 : 0;
  const workspaceStatus =
    workspaceEpisodes === 0
      ? "Ready for first upload"
      : pendingActions > 0
        ? "In active production"
        : done > 0
          ? "Clips-ready library"
          : "Library building";
  const visibilityTotal = (analytics?.total_views ?? 0) + (analytics?.total_downloads ?? 0);
  const leadingClip = (Array.isArray(analytics?.top_clips) ? analytics.top_clips : [])[0] ?? null;
  const generatedClipsByPodcastId = useMemo(
    () =>
      Object.fromEntries(
        (analytics?.podcasts ?? []).map((podcast) => [podcast.podcast_id, podcast.total_clips]),
      ) as Record<string, number>,
    [analytics?.podcasts],
  );
  const notifications = useMemo(() => {
    const items: Array<{
      id: string;
      title: string;
      description: string;
      tone: "success" | "warning" | "info";
      ctaHref?: string;
      ctaLabel?: string;
    }> = [];

    podcastsWithEffectiveStatus.forEach((podcast) => {
      const analysis = analysisByPodcast[podcast.id];

      if (podcast.status === "processing") {
        items.push({
          id: `processing-${podcast.id}`,
          title: "Analysis in progress",
          description: `${podcast.title} is currently being processed.`,
          tone: "info",
          ctaHref: "/dashboard",
          ctaLabel: "View status",
        });
      }

      if (podcast.status === "awaiting_payment") {
        items.push({
          id: `payment-${podcast.id}`,
          title: "Payment required",
          description: `${podcast.title} is waiting for payment before processing can continue.`,
          tone: "warning",
          ctaHref: "/upload",
          ctaLabel: "Resolve upload",
        });
      }

      if (analysis && analysis.total_scored_segments > 0) {
        items.push({
          id: `analysis-${podcast.id}`,
          title: "Analysis ready",
          description: `${podcast.title} has ${analysis.total_scored_segments} scored moments ready for clips.`,
          tone: "success",
          ctaHref: `/clips?podcastId=${podcast.id}`,
          ctaLabel: "Open clips",
        });
      }
    });

    if (!items.length) {
      items.push({
        id: "empty",
        title: "No activity yet",
        description: "Upload or analyze an episode and your recent activity will appear here.",
        tone: "info",
        ctaHref: "/upload",
        ctaLabel: "Upload or import",
      });
    }

    return items.slice(0, 6);
  }, [analysisByPodcast, podcastsWithEffectiveStatus]);
  const unreadCount = notificationsSeen ? 0 : notifications.filter((item) => item.id !== "empty").length;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!notificationsRef.current) return;
      if (!notificationsRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    };

    if (notificationsOpen) {
      window.addEventListener("mousedown", handleClickOutside);
    }

    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [notificationsOpen]);

  const runAnalysis = async (podcastId: string) => {
    try {
      setAnalysisLoadingByPodcast((current) => ({ ...current, [podcastId]: true }));
      setPodcasts((current) =>
        current.map((podcast) =>
          podcast.id === podcastId ? { ...podcast, status: "processing" } : podcast
        )
      );
      setError("");
      const token = backendToken ?? (await syncBackendSession());
      if (!token) { router.replace("/login"); return; }
      const result = await analyzePodcast(podcastId, {}, token);
      setPodcasts((current) =>
        current.map((podcast) =>
          podcast.id === podcastId ? { ...podcast, status: "done" } : podcast
        )
      );
      setAnalysisByPodcast((current) => ({
        ...current,
        [podcastId]: {
          podcast_id: result.podcast_id,
          total_scored_segments: result.total_segments_analyzed,
          highest_score: result.top_scoring_segments[0]?.virality_score ?? 0,
          top_segments: result.top_scoring_segments,
        },
      }));
    } catch (e) {
      setPodcasts((current) =>
        current.map((podcast) =>
          podcast.id === podcastId ? { ...podcast, status: "ready_for_processing" } : podcast
        )
      );
      setError(e instanceof Error ? e.message : "Unable to run analysis.");
    } finally {
      setAnalysisLoadingByPodcast((current) => ({ ...current, [podcastId]: false }));
    }
  };

  /* ── loading screen ── */
  if (!mounted || loading || authLoading) return (
    <div style={{ display:"flex", minHeight:"100vh", alignItems:"center", justifyContent:"center", background: dark ? T.dark.bg : T.light.bg }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600;700&display=swap');
        @keyframes spin { to{transform:rotate(360deg)} }
      `}</style>
      <div style={{ textAlign:"center", fontFamily:"'DM Sans',sans-serif" }}>
        <div style={{
          width: 44, height: 44, borderRadius: "50%", margin: "0 auto 16px",
          border: `2px solid ${t.borderSub}`,
          borderTop: `2px solid ${t.accent}`,
          animation: "spin 1s linear infinite",
        }}/>
        <p style={{ fontSize: 11, letterSpacing: ".3em", textTransform: "uppercase", color: t.textFaint, fontWeight: 600 }}>Loading workspace</p>
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        html { scroll-behavior: smooth; }

        @keyframes slideUp   { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn    { from{opacity:0} to{opacity:1} }
        @keyframes orbDrift  { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(28px,-20px) scale(1.04)} }
        @keyframes spin      { to{transform:rotate(360deg)} }
        @keyframes barRise   { from{transform:scaleY(0)} to{transform:scaleY(1)} }
        @keyframes pulseDot  { 0%,100%{opacity:.45;transform:scale(.8)} 50%{opacity:1;transform:scale(1.15)} }
        @keyframes shimmer   { 0%{background-position:200% center} 100%{background-position:-200% center} }

        .orb1 { animation: orbDrift 14s ease-in-out infinite; }
        .orb2 { animation: orbDrift 18s 2s ease-in-out infinite; }
        .orb3 { animation: orbDrift 22s 5s ease-in-out infinite; }
        .bar  { transform-origin:bottom; animation: barRise .6s calc(var(--i)*.04s + .4s) cubic-bezier(.22,1,.36,1) both; }
        .pdot { animation: pulseDot 2.2s ease-in-out infinite; }
        .pc   { animation: slideUp .5s calc(var(--i)*.07s + .35s) cubic-bezier(.22,1,.36,1) both; }

        .nav-link:hover { background: rgba(90,158,58,.08) !important; }
        .icon-btn:hover { background: rgba(90,158,58,.1) !important; transform: scale(1.06); }
        .icon-btn { transition: all .2s cubic-bezier(.34,1.56,.64,1) !important; }

        .stat-card:hover { transform: translateY(-4px) !important; box-shadow: 0 16px 44px rgba(0,0,0,.13) !important; }
        .stat-card { transition: transform .3s cubic-bezier(.22,1,.36,1), box-shadow .3s !important; }

        .pod-item { transition: transform .28s cubic-bezier(.22,1,.36,1), box-shadow .28s; }
        .pod-item:hover { transform: translateY(-4px); box-shadow: 0 14px 36px rgba(0,0,0,.12); }

        .sidebar-link { transition: all .2s; }
        .sidebar-link:hover { background: rgba(90,158,58,.08) !important; transform: translateX(3px); }

        .upload-btn {
          transition: transform .25s cubic-bezier(.34,1.56,.64,1), box-shadow .25s;
          position: relative; overflow: hidden;
        }
        .upload-btn::after {
          content:''; position:absolute; inset:0;
          background:linear-gradient(105deg,transparent 40%,rgba(255,255,255,.18) 50%,transparent 60%);
          background-size:250%; background-position:200%;
          transition: background-position .5s;
        }
        .upload-btn:hover { transform: translateY(-3px); box-shadow: 0 18px 40px rgba(90,158,58,.38) !important; }
        .upload-btn:hover::after { background-position:-50%; }
        .upload-btn:active { transform: scale(.97); }

        .tab-btn {
          font-family:'DM Sans',sans-serif; font-size:12px; font-weight:500;
          border:none; background:none; cursor:pointer;
          padding:8px 16px; border-radius:8px;
          transition: all .2s;
          letter-spacing: .01em;
        }
        .tab-btn.on { font-weight:700; }

        .theme-toggle {
          cursor:pointer; border:none; background:none; padding:0;
          position:relative;
        }
        .notification-card {
          transition: transform .22s cubic-bezier(.22,1,.36,1), border-color .22s;
        }
        .notification-card:hover {
          transform: translateY(-2px);
          border-color: ${t.border};
        }

        .shimmer-name {
          background: linear-gradient(90deg, ${t.text} 0%, ${t.accent} 35%, ${t.accentLt} 55%, ${t.text} 100%);
          background-size:200% auto;
          -webkit-background-clip:text; -webkit-text-fill-color:transparent;
          background-clip:text;
          animation: shimmer 4s linear infinite;
        }

        ::-webkit-scrollbar { width:4px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:${t.border}; border-radius:4px; }
      `}</style>

      <div style={{
        minHeight: "100vh",
        background: t.bg,
        color: t.text,
        fontFamily: "'DM Sans', sans-serif",
        display: "flex",
        transition: "background .4s, color .4s",
        position: "relative",
      }}>

        {/* ── ambient orbs ── */}
        <div style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:0, overflow:"hidden" }}>
          <div className="orb1" style={{ position:"absolute", top:"-160px", right:"-80px", width:500, height:500, borderRadius:"50%", background:dark?"rgba(24,68,14,.55)":"rgba(168,228,130,.35)", filter:"blur(90px)" }}/>
          <div className="orb2" style={{ position:"absolute", bottom:"-120px", left:"-60px", width:420, height:420, borderRadius:"50%", background:dark?"rgba(15,52,8,.45)":"rgba(196,244,162,.32)", filter:"blur(80px)" }}/>
          <div className="orb3" style={{ position:"absolute", top:"40%", left:"35%", width:280, height:280, borderRadius:"50%", background:dark?"rgba(18,56,10,.3)":"rgba(215,248,185,.28)", filter:"blur(70px)" }}/>
        </div>

        {/* ═══════════════════════ SIDEBAR ═══════════════════════ */}
        {isMobile && mobileNavOpen && (
          <div
            onClick={() => setMobileNavOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,.35)",
              backdropFilter: "blur(4px)",
              zIndex: 45,
            }}
          />
        )}

        <aside style={{
          width: isMobile ? 240 : (collapsed ? 68 : 240),
          minHeight: "100vh",
          position: "fixed", top: 0, left: 0, zIndex: 50,
          background: t.sidebar,
          borderRight: `1px solid ${t.border}`,
          display: "flex", flexDirection: "column",
          transition: "width .35s cubic-bezier(.22,1,.36,1), transform .3s cubic-bezier(.22,1,.36,1)",
          overflow: "hidden",
          transform: isMobile ? (mobileNavOpen ? "translateX(0)" : "translateX(-100%)") : "translateX(0)",
          boxShadow: isMobile && mobileNavOpen ? "0 24px 60px rgba(0,0,0,.24)" : "none",
        }}>
          {/* Logo */}
          <div style={{
            padding: collapsed ? "22px 14px" : "24px 20px",
            borderBottom: `1px solid ${t.borderSub}`,
            display: "flex", alignItems: "center",
            gap: 12, justifyContent: collapsed ? "center" : "flex-start",
            flexShrink: 0,
          }}>
            <Image
              src="/insightclips-logo.svg"
              alt="InsightClips logo"
              width={34}
              height={34}
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                flexShrink: 0,
                boxShadow: `0 4px 16px ${t.accentGlow}`,
              }}
            />
            {!collapsed && (
              <div style={{ overflow:"hidden" }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".22em", textTransform: "uppercase", color: t.accentLt, lineHeight: 1 }}>InsightClips</div>
                <div style={{ fontFamily:"'DM Serif Display',serif", fontSize: 16, fontStyle:"italic", color: t.text, lineHeight: 1.2, marginTop: 2 }}>Dashboard</div>
              </div>
            )}
          </div>

          {/* Nav */}
          <nav style={{ flex: 1, padding: "16px 10px", display: "flex", flexDirection:"column", gap: 3 }}>
            <NavItem icon={LayoutDashboard} label="Overview"  href="/dashboard" active t={t} collapsed={collapsed}/>
            <NavItem icon={Library}         label="Library"   href="/podcasts"  t={t} collapsed={collapsed}/>
            <NavItem icon={BarChart2}       label="Analytics" href="/analytics" t={t} collapsed={collapsed}/>
            <NavItem icon={User}             label="Profile"   href="/profile"   t={t} collapsed={collapsed}/>
            <NavItem icon={Settings}         label="Settings"  href="/settings"  t={t} collapsed={collapsed}/>
          </nav>

          {/* Profile + sign out */}
          <div style={{
            padding: collapsed ? "16px 10px" : "16px 14px",
            borderTop: `1px solid ${t.borderSub}`,
            display: "flex", flexDirection:"column", gap: 10,
          }}>
            {/* Mini profile */}
            {!collapsed && profile && (
              <div style={{
                display:"flex", alignItems:"center", gap: 10,
                padding: "10px 12px", borderRadius: 12,
                background: `rgba(90,158,58,.06)`,
                border: `1px solid ${t.borderSub}`,
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                  background: `linear-gradient(135deg, ${t.accent}, ${t.accentLt})`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 700, color: "#fff",
                }}>
                  {(profile.full_name?.[0] ?? profile.email[0]).toUpperCase()}
                </div>
                <div style={{ overflow:"hidden", flex:1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                    {profile.full_name ?? "User"}
                  </div>
                  <div style={{ fontSize: 11, color: t.textSub, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                    {profile.email}
                  </div>
                </div>
              </div>
            )}
            <button onClick={() => void signOut()} style={{
              display:"flex", alignItems:"center", justifyContent: collapsed?"center":"flex-start", gap: 8,
              padding: "9px 12px", borderRadius: 10,
              background:"transparent", border:`1px solid ${t.redBord}`,
              color: t.red, fontSize: 13, fontWeight: 500, cursor:"pointer",
              fontFamily:"'DM Sans',sans-serif",
              transition: "all .2s",
            }}>
              <LogOut size={15} strokeWidth={1.8}/>
              {!collapsed && "Sign out"}
            </button>
          </div>
        </aside>

        {/* ═══════════════════════ MAIN AREA ═══════════════════════ */}
        <div style={{
          marginLeft: isMobile ? 0 : (collapsed ? 68 : 240),
          flex: 1, minHeight:"100vh",
          display:"flex", flexDirection:"column",
          transition:"margin-left .35s cubic-bezier(.22,1,.36,1)",
          position:"relative", zIndex:1,
        }}>

          {/* ── TOPBAR ── */}
          <header style={{
            position: "sticky", top: 0, zIndex: 40,
            background: t.topbar,
            backdropFilter: "blur(24px) saturate(1.5)",
            borderBottom: `1px solid ${t.border}`,
            padding: isMobile ? "0 16px" : "0 32px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            height: 64,
            animation: "slideUp .5s .0s cubic-bezier(.22,1,.36,1) both",
          }}>
            {/* Left — collapse toggle + breadcrumb */}
            <div style={{ display:"flex", alignItems:"center", gap: 16 }}>
              <button
                onClick={() => {
                  if (isMobile) {
                    setMobileNavOpen((v) => !v);
                  } else {
                    setCollapsed((v) => !v);
                  }
                }}
                className="icon-btn"
                style={{
                  width: 34, height: 34, borderRadius: 9,
                  background: `rgba(90,158,58,.08)`,
                  border: `1px solid ${t.borderSub}`,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  cursor:"pointer", color: t.textSub,
                }}
              >
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                  <rect x="1" y="2" width="13" height="1.5" rx=".75" fill="currentColor"/>
                  <rect x="1" y="6.5" width="9" height="1.5" rx=".75" fill="currentColor"/>
                  <rect x="1" y="11" width="11" height="1.5" rx=".75" fill="currentColor"/>
                </svg>
              </button>
              <div>
                <div style={{ fontSize: 10, letterSpacing: ".22em", textTransform:"uppercase", color: t.textFaint, fontWeight: 700 }}>InsightClips Studio</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: t.text, lineHeight: 1.1 }}>Executive Overview</div>
              </div>
            </div>

            {/* Right — theme toggle + bell + upload */}
            <div style={{ display:"flex", alignItems:"center", gap: 10 }}>

              {/* ── DARK/LIGHT TOGGLE ── */}
              <button
                onClick={() => setDark(v => !v)}
                className="theme-toggle"
                aria-label="Toggle theme"
                style={{
                  display:"flex", alignItems:"center", gap: 10,
                  padding: "7px 14px 7px 8px",
                  borderRadius: 100,
                  border: `1px solid ${t.border}`,
                  background: dark ? "rgba(14,22,11,.9)" : "rgba(255,255,255,.85)",
                  backdropFilter: "blur(10px)",
                  cursor:"pointer",
                  transition: "all .3s",
                }}
              >
                {/* Track */}
                <div style={{
                  width: 40, height: 22, borderRadius: 11, position:"relative",
                  background: dark ? `rgba(90,158,58,.35)` : `rgba(90,158,58,.2)`,
                  border: `1px solid ${dark ? "rgba(90,158,58,.4)" : "rgba(90,158,58,.3)"}`,
                  transition: "all .35s",
                  flexShrink: 0,
                }}>
                  {/* Knob */}
                  <div style={{
                    position:"absolute", top: 2,
                    left: dark ? 20 : 2,
                    width: 16, height: 16, borderRadius: "50%",
                    background: dark
                      ? `linear-gradient(135deg, #9dce7a, #5a9e3a)`
                      : `linear-gradient(135deg, #5a9e3a, #3d6e24)`,
                    boxShadow: `0 1px 6px rgba(90,158,58,.5)`,
                    transition: "left .35s cubic-bezier(.34,1.56,.64,1)",
                    display:"flex", alignItems:"center", justifyContent:"center",
                  }}>
                    {dark
                      ? <Moon size={8} color="#0d140b" strokeWidth={2.5}/>
                      : <SunMedium size={8} color="#fff" strokeWidth={2.5}/>
                    }
                  </div>
                </div>
                {!isMobile && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: t.textSub }}>
                    {dark ? "Dark" : "Light"}
                  </span>
                )}
              </button>

              {/* Bell */}
              <div ref={notificationsRef} style={{ position:"relative" }}>
                <button
                  className="icon-btn"
                  onClick={() => {
                    setNotificationsOpen((value) => !value);
                    setNotificationsSeen(true);
                  }}
                  style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: "transparent",
                    border: `1px solid ${t.border}`,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    color: t.textSub, position:"relative", cursor:"pointer",
                  }}
                >
                  <Bell size={15} strokeWidth={1.8}/>
                  {unreadCount > 0 && (
                    <span style={{
                      position:"absolute", top: 6, right: 5,
                      minWidth: 16, height: 16, borderRadius:999,
                      background: t.accent, border:`1.5px solid ${t.bg}`,
                      color:"#fff", fontSize:9, fontWeight:700,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      padding:"0 4px",
                    }}>
                      {Math.min(unreadCount, 9)}
                    </span>
                  )}
                </button>

                {notificationsOpen && (
                  <div
                    style={{
                      position:"absolute",
                      top: 46,
                      right: 0,
                      width: isMobile ? 300 : 360,
                      borderRadius: 18,
                      border: `1px solid ${t.border}`,
                      background: t.card,
                      backdropFilter: "blur(24px)",
                      boxShadow: "0 20px 60px rgba(0,0,0,.18)",
                      padding: 14,
                      zIndex: 80,
                    }}
                  >
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight:700, letterSpacing:".2em", textTransform:"uppercase", color:t.textFaint, marginBottom:4 }}>
                          Notifications
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>Recent activity</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setNotificationsSeen(true)}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: t.accent,
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        Mark all as read
                      </button>
                    </div>

                    <div style={{ display:"grid", gap: 10 }}>
                      {notifications.map((item) => {
                        const toneColor =
                          item.tone === "success"
                            ? t.accent
                            : item.tone === "warning"
                              ? "#c98a2d"
                              : t.textSub;

                        return (
                          <div
                            key={item.id}
                            className="notification-card"
                            style={{
                              borderRadius: 14,
                              border: `1px solid ${t.borderSub}`,
                              background: t.cardAlt,
                              padding: 12,
                            }}
                          >
                            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, marginBottom:6 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{item.title}</div>
                              <div style={{ width: 8, height: 8, borderRadius:"50%", background: toneColor, flexShrink:0 }} />
                            </div>
                            <div style={{ fontSize: 12, lineHeight: 1.6, color: t.textSub }}>{item.description}</div>
                            {item.ctaHref && item.ctaLabel && (
                              <Link
                                href={item.ctaHref}
                                onClick={() => setNotificationsOpen(false)}
                                style={{
                                  display:"inline-flex",
                                  alignItems:"center",
                                  gap: 6,
                                  marginTop: 10,
                                  color: t.accent,
                                  fontSize: 12,
                                  fontWeight: 700,
                                  textDecoration: "none",
                                }}
                              >
                                {item.ctaLabel}
                                <ChevronRight size={13} />
                              </Link>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Upload CTA */}
              <button onClick={() => router.push("/upload")} className="upload-btn" style={{
                display:"flex", alignItems:"center", gap: 7,
                padding: "9px 20px", borderRadius: 100, border:"none",
                background: `linear-gradient(135deg, ${dark?"#3d6e24":"#4a8e2a"}, ${t.accent})`,
                color: "#fff", fontSize: 13, fontWeight: 600,
                cursor:"pointer", fontFamily:"'DM Sans',sans-serif",
                boxShadow: `0 6px 22px ${t.accentGlow}`,
              }}>
                <Plus size={14} strokeWidth={2.5}/>
                {isMobile ? "Upload" : "New upload"}
              </button>
            </div>
          </header>

          {/* ── PAGE CONTENT ── */}
          <main style={{ padding: isMobile ? "20px 16px 40px" : "32px 32px 60px", flex:1 }}>

            {/* Welcome row */}
            <section
              className="ic-premium-card"
              style={{
                marginBottom: 28,
                borderRadius: 28,
                border: `1px solid ${t.border}`,
                background: dark
                  ? "linear-gradient(135deg, rgba(18,30,14,.96), rgba(12,18,10,.92))"
                  : "linear-gradient(135deg, rgba(255,255,255,.96), rgba(244,248,236,.98))",
                padding: isMobile ? "22px 18px" : "28px",
                boxShadow: dark ? "0 28px 70px rgba(0,0,0,.2)" : "0 28px 70px rgba(90,158,58,.08)",
                animation: "slideUp .55s .08s cubic-bezier(.22,1,.36,1) both",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isTablet ? "1fr" : "minmax(0,1.3fr) minmax(280px,.7fr)",
                  gap: 20,
                  alignItems: "stretch",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 18 }}>
                  <div>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "7px 12px",
                        borderRadius: 999,
                        border: `1px solid ${t.borderSub}`,
                        background: dark ? "rgba(90,158,58,.08)" : "rgba(90,158,58,.06)",
                        color: t.accentLt,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: ".2em",
                        textTransform: "uppercase",
                        marginBottom: 16,
                      }}
                    >
                      <Sparkles size={12} />
                      Studio Overview
                    </div>
                    <h1 style={{
                      fontFamily: "'DM Serif Display', serif",
                      fontSize: "clamp(30px, 3.6vw, 46px)",
                      fontStyle: "italic", letterSpacing: "-.045em",
                      lineHeight: 1.04, marginBottom: 10,
                    }}>
                      {firstName ? (
                        <>Welcome back, <span className="shimmer-name">{firstName}</span>.</>
                      ) : (
                        <span className="shimmer-name">Welcome to InsightClips</span>
                      )}
                    </h1>
                    <p style={{ fontSize: 15, color: t.textSub, lineHeight: 1.75, maxWidth: 680 }}>
                      {workspaceEpisodes > 0
                        ? analytics && analytics.total_clips > 0
                          ? `${analytics.total_clips} generated clip${analytics.total_clips !== 1 ? "s" : ""} across ${analytics.total_podcasts} tracked episode${analytics.total_podcasts !== 1 ? "s" : ""}, with ${analytics.published_clips} already published and ${visibilityTotal} total reach.`
                          : `${workspaceEpisodes} episode${workspaceEpisodes > 1 ? "s" : ""} are in your workspace. ${pendingActions > 0 ? `${pendingActions} still need attention before the pipeline is fully clear.` : "Your library is in a healthy state and ready for the next clip run."}`
                        : "Your workspace is ready. Upload the first episode and InsightClips will guide the rest of the clip workflow from analysis to publishing."}
                    </p>
                  </div>

                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <button
                      onClick={() => router.push("/upload")}
                      className="upload-btn ic-action"
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 8,
                        padding: "12px 22px", borderRadius: 999, border: "none",
                        background: `linear-gradient(135deg, ${dark ? "#3d6e24" : "#4a8e2a"}, ${t.accent})`,
                        color: "#fff", fontSize: 13, fontWeight: 700,
                        cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                        boxShadow: `0 10px 28px ${t.accentGlow}`,
                      }}
                    >
                      <Plus size={15} strokeWidth={2.5} />
                      Start new upload
                    </button>
                    <Link
                      href="/clips"
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 8,
                        padding: "11px 20px", borderRadius: 999,
                        border: `1px solid ${t.border}`,
                        background: dark ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.7)",
                        color: t.text, textDecoration: "none", fontSize: 13, fontWeight: 700,
                      }}
                    >
                      Open clips workspace
                      <ArrowUpRight size={14} />
                    </Link>
                  </div>
                </div>

                <div style={{ display: "grid", gap: 12 }}>
                  <SignalPill
                    label="Workspace status"
                    value={workspaceStatus}
                    accent={t.accent}
                    border={t.border}
                    dark={dark}
                  />
                  <SignalPill
                    label="Pipeline"
                    value={`${done} ready · ${processing} processing${payments ? ` · ${payments} payment hold` : ""}`}
                    accent={t.accent}
                    border={t.border}
                    dark={dark}
                  />
                  <SignalPill
                    label="Readiness"
                    value={workspaceEpisodes > 0 ? `${formatPercent(readinessRate)} of episodes are clips-ready` : "No episodes uploaded yet"}
                    accent={t.accent}
                    border={t.border}
                    dark={dark}
                  />
                </div>
              </div>
            </section>

            <section
              className="ic-premium-card"
              style={{
                marginBottom: 28,
                borderRadius: 22,
                border: `1px solid ${t.border}`,
                background: dark ? "rgba(255,255,255,.035)" : "rgba(255,255,255,.76)",
                padding: isMobile ? "16px" : "18px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
                <div>
                  <div className="ic-kicker" style={{ color: t.accent, borderColor: t.borderSub, background: dark ? "rgba(90,158,58,.1)" : "rgba(90,158,58,.08)" }}>
                    Studio path
                  </div>
                  <div style={{ marginTop: 10, fontFamily: "'DM Serif Display',serif", fontSize: 22, lineHeight: 1.1, color: t.text }}>
                    From upload to publish in four clear steps.
                  </div>
                </div>
                <Link
                  href="/upload"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    borderRadius: 999,
                    border: `1px solid ${t.border}`,
                    background: t.cardAlt,
                    color: t.textSub,
                    padding: "9px 13px",
                    textDecoration: "none",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  Start flow
                  <ArrowUpRight size={13} />
                </Link>
              </div>
              <div className="ic-studio-steps ic-mobile-scroll">
                {[
                  ["Upload", "Add a file or YouTube link."],
                  ["Tune", "Pick format, captions, and clip goals."],
                  ["Generate", "Let InsightClips rank the best moments."],
                  ["Publish", "Review, export, and track performance."],
                ].map(([title, copy], index) => (
                  <div key={title} className="ic-studio-step" style={{ borderColor: t.borderSub, background: dark ? "rgba(255,255,255,.025)" : "rgba(255,255,255,.68)" }}>
                    <span className="ic-studio-step-index" style={{ background: t.chip, color: t.accent }}>
                      {index + 1}
                    </span>
                    <div className="ic-studio-step-title" style={{ color: t.text }}>{title}</div>
                    <div className="ic-studio-step-copy" style={{ color: t.textSub, opacity: 1 }}>{copy}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* ── STATS GRID ── */}
            <div style={{
              display:"grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,190px),1fr))",
              gap: 16, marginBottom: 28,
            }}>
              <div className="stat-card">
                <StatCard icon={Mic2}       label="Podcasts"   value={analytics?.total_podcasts ?? safePodcasts.length} sub="total uploaded"          accent="#5a9e3a"  t={t} delay={.10}/>
              </div>
              <div className="stat-card">
                <StatCard icon={Play}       label="Total clips" value={analytics?.total_clips ?? 0} sub="generated across the workspace"  accent="#3a9e88"  t={t} delay={.16}/>
              </div>
              <div className="stat-card">
                <StatCard icon={TrendingUp} label="Publish rate" value={formatPercent(analytics?.publish_rate ?? 0)} sub="clips live for download" accent="#9e8a3a"  t={t} delay={.22}/>
              </div>
              <div className="stat-card">
                <StatCard icon={Activity}   label="Views"      value={analytics?.total_views ?? 0} sub="backend performance count" accent="#8a5a9e"  t={t} delay={.28}/>
              </div>
              <div className="stat-card">
                <StatCard icon={Download}   label="Downloads" value={analytics?.total_downloads ?? 0} sub="clip exports claimed" accent="#c98a2d"  t={t} delay={.34}/>
              </div>
            </div>

            {/* ── MAIN GRID: summary + library ── */}
            <div style={{ display:"grid", gridTemplateColumns:isTablet ? "1fr" : "320px 1fr", gap: 20, alignItems:"start" }}>

              {/* Left col */}
              <div style={{ display:"flex", flexDirection:"column", gap: 16 }}>

                {/* Performance summary */}
                <div style={{
                  padding: "20px", borderRadius: 22,
                  border: `1px solid ${t.border}`,
                  background: `linear-gradient(180deg, ${t.card}, ${t.cardAlt})`,
                  backdropFilter:"blur(20px)",
                  animation: "slideUp .55s .36s cubic-bezier(.22,1,.36,1) both",
                }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
                    <div style={{
                      width:36, height:36, borderRadius:10,
                      background:`rgba(138,90,158,.14)`,
                      border:`1px solid rgba(138,90,158,.22)`,
                      display:"flex", alignItems:"center", justifyContent:"center",
                    }}>
                      <Sparkles size={16} color="#8a5a9e" strokeWidth={1.8}/>
                    </div>
                    <div>
                      <div style={{ fontSize:12, fontWeight:600, color:t.text }}>Performance summary</div>
                      <div style={{ fontSize:11, color:t.textSub }}>
                        {leadingClip ? `Top clip ${leadingClip.clip_number} from ${leadingClip.podcast_title}` : "No clip ranking yet"}
                      </div>
                    </div>
                    <div style={{ marginLeft:"auto" }}>
                      <div style={{
                        padding:"3px 10px", borderRadius:100,
                        background: leadingClip ? "rgba(90,158,58,.12)" : "rgba(180,60,60,.12)",
                        border: `1px solid ${leadingClip ? "rgba(90,158,58,.25)" : "rgba(180,60,60,.25)"}`,
                        fontSize:10, fontWeight:700, letterSpacing:".1em", textTransform:"uppercase",
                        color: leadingClip ? t.accent : t.red,
                      }}>
                        {leadingClip ? "Tracked" : "Waiting"}
                      </div>
                    </div>
                  </div>
                  <div style={{ display:"grid", gap:10 }}>
                    <div style={{ fontSize:13, color:t.textSub, lineHeight:1.65 }}>
                      {leadingClip
                        ? `${leadingClip.views} views · ${leadingClip.downloads} downloads · ${leadingClip.published ? "published" : "private"}`
                        : "Generate and publish clips to unlock comparative performance insight."}
                    </div>
                    <div style={{ display:"grid", gap:8 }}>
                      {[
                        `${done} episode${done === 1 ? "" : "s"} are ready for clips.`,
                        `${processing} currently processing${payments ? ` · ${payments} waiting on payment` : ""}.`,
                        analytics?.average_virality_score
                          ? `Average virality score is ${analytics.average_virality_score.toFixed(1)} across tracked clips.`
                          : "Virality averages will appear after clips are generated.",
                      ].map((line) => (
                        <div
                          key={line}
                          style={{
                            padding:"10px 12px",
                            borderRadius:12,
                            border:`1px solid ${t.borderSub}`,
                            background:dark?"rgba(90,158,58,.05)":"rgba(90,158,58,.04)",
                            color:t.textSub,
                            fontSize:12,
                            lineHeight:1.6,
                          }}
                        >
                          {line}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Quick actions */}
                <div style={{
                  padding:"18px", borderRadius:22,
                  border:`1px solid ${t.border}`,
                  background:`linear-gradient(180deg, ${t.card}, ${t.cardAlt})`, backdropFilter:"blur(20px)",
                  animation:"slideUp .55s .42s cubic-bezier(.22,1,.36,1) both",
                }}>
                  <div style={{ fontSize:10, fontWeight:700, letterSpacing:".2em", textTransform:"uppercase", color:t.textFaint, marginBottom:12, paddingLeft:4 }}>
                    Quick actions
                  </div>
                    <div style={{ display:"grid", gridTemplateColumns:isTablet ? "1fr" : "1fr 1fr", gap:8 }}>
                  {[
                    { id:"upload",    icon:Plus,      label:"Upload or import",  sub:"File upload or YouTube link",      href:"/upload" },
                    { id:"podcasts",  icon:Library,   label:"Browse podcasts", sub:"Search your library",  href:"/podcasts" },
                    { id:"clips",     icon:Play,      label:"View clips",      sub:"Open discovery flow",  href:"/clips" },
                    { id:"analytics", icon:BarChart2, label:"View analytics",  sub:"Performance summary",  href:"/analytics" },
                    { id:"planning",  icon:Sparkles,  label:"Open planning",   sub:"Calendar and hashtags", href:"/clips" },
                    { id:"feedback",  icon:Settings,  label:"Share feedback",  sub:"Support and contact",  href:"/settings" },
                  ].map(({ id, icon:Icon, label, sub, href }) => (
                    <Link key={id} href={href} className="sidebar-link ic-premium-card" style={{
                      display:"flex", alignItems:"center", justifyContent:"space-between",
                      padding:"12px 12px", borderRadius:14,
                      background:dark?"rgba(90,158,58,.05)":"rgba(90,158,58,.04)",
                      border:`1px solid ${t.borderSub}`,
                      textDecoration:"none",
                    }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{
                          width:30, height:30, borderRadius:8,
                          background:dark?"rgba(90,158,58,.12)":"rgba(90,158,58,.1)",
                          display:"flex", alignItems:"center", justifyContent:"center",
                        }}>
                          <Icon size={13} color={t.accent} strokeWidth={1.8}/>
                        </div>
                        <div>
                          <div style={{ fontSize:12, fontWeight:500, color:t.text }}>{label}</div>
                          <div style={{ fontSize:10, color:t.textFaint }}>{sub}</div>
                        </div>
                      </div>
                      <ChevronRight size={12} color={t.textFaint}/>
                    </Link>
                  ))}
                  </div>
                </div>
              </div>

              {/* ── PODCAST LIBRARY PANEL ── */}
              <div
                id="library"
                style={{
                borderRadius:24, border:`1px solid ${t.border}`,
                background:`linear-gradient(180deg, ${t.card}, ${t.cardAlt})`, backdropFilter:"blur(20px)",
                overflow:"hidden",
                animation:"slideUp .55s .2s cubic-bezier(.22,1,.36,1) both",
              }}
              >
                {/* Panel header */}
                <div style={{ padding:"20px 24px 0", borderBottom:`1px solid ${t.borderSub}` }}>
                  <div style={{ display:"flex", alignItems:isMobile ? "stretch" : "center", justifyContent:"space-between", flexDirection:isMobile ? "column" : "row", gap:12, marginBottom:16 }}>
                    <div>
                      <div style={{
                        display:"inline-flex", alignItems:"center", gap:7,
                        padding:"6px 10px", borderRadius:999,
                        background:dark?"rgba(90,158,58,.08)":"rgba(90,158,58,.06)",
                        border:`1px solid ${t.borderSub}`,
                        color:t.accentLt, fontSize:10, fontWeight:700,
                        letterSpacing:".18em", textTransform:"uppercase",
                        marginBottom:10,
                      }}>
                        <Library size={12} />
                        Content Library
                      </div>
                      <h2 style={{
                        fontFamily:"'DM Serif Display',serif",
                        fontSize:26, fontStyle:"italic", letterSpacing:"-.03em",
                        color:t.text,
                      }}>Podcast Library</h2>
                      <p style={{ fontSize:13, color:t.textSub, marginTop:5, lineHeight:1.65, maxWidth:460 }}>
                        {isMock
                          ? "Showing demo content in the library view."
                          : `${safePodcasts.length} episode${safePodcasts.length!==1?"s":""} in the library. Filter by status, open clips, or start a fresh upload from here.`}
                      </p>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:8, width:isMobile ? "100%" : "auto", justifyContent:isMobile ? "space-between" : "flex-end" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", justifyContent:isMobile ? "space-between" : "flex-end" }}>
                        <button onClick={() => router.push("/upload")} className="upload-btn" style={{
                        display:"flex", alignItems:"center", gap:6,
                        padding:"8px 18px", borderRadius:100, border:"none",
                        background:`linear-gradient(135deg,${dark?"#3d6e24":"#4a8e2a"},${t.accent})`,
                        color:"#fff", fontSize:12, fontWeight:600,
                        cursor:"pointer", fontFamily:"'DM Sans',sans-serif",
                        boxShadow:`0 4px 16px ${t.accentGlow}`,
                      }}>
                          <Plus size={13} strokeWidth={2.5}/> Upload file
                        </button>
                        <Link href="/upload/youtube" style={{
                          display:"inline-flex", alignItems:"center", gap:6,
                          padding:"8px 14px", borderRadius:100,
                          border:`1px solid ${t.border}`,
                          background:t.cardAlt,
                          color:t.textSub, fontSize:12, fontWeight:600,
                          textDecoration:"none",
                        }}>
                          <Radio size={13} strokeWidth={2}/>
                          YouTube
                        </Link>
                      </div>
                      <Link href="/podcasts" style={{
                        display:"inline-flex", alignItems:"center", gap:6,
                        padding:"8px 12px", borderRadius:100,
                        border:`1px solid ${t.border}`,
                        background:"transparent",
                        color:t.textSub, fontSize:12, fontWeight:600,
                        textDecoration:"none",
                      }}>
                        View all
                        <ArrowUpRight size={13}/>
                      </Link>
                    </div>
                  </div>

                  {/* Tabs */}
                  <div style={{ display:"flex", gap:2 }}>
                    {(["all","processing","payments","done"] as const).map(tab => {
                      const on = activeTab===tab;
                      return (
                        <button key={tab} onClick={()=>setActiveTab(tab)} className={`tab-btn${on?" on":""}`} style={{
                          color: on ? t.accent : t.textSub,
                          background: on ? (dark?"rgba(90,158,58,.12)":"rgba(90,158,58,.09)") : "transparent",
                        }}>
                          {tab.charAt(0).toUpperCase()+tab.slice(1)}
                          {tab==="processing" && processing>0 && (
                            <span style={{
                              marginLeft:6, background:t.accent, color:"#fff",
                              borderRadius:6, padding:"1px 6px", fontSize:10, fontWeight:700,
                            }}>{processing}</span>
                          )}
                          {tab==="payments" && payments>0 && (
                            <span style={{
                              marginLeft:6, background:"#c98a2d", color:"#fff",
                              borderRadius:6, padding:"1px 6px", fontSize:10, fontWeight:700,
                            }}>{payments}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Content */}
                <div style={{ padding:20 }}>
                  {error && (
                    <div style={{
                      marginBottom:14, padding:"11px 14px", borderRadius:12, fontSize:13,
                      border:`1px solid ${t.redBord}`, background:t.redBg, color:t.red,
                    }}>{error}</div>
                  )}

                  {filtered.length === 0 ? (
                    <div className="ic-empty-state" style={{ padding:"52px 20px", textAlign:"center" }}>
                      <div style={{
                        width:68, height:68, borderRadius:18, margin:"0 auto 20px",
                        background:dark?"rgba(90,158,58,.1)":"rgba(90,158,58,.07)",
                        border:`1px solid ${t.border}`,
                        display:"flex", alignItems:"center", justifyContent:"center",
                        animation:"fadeIn 1s ease both",
                      }}>
                        <Radio size={26} color={t.accentLt} strokeWidth={1.6}/>
                      </div>
                      <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:22, fontStyle:"italic", color:t.text, marginBottom:8 }}>
                        {activeTab==="all" ? "No episodes yet" : "Nothing here"}
                      </div>
                      <p style={{ fontSize:13, color:t.textSub, marginBottom:24, lineHeight:1.65 }}>
                        {activeTab==="all" ? "Upload your first podcast to populate your library" : "No episodes match this filter"}
                      </p>
                      {activeTab==="all" && (
                        <button onClick={()=>router.push("/upload")} className="upload-btn" style={{
                          display:"inline-flex", alignItems:"center", gap:8,
                          padding:"11px 26px", borderRadius:100, border:"none",
                          background:`linear-gradient(135deg,${dark?"#3d6e24":"#4a8e2a"},${t.accent})`,
                          color:"#fff", fontSize:13, fontWeight:600,
                          cursor:"pointer", fontFamily:"'DM Sans',sans-serif",
                          boxShadow:`0 8px 24px ${t.accentGlow}`,
                        }}>
                          <Plus size={14}/> Upload or import first episode
                        </button>
                      )}
                    </div>
                  ) : (
                    <div style={{ display:"grid", gridTemplateColumns:isMobile ? "1fr" : "repeat(auto-fill,minmax(min(100%,220px),1fr))", gap:14 }}>
                      {filtered.map((podcast,i) => (
                        <div key={podcast.id} className={`pod-item pc`} style={{ "--i":i, borderRadius:14 } as React.CSSProperties}>
                          <PodcastCard
                            podcast={podcast}
                            analysis={analysisByPodcast[podcast.id]}
                            analysisLoading={Boolean(analysisLoadingByPodcast[podcast.id])}
                            onAnalyze={() => void runAnalysis(podcast.id)}
                            generatedClipsCount={generatedClipsByPodcastId[podcast.id] ?? 0}
                            dark={dark}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── BOTTOM ROW ── */}
            <div style={{ display:"grid", gridTemplateColumns:isTablet ? "1fr" : "1fr 1fr", gap:16, marginTop:20 }}>
              {/* Upload CTA banner */}
              <div
                onClick={()=>router.push("/upload")}
                style={{
                  padding:"26px 28px", borderRadius:18, cursor:"pointer",
                  background:`linear-gradient(135deg,${dark?"rgba(40,80,22,.6)":"rgba(200,235,175,.7)"},${dark?"rgba(25,55,14,.5)":"rgba(225,248,200,.6)"})`,
                  border:`1px solid ${dark?"rgba(90,158,58,.3)":"rgba(90,158,58,.22)"}`,
                  backdropFilter:"blur(14px)",
                  position:"relative", overflow:"hidden",
                  animation:"slideUp .55s .48s cubic-bezier(.22,1,.36,1) both",
                  transition:"transform .25s cubic-bezier(.22,1,.36,1)",
                }}
                onMouseEnter={e=>(e.currentTarget.style.transform="translateY(-3px)")}
                onMouseLeave={e=>(e.currentTarget.style.transform="translateY(0)")}
              >
                <Zap size={22} color={t.accent} style={{ marginBottom:12 }} strokeWidth={1.8}/>
                <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:20, fontStyle:"italic", color:t.text, marginBottom:6 }}>Upload or import</div>
                <p style={{ fontSize:13, color:t.textSub, lineHeight:1.65, marginBottom:16 }}>Start from a local video or paste a YouTube link and keep the same clip setup.</p>
                <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:12, fontWeight:600, color:t.accent }}>
                  Open upload workspace <ArrowUpRight size={14}/>
                </div>
              </div>

              {/* Clips workspace */}
              <div style={{
                padding:"26px 28px", borderRadius:18,
                border:`1px solid ${t.border}`,
                background:t.card, backdropFilter:"blur(14px)",
                animation:"slideUp .55s .52s cubic-bezier(.22,1,.36,1) both",
              }}>
                <Play size={22} color={t.textFaint} style={{ marginBottom:12 }} strokeWidth={1.8}/>
                <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:20, fontStyle:"italic", color:t.text, marginBottom:6 }}>Clips workspace</div>
                <p style={{ fontSize:13, color:t.textSub, lineHeight:1.65, marginBottom:16 }}>Analysis ranks the best moments first. Open Clips to generate the rendered videos.</p>
                <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                  <div className="pdot" style={{ width:6, height:6, borderRadius:"50%", background:t.accent, flexShrink:0 }}/>
                  <span style={{ fontSize:10, fontWeight:700, letterSpacing:".2em", textTransform:"uppercase", color:t.textFaint }}>Ready after analysis</span>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
