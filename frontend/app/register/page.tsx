"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  Moon,
  RotateCcw,
  Shield,
  Sparkles,
  SunMedium,
  User,
} from "lucide-react";
import Link from "next/link";

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

function CheckItem({ label, dark }: { label: string; dark: boolean }) {
  const t = dark ? tk.dark : tk.light;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          flexShrink: 0,
          marginTop: 1,
          background: `rgba(90,158,58,${dark ? ".15" : ".12"})`,
          border: `1px solid rgba(90,158,58,${dark ? ".3" : ".22"})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CheckCircle2 size={11} color={t.accent} />
      </div>
      <span
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: dark ? "rgba(122,181,92,0.75)" : "rgba(74,112,48,0.75)",
          lineHeight: 1.55,
        }}
      >
        {label}
      </span>
    </div>
  );
}

export default function RegisterPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [formData, setFormData] = useState({ name: "", email: "", password: "" });
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [showPassword, setShowPassword] = useState(false);
  const [dark, setDark] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem("insightclips-theme") === "dark",
  );
  const [viewportWidth, setViewportWidth] = useState(1280);

  const t = dark ? tk.dark : tk.light;
  const normalizedEmail = formData.email.trim().toLowerCase();
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

  const sendRegisterCode = async () => {
    const { error: otpError } = await supabase.auth.resend({
      type: "signup",
      email: normalizedEmail,
    });

    if (otpError) {
      throw new Error(otpError.message || "Unable to resend verification code.");
    }
  };

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");

    if (formData.password.length < 8) {
      setError("Password must be at least 8 characters.");
      setLoading(false);
      return;
    }

    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: formData.password,
        options: {
          data: {
            full_name: formData.name.trim() || undefined,
          },
          emailRedirectTo: undefined,
        },
      });

      if (signUpError) {
        throw new Error(signUpError.message || "Unable to create account.");
      }

      setInfo(`We sent a 6-digit verification code to ${normalizedEmail}.`);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create account.");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (value: string, idx: number) => {
    if (!/^\d?$/.test(value)) {
      return;
    }

    const next = [...otp];
    next[idx] = value;
    setOtp(next);

    if (value) {
      const nextInput = document.getElementById(`register-code-${idx + 1}`) as HTMLInputElement | null;
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

  const handleVerifyOtp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");

    const token = otp.join("");
    if (token.length !== 6) {
      setError("Enter the 6-digit verification code.");
      setLoading(false);
      return;
    }

    try {
      const { error: otpError } = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token,
        type: "signup",
      });

      if (otpError) {
        throw new Error(otpError.message || "Invalid or expired verification code.");
      }

      await supabase.auth.signOut();
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to verify code.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setResending(true);
    setError("");

    try {
      await sendRegisterCode();
      setInfo(`A new verification code was sent to ${normalizedEmail}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to resend verification code.");
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
        @keyframes spin-ring { to{transform:rotate(360deg)} }
        @keyframes spin-ccw { to{transform:rotate(-360deg)} }
        @keyframes pulse-dot { 0%,100%{opacity:.4;transform:scale(.9)} 50%{opacity:1;transform:scale(1.1)} }
        @keyframes slide-up { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pop-in { from{opacity:0;transform:scale(.85)} to{opacity:1;transform:scale(1)} }
        .orb-a { animation: float-a 7s ease-in-out infinite; }
        .orb-b { animation: float-b 9s 1s ease-in-out infinite; }
        .ring1 { animation: spin-ring 22s linear infinite; }
        .ring2 { animation: spin-ccw 18s linear infinite; }
        .pdot { animation: pulse-dot 2.4s ease-in-out infinite; }
        .form-in { animation: slide-up .55s cubic-bezier(.22,1,.36,1) both; }
        .pop-in { animation: pop-in .6s cubic-bezier(.22,1,.36,1) both; }
        input:focus { border-color: ${t.accent} !important; box-shadow: 0 0 0 3px ${dark ? "rgba(90,158,58,0.15)" : "rgba(90,158,58,0.10)"}; }
        input::placeholder { color: ${dark ? "rgba(74,112,48,0.45)" : "rgba(138,184,112,0.65)"}; }
        .btn-primary { background: #5a9e3a; color: #fff; border: none; cursor: pointer; font-family: inherit; transition: background .2s, transform .15s, box-shadow .2s; }
        .btn-primary:hover { background: #4d8a2f; box-shadow: 0 8px 28px rgba(90,158,58,0.38); }
        .btn-primary:active { transform: scale(.97); }
        .btn-primary:disabled { opacity: .55; cursor: not-allowed; }
        .theme-btn { cursor: pointer; font-family: inherit; transition: all .2s; }
        a { text-decoration: none; }
        .pass-bar { transition: background .3s, width .4s; }
      `}</style>

      <div style={{ minHeight: "100vh", display: "flex", flexDirection: isMobile ? "column" : "row", background: t.bg, transition: "background .3s", fontFamily: "'DM Sans', sans-serif" }}>
        <div
          style={{
            width: isMobile ? "100%" : "48%",
            minHeight: isMobile ? "auto" : "100vh",
            position: "relative",
            background: dark ? "linear-gradient(150deg, #091007 0%, #0f1d0a 55%, #0b1608 100%)" : "linear-gradient(150deg, #daf0c8 0%, #e8f5d8 55%, #d4ecc0 100%)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: isMobile ? "28px 18px 24px" : "60px 56px",
            overflow: "hidden",
            transition: "background .3s",
          }}
        >
          <div className="orb-a" style={{ position: "absolute", top: "5%", right: "8%", width: 260, height: 260, borderRadius: "50%", background: `radial-gradient(circle, ${dark ? "rgba(90,158,58,0.16)" : "rgba(90,158,58,0.13)"}, transparent 70%)`, pointerEvents: "none" }} />
          <div className="orb-b" style={{ position: "absolute", bottom: "8%", left: "-4%", width: 200, height: 200, borderRadius: "50%", background: `radial-gradient(circle, ${dark ? "rgba(45,94,30,0.20)" : "rgba(140,200,80,0.16)"}, transparent 70%)`, pointerEvents: "none" }} />
          <div className="ring1" style={{ position: "absolute", top: "30%", right: "-80px", width: 240, height: 240, borderRadius: "50%", border: `1px dashed ${dark ? "rgba(90,158,58,0.15)" : "rgba(90,158,58,0.2)"}`, pointerEvents: "none" }} />
          <div className="ring2" style={{ position: "absolute", top: "32%", right: "-60px", width: 160, height: 160, borderRadius: "50%", border: `1px solid ${dark ? "rgba(90,158,58,0.08)" : "rgba(90,158,58,0.12)"}`, pointerEvents: "none" }} />

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

          <div style={{ display: "flex", gap: 6, marginBottom: 36 }}>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  height: 4,
                  borderRadius: 2,
                  width: step >= i ? 28 : 12,
                  background: step >= i ? t.accent : dark ? "rgba(90,158,58,0.2)" : "rgba(90,158,58,0.18)",
                }}
              />
            ))}
          </div>

          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: "clamp(32px, 3.2vw, 46px)", lineHeight: 1.08, letterSpacing: "-.04em", color: dark ? "#e8f5e2" : "#1a2e14", marginBottom: 14 }}>
            {step === 1 ? "Create your account" : step === 2 ? "Verify your email" : "You're in."}
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.65, fontWeight: 400, marginBottom: 44, color: dark ? "rgba(122,181,92,0.7)" : "rgba(74,112,48,0.75)", maxWidth: 360 }}>
            {step === 1
              ? "Create your profile and protect it with a one-time verification code."
              : step === 2
                ? "We sent a 6-digit verification code to your email. Enter it once to finish registration."
                : "Your account is verified. From now on, you can sign in directly with email and password."}
          </p>

          {step === 1 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 48 }}>
              <CheckItem label="Free to start - no credit card required" dark={dark} />
              <CheckItem label="One-time verification during registration" dark={dark} />
              <CheckItem label="Faster sign-in after your account is confirmed" dark={dark} />
              <CheckItem label="Secure account setup for your content library" dark={dark} />
            </div>
          ) : (
            <div
              style={{
                padding: "24px 26px",
                borderRadius: 18,
                marginBottom: 48,
                border: `1px solid ${dark ? "rgba(90,158,58,0.18)" : "rgba(90,158,58,0.2)"}`,
                background: dark ? "rgba(20,31,16,0.6)" : "rgba(255,255,255,0.6)",
                backdropFilter: "blur(10px)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: dark ? "rgba(90,158,58,0.12)" : "rgba(90,158,58,0.1)", border: `1px solid ${dark ? "rgba(90,158,58,0.25)" : "rgba(90,158,58,0.2)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {step === 2 ? <Mail size={16} color={t.accent} /> : <Shield size={16} color={t.accent} />}
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: dark ? "#9dce7a" : "#3a6e25", letterSpacing: ".06em" }}>
                  {step === 2 ? "Code sent to your inbox" : "Registration complete"}
                </span>
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.65, color: dark ? "rgba(122,181,92,0.65)" : "rgba(74,112,48,0.7)" }}>
                {step === 2
                  ? <>We sent a verification code to <strong style={{ color: dark ? "#9dce7a" : "#3a6e25" }}>{normalizedEmail}</strong>. Check spam if it does not appear right away.</>
                  : <>Your account for <strong style={{ color: dark ? "#9dce7a" : "#3a6e25" }}>{normalizedEmail}</strong> is verified. You can now log in directly without another email code.</>}
              </p>
            </div>
          )}

          <div style={{ position: "absolute", top: 28, right: 28, display: "flex", alignItems: "center", gap: 7 }}>
            <div className="pdot" style={{ width: 7, height: 7, borderRadius: "50%", background: t.accent }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".2em", textTransform: "uppercase", color: t.muted }}>Secure onboarding</span>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: isMobile ? "28px 16px 36px" : "48px 40px", position: "relative", background: dark ? "rgba(14,21,16,0.98)" : t.bg, transition: "background .3s" }}>
          <div style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "stretch" : "center", gap: isMobile ? 12 : 0, marginBottom: 36 }}>
            <Link href="/" style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, color: dark ? "rgba(122,181,92,0.65)" : "rgba(74,112,48,0.65)" }}>
              <ArrowLeft size={15} /> Back
            </Link>
            <button className="theme-btn" onClick={() => setDark((value) => !value)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 100, border: `1px solid ${dark ? "rgba(61,96,48,0.6)" : t.border}`, background: dark ? "rgba(30,48,24,0.8)" : "#fff", fontSize: 11, fontWeight: 700, color: dark ? "#9dce7a" : "#3a6e25" }}>
              {dark ? <SunMedium size={12} /> : <Moon size={12} />}
              {dark ? "Light mode" : "Dark mode"}
            </button>
          </div>

          <div className="form-in" style={{ width: "100%", maxWidth: 400 }}>
            {step === 1 && (
              <>
                <div style={{ marginBottom: 32 }}>
                  <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 32, letterSpacing: "-.04em", lineHeight: 1.1, color: dark ? "#e8f5e2" : "#1a2e14", marginBottom: 8 }}>Create account</h1>
                  <p style={{ fontSize: 14, color: dark ? "rgba(122,181,92,0.6)" : "rgba(74,112,48,0.6)", lineHeight: 1.6 }}>
                    Set up your account and confirm it with a single email code.
                  </p>
                </div>

                <form style={{ display: "flex", flexDirection: "column", gap: 14 }} onSubmit={handleRegister}>
                  <div style={{ position: "relative" }}>
                    <User size={15} style={{ position: "absolute", left: 15, top: "50%", transform: "translateY(-50%)", color: dark ? "rgba(90,158,58,0.55)" : "#8ab870", pointerEvents: "none" }} />
                    <input required type="text" placeholder="Full name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} style={inputStyle} />
                  </div>
                  <div style={{ position: "relative" }}>
                    <Mail size={15} style={{ position: "absolute", left: 15, top: "50%", transform: "translateY(-50%)", color: dark ? "rgba(90,158,58,0.55)" : "#8ab870", pointerEvents: "none" }} />
                    <input required type="email" placeholder="Email address" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} style={inputStyle} />
                  </div>
                  <div style={{ position: "relative" }}>
                    <Lock size={15} style={{ position: "absolute", left: 15, top: "50%", transform: "translateY(-50%)", color: dark ? "rgba(90,158,58,0.55)" : "#8ab870", pointerEvents: "none" }} />
                    <input required type={showPassword ? "text" : "password"} placeholder="Create password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} style={{ ...inputStyle, paddingRight: 44 }} />
                    <button type="button" onClick={() => setShowPassword((value) => !value)} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 0, color: dark ? "rgba(90,158,58,0.55)" : "#8ab870" }}>
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>

                  {formData.password.length > 0 && (
                    <div>
                      <div style={{ display: "flex", gap: 5, marginBottom: 6 }}>
                        {[1, 2, 3, 4].map((i) => (
                          <div
                            key={i}
                            className="pass-bar"
                            style={{
                              height: 3,
                              flex: 1,
                              borderRadius: 2,
                              background:
                                formData.password.length >= i * 3
                                  ? i <= 2
                                    ? "#e08080"
                                    : i === 3
                                      ? "#e0b060"
                                      : "#5a9e3a"
                                  : dark
                                    ? "rgba(46,77,34,0.4)"
                                    : "#c5ddb5",
                            }}
                          />
                        ))}
                      </div>
                      <span style={{ fontSize: 11, color: dark ? "rgba(122,181,92,0.5)" : "rgba(74,112,48,0.6)" }}>
                        {formData.password.length < 6 ? "Weak" : formData.password.length < 10 ? "Fair" : "Strong"} password
                      </span>
                    </div>
                  )}

                  {info && (
                    <div style={{ padding: "11px 14px", borderRadius: 12, fontSize: 13, border: `1px solid ${dark ? "rgba(90,158,58,0.28)" : "rgba(90,158,58,0.2)"}`, background: dark ? "rgba(20,31,16,0.75)" : "#f3faee", color: dark ? "#b0d991" : "#466c2d" }}>
                      {info}
                    </div>
                  )}

                  {error && (
                    <div style={{ padding: "11px 14px", borderRadius: 12, fontSize: 13, border: `1px solid ${dark ? "rgba(94,46,46,0.5)" : "#e6b7b7"}`, background: dark ? "rgba(42,20,20,0.6)" : "#fff4f4", color: dark ? "#e08080" : "#9d4b4b" }}>
                      {error}
                    </div>
                  )}

                  <button type="submit" disabled={loading} className="btn-primary" style={{ marginTop: 4, width: "100%", padding: "14px 20px", borderRadius: 14, fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 6px 22px rgba(90,158,58,0.28)" }}>
                    {loading ? (
                      <>
                        <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> Creating account...
                      </>
                    ) : (
                      <>
                        Create account <ChevronRight size={15} />
                      </>
                    )}
                  </button>
                </form>

                <p style={{ marginTop: 28, textAlign: "center", fontSize: 13, color: dark ? "rgba(122,181,92,0.45)" : "rgba(74,112,48,0.5)" }}>
                  Already have an account? <Link href="/login" style={{ fontWeight: 700, color: t.accent }}>Sign in</Link>
                </p>
              </>
            )}

            {step === 2 && (
              <>
                <div style={{ marginBottom: 32 }}>
                  <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 32, letterSpacing: "-.04em", color: dark ? "#e8f5e2" : "#1a2e14", marginBottom: 8 }}>
                    Enter code
                  </h1>
                  <p style={{ fontSize: 14, color: dark ? "rgba(122,181,92,0.6)" : "rgba(74,112,48,0.6)", lineHeight: 1.6 }}>
                    Sent to <strong style={{ color: dark ? "#9dce7a" : "#3a6e25" }}>{normalizedEmail}</strong>
                  </p>
                </div>

                {info && (
                  <div style={{ marginBottom: 16, padding: "11px 14px", borderRadius: 12, fontSize: 13, border: `1px solid ${dark ? "rgba(90,158,58,0.28)" : "rgba(90,158,58,0.2)"}`, background: dark ? "rgba(20,31,16,0.75)" : "#f3faee", color: dark ? "#b0d991" : "#466c2d" }}>
                    {info}
                  </div>
                )}

                <form style={{ display: "flex", flexDirection: "column", gap: 20 }} onSubmit={handleVerifyOtp}>
                  <div style={{ display: "flex", gap: isMobile ? 6 : 10, justifyContent: "space-between" }}>
                    {otp.map((value, idx) => (
                      <input
                        key={idx}
                        id={`register-code-${idx}`}
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

                  <button type="submit" disabled={loading} className="btn-primary" style={{ width: "100%", padding: "14px 20px", borderRadius: 14, fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 6px 22px rgba(90,158,58,0.28)" }}>
                    {loading ? (
                      <>
                        <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> Verifying...
                      </>
                    ) : (
                      <>
                        Verify and finish <ChevronRight size={15} />
                      </>
                    )}
                  </button>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <button type="button" onClick={() => { setStep(1); setError(""); setInfo(""); setOtp(["", "", "", "", "", ""]); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: dark ? "rgba(122,181,92,0.55)" : "rgba(74,112,48,0.62)", display: "flex", alignItems: "center", gap: 6 }}>
                      <RotateCcw size={14} /> Edit details
                    </button>
                    <button type="button" onClick={handleResendCode} disabled={resending || loading} style={{ background: "none", border: "none", cursor: resending || loading ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700, color: t.accent, opacity: resending || loading ? 0.55 : 1 }}>
                      {resending ? "Resending..." : "Resend code"}
                    </button>
                  </div>
                </form>
              </>
            )}

            {step === 3 && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", paddingTop: 20 }}>
                <div className="pop-in" style={{ width: 80, height: 80, borderRadius: "50%", marginBottom: 28, background: dark ? "rgba(30,58,18,0.8)" : "#eaf7e0", border: `2px solid ${dark ? "rgba(61,96,48,0.6)" : "#b5dba0"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <CheckCircle2 size={38} color={t.accent} />
                </div>
                <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 32, letterSpacing: "-.04em", color: dark ? "#e8f5e2" : "#1a2e14", marginBottom: 10 }}>
                  You&apos;re verified!
                </h2>
                <p style={{ fontSize: 14, lineHeight: 1.7, color: dark ? "rgba(122,181,92,0.6)" : "rgba(74,112,48,0.6)", marginBottom: 18, maxWidth: 320 }}>
                  Registration is complete. From now on, you can log in directly with your email and password without another verification code.
                </p>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", marginBottom: 28 }}>
                  {[
                    { icon: <Sparkles size={13} />, label: "AI-powered clips" },
                    { icon: <Shield size={13} />, label: "Verified account" },
                    { icon: <Mail size={13} />, label: "Direct login next time" },
                  ].map(({ icon, label }) => (
                    <div
                      key={label}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        padding: "8px 14px",
                        borderRadius: 100,
                        border: `1px solid ${dark ? "rgba(90,158,58,0.22)" : "rgba(90,158,58,0.2)"}`,
                        background: dark ? "rgba(20,31,16,0.5)" : "rgba(255,255,255,0.6)",
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: ".08em",
                        color: t.accent,
                      }}
                    >
                      {icon}
                      {label}
                    </div>
                  ))}
                </div>
                <Link href={`/login?registered=true&email=${encodeURIComponent(normalizedEmail)}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "14px 20px", borderRadius: 14, background: "#5a9e3a", color: "#fff", fontSize: 14, fontWeight: 600, boxShadow: "0 6px 22px rgba(90,158,58,0.28)" }}>
                  Continue to sign in <ChevronRight size={15} />
                </Link>
              </div>
            )}
          </div>

          <p style={{ marginTop: 48, fontSize: 11, color: dark ? "rgba(58,110,37,0.35)" : "rgba(138,184,112,0.45)", letterSpacing: ".12em", textTransform: "uppercase" }}>
            InsightClips - Secure registration
          </p>
        </div>
      </div>
    </>
  );
}
