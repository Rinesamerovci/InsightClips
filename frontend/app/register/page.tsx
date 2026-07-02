"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  RotateCcw,
  Shield,
  User,
} from "lucide-react";

import { AuthScaffold } from "@/components/AuthScaffold";
import { ApiRequestError, postJson } from "@/lib/api";
import { getAuthTheme, THEME_STORAGE_KEY } from "@/lib/brand";
import { getPasswordPolicyError } from "@/lib/password-policy";
import { supabase } from "@/lib/supabase";

type EmailAvailabilityResponse = {
  email: string;
  exists: boolean;
  message: string;
};

function ProgressStep({
  index,
  label,
  active,
  completed,
  shell,
  dark,
}: {
  index: number;
  label: string;
  active: boolean;
  completed: boolean;
  shell: ReturnType<typeof getAuthTheme>;
  dark: boolean;
}) {
  return (
    <div
      style={{
        borderRadius: 18,
        border: `1px solid ${active || completed ? shell.borderStrong : shell.border}`,
        background:
          active || completed
            ? shell.accentSoft
            : dark
              ? "rgba(255,255,255,.03)"
              : "rgba(255,255,255,.72)",
        padding: "14px 14px 13px",
      }}
    >
      <div
        style={{
          color: active || completed ? shell.accent : shell.muted,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: ".18em",
          textTransform: "uppercase",
          marginBottom: 7,
        }}
      >
        Step {index}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.6 }}>{label}</div>
    </div>
  );
}
/* -------------------------
   Register Page Component
   ------------------------- */
export default function RegisterPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [formData, setFormData] = useState({ name: "", email: "", password: "" });
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [showPassword, setShowPassword] = useState(false);
  const [dark, setDark] = useState(false);

  const shell = getAuthTheme(dark);
  const normalizedEmail = formData.email.trim().toLowerCase();

  useEffect(() => {
    try {
      setDark(window.localStorage.getItem(THEME_STORAGE_KEY) !== "light");
    } catch {}
  }, []);

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light");
  }, [dark]);

  const showcaseTitle = useMemo(() => {
    if (step === 2) {
      return (
        <>
          Verify your email,
          <br />
          <em style={{ color: shell.accent }}>then continue directly.</em>
        </>
      );
    }

    if (step === 3) {
      return (
        <>
          Your account is ready.
          <br />
          <em style={{ color: shell.accent }}>You can sign in now.</em>
        </>
      );
    }

    return (
      <>
        Create a cleaner
        <br />
        <em style={{ color: shell.accent }}>creator workspace.</em>
      </>
    );
  }, [shell.accent, step]);

  const showcaseBody =
    step === 1
      ? "A simple account setup that gets you into uploads, clips, and publishing with less friction."
      : step === 2
        ? "We only use one code during registration, so future sign-ins stay direct with email and password."
        : "Verification is complete. The next step is simply signing in and opening your workspace.";
 /* -------------------------
     Send OTP (resend signup code)
     ------------------------- */
  const sendRegisterCode = async () => {
    const { error: otpError } = await supabase.auth.resend({
      type: "signup",
      email: normalizedEmail,
    });

    if (otpError) {
      throw new Error(otpError.message || "Unable to resend verification code.");
    }
  };

  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");

    const passwordError = getPasswordPolicyError(formData.password);
    if (passwordError) {
      setError(passwordError);
      setLoading(false);
      return;
    }

    try {
      const availability = await postJson<EmailAvailabilityResponse>("/auth/check-email", {
        email: normalizedEmail,
      });
      if (availability.exists) {
        setError(availability.message || "An account already exists for this email. Please sign in instead.");
        return;
      }

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
      if (err instanceof ApiRequestError && err.status === 409) {
        setError(err.detail || "An account already exists for this email. Please sign in instead.");
      } else {
        setError(err instanceof Error ? err.message : "Unable to create account.");
      }
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

  const handleVerifyOtp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
      backHref="/"
      backLabel="Back"
      showcaseBadge="Secure onboarding"
      showcaseTitle={showcaseTitle}
      showcaseBody={showcaseBody}
      showcaseContent={
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))",
              gap: 12,
            }}
          >
            <ProgressStep index={1} label="Create account details" active={step === 1} completed={step > 1} shell={shell} dark={dark} />
            <ProgressStep index={2} label="Confirm with one code" active={step === 2} completed={step > 2} shell={shell} dark={dark} />
            <ProgressStep index={3} label="Continue to sign in" active={step === 3} completed={step > 3} shell={shell} dark={dark} />
          </div>

          <div
            style={{
              marginTop: 22,
              borderRadius: 24,
              border: `1px solid ${shell.border}`,
              background: dark ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.72)",
              padding: "18px",
            }}
          >
            <div
              style={{
                color: shell.accent,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: ".18em",
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              Why this flow
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {[
                "Account setup stays short and creator-focused.",
                "Email verification only happens once during registration.",
                "After that, login becomes a simple email and password step.",
              ].map((item) => (
                <div
                  key={item}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    color: shell.muted,
                    fontSize: 14,
                    lineHeight: 1.65,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: shell.accent,
                      flexShrink: 0,
                    }}
                  />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </>
      }
      statusLabel="Registration flow ready"
      shell={shell}
      onToggleTheme={() => setDark((value) => !value)}
      footerLabel="InsightClips secure registration"
    >
      {step === 1 ? (
        <>
          <div style={{ marginBottom: 24 }}>
            <div style={{ color: shell.accent, fontSize: 11, fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase", marginBottom: 10 }}>
              Create account
            </div>
            <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 34, lineHeight: 1, letterSpacing: "-0.04em", marginBottom: 10 }}>
              Start your workspace
            </h1>
            <p style={{ color: shell.muted, fontSize: 14, lineHeight: 1.7 }}>
              Set up your account once, then move directly into uploads, analysis, and clip generation.
            </p>
          </div>

          <form style={{ display: "grid", gap: 14 }} onSubmit={handleRegister}>
            <div style={{ position: "relative" }}>
              <User size={16} style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: shell.faint }} />
              <input
                required
                type="text"
                placeholder="Full name"
                value={formData.name}
                onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                style={inputStyle}
              />
            </div>

            <div style={{ position: "relative" }}>
              <Mail size={16} style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: shell.faint }} />
              <input
                required
                type="email"
                placeholder="Email address"
                value={formData.email}
                onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                style={inputStyle}
              />
            </div>

            <div style={{ position: "relative" }}>
              <Lock size={16} style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: shell.faint }} />
              <input
                required
                type={showPassword ? "text" : "password"}
                placeholder="Create password"
                value={formData.password}
                onChange={(event) => setFormData({ ...formData, password: event.target.value })}
                style={{ ...inputStyle, paddingRight: 48 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                style={{
                  position: "absolute",
                  right: 14,
                  top: "50%",
                  transform: "translateY(-50%)",
                  border: "none",
                  background: "transparent",
                  color: shell.faint,
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {formData.password.length > 0 ? (
              <div
                style={{
                  borderRadius: 16,
                  border: `1px solid ${shell.border}`,
                  background: dark ? "rgba(255,255,255,.025)" : "rgba(255,255,255,.72)",
                  padding: "12px 14px",
                }}
              >
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 5, marginBottom: 8 }}>
                  {[1, 2, 3, 4].map((segment) => (
                    <div
                      key={segment}
                      style={{
                        height: 4,
                        borderRadius: 999,
                        background:
                          formData.password.length >= segment * 3
                            ? segment === 4
                              ? shell.accent
                              : segment === 3
                                ? "#d0b15a"
                                : "#a7c86e"
                            : dark
                              ? "rgba(255,255,255,.08)"
                              : "rgba(26,37,16,.08)",
                      }}
                    />
                  ))}
                </div>
                <div style={{ color: shell.muted, fontSize: 12 }}>
                  {formData.password.length < 6 ? "Weak" : formData.password.length < 10 ? "Fair" : "Strong"} password
                </div>
              </div>
            ) : null}

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
              style={{
                width: "100%",
                padding: "14px 20px",
                fontSize: 14,
                fontWeight: 700,
                cursor: loading ? "default" : "pointer",
                opacity: loading ? 0.72 : 1,
              }}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Creating account...
                </>
              ) : (
                <>
                  Create account
                  <ChevronRight size={16} />
                </>
              )}
            </button>
          </form>

          <p style={{ marginTop: 22, textAlign: "center", color: shell.muted, fontSize: 13 }}>
            Already have an account?{" "}
            <Link href="/login" style={{ color: shell.accent, fontWeight: 700, textDecoration: "none" }}>
              Sign in
            </Link>
          </p>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <div style={{ marginBottom: 24 }}>
            <div style={{ color: shell.accent, fontSize: 11, fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase", marginBottom: 10 }}>
              Verify email
            </div>
            <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 34, lineHeight: 1, letterSpacing: "-0.04em", marginBottom: 10 }}>
              Enter the 6-digit code
            </h1>
            <p style={{ color: shell.muted, fontSize: 14, lineHeight: 1.7 }}>
              We sent it to <strong style={{ color: shell.text }}>{normalizedEmail}</strong>.
            </p>
          </div>

          {info ? (
            <div style={{ marginBottom: 14, borderRadius: 16, border: `1px solid ${shell.borderStrong}`, background: shell.accentSoft, color: shell.text, padding: "14px 16px", fontSize: 13, lineHeight: 1.6 }}>
              {info}
            </div>
          ) : null}

          <form style={{ display: "grid", gap: 18 }} onSubmit={handleVerifyOtp}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 8 }}>
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
              style={{
                width: "100%",
                padding: "14px 20px",
                fontSize: 14,
                fontWeight: 700,
                cursor: loading ? "default" : "pointer",
                opacity: loading ? 0.72 : 1,
              }}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  Verify and finish
                  <ChevronRight size={16} />
                </>
              )}
            </button>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setError("");
                  setInfo("");
                  setOtp(["", "", "", "", "", ""]);
                }}
                style={{ border: "none", background: "transparent", color: shell.muted, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <RotateCcw size={14} />
                Edit details
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
          </form>
        </>
      ) : null}

      {step === 3 ? (
        <div style={{ textAlign: "center", paddingTop: 12 }}>
          <div
            style={{
              width: 86,
              height: 86,
              borderRadius: 999,
              margin: "0 auto 22px",
              border: `1px solid ${shell.borderStrong}`,
              background: shell.accentSoft,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: shell.accent,
            }}
          >
            <CheckCircle2 size={38} />
          </div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 34, lineHeight: 1, letterSpacing: "-0.04em", marginBottom: 12 }}>
            You&apos;re verified
          </h1>
          <p style={{ color: shell.muted, fontSize: 14, lineHeight: 1.8, marginBottom: 18 }}>
            Your account is ready. From now on, you can sign in directly with your email and password.
          </p>

          <div
            style={{
              marginBottom: 22,
              borderRadius: 18,
              border: `1px solid ${shell.border}`,
              background: dark ? "rgba(255,255,255,.025)" : "rgba(255,255,255,.72)",
              padding: "14px 16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 6 }}>
              <Shield size={14} color={shell.accent} />
              <span style={{ color: shell.text, fontSize: 13, fontWeight: 700 }}>
                Registration complete
              </span>
            </div>
            <div style={{ color: shell.muted, fontSize: 13, lineHeight: 1.65 }}>
              Next time you only need your email and password to access the workspace.
            </div>
          </div>

          <Link
            href={`/login?registered=true&email=${encodeURIComponent(normalizedEmail)}`}
            className="brand-button"
            style={{
              width: "100%",
              padding: "14px 20px",
              fontSize: 14,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Continue to sign in
            <ChevronRight size={16} />
          </Link>
        </div>
      ) : null}
    </AuthScaffold>
  );
}
