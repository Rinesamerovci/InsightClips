import type { GenerationSettings, GenerationTemplateId } from "@/lib/api";
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
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 16,
            }}
          >
            {GENERATION_TEMPLATES.map((tpl) => {
              const active = selectedTemplateId === tpl.id;
              
              // Give each template a unique flavor
              let icon = "✨";
              let gradient = "linear-gradient(135deg, rgba(90,158,58,0.2) 0%, rgba(90,158,58,0.05) 100%)";
              let activeBorder = palette.hi;
              
              if (tpl.id.includes("viral")) {
                icon = "🔥";
                gradient = dark ? "linear-gradient(135deg, rgba(255,107,107,0.2) 0%, rgba(200,80,192,0.1) 100%)" : "linear-gradient(135deg, rgba(255,107,107,0.1) 0%, rgba(200,80,192,0.05) 100%)";
                activeBorder = "#ff6b6b";
              } else if (tpl.id.includes("bomb") || tpl.id.includes("value")) {
                icon = "💎";
                gradient = dark ? "linear-gradient(135deg, rgba(74,144,226,0.2) 0%, rgba(80,227,194,0.1) 100%)" : "linear-gradient(135deg, rgba(74,144,226,0.1) 0%, rgba(80,227,194,0.05) 100%)";
                activeBorder = "#4a90e2";
              } else if (tpl.id.includes("hook")) {
                icon = "🎣";
                gradient = dark ? "linear-gradient(135deg, rgba(245,166,35,0.2) 0%, rgba(248,231,28,0.1) 100%)" : "linear-gradient(135deg, rgba(245,166,35,0.1) 0%, rgba(248,231,28,0.05) 100%)";
                activeBorder = "#f5a623";
              }

              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => onTemplateSelect?.(tpl.id)}
                  className="lift-card"
                  style={{
                    textAlign: "left",
                    borderRadius: 20,
                    padding: "16px",
                    border: `2px solid ${active ? activeBorder : palette.subBorder}`,
                    background: active
                      ? gradient
                      : dark
                        ? "rgba(20,24,20,.6)"
                        : "rgba(255,255,255,.8)",
                    color: "inherit",
                    cursor: "pointer",
                    transition: "all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    minHeight: 110,
                    boxShadow: active ? `0 8px 24px -8px ${activeBorder}40` : "none",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 20, filter: active ? "grayscale(0%)" : "grayscale(100%)", opacity: active ? 1 : 0.5, transition: "all 0.3s" }}>{icon}</span>
                        <span style={{ fontSize: 14, fontWeight: 800, color: active ? activeBorder : "inherit", letterSpacing: "-0.01em" }}>
                          {tpl.label}
                        </span>
                      </div>
                      <span
                        style={{
                          borderRadius: 8,
                          background: active ? `${activeBorder}20` : dark ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.04)",
                          padding: "4px 8px",
                          fontSize: 10,
                          fontWeight: 700,
                          color: active ? activeBorder : palette.muted,
                        }}
                      >
                        {tpl.badge}
                      </span>
                    </div>
                  </div>

                  <div style={{ marginTop: "auto" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        fontSize: 11,
                        fontWeight: 600,
                        color: active ? activeBorder : palette.muted,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        {tpl.generationSettings.clip_duration_seconds}s
                      </div>
                      <div style={{ width: 4, height: 4, borderRadius: "50%", background: "currentColor", opacity: 0.3 }} />
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        {tpl.generationSettings.number_of_clips} clip{tpl.generationSettings.number_of_clips === 1 ? "" : "s"}
                      </div>
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
          <select
            value={settings.language ?? "auto"}
            onChange={(e) => onSettingsChange({ language: e.target.value })}
            style={{
              width: "100%",
              borderRadius: 12,
              border: `1px solid ${palette.subBorder}`,
              background: dark ? "rgba(90,158,58,.14)" : "rgba(90,158,58,.1)",
              color: dark ? "#dff0d8" : "#1e3418",
              fontSize: 14,
              fontWeight: 700,
              padding: "10px 14px",
              cursor: "pointer",
              outline: "none",
              appearance: "none",
            }}
          >
            <option value="auto">Auto-detect (Recommended)</option>
            <option value="sq">Albanian (Shqip)</option>
            <option value="en">English</option>
          </select>
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
            {settings.topic_focus.trim().length}/{MAX_TOPIC_LENGTH}
          </div>
        </div>
        <textarea
          value={settings.topic_focus}
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
          }}
        />
        <div style={{ marginTop: 8, fontSize: 12, color: palette.muted, lineHeight: 1.6 }}>
          Use this to tell InsightClips what to look for inside this video. Put the theme, hook style,
          story angle, or exact moments you want surfaced.
        </div>
      </label>

    </section>
  );
}
