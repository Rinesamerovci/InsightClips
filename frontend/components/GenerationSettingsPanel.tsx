import type { GenerationSettings } from "@/lib/api";
import {
  CLIP_COUNT_OPTIONS,
  CLIP_DURATION_OPTIONS,
  MAX_TOPIC_LENGTH,
} from "@/lib/generation-settings";

type GenerationSettingsPanelProps = {
  dark: boolean;
  settings: GenerationSettings;
  onSettingsChange: (changes: Partial<GenerationSettings>) => void;
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
              {settings.number_of_clips} outputs
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
