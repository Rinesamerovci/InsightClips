"use client";

import { useEffect, useState } from "react";
import {
  ChevronRight,
  Loader2,
  Mail,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";

import { AuthScaffold } from "@/components/AuthScaffold";
import { getAuthTheme, THEME_STORAGE_KEY } from "@/lib/brand";
import { supabase } from "@/lib/supabase";

function RecoveryStep({
  title,
  body,
  active,
  accent,
  border,
  dark,
}: {
  title: string;
  body: string;
  active: boolean;
  accent: string;
  border: string;
  dark: boolean;
}) {
  return (
    <div
      style={{
        borderRadius: 20,
        border: `1px solid ${active ? accent : border}`,
        background: active ? `${accent}18` : dark ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.72)",
        padding: "16px",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, lineHeight: 1.7 }}>{body}</div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [dark, setDark] = useState(false);

  const shell = getAuthTheme(dark);
  const normalizedEmail = email.trim().toLowerCase();

  useEffect(() => {
    try {
      setDark(window.localStorage.getItem(THEME_STORAGE_KEY) === "dark");
    } catch {}
  }, []);

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light");
  }, [dark]);

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

      window.location.href = "/reset-password?mode=code";
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
    borderRadius: 16,
    padding: "14px 16px 14px 46px",
    fontSize: 14,
    outline: "none",
    border: `1px solid ${shell.border}`,
    background: dark ? "rgba(255,255,255,.03)" : "#ffffff",
    color: shell.text,
    fontFamily: "var(--font-sans)",
  };

  return (
    <AuthScaffold
      dark={dark}
      backHref="/login"
      backLabel="Back to login"
      showcaseBadge="Recovery flow"
      showcaseTitle={
        <>
          Recover access
          <br />
          <em style={{ color: shell.accent }}>without losing momentum.</em>
        </>
      }
      showcaseBody="The recovery flow stays simple: request one code, verify it, then reset the password and get back to the dashboard."
      showcaseContent={
        <div style={{ display: "grid", gap: 14 }}>
          <RecoveryStep
            title="1. Request recovery code"
            body="Enter the email tied to your workspace and we will send a one-time code."
            active
            accent={shell.accent}
            border={shell.border}
            dark={dark}
          />
          <RecoveryStep
            title="2. Verify session"
            body="Confirm the code once to open a valid password reset session."
            active={step >= 2}
            accent={shell.accent}
            border={shell.border}
            dark={dark}
          />
          <RecoveryStep
            title="3. Create a new password"
            body="Finish on the next screen and return directly to sign in."
            active={step === 2}
            accent={shell.accent}
            border={shell.border}
            dark={dark}
          />
        </div>
      }
      statusLabel="Secure account recovery"
      shell={shell}
      onToggleTheme={() => setDark((value) => !value)}
      footerLabel="InsightClips password recovery"
    >
      {step === 1 ? (
        <>
          <div style={{ marginBottom: 24 }}>
            <div style={{ color: shell.accent, fontSize: 11, fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase", marginBottom: 10 }}>
              Password recovery
            </div>
            <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 34, lineHeight: 1, letterSpacing: "-0.04em", marginBottom: 10 }}>
              Send recovery code
            </h1>
            <p style={{ color: shell.muted, fontSize: 14, lineHeight: 1.7 }}>
              We will send a 6-digit code to the email linked with your account.
            </p>
          </div>

          <form style={{ display: "grid", gap: 14 }} onSubmit={handleSendReset}>
            <div style={{ position: "relative" }}>
              <Mail size={16} style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: shell.faint }} />
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email address"
                style={inputStyle}
              />
            </div>

            {info ? (
              <div style={{ borderRadius: 16, border: `1px solid ${shell.borderStrong}`, background: shell.accentSoft, color: shell.text, padding: "14px 16px", fontSize: 13, lineHeight: 1.6 }}>
                {info}
              </div>
            ) : null}

            {error ? (
              <div style={{ borderRadius: 16, border: `1px solid ${dark ? "rgba(236,122,140,.24)" : "rgba(224,140,156,.36)"}`, background: dark ? "rgba(86,28,40,.56)" : "rgba(255,236,239,.9)", color: dark ? "#ffc1cb" : "#9b314b", padding: "14px 16px", fontSize: 13, lineHeight: 1.6 }}>
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="brand-button"
              style={{ width: "100%", padding: "14px 20px", fontSize: 14, fontWeight: 700, cursor: loading ? "default" : "pointer", opacity: loading ? 0.72 : 1 }}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Sending code...
                </>
              ) : (
                <>
                  Send recovery code
                  <ChevronRight size={16} />
                </>
              )}
            </button>
          </form>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <div style={{ marginBottom: 24 }}>
            <div style={{ color: shell.accent, fontSize: 11, fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase", marginBottom: 10 }}>
              Verify recovery
            </div>
            <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 34, lineHeight: 1, letterSpacing: "-0.04em", marginBottom: 10 }}>
              Enter your code
            </h1>
            <p style={{ color: shell.muted, fontSize: 14, lineHeight: 1.7 }}>
              Sent to <strong style={{ color: shell.text }}>{normalizedEmail}</strong>.
            </p>
          </div>

          {info ? (
            <div style={{ marginBottom: 14, borderRadius: 16, border: `1px solid ${shell.borderStrong}`, background: shell.accentSoft, color: shell.text, padding: "14px 16px", fontSize: 13, lineHeight: 1.6 }}>
              {info}
            </div>
          ) : null}

          <form style={{ display: "grid", gap: 18 }} onSubmit={handleVerifyCode}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 8 }}>
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
                  onChange={(event) => handleOtpChange(event.target.value, idx)}
                  style={{
                    height: 58,
                    borderRadius: 16,
                    border: `1px solid ${shell.border}`,
                    background: dark ? "rgba(255,255,255,.03)" : "#ffffff",
                    color: shell.text,
                    textAlign: "center",
                    fontSize: 22,
                    fontWeight: 700,
                    fontFamily: "var(--font-serif)",
                    outline: "none",
                  }}
                />
              ))}
            </div>

            {error ? (
              <div style={{ borderRadius: 16, border: `1px solid ${dark ? "rgba(236,122,140,.24)" : "rgba(224,140,156,.36)"}`, background: dark ? "rgba(86,28,40,.56)" : "rgba(255,236,239,.9)", color: dark ? "#ffc1cb" : "#9b314b", padding: "14px 16px", fontSize: 13, lineHeight: 1.6 }}>
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="brand-button"
              style={{ width: "100%", padding: "14px 20px", fontSize: 14, fontWeight: 700, cursor: loading ? "default" : "pointer", opacity: loading ? 0.72 : 1 }}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  Verify code
                  <ChevronRight size={16} />
                </>
              )}
            </button>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setOtp(["", "", "", "", "", ""]);
                  setError("");
                  setInfo("");
                }}
                style={{ border: "none", background: "transparent", color: shell.muted, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <RotateCcw size={14} />
                Change email
              </button>
              <button
                type="button"
                onClick={handleResendCode}
                disabled={resending || loading}
                style={{ border: "none", background: "transparent", color: shell.accent, fontWeight: 700, cursor: resending || loading ? "default" : "pointer", opacity: resending || loading ? 0.7 : 1 }}
              >
                {resending ? "Resending..." : "Resend code"}
              </button>
            </div>

            <div style={{ borderRadius: 16, border: `1px solid ${shell.border}`, background: dark ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.72)", padding: "14px 16px", display: "flex", gap: 10, alignItems: "start" }}>
              <ShieldCheck size={18} color={shell.accent} style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ color: shell.muted, fontSize: 13, lineHeight: 1.7 }}>
                After verification, you will continue to the password reset screen with a valid recovery session.
              </div>
            </div>
          </form>
        </>
      ) : null}
    </AuthScaffold>
  );
}
