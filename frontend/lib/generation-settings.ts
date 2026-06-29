import type {
  ExportMode,
  ExportSettings,
  GenerationSettings,
  GenerationTemplateId,
  SubtitleStyle,
} from "./api";
import {
  buildDefaultExportSettings,
  buildSubtitleStyleFromPreset,
  normalizeExportSettings,
} from "./subtitle-style";

export const GENERATION_SETTINGS_STORAGE_KEY = "insightclips-generation-settings";

export const CLIP_DURATION_OPTIONS = [15, 20, 30, 45, 60, 90] as const;
export const CLIP_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10] as const;
export const MAX_TOPIC_LENGTH = 500;

function normalizeGenerationLanguage(language?: string | null): string | undefined {
  const cleaned = language?.trim();
  if (!cleaned || cleaned.toLowerCase() === "auto") {
    return undefined;
  }
  return cleaned;
}

type GenerationTemplateDefinition = {
  id: GenerationTemplateId;
  label: string;
  title: string;
  description: string;
  badge: string;
  generationSettings: GenerationSettings;
  exportMode: ExportMode;
  subtitleStyle: SubtitleStyle;
  image?: string;
};

export const GENERATION_TEMPLATES: GenerationTemplateDefinition[] = [
  {
    id: "single_gem",
    label: "Single Gem",
    title: "One sharp standout clip",
    description: "Finds one polished 15-second moment when you want the safest, strongest post.",
    badge: "1 clip",
    generationSettings: {
      clip_duration_seconds: 15,
      number_of_clips: 1,
      topic_focus: "",
      subtitles_enabled: true,
    },
    exportMode: "portrait",
    subtitleStyle: {
      ...buildSubtitleStyleFromPreset("boxed"),
      font_family: "DM Sans",
      font_size: 27,
      primary_color: "#FFF7D6",
      outline_color: "#18130A",
      background_color: "#101010",
      background_opacity: 0.62,
      position: "center",
    },
    image: "/images/single_gem.png",
  },
  {
    id: "hook_spotlight",
    label: "Hook Spotlight",
    title: "Fast social openers",
    description: "Optimized for quick hook-led clips with bold on-screen captions.",
    badge: "Scroll stop",
    generationSettings: {
      clip_duration_seconds: 30,
      number_of_clips: 4,
      topic_focus: "",
      subtitles_enabled: true,
    },
    exportMode: "portrait",
    subtitleStyle: {
      ...buildSubtitleStyleFromPreset("bold"),
      font_family: "DM Sans",
      font_size: 26,
      primary_color: "#FFFFFF",
      outline_color: "#101810",
      background_color: "#2F6B1F",
      background_opacity: 0.28,
      position: "bottom",
    },
    image: "/images/hook_spotlight.png",
  },
  {
    id: "highlight_pair",
    label: "Highlight Pair",
    title: "Two ready-to-test angles",
    description: "Creates two clean clips so you can compare a hook-heavy version against a calmer insight.",
    badge: "A/B test",
    generationSettings: {
      clip_duration_seconds: 30,
      number_of_clips: 2,
      topic_focus: "",
      subtitles_enabled: true,
    },
    exportMode: "portrait",
    subtitleStyle: {
      ...buildSubtitleStyleFromPreset("bold"),
      font_family: "Arial",
      font_size: 24,
      primary_color: "#E9FFE1",
      outline_color: "#0D1D09",
      background_color: "#1B3D12",
      background_opacity: 0.34,
      position: "bottom",
    },
    image: "/images/highlight_pair.png",
  },
  {
    id: "story_arc",
    label: "Story Arc",
    title: "Context with payoff",
    description: "Leaves more room for setup and punchline when a clip needs narrative flow.",
    badge: "Narrative",
    generationSettings: {
      clip_duration_seconds: 45,
      number_of_clips: 3,
      topic_focus: "",
      subtitles_enabled: true,
    },
    exportMode: "portrait",
    subtitleStyle: {
      ...buildSubtitleStyleFromPreset("boxed"),
      font_family: "Georgia",
      font_size: 22,
      primary_color: "#FFF2C2",
      outline_color: "#211809",
      background_color: "#3A2D13",
      background_opacity: 0.58,
      position: "bottom",
    },
    image: "/images/story_arc.png",
  },
  {
    id: "expert_take",
    label: "Expert Take",
    title: "Concise insight bursts",
    description: "Best for punchy takeaways, practical advice, and clean talking-head cuts.",
    badge: "Authority",
    generationSettings: {
      clip_duration_seconds: 20,
      number_of_clips: 5,
      topic_focus: "",
      subtitles_enabled: true,
    },
    exportMode: "landscape",
    subtitleStyle: {
      ...buildSubtitleStyleFromPreset("minimal"),
      font_family: "Trebuchet MS",
      font_size: 18,
      primary_color: "#DDF7FF",
      outline_color: "#10222A",
      background_color: "#000000",
      background_opacity: 0,
      position: "top",
    },
    image: "/images/expert_take.png",
  },
  {
    id: "tiktok_viral",
    label: "TikTok Viral",
    title: "High-energy scroll stoppers",
    description: "Ultra-short clips with bold captions in the center, tuned for maximum mobile virality.",
    badge: "Scroll Stop",
    generationSettings: {
      clip_duration_seconds: 15,
      number_of_clips: 5,
      topic_focus: "",
      subtitles_enabled: true,
    },
    exportMode: "portrait",
    subtitleStyle: {
      ...buildSubtitleStyleFromPreset("bold"),
      font_family: "DM Sans",
      font_size: 28,
      primary_color: "#FFFFFF",
      outline_color: "#2A114B",
      background_color: "#8B5CF6",
      background_opacity: 0.58,
      position: "center",
    },
    image: "/images/tiktok_viral.png",
  },
  {
    id: "deep_conversation",
    label: "Deep Conversation",
    title: "Insightful storytelling",
    description: "Longer widescreen segments with classic subtitles at the bottom, perfect for detailed discussions.",
    badge: "Deep Dive",
    generationSettings: {
      clip_duration_seconds: 60,
      number_of_clips: 3,
      topic_focus: "",
      subtitles_enabled: true,
    },
    exportMode: "landscape",
    subtitleStyle: {
      ...buildSubtitleStyleFromPreset("classic"),
      font_family: "Arial",
      font_size: 18,
      primary_color: "#F5F7FF",
      outline_color: "#111827",
      background_color: "#111827",
      background_opacity: 0.24,
      position: "bottom",
    },
    image: "/images/deep_conversation.png",
  },
];

export function buildDefaultGenerationSettings(): GenerationSettings {
  return {
    clip_duration_seconds: 30,
    number_of_clips: 4,
    topic_focus: "",
    subtitles_enabled: true,
    language: undefined,
    target_platform: undefined,
  };
}

export function normalizeGenerationSettings(
  settings?: Partial<GenerationSettings> | null,
): GenerationSettings {
  const fallback = buildDefaultGenerationSettings();
  const clipDuration = Number(settings?.clip_duration_seconds);
  const numberOfClips = Number(settings?.number_of_clips);
  const projectPrompt = typeof settings?.topic_focus === "string" ? settings.topic_focus : "";
  return {
    clip_duration_seconds: CLIP_DURATION_OPTIONS.includes(clipDuration as (typeof CLIP_DURATION_OPTIONS)[number])
      ? clipDuration
      : fallback.clip_duration_seconds,
    number_of_clips: CLIP_COUNT_OPTIONS.includes(numberOfClips as (typeof CLIP_COUNT_OPTIONS)[number])
      ? numberOfClips
      : fallback.number_of_clips,
    topic_focus: projectPrompt.trim().slice(0, MAX_TOPIC_LENGTH),
    subtitles_enabled:
      typeof settings?.subtitles_enabled === "boolean"
        ? settings.subtitles_enabled
        : fallback.subtitles_enabled,
    language: normalizeGenerationLanguage(settings?.language),
    target_platform: settings?.target_platform ?? fallback.target_platform,
  };
}

export function buildGenerationRequestPayload(
  settings: GenerationSettings,
): GenerationSettings {
  return normalizeGenerationSettings(settings);
}

export function describeGenerationSettings(
  settings: GenerationSettings,
): string {
  const normalized = normalizeGenerationSettings(settings);
  const clipLabel = normalized.number_of_clips === 1 ? "clip" : "clips";
  return `${normalized.number_of_clips} ${clipLabel} | ${normalized.clip_duration_seconds}s | ${
    normalized.subtitles_enabled ? "Subtitles on" : "Subtitles off"
  }`;
}

export function getGenerationTemplate(
  templateId: GenerationTemplateId,
): GenerationTemplateDefinition {
  return (
    GENERATION_TEMPLATES.find((template) => template.id === templateId) ??
    GENERATION_TEMPLATES[0]
  );
}

export function applyGenerationTemplate(
  templateId: GenerationTemplateId,
  baseExportSettings?: ExportSettings | null,
  baseGenerationSettings?: Partial<GenerationSettings> | null,
): {
  generationSettings: GenerationSettings;
  exportSettings: ExportSettings;
} {
  const template = getGenerationTemplate(templateId);
  const resolvedBaseExportSettings = normalizeExportSettings(baseExportSettings);
  const resolvedBaseGenerationSettings = normalizeGenerationSettings(baseGenerationSettings);
  const generationSettings = normalizeGenerationSettings({
    ...template.generationSettings,
    topic_focus: resolvedBaseGenerationSettings.topic_focus,
  });

  return {
    generationSettings,
    exportSettings: buildDefaultExportSettings(
      template.exportMode,
      template.subtitleStyle,
      {
        ...resolvedBaseExportSettings,
        export_mode: template.exportMode,
        face_tracking_enabled: template.exportMode === "portrait" ? true : resolvedBaseExportSettings.face_tracking_enabled,
        subtitle_style: template.subtitleStyle,
        generation_settings: generationSettings,
      },
    ),
  };
}

export function loadSavedGenerationPreferences(): {
  templateId: GenerationTemplateId | null;
  settings: GenerationSettings;
  exportSettings: ExportSettings | null;
} {
  if (typeof window === "undefined") {
    return {
      templateId: "hook_spotlight",
      settings: buildDefaultGenerationSettings(),
      exportSettings: null,
    };
  }

  try {
    const stored = window.localStorage.getItem(GENERATION_SETTINGS_STORAGE_KEY);
    if (!stored) {
      return {
        templateId: "hook_spotlight",
        settings: buildDefaultGenerationSettings(),
        exportSettings: null,
      };
    }

    const parsed = JSON.parse(stored) as {
      templateId?: GenerationTemplateId | null;
      settings?: Partial<GenerationSettings>;
      exportSettings?: ExportSettings | null;
    };

    return {
      templateId:
        parsed.templateId && GENERATION_TEMPLATES.some((template) => template.id === parsed.templateId)
          ? parsed.templateId
          : null,
      settings: normalizeGenerationSettings(parsed.settings),
      exportSettings: parsed.exportSettings ? normalizeExportSettings(parsed.exportSettings) : null,
    };
  } catch {
    return {
      templateId: "hook_spotlight",
      settings: buildDefaultGenerationSettings(),
      exportSettings: null,
    };
  }
}

export function saveGenerationPreferences(
  templateId: GenerationTemplateId | null,
  settings: GenerationSettings,
  exportSettings: ExportSettings | null = null,
): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    GENERATION_SETTINGS_STORAGE_KEY,
    JSON.stringify({
      templateId,
      settings: normalizeGenerationSettings(settings),
      exportSettings: exportSettings ? normalizeExportSettings(exportSettings) : null,
    }),
  );
}
