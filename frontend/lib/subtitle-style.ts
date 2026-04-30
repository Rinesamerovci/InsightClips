import type { SubtitlePosition, SubtitleStyle, SubtitleStylePreset } from "./api";

export const SUBTITLE_PRESET_DETAILS: Record<
  SubtitleStylePreset,
  {
    label: string;
    title: string;
    description: string;
    sample: string;
  }
> = {
  classic: {
    label: "Classic",
    title: "Balanced everyday captions",
    description: "Clean white subtitles with a subtle background for most talking-head clips.",
    sample: "Clear, familiar, and easy to read.",
  },
  bold: {
    label: "Bold",
    title: "High-contrast social look",
    description: "Larger type and stronger emphasis when you want your hook to pop quickly.",
    sample: "Designed to stop the scroll faster.",
  },
  minimal: {
    label: "Minimal",
    title: "Lightweight and modern",
    description: "A softer caption treatment with no subtitle box behind it.",
    sample: "Keeps the frame feeling open.",
  },
  boxed: {
    label: "Boxed",
    title: "Statement captions",
    description: "A more visible subtitle block for clips that need maximum legibility.",
    sample: "Strong presence for noisy feeds.",
  },
};

export function buildSubtitleStyleFromPreset(preset: SubtitleStylePreset): SubtitleStyle {
  const baseStyle: SubtitleStyle = {
    preset,
    font_family: "Arial",
    font_size: 18,
    primary_color: "#FFFFFF",
    outline_color: "#000000",
    background_color: "#000000",
    background_opacity: 0.2,
    position: "bottom",
    bold: false,
    italic: false,
  };

  switch (preset) {
    case "bold":
      return {
        ...baseStyle,
        font_size: 24,
        background_opacity: 0.25,
        bold: true,
      };
    case "minimal":
      return {
        ...baseStyle,
        font_size: 16,
        outline_color: "#222222",
        background_opacity: 0,
      };
    case "boxed":
      return {
        ...baseStyle,
        font_size: 20,
        background_opacity: 0.55,
        bold: true,
      };
    default:
      return baseStyle;
  }
}

export function hasSubtitleManualOverrides(style: SubtitleStyle): boolean {
  const presetDefaults = buildSubtitleStyleFromPreset(style.preset);

  return (
    style.primary_color.toUpperCase() !== presetDefaults.primary_color ||
    style.font_size !== presetDefaults.font_size ||
    style.position !== presetDefaults.position
  );
}

export function formatSubtitlePosition(position: SubtitlePosition): string {
  switch (position) {
    case "top":
      return "Top";
    case "center":
      return "Center";
    default:
      return "Bottom";
  }
}
