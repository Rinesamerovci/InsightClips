const fs = require('fs');

function replaceOnce(file, search, replace) {
  const current = fs.readFileSync(file, 'utf8');
  if (!current.includes(search)) {
    throw new Error(`Missing expected snippet in ${file}`);
  }
  const next = current.replace(search, replace);
  fs.writeFileSync(file, next, 'utf8');
}

replaceOnce(
  'frontend/lib/generation-settings.ts',
  'export const MAX_TOPIC_LENGTH = 500;\n',
  'export const MAX_TOPIC_LENGTH = 500;\n\nfunction normalizeGenerationLanguage(language?: string | null): string | undefined {\n  const cleaned = language?.trim();\n  if (!cleaned || cleaned.toLowerCase() === "auto") {\n    return undefined;\n  }\n  return cleaned;\n}\n',
);

replaceOnce(
  'frontend/lib/generation-settings.ts',
  'export function buildDefaultGenerationSettings(): GenerationSettings {\n  return {\n    clip_duration_seconds: 30,\n    number_of_clips: 4,\n    topic_focus: "",\n    subtitles_enabled: true,\n  };\n}\n',
  'export function buildDefaultGenerationSettings(): GenerationSettings {\n  return {\n    clip_duration_seconds: 30,\n    number_of_clips: 4,\n    topic_focus: "",\n    subtitles_enabled: true,\n    language: undefined,\n  };\n}\n',
);

replaceOnce(
  'frontend/lib/generation-settings.ts',
  '    subtitles_enabled:\n      typeof settings?.subtitles_enabled === "boolean"\n        ? settings.subtitles_enabled\n        : fallback.subtitles_enabled,\n  };\n}\n',
  '    subtitles_enabled:\n      typeof settings?.subtitles_enabled === "boolean"\n        ? settings.subtitles_enabled\n        : fallback.subtitles_enabled,\n    language: normalizeGenerationLanguage(settings?.language),\n  };\n}\n',
);

replaceOnce(
  'backend/app/models/export_settings.py',
  '    @field_validator("topic_focus")\n    @classmethod\n    def normalize_topic_focus(cls, value: str | None) -> str | None:\n        if value is None:\n            return None\n        cleaned = " ".join(value.split())\n        if not cleaned:\n            return None\n        if not re.fullmatch(r"[A-Za-z0-9\\s,.\'\\-#/&]+", cleaned):\n            raise ValueError("topic_focus can only contain letters, numbers, spaces, and simple punctuation.")\n        return cleaned\n',
  '    @field_validator("topic_focus")\n    @classmethod\n    def normalize_topic_focus(cls, value: str | None) -> str | None:\n        if value is None:\n            return None\n        cleaned = " ".join(value.split())\n        if not cleaned:\n            return None\n        if not re.fullmatch(r"[A-Za-z0-9\\s,.\'\\-#/&]+", cleaned):\n            raise ValueError("topic_focus can only contain letters, numbers, spaces, and simple punctuation.")\n        return cleaned\n\n    @field_validator("language")\n    @classmethod\n    def normalize_language(cls, value: str | None) -> str | None:\n        if value is None:\n            return None\n        cleaned = " ".join(value.split()).lower()\n        if not cleaned or cleaned in {"auto", "auto-detect", "auto detect", "unknown"}:\n            return None\n        return cleaned\n',
);

replaceOnce(
  'backend/app/models/export_settings.py',
  '    @field_validator("topic_focus")\n    @classmethod\n    def normalize_topic_focus(cls, value: str | None) -> str | None:\n        return GenerationSettings.normalize_topic_focus(value)\n',
  '    @field_validator("topic_focus")\n    @classmethod\n    def normalize_topic_focus(cls, value: str | None) -> str | None:\n        return GenerationSettings.normalize_topic_focus(value)\n\n    @field_validator("language")\n    @classmethod\n    def normalize_language(cls, value: str | None) -> str | None:\n        return GenerationSettings.normalize_language(value)\n',
);

replaceOnce(
  'backend/app/models/analysis.py',
  'class AnalyzePodcastRequest(BaseModel):\n    model_config = ConfigDict(extra="forbid")\n\n    transcription: TranscriptionResult | None = None\n    transcription_model: str = "base"\n    language: str | None = None\n    topic_focus: str | None = Field(default=None, max_length=500)\n    force: bool = False\n',
  'class AnalyzePodcastRequest(BaseModel):\n    model_config = ConfigDict(extra="forbid")\n\n    transcription: TranscriptionResult | None = None\n    transcription_model: str = "base"\n    language: str | None = None\n    topic_focus: str | None = Field(default=None, max_length=500)\n    force: bool = False\n\n    @field_validator("language")\n    @classmethod\n    def normalize_language(cls, value: str | None) -> str | None:\n        if value is None:\n            return None\n        cleaned = " ".join(value.split()).lower()\n        if not cleaned or cleaned in {"auto", "auto-detect", "auto detect", "unknown"}:\n            return None\n        return cleaned\n',
);

replaceOnce(
  'backend/app/services/clipping_service.py',
  'import shutil\n',
  'import re\nimport shutil\n',
);

replaceOnce(
  'backend/app/services/clipping_service.py',
  '                _capitalize_initial_character(cue.text),\n',
  '                _format_subtitle_text(cue.text),\n',
);

replaceOnce(
  'backend/app/services/clipping_service.py',
  '    subtitle_text = _capitalize_initial_character(_join_transcript_tokens(word.word for word in clip_words))\n',
  '    subtitle_text = _format_subtitle_text(_join_transcript_tokens(word.word for word in clip_words))\n',
);

replaceOnce(
  'backend/app/services/clipping_service.py',
  'def _capitalize_initial_character(text: str) -> str:\n    if not text:\n        return text\n    first_char = text[0]\n    uppered = first_char.upper()\n    if first_char == uppered:\n        return text\n    return f"{uppered}{text[1:]}"\n',
  'def _format_subtitle_text(text: str) -> str:\n    cleaned = " ".join(str(text).split())\n    if not cleaned:\n        return cleaned\n\n    match = re.search(r"[A-Za-zÀ-ÿ]", cleaned)\n    if match is None:\n        return cleaned\n\n    index = match.start()\n    return f"{cleaned[:index]}{cleaned[index].upper()}{cleaned[index + 1:]}"\n',
);
