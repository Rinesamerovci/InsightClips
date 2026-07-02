import { ChevronDown } from "lucide-react";
import type { ContentCalendarPlatform, GenerationSettings, GenerationTemplateId } from "@/lib/api";
import {
  CLIP_COUNT_OPTIONS,
  CLIP_DURATION_OPTIONS,
  MAX_TOPIC_LENGTH,
  GENERATION_TEMPLATES,
} from "@/lib/generation-settings";

type GenerationSettingsPanelProps = {
  dark: boolean;
  settings: GenerationSettings;
  onSettingsChange: (changes: Partial<GenerationSettings>) => void;
  selectedTemplateId?: GenerationTemplateId;
  onTemplateSelect?: (templateId: GenerationTemplateId) => void;
  palette: {
    border: string;
    subBorder: string;
    muted: string;
    hi: string;
    hi2: string;
  };
  title?: string;
  description?: string;
  storageHint?: string | null;
};

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) {
    return `rgba(0,0,0,${alpha})`;
  }

  const red = Number.parseInt(clean.slice(0, 2), 16);
  const green = Number.parseInt(clean.slice(2, 4), 16);
  const blue = Number.parseInt(clean.slice(4, 6), 16);

  return `rgba(${red},${green},${blue},${alpha})`;
}

export default function GenerationSettingsPanel({
  dark,
  settings,
  onSettingsChange,
  selectedTemplateId,
  onTemplateSelect,
  palette,
  title = "Plan the clips before generation starts",
  description = "Use Topic to guide clip selection from this video. Keep fixed output settings in the controls below.",
  storageHint = null,
}: GenerationSettingsPanelProps) {
  const topicFocus = settings.topic_focus ?? "";

  return (
    <section
      className="glass a2 ic-premium-card"
      style={{
        borderRadius: 22,
        border: `1px solid ${palette.border}`,
        background: dark ? "rgba(14,24,11,.88)" : "rgba(255,255,255,.9)",
        padding: "20px 20px 18px",
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,240px),1fr))",
          gap: 18,
          alignItems: "start",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              letterSpacing: ".26em",
              textTransform: "uppercase",
              color: palette.hi2,
              fontWeight: 700,
              marginBottom: 8,
            }}
          >
            Generation settings
          </div>
          <h2
            style={{
              fontFamily: "'DM Serif Display',serif",
              fontStyle: "italic",
              fontSize: 24,
              fontWeight: 400,
              marginBottom: 10,
            }}
          >
            {title}
          </h2>
          <p
            style={{
              fontSize: 13,
              color: palette.muted,
              lineHeight: 1.72,
              marginBottom: 16,
            }}
          >
            {description}
          </p>

          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              marginBottom: 14,
            }}
          >
            <span
              style={{
                borderRadius: 999,
                border: `1px solid ${palette.subBorder}`,
                background: dark ? "rgba(90,158,58,.12)" : "rgba(90,158,58,.08)",
                padding: "6px 10px",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: ".14em",
                textTransform: "uppercase",
                color: palette.hi,
              }}
            >
              {settings.clip_duration_seconds}s clips
            </span>
            <span
              style={{
                borderRadius: 999,
                border: `1px solid ${palette.subBorder}`,
                background: "transparent",
                padding: "6px 10px",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: ".14em",
                textTransform: "uppercase",
                color: palette.muted,
              }}
            >
              {settings.number_of_clips} {settings.number_of_clips === 1 ? "output" : "outputs"}
            </span>
            <span
              style={{
                borderRadius: 999,
                border: `1px solid ${palette.subBorder}`,
                background: "transparent",
                padding: "6px 10px",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: ".14em",
                textTransform: "uppercase",
                color: settings.subtitles_enabled ? palette.hi : palette.muted,
              }}
            >
              {settings.subtitles_enabled ? "Subtitles on" : "Subtitles off"}
            </span>
          </div>

          {storageHint ? (
            <div
              style={{
                borderRadius: 14,
                border: `1px solid ${palette.subBorder}`,
                background: dark ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.72)",
                padding: "12px 13px",
                fontSize: 12,
                lineHeight: 1.65,
                color: palette.muted,
              }}
            >
              {storageHint}
            </div>
          ) : null}
        </div>

      </div>

      {onTemplateSelect ? (
        <div style={{ marginBottom: 24, marginTop: 12 }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: ".2em",
              textTransform: "uppercase",
              color: palette.hi2,
              fontWeight: 700,
              marginBottom: 10,
            }}
          >
            Style & Generation Templates
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gridTemplateRows: "1fr 1fr",
              gap: "10px",
            }}
          >
            {GENERATION_TEMPLATES.map((tpl, index) => {
              const active = selectedTemplateId === tpl.id;
              const isPortrait = tpl.exportMode === "portrait";
              const subStyle = tpl.subtitleStyle;
              const accent = subStyle.primary_color;
              const accentGlow = hexToRgba(accent, active ? 0.4 : 0.22);
              const accentSoft = hexToRgba(accent, active ? 0.24 : 0.14);
              const panelBg = hexToRgba(subStyle.background_color, Math.max(0.12, subStyle.background_opacity * 0.9));

              let gridCol = "auto";
              let gridRow = "auto";
              let alignSelf = "stretch";

              if (index === 6) {
                gridCol = "4";
                gridRow = "1 / 3";
                alignSelf = "center";
              } else {
                gridCol = `${(index % 3) + 1}`;
                gridRow = `${index < 3 ? 1 : 2}`;
              }

              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => onTemplateSelect?.(tpl.id)}
                  style={{
                    gridColumn: gridCol,
                    gridRow: gridRow,
                    alignSelf: alignSelf,
                    position: "relative",
                    width: "100%",
                    aspectRatio: "4/5", // Shorter poster ratio
                    borderRadius: "12px",
                    overflow: "hidden",
                    border: active ? `2px solid ${accent}` : `1px solid ${dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
                    boxShadow: active ? `0 0 0 4px ${accentGlow}, 0 8px 16px rgba(0,0,0,0.2)` : `0 2px 8px ${dark ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.05)"}`,
                    transform: active ? "translateY(-2px) scale(1.02)" : "translateY(0) scale(1)",
                    transition: "all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)",
                    cursor: "pointer",
                    padding: 0,
                    display: "block",
                    background: dark ? "#111" : "#fff"
                  }}
                >
                  {/* Background Image with Zoom Effect */}
                  <div style={{
                    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                    backgroundImage: `url('${tpl.image || (isPortrait ? '/images/podcast_portrait.png' : '/images/podcast_landscape.png')}')`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    transition: "transform 0.5s ease",
                    transform: active ? "scale(1.05)" : "scale(1)",
                  }} />

                  {/* Rich Gradient Overlay */}
                  <div style={{
                    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                    background: active
                      ? "linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.95) 100%)"
                      : "linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,0.95) 100%)",
                    transition: "background 0.3s ease"
                  }} />

                  {/* Format Badge (Portrait vs Landscape) */}
                  <div style={{
                    position: "absolute", top: "6px", left: "6px",
                    background: active ? accentSoft : "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
                    color: accent,
                    fontSize: "8px", fontWeight: 800, padding: "2px 4px", borderRadius: "4px",
                    border: `1px solid ${active ? accentGlow : "rgba(255,255,255,0.15)"}`,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                    display: "flex", alignItems: "center", gap: "2px",
                    textTransform: "uppercase", letterSpacing: "0.5px",
                    zIndex: 2
                  }}>
                    {isPortrait ? (
                      <svg width="6" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="3" ry="3"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>
                    ) : (
                      <svg width="10" height="6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="3" ry="3"></rect><line x1="18" y1="12" x2="18.01" y2="12"></line></svg>
                    )}
                    {isPortrait ? "9:16" : "16:9"}
                  </div>

                  {/* Top Badge: Duration */}
                  <div style={{
                    position: "absolute", top: "6px", right: "6px",
                    background: active ? panelBg : "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
                    color: active ? subStyle.primary_color : "#fff", fontSize: "9px", fontWeight: 700, padding: "2px 4px", borderRadius: "4px",
                    border: `1px solid ${active ? accentGlow : "rgba(255,255,255,0.15)"}`,
                    zIndex: 2
                  }}>
                    {tpl.generationSettings.clip_duration_seconds}s
                  </div>

                  {/* Checkmark for Active State */}
                  {active && (
                    <div style={{
                      position: "absolute", top: "24px", left: "6px",
                      width: "16px", height: "16px", borderRadius: "50%",
                      background: accent,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                      zIndex: 3
                    }}>
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </div>
                  )}

                  {/* Play Button */}
                  <div style={{
                    position: "absolute", top: "45%", left: "50%", transform: "translate(-50%, -50%)",
                    width: "28px", height: "28px", borderRadius: "50%",
                    background: active ? accent : "rgba(255,255,255,0.15)",
                    backdropFilter: "blur(8px)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    border: active ? "none" : `1px solid ${accentGlow}`,
                    boxShadow: active ? `0 4px 12px ${accentGlow}` : "0 4px 12px rgba(0,0,0,0.2)",
                    transition: "all 0.3s ease",
                  }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="#fff" style={{ marginLeft: 2 }}><polygon points="5 3 19 12 5 21 5 3" /></svg>
                  </div>

                  {/* Subtitle Visual Demo - Positioned according to style */}
                  <div style={{
                    position: "absolute",
                    left: "8px",
                    right: "8px",
                    top: subStyle.position === "top" ? "28px" : subStyle.position === "center" ? "50%" : "auto",
                    bottom: subStyle.position === "bottom" ? "42px" : "auto",
                    transform: subStyle.position === "center" ? "translateY(-50%)" : "none",
                    display: "flex",
                    justifyContent: "center",
                    zIndex: 2,
                    pointerEvents: "none"
                  }}>
                    <div style={{
                      fontFamily: subStyle.font_family,
                      fontSize: isPortrait ? "9px" : "8px",
                      fontWeight: 900,
                      color: subStyle.primary_color,
                      backgroundColor: subStyle.background_opacity > 0 ? panelBg : "transparent",
                      padding: subStyle.background_opacity > 0 ? "2px 5px" : "0",
                      borderRadius: 4,
                      textAlign: "center",
                      lineHeight: 1.2,
                      textTransform: subStyle.force_uppercase ? "uppercase" : "none",
                      textShadow: subStyle.background_opacity === 0 ? `1px 1px 2px ${subStyle.outline_color}, -1px -1px 2px ${subStyle.outline_color}, 1px -1px 2px ${subStyle.outline_color}, -1px 1px 2px ${subStyle.outline_color}` : "none",
                      boxShadow: subStyle.background_opacity > 0 ? "0 2px 8px rgba(0,0,0,0.4)" : "none",
                      maxWidth: "100%",
                      wordBreak: "keep-all",
                    }}>
                      {tpl.label}
                    </div>
                  </div>

                  {/* Content Area at Bottom */}
                  <div style={{
                    position: "absolute", bottom: "8px", left: "8px", right: "8px",
                    textAlign: "left",
                    display: "flex", flexDirection: "column", alignItems: "center"
                  }}>

                    <div style={{ color: accent, fontSize: "11px", fontWeight: 800, letterSpacing: "-0.01em", marginBottom: "2px", width: "100%", textAlign: "left", textShadow: "0 1px 3px rgba(0,0,0,0.75)" }}>
                      {tpl.label}
                    </div>
                    <div style={{ color: active ? accent : "rgba(255,255,255,0.7)", fontSize: "9px", fontWeight: 600, transition: "color 0.3s ease", width: "100%", textAlign: "left" }}>
                      {tpl.generationSettings.number_of_clips} {tpl.generationSettings.number_of_clips === 1 ? "clip" : "clips"}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,220px),1fr))",
          gap: 12,
        }}
      >
        <div
          style={{
            borderRadius: 18,
            border: `1px solid ${palette.subBorder}`,
            background: dark ? "rgba(11,18,9,.6)" : "rgba(248,252,245,.82)",
            padding: "16px 16px 14px",
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: ".2em",
              textTransform: "uppercase",
              color: palette.hi2,
              fontWeight: 700,
              marginBottom: 10,
            }}
          >
            Clip length
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(58px,1fr))",
              gap: 8,
            }}
          >
            {CLIP_DURATION_OPTIONS.map((duration) => {
              const active = settings.clip_duration_seconds === duration;

              return (
                <button
                  key={duration}
                  type="button"
                  onClick={() => onSettingsChange({ clip_duration_seconds: duration })}
                  style={{
                    borderRadius: 12,
                    border: `1px solid ${active ? palette.hi : palette.subBorder}`,
                    background: active
                      ? dark
                        ? "rgba(90,158,58,.14)"
                        : "rgba(90,158,58,.1)"
                      : "transparent",
                    color: active ? palette.hi : dark ? "#dff0d8" : "#1e3418",
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "10px 8px",
                    cursor: "pointer",
                  }}
                >
                  {duration}s
                </button>
              );
            })}
          </div>
        </div>

        <div
          style={{
            borderRadius: 18,
            border: `1px solid ${palette.subBorder}`,
            background: dark ? "rgba(11,18,9,.6)" : "rgba(248,252,245,.82)",
            padding: "16px 16px 14px",
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: ".2em",
              textTransform: "uppercase",
              color: palette.hi2,
              fontWeight: 700,
              marginBottom: 10,
            }}
          >
            Number of clips
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(48px,1fr))",
              gap: 8,
            }}
          >
            {CLIP_COUNT_OPTIONS.map((count) => {
              const active = settings.number_of_clips === count;

              return (
                <button
                  key={count}
                  type="button"
                  onClick={() => onSettingsChange({ number_of_clips: count })}
                  style={{
                    borderRadius: 12,
                    border: `1px solid ${active ? palette.hi : palette.subBorder}`,
                    background: active
                      ? dark
                        ? "rgba(90,158,58,.14)"
                        : "rgba(90,158,58,.1)"
                      : "transparent",
                    color: active ? palette.hi : dark ? "#dff0d8" : "#1e3418",
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "10px 8px",
                    cursor: "pointer",
                  }}
                >
                  {count}
                </button>
              );
            })}
          </div>
        </div>

        <div
          style={{
            borderRadius: 18,
            border: `1px solid ${palette.subBorder}`,
            background: dark ? "rgba(11,18,9,.6)" : "rgba(248,252,245,.82)",
            padding: "16px 16px 14px",
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: ".2em",
              textTransform: "uppercase",
              color: palette.hi2,
              fontWeight: 700,
              marginBottom: 10,
            }}
          >
            Spoken language (optional)
          </div>
          <div style={{ position: "relative" }}>
            <select
              value={settings.language ?? "auto"}
              onChange={(e) =>
                onSettingsChange({
                  language: e.target.value === "auto" ? undefined : e.target.value,
                })
              }
              style={{
                width: "100%",
                borderRadius: 12,
                border: `1px solid ${palette.subBorder}`,
                background: dark ? "rgba(90,158,58,.14)" : "rgba(90,158,58,.1)",
                color: dark ? "#dff0d8" : "#1e3418",
                fontSize: 12,
                fontWeight: 700,
                padding: "10px 44px 10px 14px",
                cursor: "pointer",
                outline: "none",
                appearance: "none",
              }}
            >
              <option value="auto">Auto-Detect Language</option>
              <option value="en">English</option>
              <option value="sq">Albanian (Shqip)</option>
              <option value="de">German (Deutsch)</option>
              <option value="it">Italian (Italiano)</option>
              <option value="fr">French (Français)</option>
              <option value="es">Spanish (Español)</option>
            </select>
            <ChevronDown
              size={22}
              strokeWidth={2.5}
              style={{
                position: "absolute",
                right: 14,
                top: "50%",
                transform: "translateY(-50%)",
                pointerEvents: "none",
                color: dark ? "#dff0d8" : "#1e3418",
                opacity: 0.8,
              }}
            />
          </div>
        </div>

        <div
          style={{
            borderRadius: 18,
            border: `1px solid ${palette.subBorder}`,
            background: dark ? "rgba(11,18,9,.6)" : "rgba(248,252,245,.82)",
            padding: "16px 16px 14px",
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: ".2em",
              textTransform: "uppercase",
              color: palette.hi2,
              fontWeight: 700,
              marginBottom: 10,
            }}
          >
            Target Platform
          </div>
          <div style={{ position: "relative" }}>
            <select
              value={settings.target_platform ?? "tiktok"}
              onChange={(e) =>
                onSettingsChange({
                  target_platform: e.target.value as ContentCalendarPlatform,
                })
              }
              style={{
                width: "100%",
                borderRadius: 12,
                border: `1px solid ${palette.subBorder}`,
                background: dark ? "rgba(90,158,58,.14)" : "rgba(90,158,58,.1)",
                color: dark ? "#dff0d8" : "#1e3418",
                fontSize: 12,
                fontWeight: 700,
                padding: "10px 44px 10px 14px",
                cursor: "pointer",
                outline: "none",
                appearance: "none",
              }}
            >
              <option value="tiktok">TikTok</option>
              <option value="youtube">YouTube Shorts</option>
              <option value="linkedin">LinkedIn</option>
            </select>
            <ChevronDown
              size={22}
              strokeWidth={2.5}
              style={{
                position: "absolute",
                right: 14,
                top: "50%",
                transform: "translateY(-50%)",
                pointerEvents: "none",
                color: dark ? "#dff0d8" : "#1e3418",
                opacity: 0.8,
              }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => onSettingsChange({ subtitles_enabled: !settings.subtitles_enabled })}
          style={{
            borderRadius: 18,
            border: `1px solid ${settings.subtitles_enabled ? palette.hi : palette.subBorder}`,
            background: settings.subtitles_enabled
              ? dark
                ? "rgba(90,158,58,.12)"
                : "rgba(90,158,58,.08)"
              : dark
                ? "rgba(255,255,255,.03)"
                : "rgba(255,255,255,.7)",
            padding: "16px 16px 14px",
            color: "inherit",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 8,
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: ".2em",
                textTransform: "uppercase",
                color: palette.hi2,
                fontWeight: 700,
              }}
            >
              Subtitles
            </div>
            <div
              style={{
                width: 44,
                height: 24,
                borderRadius: 999,
                background: settings.subtitles_enabled
                  ? palette.hi
                  : dark
                    ? "rgba(255,255,255,.08)"
                    : "rgba(20,34,16,.12)",
                border: `1px solid ${settings.subtitles_enabled ? palette.hi : palette.border}`,
                padding: 2,
              }}
            >
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "#fff",
                  transform: settings.subtitles_enabled ? "translateX(20px)" : "translateX(0)",
                  transition: "transform .2s ease",
                }}
              />
            </div>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
            {settings.subtitles_enabled ? "Styled subtitles enabled" : "Generate without subtitles"}
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.6, color: palette.muted }}>
            Turn them off if you want the clip framing and edit logic without any caption layer.
          </div>
        </button>
      </div>

      <label
        style={{
          display: "block",
          marginTop: 16,
          borderRadius: 18,
          border: `1px solid ${palette.subBorder}`,
          background: dark ? "rgba(11,18,9,.6)" : "rgba(248,252,245,.82)",
          padding: "16px 16px 14px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 8,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: ".2em",
              textTransform: "uppercase",
              color: palette.hi2,
              fontWeight: 700,
            }}
          >
            Topic
          </div>
          <div style={{ fontSize: 11, color: palette.muted }}>
            {topicFocus.trim().length}/{MAX_TOPIC_LENGTH}
          </div>
        </div>
        <textarea
          value={topicFocus}
          onChange={(event) =>
            onSettingsChange({
              topic_focus: event.target.value.slice(0, MAX_TOPIC_LENGTH),
            })
          }
          onKeyDownCapture={(event) => {
            event.stopPropagation();
          }}
          placeholder="Example: audience growth, strong hooks, expert takeaways, or the most interesting moments from this video."
          rows={3}
          spellCheck={false}
          style={{
            width: "100%",
            resize: "vertical",
            borderRadius: 14,
            border: `1px solid ${palette.subBorder}`,
            background: dark ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.88)",
            color: dark ? "#dff0d8" : "#1e3418",
            padding: "12px 13px",
            fontSize: 13,
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            outline: "none",
            transition: "border-color 0.2s",
          }}
          onFocus={(e) => e.target.style.borderColor = palette.hi}
          onBlur={(e) => e.target.style.borderColor = palette.subBorder}
        />

        {/* Quick Topic Suggestions */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {["🔥 Motivation", "😂 Funny Moments", "🧠 Educational", "📈 Success Story", "💡 Quick Tips"].map((topic) => (
            <button
              key={topic}
              type="button"
              onClick={() => {
                const current = topicFocus.trim();
                const newTopic = current ? `${current}, ${topic}` : topic;
                onSettingsChange({ topic_focus: newTopic.slice(0, MAX_TOPIC_LENGTH) });
              }}
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: dark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.7)",
                background: dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
                border: `1px solid ${palette.subBorder}`,
                borderRadius: 20,
                padding: "6px 12px",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)";
                e.currentTarget.style.color = palette.hi;
                e.currentTarget.style.borderColor = palette.hi;
                e.currentTarget.style.transform = "scale(1.05)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
                e.currentTarget.style.color = dark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.7)";
                e.currentTarget.style.borderColor = palette.subBorder;
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              {topic}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 8, fontSize: 12, color: palette.muted, lineHeight: 1.6 }}>
          Use this to tell InsightClips what to look for inside this video. Put the theme, hook style,
          story angle, or exact moments you want surfaced.
        </div>
      </label>

    </section>
  );
}

