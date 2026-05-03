import type { CSSProperties } from "react";

import type {
  ExportMode,
  SubtitlePosition,
  SubtitleStyle,
  SubtitleStylePreset,
} from "@/lib/api";
import {
  SUBTITLE_PRESET_DETAILS,
  formatSubtitlePosition,
  hasSubtitleManualOverrides,
} from "@/lib/subtitle-style";

type SubtitleStylePanelProps = {
  dark: boolean;
  exportMode: ExportMode;
  styleValue: SubtitleStyle;
  onPresetChange: (preset: SubtitleStylePreset) => void;
  onColorChange: (color: string) => void;
  onFontSizeChange: (size: number) => void;
  onPositionChange: (position: SubtitlePosition) => void;
  palette: {
    border: string;
    subBorder: string;
    muted: string;
    hi: string;
    hi2: string;
  };
};

const POSITION_OPTIONS: SubtitlePosition[] = ["top", "center", "bottom"];
const PRESET_ENTRIES = Object.entries(SUBTITLE_PRESET_DETAILS) as Array<
  [
    SubtitleStylePreset,
    {
      label: string;
      title: string;
      description: string;
      sample: string;
    },
  ]
>;

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

function getPreviewPosition(position: SubtitlePosition): CSSProperties {
  switch (position) {
    case "top":
      return { top: 18 };
    case "center":
      return { top: "50%", transform: "translateY(-50%)" };
    default:
      return { bottom: 18 };
  }
}

export default function SubtitleStylePanel({
  dark,
  exportMode,
  styleValue,
  onPresetChange,
  onColorChange,
  onFontSizeChange,
  onPositionChange,
  palette,
}: SubtitleStylePanelProps) {
  const previewPreset = SUBTITLE_PRESET_DETAILS[styleValue.preset];
  const hasManualTuning = hasSubtitleManualOverrides(styleValue);
  const previewWidth = exportMode === "portrait" ? 150 : 250;
  const previewHeight = exportMode === "portrait" ? 250 : 150;

  return (
    <div
      className="a2 glass"
      style={{
        borderRadius: 22,
        border: `1px solid ${palette.border}`,
        background: dark ? "rgba(14,24,11,.88)" : "rgba(255,255,255,.9)",
        padding: "24px 24px 22px",
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
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
            Subtitle style
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
            Choose a preset or fine-tune it
          </h2>
          <p
            style={{
              fontSize: 13,
              color: palette.muted,
              lineHeight: 1.72,
              marginBottom: 16,
            }}
          >
            Pick a subtitle look, then adjust color, size, and placement before the export
            record is created.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
              gap: 10,
              marginBottom: 16,
            }}
          >
            {PRESET_ENTRIES.map(([preset, details]) => {
              const active = styleValue.preset === preset;

              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onPresetChange(preset)}
                  className={`mode-option${active ? " active" : ""}`}
                  style={{
                    textAlign: "left",
                    borderRadius: 18,
                    padding: "15px 15px 14px",
                    border: `1px solid ${active ? palette.hi : palette.subBorder}`,
                    background: active
                      ? dark
                        ? "rgba(90,158,58,.16)"
                        : "rgba(90,158,58,.1)"
                      : dark
                        ? "rgba(11,18,9,.55)"
                        : "rgba(248,252,245,.82)",
                    color: dark ? "#e8f5df" : "#152412",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      marginBottom: 10,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: ".16em",
                        textTransform: "uppercase",
                        color: active ? "#dff0d8" : palette.hi2,
                      }}
                    >
                      {details.label}
                    </div>
                    <div
                      style={{
                        borderRadius: 999,
                        padding: "4px 8px",
                        border: `1px solid ${active ? "rgba(255,255,255,.22)" : palette.subBorder}`,
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: ".14em",
                        textTransform: "uppercase",
                        color: active ? "#dff0d8" : palette.hi2,
                      }}
                    >
                      {active ? "Active" : "Preset"}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: active ? (dark ? "#dff0d8" : "#285019") : palette.hi2,
                      marginBottom: 6,
                    }}
                  >
                    {details.title}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      lineHeight: 1.6,
                      color: active
                        ? dark
                          ? "rgba(232,245,223,.82)"
                          : "rgba(21,36,18,.8)"
                        : palette.muted,
                    }}
                  >
                    {details.description}
                  </div>
                </button>
              );
            })}
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
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 14,
                flexWrap: "wrap",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: ".2em",
                    textTransform: "uppercase",
                    color: palette.hi2,
                    fontWeight: 700,
                    marginBottom: 4,
                  }}
                >
                  Manual controls
                </div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  Preset stays selected while you fine-tune it
                </div>
              </div>
              <div
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
                {hasManualTuning ? "Customizing" : "Preset default"}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
                gap: 12,
              }}
            >
              <label
                style={{
                  borderRadius: 14,
                  border: `1px solid ${palette.subBorder}`,
                  background: dark ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.76)",
                  padding: "12px 13px",
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    letterSpacing: ".18em",
                    textTransform: "uppercase",
                    color: palette.muted,
                    fontWeight: 600,
                    marginBottom: 7,
                  }}
                >
                  Text color
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    type="color"
                    aria-label="Subtitle text color"
                    value={styleValue.primary_color}
                    onChange={(event) => onColorChange(event.target.value.toUpperCase())}
                    style={{
                      width: 42,
                      height: 42,
                      border: "none",
                      background: "transparent",
                      padding: 0,
                      cursor: "pointer",
                    }}
                  />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: dark ? "#dff0d8" : "#1e3418" }}>
                      {styleValue.primary_color.toUpperCase()}
                    </div>
                    <div style={{ fontSize: 11, color: palette.muted, marginTop: 2 }}>
                      Applied to subtitle text
                    </div>
                  </div>
                </div>
              </label>

              <label
                style={{
                  borderRadius: 14,
                  border: `1px solid ${palette.subBorder}`,
                  background: dark ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.76)",
                  padding: "12px 13px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      fontSize: 9,
                      letterSpacing: ".18em",
                      textTransform: "uppercase",
                      color: palette.muted,
                      fontWeight: 600,
                    }}
                  >
                    Font size
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: dark ? "#dff0d8" : "#1e3418" }}>
                    {styleValue.font_size}px
                  </div>
                </div>
                <input
                  type="range"
                  min={12}
                  max={36}
                  step={1}
                  value={styleValue.font_size}
                  onChange={(event) => onFontSizeChange(Number(event.target.value))}
                  aria-label="Subtitle font size"
                  style={{ width: "100%", accentColor: palette.hi }}
                />
                <div style={{ fontSize: 11, color: palette.muted, marginTop: 6 }}>
                  Larger text improves legibility in short-form feeds.
                </div>
              </label>

              <div
                style={{
                  borderRadius: 14,
                  border: `1px solid ${palette.subBorder}`,
                  background: dark ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.76)",
                  padding: "12px 13px",
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    letterSpacing: ".18em",
                    textTransform: "uppercase",
                    color: palette.muted,
                    fontWeight: 600,
                    marginBottom: 8,
                  }}
                >
                  Position
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3,minmax(0,1fr))",
                    gap: 6,
                  }}
                >
                  {POSITION_OPTIONS.map((position) => {
                    const active = styleValue.position === position;

                    return (
                      <button
                        key={position}
                        type="button"
                        onClick={() => onPositionChange(position)}
                        className="btn-ghost"
                        style={{
                          borderRadius: 10,
                          border: `1px solid ${active ? palette.hi : palette.subBorder}`,
                          background: active
                            ? dark
                              ? "rgba(90,158,58,.14)"
                              : "rgba(90,158,58,.1)"
                            : "transparent",
                          color: active ? palette.hi : dark ? "#dff0d8" : "#1e3418",
                          fontSize: 12,
                          fontWeight: 600,
                          padding: "10px 8px",
                        }}
                      >
                        {formatSubtitlePosition(position)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            borderRadius: 18,
            border: `1px solid ${palette.subBorder}`,
            background: dark ? "rgba(11,18,9,.92)" : "rgba(247,252,243,.96)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "18px 18px 14px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: ".22em",
                  textTransform: "uppercase",
                  color: palette.hi2,
                  fontWeight: 700,
                  marginBottom: 5,
                }}
              >
                Live subtitle preview
              </div>
              <div
                style={{
                  fontFamily: "'Bricolage Grotesque',sans-serif",
                  fontSize: 20,
                  fontWeight: 700,
                }}
              >
                {previewPreset.label}
                {hasManualTuning ? " + custom tweaks" : " preset"}
              </div>
            </div>
            <div
              style={{
                borderRadius: 999,
                border: `1px solid ${palette.subBorder}`,
                background: dark ? "rgba(90,158,58,.12)" : "rgba(90,158,58,.08)",
                padding: "6px 12px",
                fontSize: 11,
                fontWeight: 700,
                color: palette.hi,
              }}
            >
              {exportMode === "portrait" ? "9:16 preview" : "16:9 preview"}
            </div>
          </div>

          <div
            style={{
              padding: "0 18px 18px",
            }}
          >
            <div
              style={{
                minHeight: 300,
                borderRadius: 18,
                border: `1px solid ${palette.subBorder}`,
                background: dark
                  ? "linear-gradient(160deg, rgba(18,35,13,.96), rgba(11,18,9,.92))"
                  : "linear-gradient(160deg, rgba(238,248,231,.96), rgba(248,252,245,.98))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "20px 16px",
              }}
            >
              <div
                style={{
                  width: previewWidth,
                  height: previewHeight,
                  borderRadius: 24,
                  border: `1px solid ${exportMode === "portrait" ? palette.hi : palette.border}`,
                  background: exportMode === "portrait"
                    ? "linear-gradient(180deg, rgba(90,158,58,.22), rgba(122,181,92,.08))"
                    : "linear-gradient(180deg, rgba(90,158,58,.16), rgba(122,181,92,.06))",
                  boxShadow: exportMode === "portrait"
                    ? "0 18px 42px rgba(90,158,58,.2)"
                    : "0 14px 30px rgba(90,158,58,.12)",
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: dark
                      ? "linear-gradient(180deg, rgba(255,255,255,.06), rgba(8,15,7,.24))"
                      : "linear-gradient(180deg, rgba(255,255,255,.4), rgba(90,158,58,.08))",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: 14,
                    right: 14,
                    ...getPreviewPosition(styleValue.position),
                  }}
                >
                  <div
                    style={{
                      width: "fit-content",
                      maxWidth: "100%",
                      margin:
                        styleValue.position === "center"
                          ? "0 auto"
                          : styleValue.position === "top"
                            ? "0 auto 0 0"
                            : "0 auto",
                      padding: styleValue.background_opacity > 0 ? "8px 10px" : "0",
                      borderRadius: 12,
                      background:
                        styleValue.background_opacity > 0
                          ? hexToRgba(styleValue.background_color, styleValue.background_opacity)
                          : "transparent",
                      color: styleValue.primary_color,
                      fontSize: `${Math.max(14, styleValue.font_size - 2)}px`,
                      lineHeight: 1.25,
                      fontWeight: styleValue.bold ? 700 : 600,
                      fontStyle: styleValue.italic ? "italic" : "normal",
                      textAlign: "center",
                      textShadow: `0 1px 0 ${styleValue.outline_color}, 0 0 12px ${hexToRgba(
                        styleValue.outline_color,
                        0.45,
                      )}`,
                    }}
                  >
                    <div>{previewPreset.sample}</div>
                    <div style={{ opacity: 0.94 }}>This style will be saved for export.</div>
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))",
                gap: 8,
                marginTop: 14,
              }}
            >
              {[
                { label: "Preset", value: previewPreset.label },
                { label: "Position", value: formatSubtitlePosition(styleValue.position) },
                { label: "Size", value: `${styleValue.font_size}px` },
                { label: "Color", value: styleValue.primary_color.toUpperCase() },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  style={{
                    borderRadius: 12,
                    border: `1px solid ${palette.subBorder}`,
                    background: dark ? "rgba(255,255,255,.04)" : "rgba(255,255,255,.76)",
                    padding: "11px 12px",
                  }}
                >
                  <div
                    style={{
                      fontSize: 9,
                      letterSpacing: ".18em",
                      textTransform: "uppercase",
                      color: palette.muted,
                      fontWeight: 600,
                      marginBottom: 4,
                    }}
                  >
                    {label}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
