"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  ChevronRight,
  Cpu,
  Eye,
  EyeOff,
  Layers,
  Loader2,
  Lock,
  Mail,
  Moon,
  SunMedium,
} from "lucide-react";

import { postJson, storeBackendToken } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

type LoginResponse = { access_token: string };

const tk = {
  dark: {
    bg: "#0e1510",
    border: "#2e4d22",
    text: "#e8f5e2",
    muted: "#7ab55c",
    faint: "#3a6e25",
    accent: "#5a9e3a",
  },
  light: {
    bg: "#f0f7ec",
    border: "#c5ddb5",
    text: "#1a2e14",
    muted: "#4a7030",
    faint: "#8ab870",
    accent: "#5a9e3a",
  },
};

function StatPill({ val, label, dark }: { val: string; label: string; dark: boolean }) {
  const t = dark ? tk.dark : tk.light;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "18px 22px",
        borderRadius: 16,
        border: `1px solid ${dark ? "rgba(90,158,58,0.2)" : "rgba(90,158,58,0.15)"}`,
        background: dark ? "rgba(20,31,16,0.7)" : "rgba(255,255,255,0.55)",
        backdropFilter: "blur(8px)",
      }}
    >
      <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-.04em", fontFamily: "'DM Serif Display', serif", fontStyle: "italic", color: t.accent, lineHeight: 1 }}>
        {val}
      </span>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase", color: t.muted, marginTop: 5 }}>
        {label}
      </span>
    </div>
  );
}

function FeatureRow({ icon, label, dark }: { icon: React.ReactNode; label: string; dark: boolean }) {
  const t = dark ? tk.dark : tk.light;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          background: dark ? "rgba(90,158,58,0.12)" : "rgba(90,158,58,0.1)",
          border: `1px solid ${dark ? "rgba(90,158,58,0.25)" : "rgba(90,158,58,0.2)"}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: t.accent,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <span style={{ fontSize: 13, fontWeight: 500, color: t.muted, letterSpacing: "-.01em" }}>{label}</span>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { syncBackendSession, user } = useAuth();

  const [email, setEmail] = useState(
    () =>
      searchParams.get("email") ??
      (typeof window !== "undefined" ? window.localStorage.getItem("rememberedEmail") ?? "" : ""),
  );
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(
    () => typeof window !== "undefined" && Boolean(window.localStorage.getItem("rememberedEmail")),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dark, setDark] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem("insightclips-theme") === "dark",
  );
  const [viewportWidth, setViewportWidth] = useState(1280);

  const t = dark ? tk.dark : tk.light;
  const isMobile = viewportWidth < 980;

  const successMessage = useMemo(() => {
    if (searchParams.get("registered") === "true") {
      return "Account verified. You can now sign in directly with your email and password.";
    }

    return "";
  }, [searchParams]);

  useEffect(() => {
    window.localStorage.setItem("insightclips-theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (user) {
      router.replace("/dashboard");
    }
  }, [router, user]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const normalizedEmail = email.trim().toLowerCase();

    try {
      const { error: supaErr } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (supaErr) {
        throw new Error("Invalid email or password.");
      }

      const backendAuth = await postJson<LoginResponse>("/auth/login", {
        email: normalizedEmail,
        password,
      });

      storeBackendToken(backendAuth.access_token);
      await syncBackendSession();

      if (rememberMe) {
        window.localStorage.setItem("rememberedEmail", normalizedEmail);
      } else {
        window.localStorage.removeItem("rememberedEmail");
      }

      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    borderRadius: 14,
    padding: "13px 16px 13px 44px",
    fontSize: 14,
    outline: "none",
    transition: "all .25s",
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
        @keyframes slide-up { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        .orb-a { animation: float-a 7s ease-in-out infinite; }
        .orb-b { animation: float-b 9s 1s ease-in-out infinite; }
        .ring { animation: spin-ring 24s linear infinite; }
        .pdot { animation: pulse-dot 2.4s ease-in-out infinite; }
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

      <div style={{ minHeight: "100vh", display: "flex", flexDirection: isMobile ? "column" : "row", background: t.bg, transition: "background .3s", fontFamily: "'DM Sans', sans-serif" }}>
        <div
          style={{
            width: isMobile ? "100%" : "48%",
            minHeight: isMobile ? "auto" : "100vh",
            position: "relative",
            background: dark ? "linear-gradient(160deg, #0a1208 0%, #111d0c 50%, #0d1a09 100%)" : "linear-gradient(160deg, #d8edca 0%, #e6f4d7 50%, #daf0c8 100%)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: isMobile ? "28px 18px 24px" : "60px 56px",
            overflow: "hidden",
            transition: "background .3s",
          }}
        >
          <div className="orb-a" style={{ position: "absolute", top: "8%", right: "5%", width: 280, height: 280, borderRadius: "50%", background: `radial-gradient(circle, ${dark ? "rgba(90,158,58,0.18)" : "rgba(90,158,58,0.14)"}, transparent 70%)`, pointerEvents: "none" }} />
          <div className="orb-b" style={{ position: "absolute", bottom: "12%", left: "0%", width: 220, height: 220, borderRadius: "50%", background: `radial-gradient(circle, ${dark ? "rgba(45,94,30,0.22)" : "rgba(140,200,80,0.18)"}, transparent 70%)`, pointerEvents: "none" }} />
          <div className="ring" style={{ position: "absolute", bottom: "18%", right: "-60px", width: 200, height: 200, borderRadius: "50%", border: `1px dashed ${dark ? "rgba(90,158,58,0.18)" : "rgba(90,158,58,0.22)"}`, pointerEvents: "none" }} />
          <div style={{ position: "absolute", top: "35%", right: "22px", width: 120, height: 120, borderRadius: "50%", border: `1px solid ${dark ? "rgba(90,158,58,0.1)" : "rgba(90,158,58,0.14)"}`, pointerEvents: "none" }} />

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 64 }}>
            <Image
              src="/insightclips-logo.svg"
              alt="InsightClips logo"
              width={42}
              height={42}
              style={{
                width: 42,
                height: 42,
                borderRadius: 13,
                boxShadow: "0 6px 20px rgba(90,158,58,0.35)",
              }}
            />
            <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, fontStyle: "italic", color: dark ? "#e8f5e2" : "#1a2e14", letterSpacing: "-.02em" }}>
              Insight<span style={{ color: t.accent }}>Clips</span>
            </span>
          </div>

          <div style={{ marginBottom: 40 }}>
            <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: "clamp(34px, 3.5vw, 50px)", lineHeight: 1.05, letterSpacing: "-.04em", color: dark ? "#e8f5e2" : "#1a2e14", marginBottom: 16 }}>
              Turn hours of video
              <br />
              <em style={{ color: t.accent }}>into viral moments.</em>
            </h2>
            <p style={{ fontSize: 15, lineHeight: 1.65, fontWeight: 400, color: dark ? "rgba(122,181,92,0.7)" : "rgba(74,112,48,0.75)", maxWidth: 360 }}>
              InsightClips uses AI to extract the highest-impact clips from your long-form content automatically.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0,1fr))", gap: 14, marginBottom: 44 }}>
            <StatPill val="12M+" label="Clips made" dark={dark} />
            <StatPill val="99.9%" label="Uptime" dark={dark} />
            <StatPill val="0.4s" label="Latency" dark={dark} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 48 }}>
            <FeatureRow icon={<Cpu size={15} />} label="Semantic AI engine - finds the gold" dark={dark} />
            <FeatureRow icon={<Layers size={15} />} label="Auto-reframe for TikTok, Reels and Shorts" dark={dark} />
            <FeatureRow icon={<BarChart3 size={15} />} label="Viral score prediction before publish" dark={dark} />
          </div>

          <div style={{ padding: "22px 24px", borderRadius: 18, border: `1px solid ${dark ? "rgba(90,158,58,0.18)" : "rgba(90,158,58,0.2)"}`, background: dark ? "rgba(20,31,16,0.6)" : "rgba(255,255,255,0.6)", backdropFilter: "blur(10px)" }}>
            <div style={{ display: "flex", gap: 3, marginBottom: 12 }}>
              {[...Array(5)].map((_, i) => (
                <span key={i} style={{ color: t.accent, fontSize: 13 }}>★</span>
              ))}
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.65, fontStyle: "italic", color: dark ? "rgba(232,245,226,0.75)" : "rgba(26,46,20,0.7)", marginBottom: 14 }}>
              &ldquo;InsightClips saved me 6+ hours a week. The clips it picks outperform anything I&apos;d choose manually.&rdquo;
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, #5a9e3a, #3a7020)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff" }}>
                S
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: dark ? "#9dce7a" : "#3a6e25" }}>Sara M.</div>
                <div style={{ fontSize: 10, color: t.faint, letterSpacing: ".08em" }}>Content Creator - 480K followers</div>
              </div>
            </div>
          </div>

          <div style={{ position: "absolute", top: 28, right: 28, display: "flex", alignItems: "center", gap: 7 }}>
            <div className="pdot" style={{ width: 7, height: 7, borderRadius: "50%", background: t.accent }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".2em", textTransform: "uppercase", color: t.muted }}>
              Live - All systems normal
            </span>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: isMobile ? "28px 16px 36px" : "48px 40px", position: "relative", background: dark ? "rgba(14,21,16,0.98)" : t.bg, transition: "background .3s" }}>
          <div style={{ position: "absolute", top: "20%", right: "10%", width: 200, height: 200, borderRadius: "50%", background: `radial-gradient(circle, ${dark ? "rgba(45,94,30,0.12)" : "rgba(197,240,160,0.22)"}, transparent 70%)`, pointerEvents: "none" }} />

          <div style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "stretch" : "center", gap: isMobile ? 12 : 0, marginBottom: 36 }}>
            <Link href="/" style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, color: dark ? "rgba(122,181,92,0.65)" : "rgba(74,112,48,0.65)", transition: "color .2s" }}>
              <ArrowLeft size={15} /> Back
            </Link>
            <button className="theme-btn" onClick={() => setDark((value) => !value)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 100, border: `1px solid ${dark ? "rgba(61,96,48,0.6)" : t.border}`, background: dark ? "rgba(30,48,24,0.8)" : "#fff", fontSize: 11, fontWeight: 700, color: dark ? "#9dce7a" : "#3a6e25" }}>
              {dark ? <SunMedium size={12} /> : <Moon size={12} />}
              {dark ? "Light mode" : "Dark mode"}
            </button>
          </div>

          <div className="form-in" style={{ width: "100%", maxWidth: 400 }}>
            <div style={{ marginBottom: 36 }}>
              <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 32, letterSpacing: "-.04em", lineHeight: 1.1, color: dark ? "#e8f5e2" : "#1a2e14", marginBottom: 8 }}>
                Welcome back
              </h1>
              <p style={{ fontSize: 14, color: dark ? "rgba(122,181,92,0.6)" : "rgba(74,112,48,0.6)", lineHeight: 1.6 }}>
                Sign in directly with your email and password.
              </p>
            </div>

            {successMessage && (
              <div style={{ marginBottom: 20, padding: "12px 16px", borderRadius: 12, fontSize: 13, border: `1px solid ${dark ? "rgba(61,96,48,0.6)" : "#b5dba0"}`, background: dark ? "rgba(30,58,18,0.7)" : "#eaf7e0", color: dark ? "#9dce7a" : "#3a6e25" }}>
                {successMessage}
              </div>
            )}

            <form style={{ display: "flex", flexDirection: "column", gap: 14 }} onSubmit={handleLogin}>
              <div style={{ position: "relative" }}>
                <Mail size={15} style={{ position: "absolute", left: 15, top: "50%", transform: "translateY(-50%)", color: dark ? "rgba(90,158,58,0.55)" : "#8ab870", pointerEvents: "none" }} />
                <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" style={inputStyle} />
              </div>

              <div style={{ position: "relative" }}>
                <Lock size={15} style={{ position: "absolute", left: 15, top: "50%", transform: "translateY(-50%)", color: dark ? "rgba(90,158,58,0.55)" : "#8ab870", pointerEvents: "none" }} />
                <input type={showPassword ? "text" : "password"} required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" style={{ ...inputStyle, paddingRight: 44 }} />
                <button type="button" onClick={() => setShowPassword((value) => !value)} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 0, color: dark ? "rgba(90,158,58,0.55)" : "#8ab870", transition: "color .2s" }}>
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>

              {error && (
                <div style={{ padding: "11px 14px", borderRadius: 12, fontSize: 13, border: `1px solid ${dark ? "rgba(94,46,46,0.5)" : "#e6b7b7"}`, background: dark ? "rgba(42,20,20,0.6)" : "#fff4f4", color: dark ? "#e08080" : "#9d4b4b" }}>
                  {error}
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
                  <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} style={{ accentColor: t.accent, width: 14, height: 14 }} />
                  <span style={{ fontSize: 13, color: dark ? "rgba(122,181,92,0.65)" : "rgba(74,112,48,0.65)" }}>Remember me</span>
                </label>
                <Link href="/forgot-password" style={{ fontSize: 13, fontWeight: 600, color: t.accent }}>Forgot password?</Link>
              </div>

              <button type="submit" disabled={loading} className="btn-primary" style={{ marginTop: 4, width: "100%", padding: "14px 20px", borderRadius: 14, fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 6px 22px rgba(90,158,58,0.30)" }}>
                {loading ? (
                  <>
                    <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> Signing in...
                  </>
                ) : (
                  <>
                    Sign in <ChevronRight size={15} />
                  </>
                )}
              </button>
            </form>

            <p style={{ marginTop: 28, textAlign: "center", fontSize: 13, color: dark ? "rgba(122,181,92,0.45)" : "rgba(74,112,48,0.5)" }}>
              Don&apos;t have an account? <Link href="/register" style={{ fontWeight: 700, color: t.accent }}>Create one</Link>
            </p>
          </div>

          <p style={{ marginTop: 48, fontSize: 11, color: dark ? "rgba(58,110,37,0.35)" : "rgba(138,184,112,0.45)", letterSpacing: ".12em", textTransform: "uppercase" }}>
            InsightClips - Secure login
          </p>
        </div>
      </div>
    </>
  );
}
