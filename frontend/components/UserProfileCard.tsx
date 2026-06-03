"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  BadgeCheck,
  Camera,
  Clapperboard,
  Sparkles,
  UserRound,
} from "lucide-react";

import type { ProfileResponse } from "@/lib/api";
import { getStudioTheme } from "@/lib/brand";
import { formatExportMode } from "@/lib/subtitle-style";

function formatMemberDate(value: string | null): string {
  if (!value) {
    return "Recently joined";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatSubtitlePreset(preset?: string | null): string {
  if (!preset) {
    return "Classic";
  }

  return preset.charAt(0).toUpperCase() + preset.slice(1);
}

function isRenderableProfileImage(url: string | null): boolean {
  if (!url) {
    return false;
  }

  if (url.startsWith("data:image/")) {
    return true;
  }

  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function ReadinessDial({
  value,
  dark,
  accent,
  text,
}: {
  value: number;
  dark: boolean;
  accent: string;
  text: string;
}) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (circumference * value) / 100;

  return (
    <svg width="108" height="108" viewBox="0 0 108 108" style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id={`profile-readiness-${dark ? "dark" : "light"}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={accent} />
          <stop offset="100%" stopColor={dark ? "#d8f2b5" : "#8bbf45"} />
        </linearGradient>
      </defs>
      <circle
        cx="54"
        cy="54"
        r={radius}
        fill="none"
        stroke={dark ? "rgba(255,255,255,.06)" : "rgba(90,140,60,.1)"}
        strokeWidth="8"
      />
      <circle
        cx="54"
        cy="54"
        r={radius}
        fill="none"
        stroke={`url(#profile-readiness-${dark ? "dark" : "light"})`}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        transform="rotate(-90 54 54)"
        style={{ transition: "stroke-dashoffset .5s ease" }}
      />
      <text
        x="54"
        y="50"
        textAnchor="middle"
        style={{
          fill: text,
          fontSize: 22,
          fontWeight: 800,
          fontFamily: "sans-serif",
        }}
      >
        {value}
      </text>
      <text
        x="54"
        y="67"
        textAnchor="middle"
        style={{
          fill: text,
          opacity: 0.7,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          fontFamily: "sans-serif",
        }}
      >
        Ready
      </text>
    </svg>
  );
}

function StatusBlock({
  icon,
  label,
  value,
  hint,
  dark,
  theme,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
  dark: boolean;
  theme: ReturnType<typeof getStudioTheme>;
}) {
  return (
    <div
      className="ic-premium-card h-full rounded-[1.5rem] p-4 transition duration-200 ease-out hover:-translate-y-0.5"
      style={{
        border: `1px solid ${theme.borderSub}`,
        background: dark
          ? "linear-gradient(180deg, rgba(255,255,255,.055), rgba(255,255,255,.025))"
          : "linear-gradient(180deg, rgba(255,255,255,.92), rgba(255,255,255,.76))",
        boxShadow: dark
          ? "inset 0 1px 0 rgba(255,255,255,.04)"
          : "0 12px 24px rgba(90,140,60,.06)",
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style={{
            border: `1px solid ${theme.borderSub}`,
            background: theme.chip,
            color: theme.accent,
          }}
        >
          {icon}
        </div>
        <span
          className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.16em]"
          style={{ color: theme.accent }}
        >
          {label}
        </span>
      </div>
      <div
        className="mt-4 text-[1.05rem] leading-tight"
        style={{ color: theme.text, fontFamily: "var(--font-serif)" }}
      >
        {value}
      </div>
      <div className="mt-2 text-xs leading-[1.55]" style={{ color: theme.textSub }}>
        {hint}
      </div>
    </div>
  );
}

function ProgressBar({
  value,
  dark,
  theme,
}: {
  value: number;
  dark: boolean;
  theme: ReturnType<typeof getStudioTheme>;
}) {
  return (
    <div
      className="h-2 overflow-hidden rounded-full"
      style={{ background: dark ? "rgba(255,255,255,.07)" : "rgba(90,140,60,.12)" }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{
          width: `${value}%`,
          background: `linear-gradient(90deg, ${theme.accent}, ${dark ? "#d8f2b5" : "#8bbf45"})`,
        }}
      />
    </div>
  );
}

function MetricRow({
  label,
  value,
  theme,
  last = false,
}: {
  label: string;
  value: string;
  theme: ReturnType<typeof getStudioTheme>;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "12px 0",
        borderBottom: last ? "none" : `1px solid ${theme.borderSub}`,
      }}
    >
      <span style={{ color: theme.textSub, fontSize: 13 }}>{label}</span>
      <span style={{ color: theme.text, fontSize: 13, fontWeight: 700, textAlign: "right" }}>
        {value}
      </span>
    </div>
  );
}

function ReadinessItem({
  label,
  complete,
  index,
  theme,
}: {
  label: string;
  complete: boolean;
  index: number;
  theme: ReturnType<typeof getStudioTheme>;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 py-2.5"
      style={{ borderTop: `1px solid ${theme.borderSub}` }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
          style={{
            border: `1px solid ${complete ? theme.accent : theme.borderSub}`,
            background: complete ? theme.chip : "transparent",
            color: complete ? theme.accent : theme.textSub,
          }}
        >
          {complete ? <BadgeCheck size={12} /> : index}
        </span>
        <span className="truncate text-xs font-medium" style={{ color: theme.text }}>
          {label}
        </span>
      </div>
      <span
        className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: complete ? theme.accent : theme.textSub }}
      >
        {complete ? "Done" : "Missing"}
      </span>
    </div>
  );
}

export function UserProfileCard({
  profile,
  dark = true,
}: {
  profile: ProfileResponse;
  dark?: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const theme = getStudioTheme(dark);
  const initials = (profile.full_name || profile.email || "I")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const imageUrl = useMemo(
    () => (isRenderableProfileImage(profile.profile_picture_url) ? profile.profile_picture_url : null),
    [profile.profile_picture_url],
  );
  const showImage = Boolean(imageUrl) && !imageFailed;
  const hasName = Boolean(profile.full_name?.trim());
  const hasExportMode = Boolean(profile.export_settings?.export_mode);
  const hasSubtitlePreset = Boolean(profile.export_settings?.subtitle_style?.preset);

  const readinessCount = [
    hasName,
    Boolean(imageUrl),
    hasExportMode,
    hasSubtitlePreset,
  ].filter(Boolean).length;
  const readinessPercent = Math.round((readinessCount / 4) * 100);
  const readinessLabel =
    readinessPercent === 100
          ? "Studio-ready"
          : readinessPercent >= 75
        ? "Nearly complete"
        : "Needs attention";
  const readinessTone =
    readinessPercent === 100
      ? "All profile essentials are in place."
      : readinessPercent >= 75
        ? "A few final details will finish the profile."
        : "Complete the essentials for a stronger profile.";

  return (
    <section
      className="relative overflow-hidden rounded-[2rem] p-5 sm:p-6"
      style={{
        border: `1px solid ${theme.border}`,
        background: dark
          ? "radial-gradient(circle at top right, rgba(163,208,107,.16), transparent 30%), radial-gradient(circle at bottom left, rgba(201,232,154,.08), transparent 34%), linear-gradient(180deg, rgba(10,18,10,.99) 0%, rgba(15,24,13,.97) 100%)"
          : "radial-gradient(circle at top right, rgba(140,190,60,.15), transparent 30%), radial-gradient(circle at bottom left, rgba(201,232,154,.18), transparent 34%), linear-gradient(180deg, rgba(255,255,255,.99) 0%, rgba(247,250,240,.98) 100%)",
        boxShadow: dark
          ? "0 26px 58px rgba(0,0,0,.24)"
          : "0 24px 54px rgba(90,140,60,.12)",
        color: theme.text,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -70,
          right: -30,
          width: 220,
          height: 220,
          borderRadius: "50%",
          background: dark ? "rgba(163,208,107,.06)" : "rgba(140,190,60,.08)",
          filter: "blur(26px)",
          pointerEvents: "none",
        }}
      />

      <div className="relative z-[1] grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)] lg:gap-6">
        <div style={{ minWidth: 0 }}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
              <div
                className="relative shrink-0 rounded-[1.65rem] p-1"
                style={{
                  background: dark ? "rgba(255,255,255,.055)" : "rgba(255,255,255,.86)",
                  border: `1px solid ${theme.borderSub}`,
                  boxShadow: dark
                    ? "0 16px 34px rgba(0,0,0,.24)"
                    : "0 16px 30px rgba(90,140,60,.13)",
                }}
              >
                {showImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt="Profile"
                    className="h-20 w-20 rounded-[1.35rem] object-cover sm:h-[88px] sm:w-[88px]"
                    src={imageUrl ?? undefined}
                    onError={() => setImageFailed(true)}
                  />
                ) : (
                  <div
                    className="flex h-20 w-20 items-center justify-center rounded-[1.35rem] text-[1.3rem] font-semibold sm:h-[88px] sm:w-[88px] sm:text-[1.4rem]"
                    style={{
                      background: dark
                        ? "linear-gradient(135deg, rgba(163,208,107,.24), rgba(201,232,154,.1))"
                        : "linear-gradient(135deg, rgba(140,190,60,.2), rgba(201,232,154,.3))",
                      color: theme.text,
                    }}
                  >
                    {initials}
                  </div>
                )}
                <span
                  aria-hidden="true"
                  className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full"
                  style={{
                    background: theme.accent,
                    border: `3px solid ${dark ? "#10180d" : "#fbfdf7"}`,
                    boxShadow: dark ? "0 4px 10px rgba(0,0,0,.22)" : "0 4px 10px rgba(90,140,60,.18)",
                  }}
                />
              </div>

              <div className="min-w-0">
                <div
                  className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
                  style={{
                    border: `1px solid ${theme.borderSub}`,
                    background: theme.chip,
                    color: theme.accent,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: ".18em",
                    textTransform: "uppercase",
                  }}
                >
                  <Sparkles size={12} />
                  Creator Profile
                </div>
                <h2
                  className="mt-3 break-words text-[1.9rem] font-semibold leading-[1.05] sm:text-[2.2rem]"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  {profile.full_name || "InsightClips Creator"}
                </h2>
                <p className="mt-1 max-w-full break-all text-[13px]" style={{ color: theme.textSub }}>
                  {profile.email}
                </p>
              </div>
            </div>

            <div
              className="w-full rounded-[1.25rem] px-4 py-3 sm:ml-auto sm:w-[190px]"
              style={{
                border: `1px solid ${theme.borderSub}`,
                background: dark ? "rgba(255,255,255,.045)" : "rgba(255,255,255,.78)",
                boxShadow: dark ? "inset 0 1px 0 rgba(255,255,255,.035)" : "0 10px 22px rgba(90,140,60,.07)",
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <span
                  className="text-[10px] font-semibold uppercase tracking-[0.16em]"
                  style={{ color: theme.accent }}
                >
                  Readiness
                </span>
                <span className="text-sm font-bold" style={{ color: theme.text }}>
                  {readinessPercent}%
                </span>
              </div>
              <div className="mt-2">
                <ProgressBar value={readinessPercent} dark={dark} theme={theme} />
              </div>
              <div className="mt-2 text-xs font-medium" style={{ color: theme.textSub }}>
                {readinessLabel}
              </div>
            </div>
          </div>

          <p className="mt-5 max-w-[640px] text-[13px] leading-[1.75]" style={{ color: theme.textSub }}>
            Key account details and creative defaults in one clean studio profile.
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <StatusBlock
              icon={<UserRound size={16} />}
              label="Identity"
              value={hasName ? "Configured" : "Missing name"}
              hint="Shown across your studio."
              dark={dark}
              theme={theme}
            />
            <StatusBlock
              icon={<Camera size={16} />}
              label="Profile image"
              value={imageUrl ? "Connected" : "Recommended"}
              hint="Makes the account recognizable."
              dark={dark}
              theme={theme}
            />
            <StatusBlock
              icon={<Clapperboard size={16} />}
              label="Workspace state"
              value={profile.free_trial_used ? "Active creator" : "Trial ready"}
              hint="Ready for uploads and exports."
              dark={dark}
              theme={theme}
            />
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div
              className="ic-premium-card rounded-[1.5rem] p-4 transition duration-200 ease-out hover:-translate-y-0.5"
              style={{
                border: `1px solid ${theme.borderSub}`,
                background: dark ? "rgba(255,255,255,.035)" : "rgba(255,255,255,.78)",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: ".16em",
                  textTransform: "uppercase",
                  color: theme.accent,
                  marginBottom: 10,
                }}
              >
                Account Snapshot
              </div>
              <MetricRow label="Member since" value={formatMemberDate(profile.created_at)} theme={theme} />
              <MetricRow label="Free trial" value={profile.free_trial_used ? "Used" : "Available"} theme={theme} last />
              <div style={{ paddingTop: 12, color: theme.textSub, fontSize: 12, lineHeight: 1.7 }}>
                Simple account context without extra clutter.
              </div>
            </div>

            <div
              className="ic-premium-card rounded-[1.5rem] p-4 transition duration-200 ease-out hover:-translate-y-0.5"
              style={{
                border: `1px solid ${theme.borderSub}`,
                background: dark ? "rgba(255,255,255,.035)" : "rgba(255,255,255,.78)",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: ".16em",
                  textTransform: "uppercase",
                  color: theme.accent,
                  marginBottom: 10,
                }}
              >
                Creative Defaults
              </div>
              <MetricRow
                label="Default export"
                value={formatExportMode(profile.export_settings?.export_mode ?? "landscape")}
                theme={theme}
              />
              <MetricRow
                label="Subtitle preset"
                value={formatSubtitlePreset(profile.export_settings?.subtitle_style?.preset)}
                theme={theme}
                last
              />
              <div style={{ paddingTop: 12, color: theme.textSub, fontSize: 12, lineHeight: 1.7 }}>
                Defaults stay ready for faster exports.
              </div>
            </div>
          </div>
        </div>

        <aside
          className="ic-premium-card rounded-[1.5rem] p-5"
          style={{
            border: `1px solid ${theme.borderSub}`,
            background: dark
              ? "linear-gradient(180deg, rgba(255,255,255,.055), rgba(255,255,255,.025))"
              : "linear-gradient(180deg, rgba(255,255,255,.92), rgba(255,255,255,.8))",
            boxShadow: dark ? "inset 0 1px 0 rgba(255,255,255,.04)" : "0 14px 28px rgba(90,140,60,.08)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: ".18em",
              textTransform: "uppercase",
              color: theme.accent,
              marginBottom: 12,
            }}
          >
            Profile Readiness
          </div>

          <div className="flex items-center justify-center">
            <ReadinessDial value={readinessPercent} dark={dark} accent={theme.accent} text={theme.text} />
          </div>

          <div className="mt-4 text-center">
            <div
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: 23,
                lineHeight: 1.1,
                color: theme.text,
                marginBottom: 6,
              }}
            >
              {readinessLabel}
            </div>
            <div style={{ color: theme.textSub, fontSize: 13, lineHeight: 1.65 }}>
              {readinessTone}
            </div>
          </div>

          <div className="mt-5">
            <ProgressBar value={readinessPercent} dark={dark} theme={theme} />
          </div>

          <div className="mt-5">
            <ReadinessItem label="Display name" complete={hasName} index={1} theme={theme} />
            <ReadinessItem label="Profile image" complete={Boolean(imageUrl)} index={2} theme={theme} />
            <ReadinessItem label="Export format" complete={hasExportMode} index={3} theme={theme} />
            <ReadinessItem label="Subtitle style" complete={hasSubtitlePreset} index={4} theme={theme} />
          </div>

          <div
            className="mt-5 rounded-[1.25rem] px-4 py-3"
            style={{
              border: `1px solid ${theme.borderSub}`,
              background: theme.chip,
            }}
          >
            <div className="flex items-start gap-3">
              <BadgeCheck size={16} color={theme.accent} className="mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-semibold" style={{ color: theme.text }}>
                  Studio-ready identity
                </div>
                <div className="mt-1 text-xs leading-[1.65]" style={{ color: theme.textSub }}>
                  Profile details and export settings now read as one clear surface.
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
