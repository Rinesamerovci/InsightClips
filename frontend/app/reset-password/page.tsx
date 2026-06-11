"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronRight,
  Loader2,
  Lock,
  ShieldAlert,
} from "lucide-react";

import { AuthScaffold } from "@/components/AuthScaffold";
import { getAuthTheme, THEME_STORAGE_KEY } from "@/lib/brand";
import { getPasswordPolicyError } from "@/lib/password-policy";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [sessionValid, setSessionValid] = useState<boolean | null>(null);
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark";
  });

  const shell = getAuthTheme(dark);

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light");
  }, [dark]);

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

    const passwordError = getPasswordPolicyError(password);
    if (passwordError) {
      setError(passwordError);
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
    setTimeout(() => {
      window.location.href = "/login";
    }, 2500);
  };

  if (sessionValid === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0d1008]">
        <Loader2 className="animate-spin text-[#a3d06b]" size={36} />
      </div>
    );
  }

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
      showcaseBadge="Recovery session"
      showcaseTitle={
        <>
          Create a new password
          <br />
          <em style={{ color: shell.accent }}>and get right back in.</em>
        </>
      }
      showcaseBody="This final step resets the password inside the verified recovery session and sends you back to sign in with fresh credentials."
      showcaseContent={
        <div style={{ display: "grid", gap: 14 }}>
          {[
            "Use at least 8 characters for the new password.",
            "Confirm it once here to avoid mismatches on the next login.",
            "After a successful reset we sign you out and route you back to login.",
          ].map((line) => (
            <div
              key={line}
              style={{
                borderRadius: 18,
                border: `1px solid ${shell.border}`,
                background: dark ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.72)",
                padding: "14px 16px",
                lineHeight: 1.7,
                fontSize: 13,
              }}
            >
              {line}
            </div>
          ))}
        </div>
      }
      statusLabel="Verified reset session"
      shell={shell}
      onToggleTheme={() => setDark((value) => !value)}
      footerLabel="InsightClips password reset"
    >
      {!sessionValid ? (
        <div style={{ textAlign: "center", paddingTop: 16 }}>
          <div
            style={{
              width: 86,
              height: 86,
              borderRadius: 999,
              margin: "0 auto 22px",
              border: `1px solid ${dark ? "rgba(236,122,140,.24)" : "rgba(224,140,156,.36)"}`,
              background: dark ? "rgba(86,28,40,.56)" : "rgba(255,236,239,.9)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: dark ? "#ffc1cb" : "#9b314b",
            }}
          >
            <ShieldAlert size={38} />
          </div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 34, lineHeight: 1, letterSpacing: "-0.04em", marginBottom: 12 }}>
            Recovery session expired
          </h1>
          <p style={{ color: shell.muted, fontSize: 14, lineHeight: 1.8, marginBottom: 20 }}>
            Request a new recovery code and try again from the recovery screen.
          </p>
          <Link
            href="/forgot-password"
            className="brand-button"
            style={{ width: "100%", padding: "14px 20px", fontSize: 14, fontWeight: 700, textDecoration: "none" }}
          >
            Request new code
            <ChevronRight size={16} />
          </Link>
        </div>
      ) : success ? (
        <div style={{ textAlign: "center", paddingTop: 16 }}>
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
            Password updated
          </h1>
          <p style={{ color: shell.muted, fontSize: 14, lineHeight: 1.8 }}>
            Your password has been reset successfully. We are sending you back to sign in.
          </p>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 24 }}>
            <div style={{ color: shell.accent, fontSize: 11, fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase", marginBottom: 10 }}>
              Reset password
            </div>
            <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 34, lineHeight: 1, letterSpacing: "-0.04em", marginBottom: 10 }}>
              Set your new password
            </h1>
            <p style={{ color: shell.muted, fontSize: 14, lineHeight: 1.7 }}>
              Finish the recovery flow with a fresh password, then sign in again to continue.
            </p>
          </div>

          <form style={{ display: "grid", gap: 14 }} onSubmit={handleUpdatePassword}>
            <div style={{ position: "relative" }}>
              <Lock size={16} style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: shell.faint }} />
              <input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="New password"
                style={inputStyle}
              />
            </div>

            <div style={{ position: "relative" }}>
              <Lock size={16} style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: shell.faint }} />
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Confirm new password"
                style={inputStyle}
              />
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
                  Updating...
                </>
              ) : (
                <>
                  Save new password
                  <ChevronRight size={16} />
                </>
              )}
            </button>
          </form>
        </>
      )}
    </AuthScaffold>
  );
}
