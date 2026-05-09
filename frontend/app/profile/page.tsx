"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Moon,
  Save,
  Shield,
  SunMedium,
  UserRound,
} from "lucide-react";

import { UserProfileCard } from "@/components/UserProfileCard";
import { useAuth } from "@/context/AuthContext";
import { getUserProfile, updateUserProfile, type ProfileResponse } from "@/lib/api";
import { formatExportMode } from "@/lib/subtitle-style";
import { supabase } from "@/lib/supabase";

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display:ital@0;1&display=swap');
  *{box-sizing:border-box}
  body{font-family:'DM Sans',sans-serif}
  @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
  .a-up{animation:fadeUp .55s cubic-bezier(.22,1,.36,1) both}
`;

type ProfileForm = {
  full_name: string;
  profile_picture_url: string;
};

export default function ProfilePage() {
  const router = useRouter();
  const { backendToken, loading: authLoading, syncBackendSession } = useAuth();

  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [form, setForm] = useState<ProfileForm>({
    full_name: "",
    profile_picture_url: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(1280);
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.localStorage.getItem("insightclips-theme") === "dark";
  });
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error" | "info";
    message: string;
  } | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordFeedback, setPasswordFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  const isMobile = viewportWidth < 900;
  const isTablet = viewportWidth < 1180;

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
    if (authLoading) {
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        const token = backendToken ?? (await syncBackendSession());
        if (!token) {
          router.replace("/login");
          return;
        }

        const data = await getUserProfile(token);
        setProfile(data);
        setForm({
          full_name: data.full_name ?? "",
          profile_picture_url: data.profile_picture_url ?? "",
        });
        setFeedback(null);
      } catch (error) {
        setFeedback({
          tone: "error",
          message:
            error instanceof Error
              ? error.message
              : "Unable to load your profile.",
        });
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [authLoading, backendToken, router, syncBackendSession]);

  const palette = useMemo(
    () => ({
      bg: dark ? "#070d06" : "#eef6e9",
      shell: dark ? "rgba(9,14,8,.92)" : "rgba(244,249,239,.95)",
      card: dark ? "rgba(13,20,11,.88)" : "rgba(255,255,255,.92)",
      border: dark ? "rgba(60,105,40,.34)" : "rgba(140,200,110,.4)",
      subBorder: dark ? "rgba(60,105,40,.18)" : "rgba(140,200,110,.22)",
      text: dark ? "#dff0d8" : "#142210",
      muted: dark ? "rgba(163,210,128,.66)" : "rgba(55,100,35,.68)",
      accent: dark ? "#5a9e3a" : "#4a8e2a",
      accentLight: dark ? "#7ab55c" : "#6aa845",
      chip: dark ? "rgba(90,158,58,.12)" : "rgba(90,158,58,.08)",
      successBg: dark ? "rgba(18,48,14,.8)" : "rgba(228,251,220,.9)",
      successBorder: dark ? "rgba(90,158,58,.35)" : "rgba(130,205,110,.5)",
      successText: dark ? "#bfe4ab" : "#25591a",
      errorBg: dark ? "rgba(58,14,14,.82)" : "rgba(255,234,234,.92)",
      errorBorder: dark ? "rgba(170,84,84,.34)" : "rgba(215,165,165,.5)",
      errorText: dark ? "#efaaaa" : "#9d3a3a",
    }),
    [dark],
  );

  const hasChanges =
    form.full_name !== (profile?.full_name ?? "") ||
    form.profile_picture_url !== (profile?.profile_picture_url ?? "");

  const handleSaveProfile = async () => {
    if (!profile || saving || !hasChanges) {
      return;
    }

    setSaving(true);
    setFeedback({
      tone: "info",
      message: "Saving profile changes...",
    });

    try {
      const token = backendToken ?? (await syncBackendSession());
      if (!token) {
        router.replace("/login");
        return;
      }

      const updated = await updateUserProfile(
        {
          full_name: form.full_name.trim() || null,
          profile_picture_url: form.profile_picture_url.trim() || null,
        },
        token,
      );
      setProfile(updated);
      setForm({
        full_name: updated.full_name ?? "",
        profile_picture_url: updated.profile_picture_url ?? "",
      });
      setFeedback({
        tone: "success",
        message: "Profile updated successfully.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to update your profile.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (passwordLoading) {
      return;
    }

    setPasswordFeedback(null);

    if (newPassword.length < 8) {
      setPasswordFeedback({
        tone: "error",
        message: "New password must be at least 8 characters.",
      });
      return;
    }

    if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setPasswordFeedback({
        tone: "error",
        message: "Password must include letters and numbers.",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordFeedback({
        tone: "error",
        message: "Passwords do not match.",
      });
      return;
    }

    setPasswordLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      setPasswordFeedback({
        tone: "error",
        message: error.message,
      });
    } else {
      setPasswordFeedback({
        tone: "success",
        message: "Password updated successfully.",
      });
      setNewPassword("");
      setConfirmPassword("");
    }

    setPasswordLoading(false);
  };

  if (loading || authLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: palette.bg,
          color: palette.text,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <style>{CSS}</style>
        <Loader2 size={28} className="animate-spin" />
      </div>
    );
  }

  const profileFeedbackStyles =
    feedback?.tone === "success"
      ? {
          background: palette.successBg,
          border: palette.successBorder,
          color: palette.successText,
        }
      : feedback?.tone === "error"
        ? {
            background: palette.errorBg,
            border: palette.errorBorder,
            color: palette.errorText,
          }
        : {
            background: palette.chip,
            border: palette.subBorder,
            color: palette.text,
          };

  const passwordStyles =
    passwordFeedback?.tone === "success"
      ? {
          background: palette.successBg,
          border: palette.successBorder,
          color: palette.successText,
        }
      : {
          background: palette.errorBg,
          border: palette.errorBorder,
          color: palette.errorText,
        };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: palette.bg,
        color: palette.text,
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <style>{CSS}</style>

      <div style={{ maxWidth: 1240, margin: "0 auto", padding: isMobile ? "24px 16px 36px" : "40px 24px 56px" }}>
        <header
          className="a-up"
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 14,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 28,
          }}
        >
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link
              href="/dashboard"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                textDecoration: "none",
                color: "inherit",
                border: `1px solid ${palette.border}`,
                borderRadius: 999,
                padding: "10px 16px",
                background: palette.card,
              }}
            >
              <ArrowLeft size={16} />
              Dashboard
            </Link>
            <button
              type="button"
              onClick={() => setDark((value) => !value)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                border: `1px solid ${palette.border}`,
                borderRadius: 999,
                padding: "10px 14px",
                background: palette.card,
                color: palette.muted,
                cursor: "pointer",
              }}
            >
              {dark ? <SunMedium size={15} /> : <Moon size={15} />}
              {dark ? "Light mode" : "Dark mode"}
            </button>
          </div>

          <button
            type="button"
            onClick={() => void handleSaveProfile()}
            disabled={saving || !hasChanges}
            style={{
              border: "none",
              borderRadius: 999,
              background: `linear-gradient(135deg, ${palette.accent}, ${palette.accentLight})`,
              color: "#fff",
              padding: "12px 18px",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontWeight: 700,
              cursor: saving || !hasChanges ? "default" : "pointer",
              opacity: saving || !hasChanges ? 0.72 : 1,
            }}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? "Saving..." : hasChanges ? "Save profile" : "Saved"}
          </button>
        </header>

        <section
          className="a-up"
          style={{
            borderRadius: 30,
            border: `1px solid ${palette.border}`,
            background: palette.shell,
            padding: isMobile ? "24px 20px" : "30px 32px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isTablet ? "1fr" : "minmax(0,1.35fr) 320px",
              gap: 22,
            }}
          >
            <div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  borderRadius: 999,
                  padding: "7px 12px",
                  background: palette.chip,
                  color: palette.accentLight,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: ".18em",
                  textTransform: "uppercase",
                }}
              >
                <UserRound size={14} />
                Creator Profile
              </div>
              <h1
                style={{
                  marginTop: 16,
                  marginBottom: 12,
                  fontFamily: "'DM Serif Display', serif",
                  fontSize: "clamp(34px, 4vw, 58px)",
                  lineHeight: 1.02,
                  letterSpacing: "-.04em",
                }}
              >
                Keep your creator identity and account details in sync.
              </h1>
              <p style={{ fontSize: 15, lineHeight: 1.8, color: palette.muted, maxWidth: 720 }}>
                Update how your profile appears across the dashboard and keep your
                default export preferences visible while you manage account security.
              </p>
            </div>

            <div
              style={{
                borderRadius: 24,
                border: `1px solid ${palette.subBorder}`,
                background: palette.card,
                padding: "20px 22px",
                display: "grid",
                gap: 14,
              }}
            >
              {[
                { label: "Full name", value: profile?.full_name || "Creator profile" },
                { label: "Default export", value: formatExportMode(profile?.export_settings.export_mode ?? "landscape") },
                { label: "Subtitle preset", value: profile?.export_settings.subtitle_style?.preset ?? "classic" },
              ].map((item) => (
                <div key={item.label}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".2em", textTransform: "uppercase", color: palette.muted, marginBottom: 4 }}>
                    {item.label}
                  </div>
                  <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, fontStyle: "italic", lineHeight: 1 }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {feedback ? (
          <div
            style={{
              marginTop: 18,
              borderRadius: 18,
              padding: "14px 18px",
              background: profileFeedbackStyles.background,
              border: `1px solid ${profileFeedbackStyles.border}`,
              color: profileFeedbackStyles.color,
            }}
          >
            {feedback.message}
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isTablet ? "1fr" : "minmax(0,1fr) 360px",
            gap: 20,
            marginTop: 22,
            alignItems: "start",
          }}
        >
          <main style={{ display: "grid", gap: 18 }}>
            <section
              className="a-up"
              style={{
                borderRadius: 24,
                background: palette.card,
                border: `1px solid ${palette.border}`,
                padding: 20,
              }}
            >
              {profile ? <UserProfileCard profile={profile} /> : null}
            </section>

            <section
              className="a-up"
              style={{
                borderRadius: 24,
                background: palette.card,
                border: `1px solid ${palette.border}`,
                padding: 20,
              }}
            >
              <div style={{ fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: palette.muted, marginBottom: 14 }}>
                Profile Details
              </div>

              <div style={{ display: "grid", gap: 14 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Full name</span>
                  <input
                    value={form.full_name}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, full_name: event.target.value }))
                    }
                    placeholder="Your display name"
                    style={{
                      borderRadius: 16,
                      border: `1px solid ${palette.subBorder}`,
                      background: dark ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.8)",
                      color: palette.text,
                      padding: "14px 16px",
                      outline: "none",
                    }}
                  />
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Profile image URL</span>
                  <input
                    value={form.profile_picture_url}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        profile_picture_url: event.target.value,
                      }))
                    }
                    placeholder="https://..."
                    style={{
                      borderRadius: 16,
                      border: `1px solid ${palette.subBorder}`,
                      background: dark ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.8)",
                      color: palette.text,
                      padding: "14px 16px",
                      outline: "none",
                    }}
                  />
                </label>

                <div
                  style={{
                    borderRadius: 18,
                    border: `1px solid ${palette.subBorder}`,
                    background: palette.chip,
                    padding: "14px 16px",
                  }}
                >
                  <div style={{ fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: palette.muted, marginBottom: 6 }}>
                    Account email
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{profile?.email}</div>
                </div>
              </div>
            </section>
          </main>

          <aside style={{ display: "grid", gap: 18 }}>
            <section
              className="a-up"
              style={{
                borderRadius: 24,
                background: palette.card,
                border: `1px solid ${palette.border}`,
                padding: 20,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <Shield size={18} color={palette.accent} />
                <div style={{ fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: palette.muted }}>
                  Security
                </div>
              </div>

              {passwordFeedback ? (
                <div
                  style={{
                    marginBottom: 12,
                    borderRadius: 16,
                    padding: "12px 14px",
                    background: passwordStyles.background,
                    border: `1px solid ${passwordStyles.border}`,
                    color: passwordStyles.color,
                    fontSize: 13,
                    lineHeight: 1.6,
                  }}
                >
                  {passwordFeedback.message}
                </div>
              ) : null}

              <div style={{ display: "grid", gap: 12 }}>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="New password"
                  style={{
                    borderRadius: 16,
                    border: `1px solid ${palette.subBorder}`,
                    background: dark ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.8)",
                    color: palette.text,
                    padding: "14px 16px",
                    outline: "none",
                  }}
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Confirm new password"
                  style={{
                    borderRadius: 16,
                    border: `1px solid ${palette.subBorder}`,
                    background: dark ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.8)",
                    color: palette.text,
                    padding: "14px 16px",
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  onClick={() => void handleChangePassword()}
                  disabled={passwordLoading}
                  style={{
                    border: "none",
                    borderRadius: 16,
                    background: `linear-gradient(135deg, ${palette.accent}, ${palette.accentLight})`,
                    color: "#fff",
                    padding: "12px 16px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    fontWeight: 700,
                    cursor: passwordLoading ? "default" : "pointer",
                    opacity: passwordLoading ? 0.72 : 1,
                  }}
                >
                  {passwordLoading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  {passwordLoading ? "Updating..." : "Update password"}
                </button>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
