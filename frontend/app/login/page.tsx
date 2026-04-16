"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, ChevronRight, Eye, EyeOff, Loader2,
  Lock, Mail, Moon, SunMedium, Zap, BarChart3, Cpu, Layers,
} from "lucide-react";

import { postJson, storeBackendToken } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

type LoginResponse = { access_token: string };

/* ─── shared colour tokens (same palette, untouched) ─── */
const tk = {
  dark: {
    bg:      "#0e1510",
    card:    "#141f10",
    border:  "#2e4d22",
    text:    "#e8f5e2",
    muted:   "#7ab55c",
    faint:   "#3a6e25",
    accent:  "#5a9e3a",
    accentH: "#4d8a2f",
    glow:    "rgba(45,94,30,0.25)",
    glowB:   "rgba(30,58,18,0.20)",
    panelBg: "#0a1208",
  },
  light: {
    bg:      "#f0f7ec",
    card:    "#ffffff",
    border:  "#c5ddb5",
    text:    "#1a2e14",
    muted:   "#4a7030",
    faint:   "#8ab870",
    accent:  "#5a9e3a",
    accentH: "#4d8a2f",
    glow:    "rgba(197,240,160,0.40)",
    glowB:   "rgba(216,245,184,0.30)",
    panelBg: "#e2f0d4",
  },
};

/* ─── decorative stat pill used inside left panel ─── */
function StatPill({ val, label, dark }: { val: string; label: string; dark: boolean }) {
  const t = dark ? tk.dark : tk.light;
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "18px 22px", borderRadius: 16,
      border: `1px solid ${dark ? "rgba(90,158,58,0.2)" : "rgba(90,158,58,0.15)"}`,
      background: dark ? "rgba(20,31,16,0.7)" : "rgba(255,255,255,0.55)",
      backdropFilter: "blur(8px)",
    }}>
      <span style={{
        fontSize: 28, fontWeight: 800, letterSpacing: "-.04em",
        fontFamily: "'DM Serif Display', serif", fontStyle: "italic",
        color: t.accent, lineHeight: 1,
      }}>{val}</span>
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: ".18em",
        textTransform: "uppercase", color: t.muted, marginTop: 5,
      }}>{label}</span>
    </div>
  );
}

/* ─── feature row inside left panel ─── */
function FeatureRow({ icon, label, dark }: { icon: React.ReactNode; label: string; dark: boolean }) {
  const t = dark ? tk.dark : tk.light;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{
        width: 34, height: 34, borderRadius: 10,
        background: dark ? "rgba(90,158,58,0.12)" : "rgba(90,158,58,0.1)",
        border: `1px solid ${dark ? "rgba(90,158,58,0.25)" : "rgba(90,158,58,0.2)"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: t.accent, flexShrink: 0,
      }}>
        {icon}
      </div>
      <span style={{ fontSize: 13, fontWeight: 500, color: t.muted, letterSpacing: "-.01em" }}>{label}</span>
    </div>
  );
}

export default function LoginPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { syncBackendSession, user } = useAuth();

  const [email,        setEmail]        = useState(() => typeof window !== "undefined" ? window.localStorage.getItem("rememberedEmail") ?? "" : "");
  const [password,     setPassword]     = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe,   setRememberMe]   = useState(() => typeof window !== "undefined" ? Boolean(window.localStorage.getItem("rememberedEmail")) : false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");
  const [dark,         setDark]         = useState(() => typeof window !== "undefined" ? window.localStorage.getItem("insightclips-theme") === "dark" : false);

  const t = dark ? tk.dark : tk.light;

  const successMessage = useMemo(() =>
    searchParams.get("registered") === "true" ? "Account created. Sign in to open your dashboard." : "",
  [searchParams]);

  useEffect(() => { window.localStorage.setItem("insightclips-theme", dark ? "dark" : "light"); }, [dark]);
  useEffect(() => { if (user) router.replace("/dashboard"); }, [router, user]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true); setError("");
    const normalizedEmail = email.trim().toLowerCase();
    const { error: supaErr } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
    if (supaErr) { setError("Invalid email or password."); setLoading(false); return; }
    try {
      const backendAuth = await postJson<LoginResponse>("/auth/login", { email: normalizedEmail, password });
      storeBackendToken(backendAuth.access_token);
      await syncBackendSession();
      rememberMe ? window.localStorage.setItem("rememberedEmail", normalizedEmail) : window.localStorage.removeItem("rememberedEmail");
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
      setLoading(false);
    }
  };

  /* ─── input style ─── */
  const inputStyle: React.CSSProperties = {
    width: "100%", borderRadius: 14, padding: "13px 16px 13px 44px",
    fontSize: 14, outline: "none", transition: "all .25s",
    border: `1.5px solid ${dark ? "rgba(46,77,34,0.6)" : t.border}`,
    background: dark ? "rgba(20,31,16,0.8)" : "#fff",
    color: t.text,
    fontFamily: "inherit",
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display:ital@0;1&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; }
        @keyframes float-a { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-16px)} }
        @keyframes float-b { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
        @keyframes spin-ring { to{transform:rotate(360deg)} }
        @keyframes pulse-dot { 0%,100%{opacity:.4;transform:scale(.9)} 50%{opacity:1;transform:scale(1.1)} }
        @keyframes slide-up  { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        .orb-a { animation: float-a 7s ease-in-out infinite; }
        .orb-b { animation: float-b 9s 1s ease-in-out infinite; }
        .ring  { animation: spin-ring 24s linear infinite; }
        .pdot  { animation: pulse-dot 2.4s ease-in-out infinite; }
        .form-in { animation: slide-up .55s cubic-bezier(.22,1,.36,1) both; }
        input:focus { border-color: ${t.accent} !important; box-shadow: 0 0 0 3px ${dark ? "rgba(90,158,58,0.15)" : "rgba(90,158,58,0.10)"}; }
        input::placeholder { color: ${dark ? "rgba(74,112,48,0.45)" : "rgba(138,184,112,0.65)"}; }
        .btn-primary { background: #5a9e3a; color: #fff; border: none; cursor: pointer; font-family: inherit; transition: background .2s, transform .15s, box-shadow .2s; }
        .btn-primary:hover { background: #4d8a2f; box-shadow: 0 8px 28px rgba(90,158,58,0.38); }
        .btn-primary:active { transform: scale(.97); }
        .btn-primary:disabled { opacity: .55; cursor: not-allowed; }
        .theme-btn { cursor: pointer; font-family: inherit; transition: all .2s; }
        .theme-btn:hover { opacity: .8; }
        a { text-decoration: none; }
      `}</style>

      <div style={{
        minHeight: "100vh", display: "flex",
        background: t.bg, transition: "background .3s",
        fontFamily: "'DM Sans', sans-serif",
      }}>

        {/* ══════════════ LEFT PANEL ══════════════ */}
        <div style={{
          width: "48%", minHeight: "100vh", position: "relative",
          background: dark
            ? "linear-gradient(160deg, #0a1208 0%, #111d0c 50%, #0d1a09 100%)"
            : "linear-gradient(160deg, #d8edca 0%, #e6f4d7 50%, #daf0c8 100%)",
          display: "flex", flexDirection: "column", justifyContent: "center",
          padding: "60px 56px", overflow: "hidden",
          transition: "background .3s",
        }}>
          {/* Ambient orbs */}
          <div className="orb-a" style={{
            position: "absolute", top: "8%", right: "5%",
            width: 280, height: 280, borderRadius: "50%",
            background: `radial-gradient(circle, ${dark ? "rgba(90,158,58,0.18)" : "rgba(90,158,58,0.14)"}, transparent 70%)`,
            pointerEvents: "none",
          }}/>
          <div className="orb-b" style={{
            position: "absolute", bottom: "12%", left: "0%",
            width: 220, height: 220, borderRadius: "50%",
            background: `radial-gradient(circle, ${dark ? "rgba(45,94,30,0.22)" : "rgba(140,200,80,0.18)"}, transparent 70%)`,
            pointerEvents: "none",
          }}/>
          {/* Spinning ring */}
          <div className="ring" style={{
            position: "absolute", bottom: "18%", right: "-60px",
            width: 200, height: 200, borderRadius: "50%",
            border: `1px dashed ${dark ? "rgba(90,158,58,0.18)" : "rgba(90,158,58,0.22)"}`,
            pointerEvents: "none",
          }}/>
          <div style={{
            position: "absolute", top: "35%", right: "22px",
            width: 120, height: 120, borderRadius: "50%",
            border: `1px solid ${dark ? "rgba(90,158,58,0.1)" : "rgba(90,158,58,0.14)"}`,
            pointerEvents: "none",
          }}/>

          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 64 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 13,
              background: "linear-gradient(135deg, #5a9e3a, #3d6e24)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 6px 20px rgba(90,158,58,0.35)",
            }}>
              <Zap size={20} color="#fff" fill="#fff" />
            </div>
            <span style={{
              fontFamily: "'DM Serif Display', serif",
              fontSize: 22, fontStyle: "italic",
              color: dark ? "#e8f5e2" : "#1a2e14", letterSpacing: "-.02em",
            }}>
              Insight<span style={{ color: t.accent }}>Clips</span>
            </span>
          </div>

          {/* Headline */}
          <div style={{ marginBottom: 40 }}>
            <h2 style={{
              fontFamily: "'DM Serif Display', serif",
              fontSize: "clamp(34px, 3.5vw, 50px)",
              lineHeight: 1.05, letterSpacing: "-.04em",
              color: dark ? "#e8f5e2" : "#1a2e14",
              marginBottom: 16,
            }}>
              Turn hours of video<br />
              <em style={{ color: t.accent }}>into viral moments.</em>
            </h2>
            <p style={{
              fontSize: 15, lineHeight: 1.65, fontWeight: 400,
              color: dark ? "rgba(122,181,92,0.7)" : "rgba(74,112,48,0.75)",
              maxWidth: 360,
            }}>
              InsightClips uses AI to extract the highest-impact clips from your long-form content automatically.
            </p>
          </div>

          {/* Stats row */}
          <div style={{ display: "flex", gap: 14, marginBottom: 44 }}>
            <StatPill val="12M+" label="Clips made" dark={dark} />
            <StatPill val="99.9%" label="Uptime"    dark={dark} />
            <StatPill val="0.4s"  label="Latency"   dark={dark} />
          </div>

          {/* Feature list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 48 }}>
            <FeatureRow icon={<Cpu    size={15}/>} label="Semantic AI engine — finds the gold" dark={dark}/>
            <FeatureRow icon={<Layers size={15}/>} label="Auto-reframe for TikTok, Reels & Shorts" dark={dark}/>
            <FeatureRow icon={<BarChart3 size={15}/>} label="Viral score prediction before publish" dark={dark}/>
          </div>

          {/* Testimonial */}
          <div style={{
            padding: "22px 24px", borderRadius: 18,
            border: `1px solid ${dark ? "rgba(90,158,58,0.18)" : "rgba(90,158,58,0.2)"}`,
            background: dark ? "rgba(20,31,16,0.6)" : "rgba(255,255,255,0.6)",
            backdropFilter: "blur(10px)",
          }}>
            <div style={{ display: "flex", gap: 3, marginBottom: 12 }}>
              {[...Array(5)].map((_, i) => (
                <span key={i} style={{ color: t.accent, fontSize: 13 }}>★</span>
              ))}
            </div>
            <p style={{
              fontSize: 13, lineHeight: 1.65, fontStyle: "italic",
              color: dark ? "rgba(232,245,226,0.75)" : "rgba(26,46,20,0.7)",
              marginBottom: 14,
            }}>
              "InsightClips saved me 6+ hours a week. The clips it picks outperform anything I'd choose manually."
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: "linear-gradient(135deg, #5a9e3a, #3a7020)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 700, color: "#fff",
              }}>S</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: dark ? "#9dce7a" : "#3a6e25" }}>Sara M.</div>
                <div style={{ fontSize: 10, color: t.faint, letterSpacing: ".08em" }}>Content Creator · 480K followers</div>
              </div>
            </div>
          </div>

          {/* Live indicator */}
          <div style={{ position: "absolute", top: 28, right: 28, display: "flex", alignItems: "center", gap: 7 }}>
            <div className="pdot" style={{ width: 7, height: 7, borderRadius: "50%", background: t.accent }}/>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".2em", textTransform: "uppercase", color: t.muted }}>Live · All systems normal</span>
          </div>
        </div>

        {/* ══════════════ RIGHT PANEL — FORM ══════════════ */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: "48px 40px", position: "relative",
          background: dark ? "rgba(14,21,16,0.98)" : t.bg,
          transition: "background .3s",
        }}>
          {/* Subtle right-side glow */}
          <div style={{
            position: "absolute", top: "20%", right: "10%",
            width: 200, height: 200, borderRadius: "50%",
            background: `radial-gradient(circle, ${dark ? "rgba(45,94,30,0.12)" : "rgba(197,240,160,0.22)"}, transparent 70%)`,
            pointerEvents: "none",
          }}/>

          {/* Top bar */}
          <div style={{ width: "100%", maxWidth: 400, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 36 }}>
            <Link href="/" style={{
              display: "flex", alignItems: "center", gap: 7,
              fontSize: 13, fontWeight: 600,
              color: dark ? "rgba(122,181,92,0.65)" : "rgba(74,112,48,0.65)",
              transition: "color .2s",
            }}>
              <ArrowLeft size={15}/> Back
            </Link>
            <button
              className="theme-btn"
              onClick={() => setDark(v => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: 100,
                border: `1px solid ${dark ? "rgba(61,96,48,0.6)" : t.border}`,
                background: dark ? "rgba(30,48,24,0.8)" : "#fff",
                fontSize: 11, fontWeight: 700, color: dark ? "#9dce7a" : "#3a6e25",
              }}
            >
              {dark ? <SunMedium size={12}/> : <Moon size={12}/>}
              {dark ? "Light mode" : "Dark mode"}
            </button>
          </div>

          {/* Form card */}
          <div className="form-in" style={{ width: "100%", maxWidth: 400 }}>
            <div style={{ marginBottom: 36 }}>
              <h1 style={{
                fontFamily: "'DM Serif Display', serif",
                fontSize: 32, letterSpacing: "-.04em", lineHeight: 1.1,
                color: dark ? "#e8f5e2" : "#1a2e14", marginBottom: 8,
              }}>
                Welcome back
              </h1>
              <p style={{ fontSize: 14, color: dark ? "rgba(122,181,92,0.6)" : "rgba(74,112,48,0.6)", lineHeight: 1.6 }}>
                Sign in to your InsightClips account.
              </p>
            </div>

            {successMessage && (
              <div style={{
                marginBottom: 20, padding: "12px 16px", borderRadius: 12, fontSize: 13,
                border: `1px solid ${dark ? "rgba(61,96,48,0.6)" : "#b5dba0"}`,
                background: dark ? "rgba(30,58,18,0.7)" : "#eaf7e0",
                color: dark ? "#9dce7a" : "#3a6e25",
              }}>
                {successMessage}
              </div>
            )}

            <form style={{ display: "flex", flexDirection: "column", gap: 14 }} onSubmit={handleLogin}>
              {/* Email */}
              <div style={{ position: "relative" }}>
                <Mail size={15} style={{ position: "absolute", left: 15, top: "50%", transform: "translateY(-50%)", color: dark ? "rgba(90,158,58,0.55)" : "#8ab870", pointerEvents: "none" }}/>
                <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email address" style={inputStyle}/>
              </div>

              {/* Password */}
              <div style={{ position: "relative" }}>
                <Lock size={15} style={{ position: "absolute", left: 15, top: "50%", transform: "translateY(-50%)", color: dark ? "rgba(90,158,58,0.55)" : "#8ab870", pointerEvents: "none" }}/>
                <input type={showPassword ? "text" : "password"} required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" style={{ ...inputStyle, paddingRight: 44 }}/>
                <button type="button" onClick={() => setShowPassword(v => !v)} style={{
                  position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer", padding: 0,
                  color: dark ? "rgba(90,158,58,0.55)" : "#8ab870", transition: "color .2s",
                }}>
                  {showPassword ? <EyeOff size={15}/> : <Eye size={15}/>}
                </button>
              </div>

              {error && (
                <div style={{
                  padding: "11px 14px", borderRadius: 12, fontSize: 13,
                  border: `1px solid ${dark ? "rgba(94,46,46,0.5)" : "#e6b7b7"}`,
                  background: dark ? "rgba(42,20,20,0.6)" : "#fff4f4",
                  color: dark ? "#e08080" : "#9d4b4b",
                }}>{error}</div>
              )}

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
                  <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} style={{ accentColor: t.accent, width: 14, height: 14 }}/>
                  <span style={{ fontSize: 13, color: dark ? "rgba(122,181,92,0.65)" : "rgba(74,112,48,0.65)" }}>Remember me</span>
                </label>
                <Link href="/forgot-password" style={{ fontSize: 13, fontWeight: 600, color: t.accent }}>Forgot password?</Link>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary"
                style={{
                  marginTop: 4, width: "100%", padding: "14px 20px",
                  borderRadius: 14, fontSize: 14, fontWeight: 600,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  boxShadow: "0 6px 22px rgba(90,158,58,0.30)",
                }}
              >
                {loading ? <><Loader2 size={15} style={{ animation: "spin 1s linear infinite" }}/> Signing in…</> : <>Sign in <ChevronRight size={15}/></>}
              </button>
            </form>

            <p style={{ marginTop: 28, textAlign: "center", fontSize: 13, color: dark ? "rgba(122,181,92,0.45)" : "rgba(74,112,48,0.5)" }}>
              Don't have an account?{" "}
              <Link href="/register" style={{ fontWeight: 700, color: t.accent }}>Create one</Link>
            </p>
          </div>

          <p style={{ marginTop: 48, fontSize: 11, color: dark ? "rgba(58,110,37,0.35)" : "rgba(138,184,112,0.45)", letterSpacing: ".12em", textTransform: "uppercase" }}>
            InsightClips · Secure login
          </p>
        </div>
      </div>
    </>
  );
}