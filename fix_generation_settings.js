const fs = require('fs');
const file = 'frontend/lib/generation-settings.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/export const MAX_TOPIC_LENGTH = 500;[\s\S]*?type GenerationTemplateDefinition = \{/m, `export const MAX_TOPIC_LENGTH = 500;

function normalizeGenerationLanguage(language?: string | null): string | undefined {
  const cleaned = language?.trim();
  if (!cleaned || cleaned.toLowerCase() === "auto") {
    return undefined;
  }
  return cleaned;
}

type GenerationTemplateDefinition = {`);

content = content.replace(/export function buildDefaultGenerationSettings\(\): GenerationSettings \{[\s\S]*?\n\}/m, `export function buildDefaultGenerationSettings(): GenerationSettings {
  return {
    clip_duration_seconds: 30,
    number_of_clips: 4,
    topic_focus: "",
    subtitles_enabled: true,
    language: undefined,
  };
}`);

content = content.replace(/subtitles_enabled:\s*typeof settings\?\.subtitles_enabled === "boolean"[\s\S]*?fallback\.subtitles_enabled,\s*\n\s*\};\s*\n\}/m, `subtitles_enabled:
      typeof settings?.subtitles_enabled === "boolean"
        ? settings.subtitles_enabled
        : fallback.subtitles_enabled,
    language: normalizeGenerationLanguage(settings?.language),
  };
}`);

fs.writeFileSync(file, content, 'utf8');
