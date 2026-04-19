"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Mail, Moon, ShieldCheck, SunMedium } from "lucide-react";

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

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
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

  const normalizedEmail = email.trim().toLowerCase();

  const sendRecoveryCode = async () => {
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: false,
      },
    });

    if (otpError) {
      throw new Error(otpError.message || "Unable to send recovery code.");
    }
  };

  const handleSendReset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");

    try {
      await sendRecoveryCode();
      setInfo(`We sent a 6-digit recovery code to ${normalizedEmail}.`);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send recovery code.");
    }

    setLoading(false);
  };

  const handleOtpChange = (value: string, idx: number) => {
    if (!/^\d?$/.test(value)) {
      return;
    }

    const next = [...otp];
    next[idx] = value;
    setOtp(next);

    if (value) {
      const nextInput = document.getElementById(`recovery-code-${idx + 1}`) as HTMLInputElement | null;
      nextInput?.focus();
    }
  };

  const handleOtpPaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) {
      return;
    }

    event.preventDefault();
    const next = ["", "", "", "", "", ""];
    pasted.split("").forEach((digit, idx) => {
      next[idx] = digit;
    });
    setOtp(next);
  };

  const handleVerifyCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");

    const token = otp.join("");
    if (token.length !== 6) {
      setError("Enter the 6-digit recovery code.");
      setLoading(false);
      return;
    }

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token,
        type: "email",
      });

      if (verifyError) {
        throw new Error(verifyError.message || "Invalid or expired recovery code.");
      }

      router.push("/reset-password?mode=code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to verify recovery code.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setResending(true);
    setError("");
    setInfo("");

    try {
      await sendRecoveryCode();
      setInfo(`A new recovery code was sent to ${normalizedEmail}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to resend recovery code.");
    } finally {
      setResending(false);
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
            Reset your password
            <br />
            <em style={{ color: t.accent }}>without losing momentum.</em>
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.65, fontWeight: 400, marginBottom: 44, color: dark ? "rgba(122,181,92,0.7)" : "rgba(74,112,48,0.75)", maxWidth: 360 }}>
            We&apos;ll send a secure recovery link to your email so you can set a new password and get back into your workspace.
          </p>

          <div style={{ padding: "24px 26px", borderRadius: 18, border: `1px solid ${dark ? "rgba(90,158,58,0.18)" : "rgba(90,158,58,0.2)"}`, background: dark ? "rgba(20,31,16,0.6)" : "rgba(255,255,255,0.6)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: dark ? "rgba(90,158,58,0.12)" : "rgba(90,158,58,0.1)", border: `1px solid ${dark ? "rgba(90,158,58,0.25)" : "rgba(90,158,58,0.2)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ShieldCheck size={16} color={t.accent} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: dark ? "#9dce7a" : "#3a6e25", letterSpacing: ".06em" }}>Recovery stays secure</span>
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.65, color: dark ? "rgba(122,181,92,0.65)" : "rgba(74,112,48,0.7)" }}>
              The reset link opens a temporary secure session that lets you update your password safely.
            </p>
          </div>

          <div style={{ position: "absolute", top: 28, right: 28, display: "flex", alignItems: "center", gap: 7 }}>
            <div className="pdot" style={{ width: 7, height: 7, borderRadius: "50%", background: t.accent }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".2em", textTransform: "uppercase", color: t.muted }}>Recovery online</span>
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
            {step === 1 ? (
              <>
                <div style={{ marginBottom: 32 }}>
                  <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 32, letterSpacing: "-.04em", lineHeight: 1.1, color: dark ? "#e8f5e2" : "#1a2e14", marginBottom: 8 }}>
                    Send recovery code
                  </h1>
                  <p style={{ fontSize: 14, color: dark ? "rgba(122,181,92,0.6)" : "rgba(74,112,48,0.6)", lineHeight: 1.6 }}>
                    Enter your account email and we&apos;ll send a 6-digit code so you can create a new password.
                  </p>
                </div>

                <form style={{ display: "flex", flexDirection: "column", gap: 14 }} onSubmit={handleSendReset}>
                  <div style={{ position: "relative" }}>
                    <Mail size={15} style={{ position: "absolute", left: 15, top: "50%", transform: "translateY(-50%)", color: dark ? "rgba(90,158,58,0.55)" : "#8ab870", pointerEvents: "none" }} />
                    <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" style={inputStyle} />
                  </div>

                  {error && (
                    <div style={{ padding: "11px 14px", borderRadius: 12, fontSize: 13, border: `1px solid ${dark ? "rgba(94,46,46,0.5)" : "#e6b7b7"}`, background: dark ? "rgba(42,20,20,0.6)" : "#fff4f4", color: dark ? "#e08080" : "#9d4b4b" }}>
                      {error}
                    </div>
                  )}

                  <button type="submit" disabled={loading} className="btn-primary" style={{ width: "100%", padding: "14px 20px", borderRadius: 14, fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 6px 22px rgba(90,158,58,0.30)" }}>
                    {loading ? (
                      <>
                        <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> Sending...
                      </>
                    ) : (
                      "Send recovery code"
                    )}
                  </button>
                </form>
              </>
            ) : (
              <>
                <div style={{ marginBottom: 32 }}>
                  <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 32, letterSpacing: "-.04em", lineHeight: 1.1, color: dark ? "#e8f5e2" : "#1a2e14", marginBottom: 8 }}>
                    Enter recovery code
                  </h1>
                  <p style={{ fontSize: 14, color: dark ? "rgba(122,181,92,0.6)" : "rgba(74,112,48,0.6)", lineHeight: 1.6 }}>
                    We sent a code to <strong style={{ color: dark ? "#9dce7a" : "#3a6e25" }}>{normalizedEmail}</strong>.
                  </p>
                </div>

                {info && (
                  <div style={{ marginBottom: 16, padding: "11px 14px", borderRadius: 12, fontSize: 13, border: `1px solid ${dark ? "rgba(90,158,58,0.28)" : "rgba(90,158,58,0.2)"}`, background: dark ? "rgba(20,31,16,0.75)" : "#f3faee", color: dark ? "#b0d991" : "#466c2d" }}>
                    {info}
                  </div>
                )}

                <form style={{ display: "flex", flexDirection: "column", gap: 20 }} onSubmit={handleVerifyCode}>
                  <div style={{ display: "flex", gap: isMobile ? 6 : 10, justifyContent: "space-between" }}>
                    {otp.map((value, idx) => (
                      <input
                        key={idx}
                        id={`recovery-code-${idx}`}
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={1}
                        value={value}
                        onPaste={idx === 0 ? handleOtpPaste : undefined}
                        onChange={(e) => handleOtpChange(e.target.value, idx)}
                        style={{
                          width: isMobile ? 44 : 52,
                          height: isMobile ? 52 : 58,
                          borderRadius: 14,
                          textAlign: "center",
                          fontSize: 22,
                          fontWeight: 800,
                          letterSpacing: "-.01em",
                          border: `1.5px solid ${dark ? "rgba(46,77,34,0.6)" : t.border}`,
                          background: dark ? "rgba(20,31,16,0.8)" : "#fff",
                          color: dark ? "#9dce7a" : "#3a6e25",
                          outline: "none",
                          fontFamily: "'DM Serif Display', serif",
                        }}
                      />
                    ))}
                  </div>

                  {error && (
                    <div style={{ padding: "11px 14px", borderRadius: 12, fontSize: 13, border: `1px solid ${dark ? "rgba(94,46,46,0.5)" : "#e6b7b7"}`, background: dark ? "rgba(42,20,20,0.6)" : "#fff4f4", color: dark ? "#e08080" : "#9d4b4b" }}>
                      {error}
                    </div>
                  )}

                  <button type="submit" disabled={loading} className="btn-primary" style={{ width: "100%", padding: "14px 20px", borderRadius: 14, fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 6px 22px rgba(90,158,58,0.30)" }}>
                    {loading ? (
                      <>
                        <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> Verifying...
                      </>
                    ) : (
                      "Verify code"
                    )}
                  </button>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <button type="button" onClick={() => { setStep(1); setError(""); setInfo(""); setOtp(["", "", "", "", "", ""]); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: dark ? "rgba(122,181,92,0.55)" : "rgba(74,112,48,0.62)" }}>
                      Change email
                    </button>
                    <button type="button" onClick={handleResendCode} disabled={resending || loading} style={{ background: "none", border: "none", cursor: resending || loading ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700, color: t.accent, opacity: resending || loading ? 0.55 : 1 }}>
                      {resending ? "Resending..." : "Resend code"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
