import type {
  AudioEnhancementSettings,
  CropMode,
  ExportMode,
  ExportSettings,
  SubtitlePosition,
  SubtitleStyle,
  SubtitleStylePreset,
} from "./api";

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

export function buildDefaultAudioEnhancementSettings(
  overrides: Partial<AudioEnhancementSettings> = {},
): AudioEnhancementSettings {
  const enabled = overrides.enabled ?? true;
  const normalizeLoudness = enabled
    ? overrides.normalize_loudness ?? true
    : false;
  const status =
    overrides.status ??
    (enabled && normalizeLoudness ? "enabled" : "disabled");

  return {
    enabled,
    normalize_loudness: normalizeLoudness,
    target_lufs: overrides.target_lufs ?? -16,
    true_peak_db: overrides.true_peak_db ?? -1.5,
    status,
  };
}

export function getDefaultCropMode(exportMode: ExportMode): CropMode {
  return exportMode === "portrait" ? "smart_crop" : "none";
}

export function buildDefaultExportSettings(
  exportMode: ExportMode = "portrait",
  subtitleStyle: SubtitleStyle = buildSubtitleStyleFromPreset("classic"),
  overrides: Partial<ExportSettings> = {},
): ExportSettings {
  const resolvedExportMode = overrides.export_mode ?? exportMode;
  const resolvedSubtitleStyle =
    overrides.subtitle_style ??
    subtitleStyle ??
    buildSubtitleStyleFromPreset("classic");
  const cropMode =
    overrides.crop_mode ??
    (resolvedExportMode === "portrait" ? "smart_crop" : "none");
  const faceTrackingEnabled =
    resolvedExportMode === "portrait"
      ? overrides.face_tracking_enabled ?? cropMode === "smart_crop"
      : false;

  const settings: ExportSettings = {
    export_mode: resolvedExportMode,
    crop_mode: resolvedExportMode === "landscape" ? "none" : cropMode,
    mobile_optimized:
      resolvedExportMode === "portrait"
        ? overrides.mobile_optimized ?? true
        : overrides.mobile_optimized ?? false,
    face_tracking_enabled: faceTrackingEnabled,
    subtitle_style: resolvedSubtitleStyle,
    audio_enhancement: buildDefaultAudioEnhancementSettings(
      overrides.audio_enhancement,
    ),
  };

  if (overrides.generation_settings) {
    settings.generation_settings = overrides.generation_settings;
  }

  return settings;
}

export function normalizeExportSettings(
  settings?: Partial<ExportSettings> | null,
): ExportSettings {
  const subtitleStyle = settings?.subtitle_style
    ? buildSubtitleStyleFromPreset(settings.subtitle_style.preset)
    : buildSubtitleStyleFromPreset("classic");
  const mergedSubtitleStyle = settings?.subtitle_style
    ? {
        ...subtitleStyle,
        ...settings.subtitle_style,
      }
    : subtitleStyle;

  return buildDefaultExportSettings(
    settings?.export_mode ?? "portrait",
    mergedSubtitleStyle,
    settings ?? {},
  );
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

export function formatExportMode(mode: ExportMode): string {
  return mode === "portrait" ? "Portrait" : "Landscape";
}

export function formatCropMode(mode: CropMode): string {
  switch (mode) {
    case "center_crop":
      return "Center crop";
    case "smart_crop":
      return "Smart crop";
    default:
      return "Original frame";
  }
}
