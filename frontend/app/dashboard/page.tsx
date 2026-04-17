"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LogOut, Moon, Plus, SunMedium, Mic2, Clock,
  Sparkles, Settings, Bell, ChevronRight, Play,
  Activity, Zap, TrendingUp, MoreHorizontal,
  Radio, LayoutDashboard, Library, BarChart2,
  User, ArrowUpRight, CheckCircle2,
} from "lucide-react";

import { PodcastCard } from "@/components/PodcastCard";
import { UserProfileCard } from "@/components/UserProfileCard";
import { useAuth } from "@/context/AuthContext";
import { analyzePodcast, getJson, getPodcastAnalysis, type AnalysisSummary } from "@/lib/api";

type ProfileResponse = {
  id: string; email: string; full_name: string | null;
  profile_picture_url: string | null; free_trial_used: boolean;
  created_at: string | null; updated_at: string | null;
};
type Podcast = {
  id: string; user_id: string; title: string; duration: number;
  status: string; created_at: string | null; updated_at: string | null;
};
type PodcastsResponse = { podcasts: Podcast[]; is_mock: boolean };

function isDoneStatus(status: string) {
  return ["done", "completed", "ready_for_processing"].includes(status);
}

function isProcessingStatus(status: string) {
  return ["processing", "queued"].includes(status);
}

/* ─────────────────────── design tokens ─────────────────────── */
const T = {
  dark: {
    bg:       "#070d06",
    sidebar:  "#090e08",
    topbar:   "rgba(9,14,8,.92)",
    card:     "rgba(13,20,11,.88)",
    cardSolid:"#0d140b",
    border:   "rgba(60,105,40,.38)",
    borderSub:"rgba(60,105,40,.18)",
    text:     "#dff0d8",
    textSub:  "rgba(163,210,128,.6)",
    textFaint:"rgba(100,148,72,.38)",
    accent:   "#5a9e3a",
    accentLt: "#7ab55c",
    accentGlow:"rgba(90,158,58,.22)",
    red:      "#c86060",
    redBg:    "rgba(120,30,30,.5)",
    redBord:  "rgba(150,60,60,.4)",
  },
  light: {
    bg:       "#eff7ea",
    sidebar:  "#e6f2df",
    topbar:   "rgba(240,248,235,.95)",
    card:     "rgba(255,255,255,.92)",
    cardSolid:"#ffffff",
    border:   "rgba(140,200,110,.45)",
    borderSub:"rgba(140,200,110,.22)",
    text:     "#142210",
    textSub:  "rgba(55,100,35,.6)",
    textFaint:"rgba(100,148,72,.5)",
    accent:   "#4a8e2a",
    accentLt: "#6aa845",
    accentGlow:"rgba(90,158,58,.18)",
    red:      "#9d3a3a",
    redBg:    "rgba(255,238,238,.8)",
    redBord:  "rgba(215,165,165,.5)",
  },
};

/* ─────────────────────── helpers ─────────────────────── */
function fmtDur(secs: number) {
  const m = Math.floor(secs / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

/* ─────────────────────── nav item ─────────────────────── */
function NavItem({ icon: Icon, label, href, active, t, collapsed }:
  { icon: React.ElementType; label: string; href: string; active?: boolean; t: typeof T.dark; collapsed: boolean }) {
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
  { icon: React.ElementType; label: string; value: string|number; sub: string; accent: string; t: typeof T.dark; delay: number }) {
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

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════ */
export default function DashboardPage() {
  const router  = useRouter();
  const { backendToken, loading: authLoading, signOut, syncBackendSession } = useAuth();

  const [profile,   setProfile]   = useState<ProfileResponse | null>(null);
  const [podcasts,  setPodcasts]  = useState<Podcast[]>([]);
  const [isMock,    setIsMock]    = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");
  const [dark,      setDark]      = useState(true);
  const [mounted,   setMounted]   = useState(false);
  const [activeTab, setActiveTab] = useState<"all"|"processing"|"done">("all");
  const [collapsed, setCollapsed] = useState(false);
  const [analysisByPodcast, setAnalysisByPodcast] = useState<Record<string, AnalysisSummary | null>>({});
  const [analysisLoadingByPodcast, setAnalysisLoadingByPodcast] = useState<Record<string, boolean>>({});

  const t = dark ? T.dark : T.light;

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("insightclips-theme");
    if (savedTheme) setDark(savedTheme === "dark");
    setMounted(true);
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
        if (!token) { router.replace("/login"); return; }
        const [p, pod] = await Promise.all([
          getJson<ProfileResponse>("/users/profile", token),
          getJson<PodcastsResponse>("/podcasts", token),
        ]);
        setProfile(p); setPodcasts(pod.podcasts); setIsMock(pod.is_mock);
        const analysisEntries = await Promise.all(
          pod.podcasts.map(async (podcast) => {
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

  const totalDur   = podcasts.reduce((a, p) => a + (p.duration || 0), 0);
  const processing = podcasts.filter(p => isProcessingStatus(p.status)).length;
  const done       = podcasts.filter(p => isDoneStatus(p.status)).length;
  const filtered   = podcasts.filter(p =>
    activeTab === "all"
      ? true
      : activeTab === "processing"
        ? isProcessingStatus(p.status)
        : isDoneStatus(p.status)
  );

  const firstName = profile?.full_name?.split(" ")[0] ?? null;

  const runAnalysis = async (podcastId: string) => {
    try {
      setAnalysisLoadingByPodcast((current) => ({ ...current, [podcastId]: true }));
      setError("");
      const token = backendToken ?? (await syncBackendSession());
      if (!token) { router.replace("/login"); return; }
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
    } catch (e) {
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
        <aside style={{
          width: collapsed ? 68 : 240,
          minHeight: "100vh",
          position: "fixed", top: 0, left: 0, zIndex: 50,
          background: t.sidebar,
          borderRight: `1px solid ${t.border}`,
          display: "flex", flexDirection: "column",
          transition: "width .35s cubic-bezier(.22,1,.36,1)",
          overflow: "hidden",
        }}>
          {/* Logo */}
          <div style={{
            padding: collapsed ? "22px 14px" : "24px 20px",
            borderBottom: `1px solid ${t.borderSub}`,
            display: "flex", alignItems: "center",
            gap: 12, justifyContent: collapsed ? "center" : "flex-start",
            flexShrink: 0,
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10, flexShrink: 0,
              background: `linear-gradient(135deg, ${t.accent}, ${dark?"#3d6e24":"#5a9e3a"})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: `0 4px 16px ${t.accentGlow}`,
            }}>
              <Zap size={16} color="#fff" fill="#fff"/>
            </div>
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
            <NavItem icon={BarChart2}        label="Analytics" href="/analytics" t={t} collapsed={collapsed}/>
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
          marginLeft: collapsed ? 68 : 240,
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
            padding: "0 32px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            height: 64,
            animation: "slideUp .5s .0s cubic-bezier(.22,1,.36,1) both",
          }}>
            {/* Left — collapse toggle + breadcrumb */}
            <div style={{ display:"flex", alignItems:"center", gap: 16 }}>
              <button
                onClick={() => setCollapsed(v => !v)}
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
                <div style={{ fontSize: 10, letterSpacing: ".22em", textTransform:"uppercase", color: t.textFaint, fontWeight: 700 }}>InsightClips</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: t.text, lineHeight: 1.1 }}>Overview</div>
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
                <span style={{ fontSize: 12, fontWeight: 600, color: t.textSub }}>
                  {dark ? "Dark" : "Light"}
                </span>
              </button>

              {/* Bell */}
              <button className="icon-btn" style={{
                width: 36, height: 36, borderRadius: 10,
                background: "transparent",
                border: `1px solid ${t.border}`,
                display:"flex", alignItems:"center", justifyContent:"center",
                color: t.textSub, position:"relative", cursor:"pointer",
              }}>
                <Bell size={15} strokeWidth={1.8}/>
                <span style={{
                  position:"absolute", top: 7, right: 7,
                  width: 6, height: 6, borderRadius:"50%",
                  background: t.accent, border:`1.5px solid ${t.bg}`,
                }}/>
              </button>

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
                New upload
              </button>
            </div>
          </header>

          {/* ── PAGE CONTENT ── */}
          <main style={{ padding: "32px 32px 60px", flex:1 }}>

            {/* Welcome row */}
            <div style={{
              marginBottom: 28,
              animation: "slideUp .55s .08s cubic-bezier(.22,1,.36,1) both",
            }}>
              <h1 style={{
                fontFamily: "'DM Serif Display', serif",
                fontSize: "clamp(28px, 3vw, 40px)",
                fontStyle: "italic", letterSpacing: "-.04em",
                lineHeight: 1.1, marginBottom: 6,
              }}>
                {firstName ? (
                  <>Good day, <span className="shimmer-name">{firstName}</span> 👋</>
                ) : (
                  <span className="shimmer-name">Welcome to InsightClips</span>
                )}
              </h1>
              <p style={{ fontSize: 14, color: t.textSub, lineHeight: 1.6, fontWeight: 400 }}>
                {podcasts.length > 0
                  ? `${podcasts.length} episode${podcasts.length>1?"s":""} in your library${processing > 0 ? ` · ${processing} processing` : " · all done"}`
                  : "Your workspace is ready — upload your first episode to begin."}
              </p>
            </div>

            {/* ── STATS GRID ── */}
            <div style={{
              display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap: 16, marginBottom: 28,
            }}>
              <div className="stat-card">
                <StatCard icon={Mic2}       label="Podcasts"   value={podcasts.length} sub="total uploaded"          accent="#5a9e3a"  t={t} delay={.10}/>
              </div>
              <div className="stat-card">
                <StatCard icon={Clock}      label="Total audio" value={totalDur ? fmtDur(totalDur) : "0m"} sub="processed audio"  accent="#3a9e88"  t={t} delay={.16}/>
              </div>
              <div className="stat-card">
                <StatCard icon={Activity}   label="Processing"  value={processing}      sub="in the queue"           accent="#9e8a3a"  t={t} delay={.22}/>
              </div>
              <div className="stat-card">
                <StatCard icon={CheckCircle2} label="Completed" value={done}            sub="ready to export"        accent="#8a5a9e"  t={t} delay={.28}/>
              </div>
            </div>

            {/* ── MAIN GRID: chart + library ── */}
            <div style={{ display:"grid", gridTemplateColumns:"280px 1fr", gap: 20, alignItems:"start" }}>

              {/* Left col */}
              <div style={{ display:"flex", flexDirection:"column", gap: 16 }}>

                {/* Activity chart card */}
                <div style={{
                  padding: "22px", borderRadius: 18,
                  border: `1px solid ${t.border}`,
                  background: t.card,
                  backdropFilter: "blur(20px)",
                  animation: "slideUp .55s .3s cubic-bezier(.22,1,.36,1) both",
                }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom: 20 }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight:700, letterSpacing:".2em", textTransform:"uppercase", color:t.textFaint, marginBottom:6 }}>Weekly Uploads</div>
                      <div style={{ fontFamily:"'DM Serif Display',serif", fontSize: 26, fontStyle:"italic", color:t.accent, lineHeight:1 }}>+18%</div>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                      <TrendingUp size={14} color={t.accentLt} strokeWidth={2}/>
                      <span style={{ fontSize:11, fontWeight:600, color:t.accentLt }}>Growth</span>
                    </div>
                  </div>
                  {/* Bar chart */}
                  <div style={{ display:"flex", alignItems:"flex-end", gap:4, height:60, marginBottom:10 }}>
                    {[20,38,28,52,32,68,45,80,42,66,55,88].map((h, i) => (
                      <div key={i} className="bar" style={{
                        flex:1, borderRadius: "3px 3px 0 0", height:`${h}%`,
                        background: i===11
                          ? `linear-gradient(180deg,${t.accent},${t.accentLt})`
                          : dark?"rgba(90,158,58,.2)":"rgba(90,158,58,.16)",
                        "--i":i,
                      } as React.CSSProperties}/>
                    ))}
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between" }}>
                    <span style={{ fontSize:10, color:t.textFaint }}>12 wks ago</span>
                    <span style={{ fontSize:11, fontWeight:600, color:t.accent }}>This week</span>
                  </div>
                </div>

                {/* Free trial card */}
                <div style={{
                  padding: "20px", borderRadius: 18,
                  border: `1px solid ${t.border}`,
                  background: t.card,
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
                      <div style={{ fontSize:12, fontWeight:600, color:t.text }}>Free trial</div>
                      <div style={{ fontSize:11, color:t.textSub }}>
                        {profile?.free_trial_used ? "Already used" : "Available"}
                      </div>
                    </div>
                    <div style={{ marginLeft:"auto" }}>
                      <div style={{
                        padding:"3px 10px", borderRadius:100,
                        background: profile?.free_trial_used ? "rgba(180,60,60,.12)" : "rgba(90,158,58,.12)",
                        border: `1px solid ${profile?.free_trial_used ? "rgba(180,60,60,.25)" : "rgba(90,158,58,.25)"}`,
                        fontSize:10, fontWeight:700, letterSpacing:".1em", textTransform:"uppercase",
                        color: profile?.free_trial_used ? t.red : t.accent,
                      }}>
                        {profile?.free_trial_used ? "Used" : "Active"}
                      </div>
                    </div>
                  </div>
                  <div style={{
                    height:4, borderRadius:2,
                    background:dark?"rgba(90,158,58,.12)":"rgba(90,158,58,.1)",
                    overflow:"hidden",
                  }}>
                    <div style={{
                      height:"100%", borderRadius:2,
                      width: profile?.free_trial_used ? "100%" : "40%",
                      background:`linear-gradient(90deg,${t.accent},${t.accentLt})`,
                      transition:"width .8s cubic-bezier(.22,1,.36,1)",
                    }}/>
                  </div>
                </div>

                {/* Quick actions */}
                <div style={{
                  padding:"18px", borderRadius:18,
                  border:`1px solid ${t.border}`,
                  background:t.card, backdropFilter:"blur(20px)",
                  animation:"slideUp .55s .42s cubic-bezier(.22,1,.36,1) both",
                }}>
                  <div style={{ fontSize:10, fontWeight:700, letterSpacing:".2em", textTransform:"uppercase", color:t.textFaint, marginBottom:12, paddingLeft:4 }}>
                    Quick actions
                  </div>
                  {[
                    { icon:Plus,    label:"Upload episode",    sub:"Add new content",    href:"/upload" },
                    { icon:Play,    label:"View clips",        sub:"AI moments",         href:"/clips" },
                    { icon:Settings,label:"Account settings",  sub:"Profile & billing",  href:"/profile" },
                  ].map(({ icon:Icon, label, sub, href }) => (
                    <Link key={href} href={href} className="sidebar-link" style={{
                      display:"flex", alignItems:"center", justifyContent:"space-between",
                      padding:"10px 10px", borderRadius:10, marginBottom:4,
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

              {/* ── PODCAST LIBRARY PANEL ── */}
              <div style={{
                borderRadius:20, border:`1px solid ${t.border}`,
                background:t.card, backdropFilter:"blur(20px)",
                overflow:"hidden",
                animation:"slideUp .55s .2s cubic-bezier(.22,1,.36,1) both",
              }}>
                {/* Panel header */}
                <div style={{ padding:"20px 24px 0", borderBottom:`1px solid ${t.borderSub}` }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
                    <div>
                      <h2 style={{
                        fontFamily:"'DM Serif Display',serif",
                        fontSize:22, fontStyle:"italic", letterSpacing:"-.03em",
                        color:t.text,
                      }}>Podcast Library</h2>
                      <p style={{ fontSize:12, color:t.textSub, marginTop:3 }}>
                        {isMock ? "Showing demo content" : `${podcasts.length} episode${podcasts.length!==1?"s":""} total`}
                      </p>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <button onClick={() => router.push("/upload")} className="upload-btn" style={{
                        display:"flex", alignItems:"center", gap:6,
                        padding:"8px 18px", borderRadius:100, border:"none",
                        background:`linear-gradient(135deg,${dark?"#3d6e24":"#4a8e2a"},${t.accent})`,
                        color:"#fff", fontSize:12, fontWeight:600,
                        cursor:"pointer", fontFamily:"'DM Sans',sans-serif",
                        boxShadow:`0 4px 16px ${t.accentGlow}`,
                      }}>
                        <Plus size={13} strokeWidth={2.5}/> Upload
                      </button>
                      <button className="icon-btn" style={{
                        width:34, height:34, borderRadius:9,
                        border:`1px solid ${t.border}`,
                        background:"transparent",
                        display:"flex", alignItems:"center", justifyContent:"center",
                        color:t.textSub, cursor:"pointer",
                      }}>
                        <MoreHorizontal size={15}/>
                      </button>
                    </div>
                  </div>

                  {/* Tabs */}
                  <div style={{ display:"flex", gap:2 }}>
                    {(["all","processing","done"] as const).map(tab => {
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
                    <div style={{ padding:"52px 20px", textAlign:"center" }}>
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
                          <Plus size={14}/> Upload first episode
                        </button>
                      )}
                    </div>
                  ) : (
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:14 }}>
                      {filtered.map((podcast,i) => (
                        <div key={podcast.id} className={`pod-item pc`} style={{ "--i":i, borderRadius:14 } as React.CSSProperties}>
                          <PodcastCard
                            podcast={podcast}
                            analysis={analysisByPodcast[podcast.id]}
                            analysisLoading={Boolean(analysisLoadingByPodcast[podcast.id])}
                            onAnalyze={() => void runAnalysis(podcast.id)}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── BOTTOM ROW ── */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginTop:20 }}>
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
                <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:20, fontStyle:"italic", color:t.text, marginBottom:6 }}>Quick upload</div>
                <p style={{ fontSize:13, color:t.textSub, lineHeight:1.65, marginBottom:16 }}>Drag in a video and get clips in under 60 seconds.</p>
                <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:12, fontWeight:600, color:t.accent }}>
                  Start now <ArrowUpRight size={14}/>
                </div>
              </div>

              {/* AI Clips teaser */}
              <div style={{
                padding:"26px 28px", borderRadius:18,
                border:`1px solid ${t.border}`,
                background:t.card, backdropFilter:"blur(14px)",
                animation:"slideUp .55s .52s cubic-bezier(.22,1,.36,1) both",
              }}>
                <Play size={22} color={t.textFaint} style={{ marginBottom:12 }} strokeWidth={1.8}/>
                <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:20, fontStyle:"italic", color:t.text, marginBottom:6 }}>AI Clips</div>
                <p style={{ fontSize:13, color:t.textSub, lineHeight:1.65, marginBottom:16 }}>Smart moment extraction — dropping in the next release.</p>
                <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                  <div className="pdot" style={{ width:6, height:6, borderRadius:"50%", background:t.accent, flexShrink:0 }}/>
                  <span style={{ fontSize:10, fontWeight:700, letterSpacing:".2em", textTransform:"uppercase", color:t.textFaint }}>In development</span>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
