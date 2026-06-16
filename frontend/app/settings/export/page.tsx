"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Loader2,
  Monitor,
  Moon,
  Settings2,
  Smartphone,
  Sparkles,
  SunMedium,
  Volume2,
} from "lucide-react";

import SubtitleStylePanel from "@/components/SubtitleStylePanel";
import { useAuth } from "@/context/AuthContext";
import {
  getUserExportSettings,
  updateUserExportSettings,
  type AudioEnhancementSettings,
  type ExportMode,
  type ExportSettings,
} from "@/lib/api";
import { getAudioEnhancementFeedback } from "@/lib/audio-enhancement";
import {
  buildDefaultAudioEnhancementSettings,
  buildDefaultExportSettings,
  buildSubtitleStyleFromPreset,
  formatCropMode,
  formatExportMode,
  normalizeExportSettings,
} from "@/lib/subtitle-style";

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display:ital@0;1&display=swap');
  *{box-sizing:border-box}
  body{font-family:'DM Sans',sans-serif}
  @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
  .a-up{animation:fadeUp .55s cubic-bezier(.22,1,.36,1) both}
  .glass{backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px)}
`;

function areSettingsEqual(left: ExportSettings | null, right: ExportSettings | null): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function buildAudioState(
  current: AudioEnhancementSettings,
  changes: Partial<AudioEnhancementSettings>,
): AudioEnhancementSettings {
  const nextEnabled = changes.enabled ?? current.enabled;
  const nextNormalize =
    nextEnabled ? changes.normalize_loudness ?? current.normalize_loudness : false;

  return {
    ...current,
    ...changes,
    enabled: nextEnabled,
    normalize_loudness: nextNormalize,
    status: nextEnabled && nextNormalize ? "enabled" : "disabled",
  };
}

function ModeCard({
  active,
  icon: Icon,
  label,
  title,
  text,
  onClick,
  accent,
  border,
  subBorder,
  dark,
}: {
  active: boolean;
  icon: React.ElementType;
  label: string;
  title: string;
  text: string;
  onClick: () => void;
  accent: string;
  border: string;
  subBorder: string;
  dark: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: "left",
        borderRadius: 22,
        border: `1px solid ${active ? accent : subBorder}`,
        background: active
          ? dark
            ? "rgba(90,158,58,.16)"
            : "rgba(90,158,58,.1)"
          : dark
            ? "rgba(13,20,11,.88)"
            : "rgba(255,255,255,.88)",
        padding: 18,
        color: "inherit",
        cursor: "pointer",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: `1px solid ${active ? accent : border}`,
            background: active ? "rgba(255,255,255,.1)" : "transparent",
          }}
        >
          <Icon size={18} color={accent} />
        </div>
        <span
          style={{
            borderRadius: 999,
            border: `1px solid ${active ? accent : subBorder}`,
            padding: "6px 10px",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: ".16em",
            textTransform: "uppercase",
            color: active ? accent : "inherit",
          }}
        >
          {label}
        </span>
      </div>
      <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, marginBottom: 8 }}>
        {title}
      </div>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, opacity: 0.76 }}>{text}</p>
    </button>
  );
}

function ToggleRow({
  title,
  text,
  checked,
  disabled,
  onToggle,
  accent,
  border,
  subBorder,
  dark,
}: {
  title: string;
  text: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
  accent: string;
  border: string;
  subBorder: string;
  dark: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      style={{
        width: "100%",
        textAlign: "left",
        borderRadius: 18,
        border: `1px solid ${checked ? accent : subBorder}`,
        background: checked
          ? dark
            ? "rgba(90,158,58,.12)"
            : "rgba(90,158,58,.08)"
          : dark
            ? "rgba(255,255,255,.03)"
            : "rgba(255,255,255,.7)",
        padding: "14px 16px",
        color: "inherit",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.65 : 1,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 6,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
        <div
          style={{
            width: 44,
            height: 24,
            borderRadius: 999,
            background: checked ? accent : dark ? "rgba(255,255,255,.08)" : "rgba(20,34,16,.12)",
            border: `1px solid ${checked ? accent : border}`,
            padding: 2,
          }}
        >
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "#fff",
              transform: checked ? "translateX(20px)" : "translateX(0)",
              transition: "transform .2s ease",
            }}
          />
        </div>
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.65, opacity: 0.74 }}>{text}</div>
    </button>
  );
}

export default function ExportSettingsPage() {
  const router = useRouter();
  const { backendToken, loading: authLoading, syncBackendSession } = useAuth();

  const [viewportWidth, setViewportWidth] = useState(1280);
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.localStorage.getItem("insightclips-theme") === "dark";
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsForm, setSettingsForm] = useState<ExportSettings>(() =>
    buildDefaultExportSettings(),
  );
  const [savedSettings, setSavedSettings] = useState<ExportSettings | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error" | "info";
    message: string;
  } | null>(null);
  const [showFineTune, setShowFineTune] = useState(false);

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

        const response = await getUserExportSettings(token);
        const normalized = normalizeExportSettings(response.export_settings);
        setSettingsForm(normalized);
        setSavedSettings(normalized);
        setFeedback(null);
      } catch (error) {
        setFeedback({
          tone: "error",
          message:
            error instanceof Error
              ? error.message
              : "Unable to load export settings.",
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
  const hasChanges = !areSettingsEqual(settingsForm, savedSettings);
  const subtitleStyle =
    settingsForm.subtitle_style ?? buildSubtitleStyleFromPreset("classic");
  const audioSettings =
    settingsForm.audio_enhancement ?? buildDefaultAudioEnhancementSettings();
  const audioFeedback = getAudioEnhancementFeedback({
    audioEnhancement: audioSettings,
    context: savedSettings ? "saved" : "setup",
  });

  const updateSettings = (updater: (current: ExportSettings) => ExportSettings) => {
    setSettingsForm((current) => normalizeExportSettings(updater(current)));
    if (feedback?.tone === "success") {
      setFeedback(null);
    }
  };

  const handleModeChange = (mode: ExportMode) => {
    updateSettings((current) => {
      if (mode === "landscape") {
        return {
          ...current,
          export_mode: "landscape",
          crop_mode: "none",
          mobile_optimized: false,
          face_tracking_enabled: false,
        };
      }

      return {
        ...current,
        export_mode: "portrait",
        crop_mode: current.crop_mode === "none" ? "smart_crop" : current.crop_mode,
        mobile_optimized: true,
      };
    });
  };

  const handleCropModeChange = (mode: "center_crop" | "smart_crop") => {
    updateSettings((current) => ({
      ...current,
      crop_mode: current.export_mode === "landscape" ? "none" : mode,
      face_tracking_enabled:
        current.export_mode === "portrait" && mode === "smart_crop"
          ? current.face_tracking_enabled
          : false,
    }));
  };

  const handleAudioChange = (changes: Partial<AudioEnhancementSettings>) => {
    updateSettings((current) => ({
      ...current,
      audio_enhancement: buildAudioState(
        current.audio_enhancement ?? buildDefaultAudioEnhancementSettings(),
        changes,
      ),
    }));
  };

  const handleSave = async () => {
    if (saving || !hasChanges) {
      return;
    }

    setSaving(true);
    setFeedback({
      tone: "info",
      message: "Saving your export and subtitle preferences...",
    });

    try {
      const token = backendToken ?? (await syncBackendSession());
      if (!token) {
        router.replace("/login");
        return;
      }

      const response = await updateUserExportSettings(settingsForm, token);
      const normalized = normalizeExportSettings(response.export_settings);
      setSettingsForm(normalized);
      setSavedSettings(normalized);
      setFeedback({
        tone: "success",
        message: "Settings saved. New uploads will use these export preferences.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to save export settings.",
      });
    } finally {
      setSaving(false);
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

  const feedbackStyles =
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
              href="/settings"
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
              Feedback
            </Link>
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
              <Settings2 size={16} />
              Dashboard
            </Link>
            <Link
              href="/settings/billing"
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
              <CreditCard size={16} />
              Billing
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
            onClick={() => void handleSave()}
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
            {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            {saving ? "Saving..." : hasChanges ? "Save settings" : "Saved"}
          </button>
        </header>

        <section
          className="a-up glass ic-premium-card"
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
              gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1.2fr) minmax(260px,.8fr)",
              gap: 18,
              alignItems: "start",
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
                <Settings2 size={14} />
                Export Settings
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
                Shape how every export leaves the dashboard.
              </h1>
              <p style={{ fontSize: 15, lineHeight: 1.8, color: palette.muted, maxWidth: 720 }}>
                Save a default export profile for new uploads, keep subtitle styling consistent,
                and tune audio cleanup before your clips get published.
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
                { label: "Export mode", value: formatExportMode(settingsForm.export_mode) },
                { label: "Crop mode", value: formatCropMode(settingsForm.crop_mode) },
                {
                  label: "Subtitle preset",
                  value: settingsForm.subtitle_style?.preset ?? "classic",
                },
                {
                  label: "Audio",
                  value: settingsForm.audio_enhancement?.enabled ? "Enhanced" : "Original",
                },
              ].map((item) => (
                <div key={item.label}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".2em", textTransform: "uppercase", color: palette.muted, marginBottom: 4 }}>
                    {item.label}
                  </div>
                  <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, fontStyle: "italic", lineHeight: 1 }}>
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
              background: feedbackStyles.background,
              border: `1px solid ${feedbackStyles.border}`,
              color: feedbackStyles.color,
            }}
          >
            {feedback.message}
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isTablet ? "1fr" : "minmax(0,1fr) 340px",
            gap: 20,
            marginTop: 22,
            alignItems: "start",
          }}
        >
          <main style={{ display: "grid", gap: 18 }}>
            <section
              className="glass a-up ic-premium-card"
              style={{
                borderRadius: 24,
                background: palette.card,
                border: `1px solid ${palette.border}`,
                padding: 20,
              }}
            >
              <div style={{ fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: palette.muted, marginBottom: 14 }}>
                Export Layout
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
                <ModeCard
                  active={settingsForm.export_mode === "portrait"}
                  icon={Smartphone}
                  label="9:16"
                  title="Portrait"
                  text="Default for Shorts, Reels, and TikTok. Keeps mobile framing and subtitle scale optimized for short-form feeds."
                  onClick={() => handleModeChange("portrait")}
                  accent={palette.accent}
                  border={palette.border}
                  subBorder={palette.subBorder}
                  dark={dark}
                />
                <ModeCard
                  active={settingsForm.export_mode === "landscape"}
                  icon={Monitor}
                  label="16:9"
                  title="Landscape"
                  text="Use the original widescreen frame for YouTube, desktop playback, and clips that need more horizontal context."
                  onClick={() => handleModeChange("landscape")}
                  accent={palette.accent}
                  border={palette.border}
                  subBorder={palette.subBorder}
                  dark={dark}
                />
              </div>
            </section>

            <section
              className="glass a-up ic-premium-card"
              style={{
                borderRadius: 24,
                background: palette.card,
                border: `1px solid ${palette.border}`,
                padding: 20,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: palette.muted, marginBottom: 6 }}>
                    Settings scope
                  </div>
                  <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, lineHeight: 1.08, marginBottom: 6 }}>
                    This page saves your default export profile.
                  </div>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.72, color: palette.muted, maxWidth: 680 }}>
                    Keep only the defaults here for future uploads. Clip-specific creative work like generation flow, output format, and final polishing belongs in the Clips page.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowFineTune((current) => !current)}
                  style={{
                    border: `1px solid ${palette.subBorder}`,
                    borderRadius: 999,
                    padding: "11px 16px",
                    background: showFineTune ? palette.chip : "transparent",
                    color: showFineTune ? palette.accent : palette.text,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {showFineTune ? "Hide fine-tune" : "Open fine-tune"}
                </button>
              </div>
            </section>

            <section
              className="glass a-up ic-premium-card"
              style={{
                borderRadius: 24,
                background: palette.card,
                border: `1px solid ${palette.border}`,
                padding: 20,
              }}
            >
              <div style={{ fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: palette.muted, marginBottom: 14 }}>
                Core Defaults
              </div>

              <div style={{ display: "grid", gap: 12, marginBottom: 14 }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                    gap: 12,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleCropModeChange("center_crop")}
                    disabled={settingsForm.export_mode === "landscape"}
                    style={{
                      borderRadius: 18,
                      border: `1px solid ${settingsForm.crop_mode === "center_crop" ? palette.accent : palette.subBorder}`,
                      background:
                        settingsForm.crop_mode === "center_crop"
                          ? palette.chip
                          : dark
                            ? "rgba(255,255,255,.03)"
                            : "rgba(255,255,255,.76)",
                      padding: 16,
                      textAlign: "left",
                      color: "inherit",
                      cursor: settingsForm.export_mode === "landscape" ? "default" : "pointer",
                      opacity: settingsForm.export_mode === "landscape" ? 0.55 : 1,
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Center crop</div>
                    <div style={{ fontSize: 13, lineHeight: 1.65, color: palette.muted }}>
                      Uses a stable portrait crop without speaker tracking.
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCropModeChange("smart_crop")}
                    disabled={settingsForm.export_mode === "landscape"}
                    style={{
                      borderRadius: 18,
                      border: `1px solid ${settingsForm.crop_mode === "smart_crop" ? palette.accent : palette.subBorder}`,
                      background:
                        settingsForm.crop_mode === "smart_crop"
                          ? palette.chip
                          : dark
                            ? "rgba(255,255,255,.03)"
                            : "rgba(255,255,255,.76)",
                      padding: 16,
                      textAlign: "left",
                      color: "inherit",
                      cursor: settingsForm.export_mode === "landscape" ? "default" : "pointer",
                      opacity: settingsForm.export_mode === "landscape" ? 0.55 : 1,
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Smart crop</div>
                    <div style={{ fontSize: 13, lineHeight: 1.65, color: palette.muted }}>
                      Follows speakers more aggressively and unlocks face tracking.
                    </div>
                  </button>
                </div>

                <ToggleRow
                  title="Mobile optimized framing"
                  text="Keeps exports tuned for short-form vertical playback and faster scanability."
                  checked={Boolean(settingsForm.mobile_optimized)}
                  disabled={settingsForm.export_mode === "landscape"}
                  onToggle={() =>
                    updateSettings((current) => ({
                      ...current,
                      mobile_optimized: !Boolean(current.mobile_optimized),
                    }))
                  }
                  accent={palette.accent}
                  border={palette.border}
                  subBorder={palette.subBorder}
                  dark={dark}
                />
                <ToggleRow
                  title="Face tracking"
                  text="Keeps the frame centered on speakers when portrait exports use smart crop."
                  checked={Boolean(settingsForm.face_tracking_enabled)}
                  disabled={
                    settingsForm.export_mode === "landscape" ||
                    settingsForm.crop_mode !== "smart_crop"
                  }
                  onToggle={() =>
                    updateSettings((current) => ({
                      ...current,
                      crop_mode: current.export_mode === "portrait" ? "smart_crop" : "none",
                      face_tracking_enabled: !Boolean(current.face_tracking_enabled),
                    }))
                  }
                  accent={palette.accent}
                  border={palette.border}
                  subBorder={palette.subBorder}
                  dark={dark}
                />
              </div>
            </section>

            {showFineTune ? (
              <>
                <SubtitleStylePanel
                  dark={dark}
                  exportMode={settingsForm.export_mode}
                  styleValue={subtitleStyle}
                  onPresetChange={(preset) =>
                    updateSettings((current) => ({
                      ...current,
                      subtitle_style: buildSubtitleStyleFromPreset(preset),
                    }))
                  }
                  onFontFamilyChange={(fontFamily) =>
                    updateSettings((current) => ({
                      ...current,
                      subtitle_style: {
                        ...(current.subtitle_style ?? buildSubtitleStyleFromPreset("classic")),
                        font_family: fontFamily,
                      },
                    }))
                  }
                  onColorChange={(color) =>
                    updateSettings((current) => ({
                      ...current,
                      subtitle_style: {
                        ...(current.subtitle_style ?? buildSubtitleStyleFromPreset("classic")),
                        primary_color: color,
                      },
                    }))
                  }
                  onFontSizeChange={(size) =>
                    updateSettings((current) => ({
                      ...current,
                      subtitle_style: {
                        ...(current.subtitle_style ?? buildSubtitleStyleFromPreset("classic")),
                        font_size: size,
                      },
                    }))
                  }
                  onPositionChange={(position) =>
                    updateSettings((current) => ({
                      ...current,
                      subtitle_style: {
                        ...(current.subtitle_style ?? buildSubtitleStyleFromPreset("classic")),
                        position,
                      },
                    }))
                  }
                  palette={{
                    border: palette.border,
                    subBorder: palette.subBorder,
                    muted: palette.muted,
                    hi: palette.accent,
                    hi2: palette.accentLight,
                  }}
                />

                <section
                  className="glass a-up ic-premium-card"
                  style={{
                    borderRadius: 24,
                    background: palette.card,
                    border: `1px solid ${palette.border}`,
                    padding: 20,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <Volume2 size={18} color={palette.accent} />
                    <div style={{ fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: palette.muted }}>
                      Audio Enhancement
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 12 }}>
                    <ToggleRow
                      title="Audio leveling"
                      text="Smooths volume differences before final export."
                      checked={audioSettings.enabled}
                      onToggle={() =>
                        handleAudioChange({
                          enabled: !audioSettings.enabled,
                        })
                      }
                      accent={palette.accent}
                      border={palette.border}
                      subBorder={palette.subBorder}
                      dark={dark}
                    />
                    <ToggleRow
                      title="Normalize loudness"
                      text="Targets a more consistent perceived volume across clips."
                      checked={audioSettings.normalize_loudness}
                      disabled={!audioSettings.enabled}
                      onToggle={() =>
                        handleAudioChange({
                          normalize_loudness: !audioSettings.normalize_loudness,
                        })
                      }
                      accent={palette.accent}
                      border={palette.border}
                      subBorder={palette.subBorder}
                      dark={dark}
                    />
                    <div
                      style={{
                        borderRadius: 18,
                        border: `1px solid ${palette.subBorder}`,
                        background: dark ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.76)",
                        padding: "16px 18px",
                      }}
                    >
                      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
                        <label>
                          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".16em", textTransform: "uppercase", color: palette.muted, marginBottom: 6 }}>
                            Target loudness
                          </div>
                          <input
                            type="range"
                            min={-24}
                            max={-8}
                            step={1}
                            value={audioSettings.target_lufs}
                            onChange={(event) =>
                              handleAudioChange({ target_lufs: Number(event.target.value) })
                            }
                            style={{ width: "100%", accentColor: palette.accent }}
                          />
                          <div style={{ marginTop: 6, fontSize: 13, color: palette.text }}>
                            {audioSettings.target_lufs} LUFS
                          </div>
                        </label>
                        <label>
                          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".16em", textTransform: "uppercase", color: palette.muted, marginBottom: 6 }}>
                            True peak ceiling
                          </div>
                          <input
                            type="range"
                            min={-6}
                            max={0}
                            step={0.5}
                            value={audioSettings.true_peak_db}
                            onChange={(event) =>
                              handleAudioChange({ true_peak_db: Number(event.target.value) })
                            }
                            style={{ width: "100%", accentColor: palette.accent }}
                          />
                          <div style={{ marginTop: 6, fontSize: 13, color: palette.text }}>
                            {audioSettings.true_peak_db} dB
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>
                </section>
              </>
            ) : null}
          </main>

          <aside style={{ display: "grid", gap: 18 }}>
            <section
              className="glass a-up ic-premium-card"
              style={{
                borderRadius: 24,
                background: palette.card,
                border: `1px solid ${palette.border}`,
                padding: 20,
              }}
            >
              <div style={{ fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: palette.muted, marginBottom: 14 }}>
                Save Summary
              </div>
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ borderRadius: 18, border: `1px solid ${palette.subBorder}`, background: palette.chip, padding: "14px 16px" }}>
                  <div style={{ fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: palette.muted, marginBottom: 6 }}>
                    Current profile
                  </div>
                  <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, lineHeight: 1.05 }}>
                    {formatExportMode(settingsForm.export_mode)}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.65, color: palette.muted }}>
                    {formatCropMode(settingsForm.crop_mode)} with {subtitleStyle.preset} subtitles.
                  </div>
                </div>

                <div style={{ borderRadius: 18, border: `1px solid ${palette.subBorder}`, padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <Sparkles size={16} color={palette.accent} />
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{audioFeedback.title}</div>
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.65, color: palette.muted }}>
                    {audioFeedback.description}
                  </div>
                </div>

                <div style={{ borderRadius: 18, border: `1px solid ${palette.subBorder}`, padding: "14px 16px" }}>
                  <div style={{ fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: palette.muted, marginBottom: 8 }}>
                    Save state
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
                    {hasChanges ? "Unsaved changes" : "Everything is saved"}
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.65, color: palette.muted }}>
                    {hasChanges
                      ? "Your next uploads will not use these changes until you save them."
                      : "The dashboard, clips flow, and future uploads are aligned to this export profile."}
                  </div>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
