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

export const CLIP_DURATION_OPTIONS = [15, 30, 45, 60] as const;
export const CLIP_COUNT_OPTIONS = [2, 3, 4, 5, 6] as const;
export const MAX_TOPIC_LENGTH = 500;

type GenerationTemplateDefinition = {
  id: GenerationTemplateId;
  label: string;
  title: string;
  description: string;
  badge: string;
  generationSettings: GenerationSettings;
  exportMode: ExportMode;
  subtitleStyle: SubtitleStyle;
};

export const GENERATION_TEMPLATES: GenerationTemplateDefinition[] = [
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
      position: "bottom",
    },
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
      position: "bottom",
    },
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
      position: "top",
    },
  },
];

export function buildDefaultGenerationSettings(): GenerationSettings {
  return {
    clip_duration_seconds: 30,
    number_of_clips: 4,
    topic_focus: "",
    subtitles_enabled: true,
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
  return `${normalized.number_of_clips} clips | ${normalized.clip_duration_seconds}s | ${
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
): {
  generationSettings: GenerationSettings;
  exportSettings: ExportSettings;
} {
  const template = getGenerationTemplate(templateId);
  const resolvedBaseExportSettings = normalizeExportSettings(baseExportSettings);

  return {
    generationSettings: {
      ...template.generationSettings,
    },
    exportSettings: buildDefaultExportSettings(
      template.exportMode,
      {
        ...template.subtitleStyle,
      },
      {
        ...resolvedBaseExportSettings,
        export_mode: template.exportMode,
        subtitle_style: {
          ...resolvedBaseExportSettings.subtitle_style,
          ...template.subtitleStyle,
        },
      },
    ),
  };
}

export function loadSavedGenerationPreferences(): {
  templateId: GenerationTemplateId;
  settings: GenerationSettings;
} {
  if (typeof window === "undefined") {
    return {
      templateId: "hook_spotlight",
      settings: buildDefaultGenerationSettings(),
    };
  }

  try {
    const stored = window.localStorage.getItem(GENERATION_SETTINGS_STORAGE_KEY);
    if (!stored) {
      return {
        templateId: "hook_spotlight",
        settings: buildDefaultGenerationSettings(),
      };
    }

    const parsed = JSON.parse(stored) as {
      templateId?: GenerationTemplateId;
      settings?: Partial<GenerationSettings>;
    };

    return {
      templateId:
        parsed.templateId && GENERATION_TEMPLATES.some((template) => template.id === parsed.templateId)
          ? parsed.templateId
          : "hook_spotlight",
      settings: normalizeGenerationSettings(parsed.settings),
    };
  } catch {
    return {
      templateId: "hook_spotlight",
      settings: buildDefaultGenerationSettings(),
    };
  }
}

export function saveGenerationPreferences(
  templateId: GenerationTemplateId,
  settings: GenerationSettings,
): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    GENERATION_SETTINGS_STORAGE_KEY,
    JSON.stringify({
      templateId,
      settings: normalizeGenerationSettings(settings),
    }),
  );
}
