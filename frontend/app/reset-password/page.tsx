"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Lock,
  Moon,
  ShieldAlert,
  SunMedium,
} from "lucide-react";

import { supabase } from "@/lib/supabase";

const tk = {
  dark: {
    bg: "#0e1510",
    border: "#2e4d22",
    text: "#e8f5e2",
    muted: "#7ab55c",
    accent: "#5a9e3a",
  },
  light: {
    bg: "#f0f7ec",
    border: "#c5ddb5",
    text: "#1a2e14",
    muted: "#4a7030",
    accent: "#5a9e3a",
  },
};

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [sessionValid, setSessionValid] = useState<boolean | null>(null);
  const [dark, setDark] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem("insightclips-theme") === "dark",
  );
  const [viewportWidth, setViewportWidth] = useState(1280);

  const t = dark ? tk.dark : tk.light;
  const isMobile = viewportWidth < 980;

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
    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setSessionValid(Boolean(session));
    };

    void checkSession();
  }, []);

  const handleUpdatePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    await supabase.auth.signOut();
    setTimeout(() => router.push("/login"), 2500);
  };

  if (sessionValid === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f7ef]">
        <Loader2 className="animate-spin text-[#4f6f52]" size={36} />
      </div>
    );
  }

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
        @keyframes pulse-dot { 0%,100%{opacity:.4;transform:scale(.9)} 50%{opacity:1;transform:scale(1.1)} }
        @keyframes slide-up { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        .orb-a { animation: float-a 7s ease-in-out infinite; }
        .orb-b { animation: float-b 9s 1s ease-in-out infinite; }
        .pdot { animation: pulse-dot 2.4s ease-in-out infinite; }
        .form-in { animation: slide-up .55s cubic-bezier(.22,1,.36,1) both; }
        input:focus { border-color: ${t.accent} !important; box-shadow: 0 0 0 3px ${dark ? "rgba(90,158,58,0.15)" : "rgba(90,158,58,0.10)"}; }
        input::placeholder { color: ${dark ? "rgba(74,112,48,0.45)" : "rgba(138,184,112,0.65)"}; }
        .btn-primary { background: #5a9e3a; color: #fff; border: none; cursor: pointer; font-family: inherit; transition: background .2s, transform .15s, box-shadow .2s; }
        .btn-primary:hover { background: #4d8a2f; box-shadow: 0 8px 28px rgba(90,158,58,0.38); }
        .btn-primary:active { transform: scale(.97); }
        .btn-primary:disabled { opacity: .55; cursor: not-allowed; }
        .theme-btn { cursor: pointer; font-family: inherit; transition: all .2s; }
        a { text-decoration: none; }
      `}</style>

      <div style={{ minHeight: "100vh", display: "flex", flexDirection: isMobile ? "column" : "row", background: t.bg, transition: "background .3s", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ width: isMobile ? "100%" : "48%", minHeight: isMobile ? "auto" : "100vh", position: "relative", background: dark ? "linear-gradient(150deg, #091007 0%, #0f1d0a 55%, #0b1608 100%)" : "linear-gradient(150deg, #daf0c8 0%, #e8f5d8 55%, #d4ecc0 100%)", display: "flex", flexDirection: "column", justifyContent: "center", padding: isMobile ? "28px 18px 24px" : "60px 56px", overflow: "hidden", transition: "background .3s" }}>
          <div className="orb-a" style={{ position: "absolute", top: "6%", right: "8%", width: 260, height: 260, borderRadius: "50%", background: `radial-gradient(circle, ${dark ? "rgba(90,158,58,0.16)" : "rgba(90,158,58,0.13)"}, transparent 70%)`, pointerEvents: "none" }} />
          <div className="orb-b" style={{ position: "absolute", bottom: "8%", left: "-4%", width: 200, height: 200, borderRadius: "50%", background: `radial-gradient(circle, ${dark ? "rgba(45,94,30,0.20)" : "rgba(140,200,80,0.16)"}, transparent 70%)`, pointerEvents: "none" }} />

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 60 }}>
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

          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: "clamp(32px, 3.2vw, 46px)", lineHeight: 1.08, letterSpacing: "-.04em", color: dark ? "#e8f5e2" : "#1a2e14", marginBottom: 14 }}>
            Create a new password
            <br />
            <em style={{ color: t.accent }}>and come back securely.</em>
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.65, fontWeight: 400, marginBottom: 44, color: dark ? "rgba(122,181,92,0.7)" : "rgba(74,112,48,0.75)", maxWidth: 360 }}>
            Finish the recovery code step, update your password, and then sign back in to continue working.
          </p>

          <div style={{ padding: "24px 26px", borderRadius: 18, border: `1px solid ${dark ? "rgba(90,158,58,0.18)" : "rgba(90,158,58,0.2)"}`, background: dark ? "rgba(20,31,16,0.6)" : "rgba(255,255,255,0.6)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: dark ? "rgba(90,158,58,0.12)" : "rgba(90,158,58,0.1)", border: `1px solid ${dark ? "rgba(90,158,58,0.25)" : "rgba(90,158,58,0.2)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Lock size={16} color={t.accent} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: dark ? "#9dce7a" : "#3a6e25", letterSpacing: ".06em" }}>Verified recovery session</span>
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.65, color: dark ? "rgba(122,181,92,0.65)" : "rgba(74,112,48,0.7)" }}>
              This page only works when the verified recovery session is active. If it expires, request a new code.
            </p>
          </div>

          <div style={{ position: "absolute", top: 28, right: 28, display: "flex", alignItems: "center", gap: 7 }}>
            <div className="pdot" style={{ width: 7, height: 7, borderRadius: "50%", background: t.accent }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".2em", textTransform: "uppercase", color: t.muted }}>Recovery session</span>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: isMobile ? "28px 16px 36px" : "48px 40px", position: "relative", background: dark ? "rgba(14,21,16,0.98)" : t.bg, transition: "background .3s" }}>
          <div style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "stretch" : "center", gap: isMobile ? 12 : 0, marginBottom: 36 }}>
            <Link href="/login" style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, color: dark ? "rgba(122,181,92,0.65)" : "rgba(74,112,48,0.65)" }}>
              <ArrowLeft size={15} /> Back to login
            </Link>
            <button className="theme-btn" onClick={() => setDark((value) => !value)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 100, border: `1px solid ${dark ? "rgba(61,96,48,0.6)" : t.border}`, background: dark ? "rgba(30,48,24,0.8)" : "#fff", fontSize: 11, fontWeight: 700, color: dark ? "#9dce7a" : "#3a6e25" }}>
              {dark ? <SunMedium size={12} /> : <Moon size={12} />}
              {dark ? "Light mode" : "Dark mode"}
            </button>
          </div>

          <div className="form-in" style={{ width: "100%", maxWidth: 400 }}>
            {!sessionValid ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", paddingTop: 20 }}>
                <div style={{ width: 80, height: 80, borderRadius: "50%", marginBottom: 28, background: dark ? "rgba(42,20,20,0.65)" : "#fff4f4", border: `2px solid ${dark ? "rgba(148,72,72,0.45)" : "#e6b7b7"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <ShieldAlert size={38} color={dark ? "#e08080" : "#934949"} />
                </div>
                <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 32, letterSpacing: "-.04em", color: dark ? "#e8f5e2" : "#1a2e14", marginBottom: 10 }}>
                  Recovery session expired
                </h2>
                <p style={{ fontSize: 14, lineHeight: 1.7, color: dark ? "rgba(122,181,92,0.6)" : "rgba(74,112,48,0.6)", marginBottom: 24, maxWidth: 320 }}>
                  Please request a new password recovery code and try again.
                </p>
                <Link href="/forgot-password" className="btn-primary" style={{ width: "100%", padding: "14px 20px", borderRadius: 14, fontSize: 14, fontWeight: 600, textAlign: "center", boxShadow: "0 6px 22px rgba(90,158,58,0.30)" }}>
                  Request new recovery code
                </Link>
              </div>
            ) : !success ? (
              <>
                <div style={{ marginBottom: 32 }}>
                  <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 32, letterSpacing: "-.04em", lineHeight: 1.1, color: dark ? "#e8f5e2" : "#1a2e14", marginBottom: 8 }}>
                    Update password
                  </h1>
                  <p style={{ fontSize: 14, color: dark ? "rgba(122,181,92,0.6)" : "rgba(74,112,48,0.6)", lineHeight: 1.6 }}>
                    Choose a new password for your account.
                  </p>
                </div>

                <form style={{ display: "flex", flexDirection: "column", gap: 14 }} onSubmit={handleUpdatePassword}>
                  <div style={{ position: "relative" }}>
                    <Lock size={15} style={{ position: "absolute", left: 15, top: "50%", transform: "translateY(-50%)", color: dark ? "rgba(90,158,58,0.55)" : "#8ab870", pointerEvents: "none" }} />
                    <input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="New password" style={inputStyle} />
                  </div>
                  <div style={{ position: "relative" }}>
                    <Lock size={15} style={{ position: "absolute", left: 15, top: "50%", transform: "translateY(-50%)", color: dark ? "rgba(90,158,58,0.55)" : "#8ab870", pointerEvents: "none" }} />
                    <input required type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm password" style={inputStyle} />
                  </div>

                  {error && (
                    <div style={{ padding: "11px 14px", borderRadius: 12, fontSize: 13, border: `1px solid ${dark ? "rgba(94,46,46,0.5)" : "#e6b7b7"}`, background: dark ? "rgba(42,20,20,0.6)" : "#fff4f4", color: dark ? "#e08080" : "#9d4b4b" }}>
                      {error}
                    </div>
                  )}

                  <button type="submit" disabled={loading} className="btn-primary" style={{ width: "100%", padding: "14px 20px", borderRadius: 14, fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 6px 22px rgba(90,158,58,0.30)" }}>
                    {loading ? (
                      <>
                        <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> Updating...
                      </>
                    ) : (
                      "Update password"
                    )}
                  </button>
                </form>
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", paddingTop: 20 }}>
                <div style={{ width: 80, height: 80, borderRadius: "50%", marginBottom: 28, background: dark ? "rgba(30,58,18,0.8)" : "#eaf7e0", border: `2px solid ${dark ? "rgba(61,96,48,0.6)" : "#b5dba0"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <CheckCircle2 size={38} color={t.accent} />
                </div>
                <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 32, letterSpacing: "-.04em", color: dark ? "#e8f5e2" : "#1a2e14", marginBottom: 10 }}>
                  Password updated
                </h2>
                <p style={{ fontSize: 14, lineHeight: 1.7, color: dark ? "rgba(122,181,92,0.6)" : "rgba(74,112,48,0.6)", marginBottom: 24, maxWidth: 320 }}>
                  Your password was changed successfully. Redirecting you back to login.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
