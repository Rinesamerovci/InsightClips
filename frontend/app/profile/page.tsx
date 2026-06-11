"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Loader2,
  Moon,
  Palette,
  Save,
  Shield,
  Sparkles,
  SunMedium,
  Trash2,
  UserRound,
} from "lucide-react";

import { UserProfileCard } from "@/components/UserProfileCard";
import { useAuth } from "@/context/AuthContext";
import { deleteUserAccount, getUserProfile, updateUserProfile, type ProfileResponse } from "@/lib/api";
import { getStudioTheme, THEME_STORAGE_KEY } from "@/lib/brand";
import { getPasswordPolicyError } from "@/lib/password-policy";
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

function isRenderableProfileImage(value: string | null): boolean {
  if (!value) {
    return false;
  }

  if (value.startsWith("data:image/")) {
    return true;
  }

  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function SignalCard({
  label,
  value,
  hint,
  palette,
}: {
  label: string;
  value: string;
  hint: string;
  palette: {
    card: string;
    subBorder: string;
    text: string;
    muted: string;
  };
}) {
  return (
    <div
      style={{
        borderRadius: 20,
        border: `1px solid ${palette.subBorder}`,
        background: palette.card,
        padding: "16px 18px",
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".2em", textTransform: "uppercase", color: palette.muted, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, lineHeight: 1.06, color: palette.text }}>
        {value}
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.65, color: palette.muted, marginTop: 6 }}>
        {hint}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const { backendToken, loading: authLoading, syncBackendSession, signOut } = useAuth();

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
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark";
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
  const [deleteConfirmationEmail, setDeleteConfirmationEmail] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteFeedback, setDeleteFeedback] = useState<{
    tone: "success" | "error" | "info";
    message: string;
  } | null>(null);

  const isMobile = viewportWidth < 900;
  const isTablet = viewportWidth < 1180;

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light");
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

  const palette = useMemo(() => {
    const base = getStudioTheme(dark);
    return {
      bg: base.bg,
      shell: base.shell,
      card: base.card,
      border: base.border,
      subBorder: base.borderSub,
      text: base.text,
      muted: base.textSub,
      accent: base.accent,
      accentLight: base.accentLt,
      chip: base.chip,
      successBg: dark ? "rgba(18,48,14,.8)" : "rgba(228,251,220,.9)",
      successBorder: dark ? "rgba(90,158,58,.35)" : "rgba(130,205,110,.5)",
      successText: dark ? "#bfe4ab" : "#25591a",
      errorBg: base.errorBg,
      errorBorder: base.errorBd,
      errorText: base.errorText,
      deleteBg: dark ? "rgba(90,158,58,.1)" : "rgba(241,249,235,.92)",
      deleteBorder: dark ? "rgba(130,205,110,.26)" : "rgba(130,205,110,.38)",
      deleteText: dark ? "#bfe4ab" : "#3f7f25",
      deleteButton: dark ? "#3c7627" : "#5a9e3a",
    };
  }, [dark]);

  const hasChanges =
    form.full_name !== (profile?.full_name ?? "") ||
    form.profile_picture_url !== (profile?.profile_picture_url ?? "");
  const profileStrength = [
    Boolean(form.full_name.trim()),
    Boolean(form.profile_picture_url.trim()),
    Boolean(profile?.export_settings?.subtitle_style?.preset),
  ].filter(Boolean).length;
  const avatarPreview = useMemo(() => {
    const candidate = form.profile_picture_url.trim() || profile?.profile_picture_url || null;
    return isRenderableProfileImage(candidate) ? candidate : null;
  }, [form.profile_picture_url, profile?.profile_picture_url]);

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

    const passwordError = getPasswordPolicyError(newPassword);
    if (passwordError) {
      setPasswordFeedback({
        tone: "error",
        message: passwordError,
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

  const handleAvatarChange = (file: File | null) => {
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setFeedback({
        tone: "error",
        message: "Please choose an image file for your profile photo.",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setFeedback({
        tone: "error",
        message: "Profile photo must be smaller than 5 MB.",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        setFeedback({
          tone: "error",
          message: "We could not read that image. Please try another one.",
        });
        return;
      }

      setForm((current) => ({
        ...current,
        profile_picture_url: result,
      }));
      setFeedback(null);
    };
    reader.onerror = () => {
      setFeedback({
        tone: "error",
        message: "We could not read that image. Please try another one.",
      });
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteAccount = async () => {
    if (!profile || deleteLoading) {
      return;
    }

    const expectedEmail = profile.email.toLowerCase();
    if (deleteConfirmationEmail.trim().toLowerCase() !== expectedEmail) {
      setDeleteFeedback({
        tone: "error",
        message: "Type your account email exactly before deleting this account.",
      });
      return;
    }

    const confirmed = window.confirm(
      [
        "Are you sure you want to permanently delete this account?",
        "",
        "This removes your profile, podcasts, source media, generated clips, and sign-in access.",
        "Your one-time free upload usage will not be restored for this email.",
      ].join("\n"),
    );
    if (!confirmed) {
      return;
    }

    setDeleteLoading(true);
    setDeleteFeedback({
      tone: "info",
      message: "Deleting account data, generated clips, source media, and auth access...",
    });

    try {
      const token = backendToken ?? (await syncBackendSession());
      if (!token) {
        router.replace("/login");
        return;
      }

      await deleteUserAccount(deleteConfirmationEmail.trim(), token);
      setDeleteFeedback({
        tone: "success",
        message: "Account deleted successfully. Signing out...",
      });
      await signOut();
    } catch (error) {
      setDeleteFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to delete this account right now.",
      });
    } finally {
      setDeleteLoading(false);
    }
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
  const deleteStyles =
    deleteFeedback?.tone === "success"
      ? {
          background: palette.successBg,
          border: palette.successBorder,
          color: palette.successText,
        }
      : deleteFeedback?.tone === "error"
        ? {
            background: palette.deleteBg,
            border: palette.deleteBorder,
            color: palette.deleteText,
          }
        : {
            background: palette.chip,
            border: palette.subBorder,
            color: palette.text,
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
          className="a-up ic-premium-card"
          style={{
            borderRadius: 34,
            border: `1px solid ${palette.border}`,
            background: `linear-gradient(180deg, ${palette.shell}, ${palette.card})`,
            padding: isMobile ? "24px 20px" : "34px 36px",
            boxShadow: dark ? "0 26px 60px rgba(0,0,0,.24)" : "0 26px 60px rgba(14,55,78,.10)",
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
                Shape how your creator identity appears across the whole studio.
              </h1>
              <p style={{ fontSize: 15, lineHeight: 1.8, color: palette.muted, maxWidth: 720 }}>
                Tune your public-facing profile, keep export defaults visible, and manage account security without leaving the product context.
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
                  gap: 12,
                  marginTop: 18,
                }}
              >
                <SignalCard
                  label="Profile state"
                  value={profileStrength >= 3 ? "Studio-ready" : profileStrength === 2 ? "Nearly complete" : "Needs setup"}
                  hint="A clearer identity helps every page feel more personal and easier to scan."
                  palette={palette}
                />
                <SignalCard
                  label="Display name"
                  value={form.full_name.trim() || "Add your name"}
                  hint="This is the name shown across profile and workspace areas."
                  palette={palette}
                />
                <SignalCard
                  label="Export style"
                  value={formatExportMode(profile?.export_settings.export_mode ?? "landscape")}
                  hint="Your default export mode stays visible while editing your account."
                  palette={palette}
                />
              </div>
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
              className="a-up ic-premium-card"
              style={{
                borderRadius: 24,
                background: palette.card,
                border: `1px solid ${palette.border}`,
                padding: 20,
              }}
            >
              {profile ? <UserProfileCard profile={profile} dark={dark} /> : null}
            </section>

            <section
              className="a-up ic-premium-card"
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

              <div
                style={{
                  borderRadius: 18,
                  border: `1px solid ${palette.subBorder}`,
                  background: palette.chip,
                  padding: "14px 16px",
                  marginBottom: 14,
                  color: palette.muted,
                  fontSize: 13,
                  lineHeight: 1.7,
                }}
              >
                Fill in only what matters here. The display name and image help the studio feel clearer, while your email stays fixed for account identity.
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
                  <span style={{ fontSize: 12, color: palette.muted, lineHeight: 1.6 }}>
                    Use the name you want shown across your workspace and profile.
                  </span>
                </label>

                <div style={{ display: "grid", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Profile photo</span>
                  <div
                    style={{
                      borderRadius: 18,
                      border: `1px solid ${palette.subBorder}`,
                      background: dark ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.8)",
                      padding: "16px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 14,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      {avatarPreview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={avatarPreview}
                          alt="Avatar preview"
                          style={{
                            width: 72,
                            height: 72,
                            borderRadius: 20,
                            objectFit: "cover",
                            border: `1px solid ${palette.subBorder}`,
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 72,
                            height: 72,
                            borderRadius: 20,
                            border: `1px solid ${palette.subBorder}`,
                            background: palette.chip,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: palette.accent,
                          }}
                        >
                          <Camera size={24} />
                        </div>
                      )}

                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: palette.text, marginBottom: 4 }}>
                          {avatarPreview ? "Photo ready" : "No photo selected"}
                        </div>
                        <div style={{ fontSize: 12, color: palette.muted, lineHeight: 1.6, maxWidth: 320 }}>
                          Choose an image directly and we will use it as your profile photo instead of asking for a link.
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={(event) => handleAvatarChange(event.target.files?.[0] ?? null)}
                      />
                      <button
                        type="button"
                        onClick={() => avatarInputRef.current?.click()}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          borderRadius: 999,
                          border: "none",
                          background: `linear-gradient(135deg, ${palette.accent}, ${palette.accentLight})`,
                          color: "#fff",
                          padding: "11px 16px",
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        <Camera size={15} />
                        Choose photo
                      </button>
                      {form.profile_picture_url.trim() ? (
                        <button
                          type="button"
                          onClick={() =>
                            setForm((current) => ({
                              ...current,
                              profile_picture_url: "",
                            }))
                          }
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            borderRadius: 999,
                            border: `1px solid ${palette.subBorder}`,
                            background: palette.card,
                            color: palette.text,
                            padding: "11px 16px",
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          Remove photo
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: palette.muted, lineHeight: 1.6 }}>
                    Best result: use a square photo so it looks clean on profile cards and account areas.
                  </span>
                </div>

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
              className="a-up ic-premium-card"
              style={{
                borderRadius: 24,
                background: palette.card,
                border: `1px solid ${palette.border}`,
                padding: 20,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <Palette size={18} color={palette.accent} />
                <div style={{ fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: palette.muted }}>
                  What changes here
                </div>
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                {[
                  "Display name improves recognition across the studio.",
                  "Avatar helps profile and account views feel more polished.",
                  "Security stays separate so account changes remain easy to understand.",
                ].map((item) => (
                  <div
                    key={item}
                    style={{
                      borderRadius: 16,
                      border: `1px solid ${palette.subBorder}`,
                      background: palette.chip,
                      padding: "11px 12px",
                      fontSize: 13,
                      lineHeight: 1.65,
                      color: palette.muted,
                    }}
                  >
                    {item}
                  </div>
                ))}
              </div>
            </section>

            <section
              className="a-up ic-premium-card"
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

              <div
                style={{
                  borderRadius: 16,
                  border: `1px solid ${palette.subBorder}`,
                  background: palette.chip,
                  padding: "12px 14px",
                  marginBottom: 12,
                  fontSize: 13,
                  lineHeight: 1.65,
                  color: palette.muted,
                }}
              >
                Choose a password with at least 8 characters, including letters and numbers, so the message stays clear and you know exactly what is required.
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

              <div
                style={{
                  marginTop: 14,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  borderRadius: 16,
                  border: `1px solid ${palette.subBorder}`,
                  background: dark ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.76)",
                  padding: "12px 14px",
                  fontSize: 12,
                  lineHeight: 1.65,
                  color: palette.muted,
                }}
              >
                <Sparkles size={15} color={palette.accent} />
                Password changes stay in this panel so profile edits and security tasks never get mixed together.
              </div>
            </section>

            <section
              className="a-up ic-premium-card"
              style={{
                borderRadius: 24,
                background: palette.card,
                border: `1px solid ${palette.deleteBorder}`,
                padding: 20,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <Trash2 size={18} color={palette.deleteText} />
                <div style={{ fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: palette.deleteText }}>
                  Account deletion
                </div>
              </div>

              <div
                style={{
                  borderRadius: 16,
                  border: `1px solid ${palette.deleteBorder}`,
                  background: palette.deleteBg,
                  padding: "12px 14px",
                  marginBottom: 12,
                  fontSize: 13,
                  lineHeight: 1.65,
                  color: palette.deleteText,
                }}
              >
                Delete account permanently removes your profile, podcasts, generated clips, source media, messages, and sign-in access.
              </div>

              {deleteFeedback ? (
                <div
                  style={{
                    marginBottom: 12,
                    borderRadius: 16,
                    padding: "12px 14px",
                    background: deleteStyles.background,
                    border: `1px solid ${deleteStyles.border}`,
                    color: deleteStyles.color,
                    fontSize: 13,
                    lineHeight: 1.6,
                  }}
                >
                  {deleteFeedback.message}
                </div>
              ) : null}

              <div style={{ display: "grid", gap: 12 }}>
                <input
                  type="email"
                  value={deleteConfirmationEmail}
                  onChange={(event) => setDeleteConfirmationEmail(event.target.value)}
                  placeholder={`Type ${profile?.email ?? "your email"} to confirm`}
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
                  onClick={() => void handleDeleteAccount()}
                  disabled={deleteLoading || !profile}
                  style={{
                    border: "none",
                    borderRadius: 16,
                    background: palette.deleteButton,
                    color: "#fff",
                    padding: "12px 16px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    fontWeight: 700,
                    cursor: deleteLoading || !profile ? "default" : "pointer",
                    opacity: deleteLoading || !profile ? 0.72 : 1,
                  }}
                >
                  {deleteLoading ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  {deleteLoading ? "Deleting..." : "Delete account permanently"}
                </button>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
