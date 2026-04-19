"use client";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Shield,
  Globe,
  Cpu,
  Layers,
  BarChart3,
  CheckCircle2,
  Play,
  MoveRight,
  Sun,
  Moon,
  ChevronDown,
  ArrowUpRight,
} from "lucide-react";

/* ─────────────────────────────────────────────
   COLOR TOKENS — pistachio palette
   ───────────────────────────────────────────── */
const theme = {
  dark: {
    bg:          "#0D1008",
    bgCard:      "#141A0E",
    bgCardHover: "#1A2213",
    border:      "rgba(163,208,107,0.08)",
    borderHover: "rgba(163,208,107,0.18)",
    text:        "#E8F0DC",
    textMuted:   "#7A9060",
    textFaint:   "#3D5030",
    accent:      "#A3D06B",
    accentDark:  "#6E9C3A",
    accentLight: "#C9E89A",
    glowA:       "rgba(163,208,107,0.12)",
    glowB:       "rgba(100,160,60,0.08)",
  },
  light: {
    bg:          "#F5F8EE",
    bgCard:      "#FFFFFF",
    bgCardHover: "#EFF5E4",
    border:      "rgba(100,140,60,0.12)",
    borderHover: "rgba(100,140,60,0.28)",
    text:        "#1A2510",
    textMuted:   "#5A7040",
    textFaint:   "#9AB878",
    accent:      "#5A8C28",
    accentDark:  "#3D6018",
    accentLight: "#8BBF45",
    glowA:       "rgba(140,190,60,0.15)",
    glowB:       "rgba(100,160,50,0.10)",
  },
};

const THEME_STORAGE_KEY = "ic-theme";

function subscribeTheme(callback: () => void) {
  const handler = (event: Event) => {
    const storageEvent = event as StorageEvent;
    if (storageEvent.type === "storage" && storageEvent.key && storageEvent.key !== THEME_STORAGE_KEY) {
      return;
    }
    callback();
  };

  window.addEventListener("storage", handler);
  window.addEventListener("ic-theme-change", handler);

  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener("ic-theme-change", handler);
  };
}

function getThemeSnapshot() {
  return window.localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
}

function getThemeServerSnapshot() {
  return "dark";
}

export default function InsightClipsLanding() {
  const [scrolled,       setScrolled]       = useState(false);
  const [activeFeature,  setActiveFeature]  = useState(1);
  const currentTheme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getThemeServerSnapshot);
  const isDark = currentTheme === "dark";

  const t = isDark ? theme.dark : theme.light;

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, isDark ? "dark" : "light");
  }, [isDark]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div
      style={{
        backgroundColor: t.bg,
        color: t.text,
        fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
        minHeight: "100vh",
        overflowX: "hidden",
        transition: "background-color 0.4s ease, color 0.4s ease",
        position: "relative",
      }}
    >
      {/* — Google Fonts import (injected once) — */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,700;1,700&family=DM+Serif+Display:ital@0;1&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::selection { background: ${t.accent}40; color: ${t.text}; }
        html { scroll-behavior: smooth; }

        @keyframes float-slow  { 0%,100%{transform:translateY(0)}  50%{transform:translateY(-18px)} }
        @keyframes pulse-glow  { 0%,100%{opacity:.5} 50%{opacity:1} }
        @keyframes slide-up    { from{opacity:0;transform:translateY(32px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fade-in     { from{opacity:0} to{opacity:1} }
        @keyframes spin-slow   { to{transform:rotate(360deg)} }
        @keyframes blink       { 0%,100%{opacity:1} 50%{opacity:0} }

        .hero-title   { animation: slide-up .9s cubic-bezier(.22,1,.36,1) both; }
        .hero-sub     { animation: slide-up .9s .15s cubic-bezier(.22,1,.36,1) both; }
        .hero-cta     { animation: slide-up .9s .28s cubic-bezier(.22,1,.36,1) both; }
        .hero-badge   { animation: fade-in 1s .05s both; }
        .float-orb    { animation: float-slow 7s ease-in-out infinite; }
        .float-orb2   { animation: float-slow 9s 1s ease-in-out infinite; }
        .spin-ring    { animation: spin-slow 20s linear infinite; }
        .pulse        { animation: pulse-glow 2.5s ease-in-out infinite; }

        .nav-link {
          font-size: 11px; font-weight: 700; letter-spacing: .18em;
          text-transform: uppercase; transition: color .25s;
          text-decoration: none; background: none; border: none; cursor: pointer;
        }
        .card-feature { transition: transform .35s cubic-bezier(.22,1,.36,1), box-shadow .35s, background-color .35s, border-color .35s; }
        .card-feature:hover { transform: translateY(-4px); }

        .theme-toggle {
          width: 52px; height: 28px; border-radius: 14px; position: relative;
          cursor: pointer; border: none; padding: 0;
          transition: background .35s;
        }
        .toggle-knob {
          position: absolute; top: 4px; width: 20px; height: 20px;
          border-radius: 50%; background: #fff;
          transition: left .3s cubic-bezier(.34,1.56,.64,1), background .3s;
          display: flex; align-items: center; justify-content: center;
        }

        .stat-item { transition: transform .3s; }
        .stat-item:hover { transform: scale(1.06); }

        .scroll-indicator { animation: float-slow 2.5s ease-in-out infinite; }

        /* Divider lines */
        .section-line {
          height: 1px;
          width: 100%;
        }
      `}</style>

      {/* ── Ambient glows ── */}
      <div style={{
        position:"fixed", inset:0, pointerEvents:"none", zIndex:0,
        background:`radial-gradient(ellipse 60% 50% at 15% 10%, ${t.glowA}, transparent),
                    radial-gradient(ellipse 55% 45% at 85% 85%, ${t.glowB}, transparent)`,
        transition:"background .5s",
      }}/>

      {/* ═══════════════════════════ NAV ═══════════════════════════ */}
      <nav style={{
        position:"fixed", top:0, width:"100%", zIndex:100,
        padding: scrolled ? "14px 0" : "28px 0",
        backdropFilter: scrolled ? "blur(20px) saturate(1.6)" : "none",
        backgroundColor: scrolled ? (isDark ? "rgba(13,16,8,.88)" : "rgba(245,248,238,.88)") : "transparent",
        borderBottom: scrolled ? `1px solid ${t.border}` : "1px solid transparent",
        transition:"all .4s ease",
      }}>
        <div style={{ maxWidth:1280, margin:"0 auto", padding:"0 40px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          {/* Logo */}
          <button
            onClick={() => window.scrollTo({top:0,behavior:"smooth"})}
            style={{ background:"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:12 }}
          >
            <Image
              src="/insightclips-logo.svg"
              alt="InsightClips logo"
              width={38}
              height={38}
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                boxShadow: `0 4px 20px ${t.accent}35`,
              }}
            />
            <span style={{
              fontFamily:"'DM Serif Display', serif",
              fontSize:20, fontStyle:"italic", color:t.text, letterSpacing:"-.02em",
            }}>
              Insight<span style={{ color:t.accent }}>Clips</span>
            </span>
          </button>

          {/* Center links */}
          <div style={{ display:"flex", alignItems:"center", gap:40 }}>
            <button
              className="nav-link"
              style={{ color:t.textMuted }}
              onClick={() => document.getElementById("features-section")?.scrollIntoView({behavior:"smooth"})}
            >
              Features
            </button>
            <button
              className="nav-link"
              style={{ color:t.textMuted }}
              onClick={() => document.getElementById("stats-section")?.scrollIntoView({behavior:"smooth"})}
            >
              Stats
            </button>
            <Link href="/login" className="nav-link" style={{ color:t.textMuted }}>
              Sign In
            </Link>
          </div>

          {/* Right side */}
          <div style={{ display:"flex", alignItems:"center", gap:16 }}>
            {/* Theme toggle */}
            <button
              className="theme-toggle"
              style={{ background: isDark ? `${t.accentDark}55` : `${t.accentLight}55`, border:`1px solid ${t.borderHover}` }}
              onClick={() => {
                const nextTheme = isDark ? "light" : "dark";
                window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
                window.dispatchEvent(new Event("ic-theme-change"));
              }}
              aria-label="Toggle theme"
            >
              <div className="toggle-knob" style={{
                left: isDark ? 4 : 28,
                background: isDark ? t.accentLight : t.accent,
              }}>
                {isDark
                  ? <Moon size={11} color={t.accentDark} />
                  : <Sun  size={11} color="#fff" />
                }
              </div>
            </button>

            <Link href="/register" style={{
              background:`linear-gradient(135deg, ${t.accent}, ${t.accentDark})`,
              color: isDark ? "#0D1008" : "#fff",
              padding:"10px 26px", borderRadius:100,
              fontSize:11, fontWeight:700, letterSpacing:".15em", textTransform:"uppercase",
              textDecoration:"none", display:"flex", alignItems:"center", gap:8,
              boxShadow:`0 4px 24px ${t.accent}30`,
              transition:"box-shadow .3s, transform .2s",
            }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = `0 6px 32px ${t.accent}55`)}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = `0 4px 24px ${t.accent}30`)}
            >
              Get Started <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>
      </nav>

      <main style={{ position:"relative", zIndex:1 }}>
        {/* ═══════════════════════════ HERO ═══════════════════════════ */}
        <section style={{
          minHeight:"100vh", display:"flex", flexDirection:"column",
          alignItems:"center", justifyContent:"center",
          padding:"120px 40px 80px", textAlign:"center", position:"relative",
        }}>
          {/* Decorative ring */}
          <div className="spin-ring" style={{
            position:"absolute", width:600, height:600,
            borderRadius:"50%",
            border:`1px dashed ${t.accent}18`,
            pointerEvents:"none",
          }}/>
          <div style={{
            position:"absolute", width:400, height:400,
            borderRadius:"50%",
            border:`1px solid ${t.accent}12`,
            pointerEvents:"none",
          }}/>

          {/* Float orbs */}
          <div className="float-orb" style={{
            position:"absolute", top:"18%", left:"8%",
            width:220, height:220, borderRadius:"50%",
            background:`radial-gradient(circle, ${t.accent}18, transparent 70%)`,
            pointerEvents:"none",
          }}/>
          <div className="float-orb2" style={{
            position:"absolute", bottom:"15%", right:"8%",
            width:180, height:180, borderRadius:"50%",
            background:`radial-gradient(circle, ${t.accentDark}22, transparent 70%)`,
            pointerEvents:"none",
          }}/>

          <div style={{ maxWidth:900, position:"relative", zIndex:2 }}>
            {/* Badge */}
            <div className="hero-badge" style={{
              display:"inline-flex", alignItems:"center", gap:8,
              padding:"7px 18px", borderRadius:100,
              border:`1px solid ${t.accent}30`,
              background:`${t.accent}08`,
              marginBottom:40,
            }}>
              <div className="pulse" style={{ width:6, height:6, borderRadius:"50%", background:t.accent }}/>
              <span style={{ fontSize:10, fontWeight:700, letterSpacing:".22em", textTransform:"uppercase", color:t.accent }}>
                Next-Gen Intelligence · v3.0
              </span>
            </div>

            {/* Title */}
            <h1 className="hero-title" style={{
              fontFamily:"'DM Serif Display', serif",
              fontSize:"clamp(52px,9vw,104px)",
              lineHeight:.88, color:t.text,
              letterSpacing:"-.04em", marginBottom:32,
            }}>
              High Impact.<br />
              <em style={{ color:t.accent }}>Low Effort.</em>
            </h1>

            {/* Subtitle */}
            <p className="hero-sub" style={{
              maxWidth:520, margin:"0 auto 48px",
              fontSize:17, fontWeight:400, lineHeight:1.65,
              color:t.textMuted, letterSpacing:"-.01em",
            }}>
              Our AI engine identifies viral-worthy clips from long-form videos with
              semantic precision — ready for social media in a single click.
            </p>

            {/* CTAs */}
            <div className="hero-cta" style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:16, flexWrap:"wrap" }}>
              <Link href="/register" style={{
                background:`linear-gradient(135deg, ${t.accent}, ${t.accentDark})`,
                color: isDark ? "#0D1008" : "#fff",
                padding:"16px 36px", borderRadius:14,
                fontSize:12, fontWeight:700, letterSpacing:".14em", textTransform:"uppercase",
                textDecoration:"none", display:"flex", alignItems:"center", gap:10,
                boxShadow:`0 8px 32px ${t.accent}38`,
                transition:"all .3s",
              }}>
                Start for Free <MoveRight size={16} />
              </Link>

              <button style={{
                display:"flex", alignItems:"center", gap:12,
                padding:"15px 28px", borderRadius:14,
                border:`1px solid ${t.border}`,
                background: isDark ? "rgba(255,255,255,.03)" : "rgba(0,0,0,.03)",
                color:t.text, fontSize:12, fontWeight:600,
                letterSpacing:".1em", textTransform:"uppercase", cursor:"pointer",
                transition:"all .3s",
              }}>
                <div style={{
                  width:32, height:32, borderRadius:"50%",
                  background:`${t.accent}18`,
                  display:"flex", alignItems:"center", justifyContent:"center",
                }}>
                  <Play size={12} color={t.accent} fill={t.accent} style={{ marginLeft:2 }} />
                </div>
                Watch Demo
              </button>
            </div>
          </div>

          {/* Scroll hint */}
          <div className="scroll-indicator" style={{
            position:"absolute", bottom:36, left:"50%", transform:"translateX(-50%)",
            display:"flex", flexDirection:"column", alignItems:"center", gap:8,
            color:t.textFaint,
          }}>
            <span style={{ fontSize:9, letterSpacing:".25em", textTransform:"uppercase", fontWeight:700 }}>Scroll</span>
            <ChevronDown size={16} />
          </div>
        </section>

        {/* ═══════════════════════════ LOGOS BAND ═══════════════════════════ */}
        <div style={{
          borderTop:`1px solid ${t.border}`,
          borderBottom:`1px solid ${t.border}`,
          padding:"20px 40px",
          background: isDark ? "rgba(255,255,255,.01)" : "rgba(0,0,0,.01)",
        }}>
          <div style={{
            maxWidth:1280, margin:"0 auto",
            display:"flex", alignItems:"center", justifyContent:"center", gap:60,
          }}>
            {["TechCrunch", "Product Hunt", "Forbes", "Wired", "Y Combinator"].map(name => (
              <span key={name} style={{
                fontSize:11, fontWeight:700, letterSpacing:".2em",
                textTransform:"uppercase", color:t.textFaint,
              }}>{name}</span>
            ))}
          </div>
        </div>

        {/* ═══════════════════════════ FEATURES ═══════════════════════════ */}
        <section id="features-section" style={{ maxWidth:1280, margin:"0 auto", padding:"120px 40px" }}>
          {/* Section header */}
          <div style={{ maxWidth:600, marginBottom:72 }}>
            <span style={{
              fontSize:10, fontWeight:700, letterSpacing:".25em",
              textTransform:"uppercase", color:t.accent, display:"block", marginBottom:16,
            }}>
              — Core capabilities
            </span>
            <h2 style={{
              fontFamily:"'DM Serif Display', serif",
              fontSize:"clamp(36px,5vw,60px)",
              lineHeight:1.05, letterSpacing:"-.04em", color:t.text,
            }}>
              Everything you need to go viral.
            </h2>
          </div>

          {/* Feature grid */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:20 }}>
            {[
              {
                icon:<Cpu size={24}/>,
                title:"Semantic AI",
                desc:"Analyses voice tone, cadence, and visual hooks simultaneously to surface only the moments that matter — the gold.",
                tag:"Engine",
                i:0,
              },
              {
                icon:<Layers size={24}/>,
                title:"Smart Cropping",
                desc:"Automatic reframing for TikTok 9:16, Reels, and YouTube Shorts with face-tracking and subject detection built in.",
                tag:"Output",
                i:1,
              },
              {
                icon:<BarChart3 size={24}/>,
                title:"Viral Score",
                desc:"Proprietary neural ranking model trained on 12M+ clips predicts engagement before you publish a single frame.",
                tag:"Analytics",
                i:2,
              },
            ].map(({ icon, title, desc, tag, i }) => (
              <FeatureCard
                key={i}
                icon={icon}
                title={title}
                desc={desc}
                tag={tag}
                active={activeFeature === i}
                isDark={isDark}
                t={t}
                onClick={() => setActiveFeature(i)}
              />
            ))}
          </div>
        </section>

        {/* ═══════════════════════════ STATS ═══════════════════════════ */}
        <section id="stats-section" style={{
          maxWidth:1280, margin:"0 auto 120px",
          padding:"80px 60px", borderRadius:32,
          border:`1px solid ${t.border}`,
          background: isDark ? "rgba(255,255,255,.015)" : "rgba(0,0,0,.02)",
          backdropFilter:"blur(4px)",
        }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:40, textAlign:"center" }}>
            {[
              { val:"0.4s",  label:"Inference Latency" },
              { val:"12M+",  label:"Clips Processed" },
              { val:"99.9%", label:"Uptime" },
              { val:"4.9★",  label:"User Rating" },
            ].map(({ val, label }) => (
              <div key={label} className="stat-item">
                <div style={{
                  fontFamily:"'DM Serif Display', serif",
                  fontSize:"clamp(40px,5vw,64px)", letterSpacing:"-.04em",
                  color:t.accent, lineHeight:1, marginBottom:10,
                }}>{val}</div>
                <div style={{
                  fontSize:10, fontWeight:700, letterSpacing:".22em",
                  textTransform:"uppercase", color:t.textMuted,
                }}>{label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ═══════════════════════════ CTA BANNER ═══════════════════════════ */}
        <section style={{
          maxWidth:1280, margin:"0 auto 120px", padding:"0 40px",
        }}>
          <div style={{
            padding:"80px 80px", borderRadius:32,
            background:`linear-gradient(135deg, ${t.accentDark}22, ${t.accent}12)`,
            border:`1px solid ${t.accent}25`,
            display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:40,
          }}>
            <div>
              <h2 style={{
                fontFamily:"'DM Serif Display', serif",
                fontSize:"clamp(32px,4vw,52px)", letterSpacing:"-.04em",
                color:t.text, marginBottom:14, lineHeight:1.1,
              }}>
                Ready to transform<br/><em style={{ color:t.accent }}>your content?</em>
              </h2>
              <p style={{ color:t.textMuted, fontSize:15, lineHeight:1.6, maxWidth:420 }}>
                Join 40,000+ creators using InsightClips to grow their audience every week.
              </p>
            </div>
            <Link href="/register" style={{
              background:`linear-gradient(135deg, ${t.accent}, ${t.accentDark})`,
              color: isDark ? "#0D1008" : "#fff",
              padding:"18px 44px", borderRadius:14, flexShrink:0,
              fontSize:12, fontWeight:700, letterSpacing:".14em", textTransform:"uppercase",
              textDecoration:"none", display:"flex", alignItems:"center", gap:10,
              boxShadow:`0 8px 40px ${t.accent}40`,
            }}>
              Create Free Account <ArrowUpRight size={16} />
            </Link>
          </div>
        </section>
      </main>

      {/* ═══════════════════════════ FOOTER ═══════════════════════════ */}
      <footer style={{
        borderTop:`1px solid ${t.border}`,
        padding:"60px 40px",
        background: isDark ? "rgba(0,0,0,.3)" : "rgba(0,0,0,.02)",
      }}>
        <div style={{
          maxWidth:1280, margin:"0 auto",
          display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:32,
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <Image
              src="/insightclips-logo.svg"
              alt="InsightClips logo"
              width={34}
              height={34}
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
              }}
            />
            <span style={{
              fontFamily:"'DM Serif Display', serif", fontSize:18,
              fontStyle:"italic", color:t.text, letterSpacing:"-.02em",
            }}>
              Insight<span style={{color:t.accent}}>Clips</span>
            </span>
          </div>

          <p style={{ fontSize:11, fontWeight:600, color:t.textFaint, letterSpacing:".2em", textTransform:"uppercase" }}>
            © 2026 InsightClips · All rights reserved
          </p>

          <div style={{ display:"flex", gap:28 }}>
            {[
              { icon:<Globe size={16}/>,       label:"Global CDN" },
              { icon:<Shield size={16}/>,      label:"SOC 2" },
              { icon:<CheckCircle2 size={16}/>, label:"99.9% SLA" },
            ].map(({ icon, label }) => (
              <div key={label} style={{
                display:"flex", alignItems:"center", gap:7,
                color:t.textMuted, fontSize:11, fontWeight:600,
                letterSpacing:".1em", textTransform:"uppercase", cursor:"default",
              }}>
                {icon} {label}
              </div>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ─────────────────────────────────────────────
   FEATURE CARD
   ───────────────────────────────────────────── */
type FeatureCardProps = {
  icon: ReactNode; title: string; desc: string;
  tag: string; active: boolean; isDark: boolean;
  t: typeof theme.dark; onClick: () => void;
};

function FeatureCard({ icon, title, desc, tag, active, isDark, t, onClick }: FeatureCardProps) {
  return (
    <button
      className="card-feature"
      onClick={onClick}
      style={{
        display:"flex", flexDirection:"column", alignItems:"flex-start", textAlign:"left",
        padding:"44px 40px", borderRadius:28, cursor:"pointer",
        border:`1px solid ${active ? t.accent + "50" : t.border}`,
        background: active
          ? `linear-gradient(135deg, ${t.accent}18, ${t.accentDark}10)`
          : (isDark ? "rgba(255,255,255,.02)" : "rgba(0,0,0,.015)"),
        boxShadow: active ? `0 8px 48px ${t.accent}20` : "none",
        outline:"none",
      }}
    >
      {/* Icon */}
      <div style={{
        width:52, height:52, borderRadius:16, marginBottom:32,
        background: active ? `${t.accent}20` : `${t.accent}10`,
        border:`1px solid ${active ? t.accent + "40" : t.accent + "15"}`,
        display:"flex", alignItems:"center", justifyContent:"center",
        color: t.accent,
        transition:"all .3s",
      }}>
        {icon}
      </div>

      {/* Tag */}
      <span style={{
        fontSize:9, fontWeight:700, letterSpacing:".28em",
        textTransform:"uppercase", color: active ? t.accent : t.textFaint,
        marginBottom:12, display:"block",
      }}>
        {tag}
      </span>

      {/* Title */}
      <h3 style={{
        fontFamily:"'DM Serif Display', serif",
        fontSize:26, letterSpacing:"-.03em", lineHeight:1.1,
        color:t.text, marginBottom:16, fontStyle:"italic",
      }}>
        {title}
      </h3>

      {/* Description */}
      <p style={{
        fontSize:14, lineHeight:1.7, color:t.textMuted, fontWeight:400,
      }}>
        {desc}
      </p>

      {/* Bottom indicator */}
      {active && (
        <div style={{
          marginTop:32, display:"flex", alignItems:"center", gap:6,
          fontSize:10, fontWeight:700, letterSpacing:".2em",
          textTransform:"uppercase", color:t.accent,
        }}>
          <div style={{ width:20, height:1, background:t.accent }}/>
          Active
        </div>
      )}
    </button>
  );
}
