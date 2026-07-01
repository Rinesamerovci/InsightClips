"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
} from "lucide-react";

import { AuthScaffold } from "@/components/AuthScaffold";
import { postJson, storeBackendToken } from "@/lib/api";
import { getAuthTheme, THEME_STORAGE_KEY } from "@/lib/brand";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

type LoginResponse = { access_token: string };

function MetricChip({
  value,
  label,
  accent,
  border,
  dark,
}: {
  value: string;
  label: string;
  accent: string;
  border: string;
  dark: boolean;
}) {
  return (
    <div
      style={{
        borderRadius: 20,
        border: `1px solid ${border}`,
        background: dark ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.72)",
        padding: "16px 14px",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-serif)",
          color: accent,
          fontSize: 28,
          lineHeight: 1,
          letterSpacing: "-0.05em",
        }}
      >
        {value}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: ".18em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
    </div>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { backendToken, loading: authLoading, syncBackendSession, user } = useAuth();

  const [email, setEmail] = useState(() => searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dark, setDark] = useState(false);

  const shell = getAuthTheme(dark);
  const nextPath = useMemo(() => {
    const candidate = searchParams.get("next") ?? "";
    return candidate.startsWith("/") && !candidate.startsWith("//") && candidate !== "/login"
      ? candidate
      : "/dashboard";
  }, [searchParams]);

  const successMessage = useMemo(() => {
    if (searchParams.get("registered") === "true") {
      return "Account verified. You can now sign in directly with your email and password.";
    }

    return "";
  }, [searchParams]);

  useEffect(() => {
    try {
      setDark(window.localStorage.getItem(THEME_STORAGE_KEY) !== "light");
      const remembered = window.localStorage.getItem("rememberedEmail");
      if (remembered) {
        setRememberMe(true);
        setEmail((current) => current || remembered);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light");
    } catch {}
  }, [dark]);

  useEffect(() => {
    if (authLoading || !user) {
      return;
    }

    let cancelled = false;

    const goToNextPath = async () => {
      try {
        const token = backendToken ?? (await syncBackendSession());
        if (!cancelled && token) {
          router.replace(nextPath);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to reach the backend.");
        }
      }
    };

    void goToNextPath();

    return () => {
      cancelled = true;
    };
  }, [authLoading, backendToken, nextPath, router, syncBackendSession, user]);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    const normalizedEmail = email.trim().toLowerCase();

    try {
      const { error: supaErr } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (supaErr) {
        throw new Error(supaErr.message || "Invalid email or password.");
      }

      const backendAuth = await postJson<LoginResponse>("/auth/login", {
        email: normalizedEmail,
        password,
      });

      storeBackendToken(backendAuth.access_token);
      void syncBackendSession().catch(() => {});

      if (rememberMe) {
        window.localStorage.setItem("rememberedEmail", normalizedEmail);
      } else {
        window.localStorage.removeItem("rememberedEmail");
      }

      router.replace(nextPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
      setLoading(false);
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
      showcaseBadge="Creator workspace"
      showcaseTitle={
        <>
          Sign in to the
          <br />
          <em style={{ color: shell.accent }}>InsightClips studio.</em>
        </>
      }
      showcaseBody="A cleaner workspace for upload, analysis, clip generation, and publishing, all inside one focused flow."
      showcaseContent={
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 120px), 1fr))",
              gap: 12,
            }}
          >
            <MetricChip value="12M+" label="Clips made" accent={shell.accent} border={shell.border} dark={dark} />
            <MetricChip value="99.9%" label="Uptime" accent={shell.accent} border={shell.border} dark={dark} />
            <MetricChip value="0.4s" label="Latency" accent={shell.accent} border={shell.border} dark={dark} />
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
              Included in the flow
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {[
                "Upload, analyze, and publish from one product flow.",
                "Subtitle, framing, and clip settings stay aligned.",
                "The strongest moments are easier to review and ship.",
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
      statusLabel="Secure workspace access"
      shell={shell}
      onToggleTheme={() => setDark((value) => !value)}
      footerLabel="InsightClips secure sign in"
    >
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            color: shell.accent,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: ".18em",
            textTransform: "uppercase",
            marginBottom: 10,
          }}
        >
          Sign in
        </div>
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 34,
            lineHeight: 1,
            letterSpacing: "-0.04em",
            marginBottom: 10,
          }}
        >
          Welcome back
        </h1>
        <p style={{ color: shell.muted, fontSize: 14, lineHeight: 1.7 }}>
          Continue with your email and password to open dashboard, uploads, and clips.
        </p>
      </div>

      {successMessage ? (
        <div
          style={{
            marginBottom: 16,
            borderRadius: 16,
            border: `1px solid ${shell.borderStrong}`,
            background: shell.accentSoft,
            color: shell.text,
            padding: "14px 16px",
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          {successMessage}
        </div>
      ) : null}

      <form style={{ display: "grid", gap: 14 }} onSubmit={handleLogin}>
        <div style={{ position: "relative" }}>
          <Mail
            size={16}
            style={{
              position: "absolute",
              left: 16,
              top: "50%",
              transform: "translateY(-50%)",
              color: shell.faint,
            }}
          />
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

        <div style={{ position: "relative" }}>
          <Lock
            size={16}
            style={{
              position: "absolute",
              left: 16,
              top: "50%",
              transform: "translateY(-50%)",
              color: shell.faint,
            }}
          />
          <input
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
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

        {error ? (
          <div
            style={{
              borderRadius: 16,
              border: `1px solid ${dark ? "rgba(236,122,140,.24)" : "rgba(224,140,156,.36)"}`,
              background: dark ? "rgba(86,28,40,.56)" : "rgba(255,236,239,.9)",
              color: dark ? "#ffc1cb" : "#9b314b",
              padding: "14px 16px",
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            {error}
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, color: shell.muted, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
              style={{ accentColor: shell.accent, width: 14, height: 14 }}
            />
            Remember me
          </label>

          <Link href="/forgot-password" style={{ color: shell.accent, fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="brand-button"
          style={{
            marginTop: 4,
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
              Signing in...
            </>
          ) : (
            <>
              Sign in
              <ChevronRight size={16} />
            </>
          )}
        </button>
      </form>

      <p style={{ marginTop: 22, textAlign: "center", color: shell.muted, fontSize: 13 }}>
        Don&apos;t have an account?{" "}
        <Link href="/register" style={{ color: shell.accent, fontWeight: 700, textDecoration: "none" }}>
          Create one
        </Link>
      </p>
    </AuthScaffold>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}
