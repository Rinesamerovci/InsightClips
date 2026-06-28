const fs = require('fs');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}
function write(file, content) {
  fs.writeFileSync(file, content, 'utf8');
}
function replaceRegex(file, pattern, replacement) {
  const current = read(file);
  if (!pattern.test(current)) {
    throw new Error(`Missing expected pattern in ${file}: ${pattern}`);
  }
  write(file, current.replace(pattern, replacement));
}
function replaceExact(file, search, replacement) {
  const current = read(file);
  if (!current.includes(search)) {
    throw new Error(`Missing expected snippet in ${file}`);
  }
  write(file, current.replace(search, replacement));
}

replaceRegex(
  'frontend/lib/generation-settings.ts',
  /export const MAX_TOPIC_LENGTH = 500;[\s\S]*?type GenerationTemplateDefinition = \{/, 
  `export const MAX_TOPIC_LENGTH = 500;

function normalizeGenerationLanguage(language?: string | null): string | undefined {
  const cleaned = language?.trim();
  if (!cleaned || cleaned.toLowerCase() === "auto") {
    return undefined;
  }
  return cleaned;
}

type GenerationTemplateDefinition = {`
);

replaceExact(
  'frontend/lib/generation-settings.ts',
  `export function buildDefaultGenerationSettings(): GenerationSettings {
  return {
    clip_duration_seconds: 30,
    number_of_clips: 4,
    topic_focus: "",
    subtitles_enabled: true,
  };
}
`,
  `export function buildDefaultGenerationSettings(): GenerationSettings {
  return {
    clip_duration_seconds: 30,
    number_of_clips: 4,
    topic_focus: "",
    subtitles_enabled: true,
    language: undefined,
  };
}
`,
);

replaceExact(
  'frontend/lib/generation-settings.ts',
  `    subtitles_enabled:
      typeof settings?.subtitles_enabled === "boolean"
        ? settings.subtitles_enabled
        : fallback.subtitles_enabled,
  };
}
`,
  `    subtitles_enabled:
      typeof settings?.subtitles_enabled === "boolean"
        ? settings.subtitles_enabled
        : fallback.subtitles_enabled,
    language: normalizeGenerationLanguage(settings?.language),
  };
}
`,
);

replaceExact(
  'backend/app/models/export_settings.py',
  `    @field_validator("topic_focus")
    @classmethod
    def normalize_topic_focus(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = " ".join(value.split())
        if not cleaned:
            return None
        if not re.fullmatch(r"[A-Za-z0-9\\s,.'\\-#/&]+", cleaned):
            raise ValueError("topic_focus can only contain letters, numbers, spaces, and simple punctuation.")
        return cleaned
`,
  `    @field_validator("topic_focus")
    @classmethod
    def normalize_topic_focus(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = " ".join(value.split())
        if not cleaned:
            return None
        if not re.fullmatch(r"[A-Za-z0-9\\s,.'\\-#/&]+", cleaned):
            raise ValueError("topic_focus can only contain letters, numbers, spaces, and simple punctuation.")
        return cleaned

    @field_validator("language")
    @classmethod
    def normalize_language(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = " ".join(value.split()).lower()
        if not cleaned or cleaned in {"auto", "auto-detect", "auto detect", "unknown"}:
            return None
        return cleaned
`,
);

replaceExact(
  'backend/app/models/export_settings.py',
  `    @field_validator("topic_focus")
    @classmethod
    def normalize_topic_focus(cls, value: str | None) -> str | None:
        return GenerationSettings.normalize_topic_focus(value)
`,
  `    @field_validator("topic_focus")
    @classmethod
    def normalize_topic_focus(cls, value: str | None) -> str | None:
        return GenerationSettings.normalize_topic_focus(value)

    @field_validator("language")
    @classmethod
    def normalize_language(cls, value: str | None) -> str | None:
        return GenerationSettings.normalize_language(value)
`,
);

replaceExact(
  'backend/app/models/analysis.py',
  `class AnalyzePodcastRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    transcription: TranscriptionResult | None = None
    transcription_model: str = "base"
    language: str | None = None
    topic_focus: str | None = Field(default=None, max_length=500)
    force: bool = False
`,
  `class AnalyzePodcastRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    transcription: TranscriptionResult | None = None
    transcription_model: str = "base"
    language: str | None = None
    topic_focus: str | None = Field(default=None, max_length=500)
    force: bool = False

    @field_validator("language")
    @classmethod
    def normalize_language(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = " ".join(value.split()).lower()
        if not cleaned or cleaned in {"auto", "auto-detect", "auto detect", "unknown"}:
            return None
        return cleaned
`,
);

replaceExact(
  'backend/app/services/clipping_service.py',
  `import shutil
`,
  `import re
import shutil
`,
);

replaceExact(
  'backend/app/services/clipping_service.py',
  `def _capitalize_initial_character(text: str) -> str:
    if not text:
        return text
    first_char = text[0]
    uppered = first_char.upper()
    if first_char == uppered:
        return text
    return f"{uppered}{text[1:]}"
`,
  `def _format_subtitle_text(text: str) -> str:
    cleaned = " ".join(str(text).split())
    if not cleaned:
        return cleaned

    match = re.search(r"[A-Za-zÀ-ÿ]", cleaned)
    if match is None:
        return cleaned

    index = match.start()
    return f"{cleaned[:index]}{cleaned[index].upper()}{cleaned[index + 1:]}"
`,
);
