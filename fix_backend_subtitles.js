const fs = require('fs');

function patch(file, transforms) {
  let content = fs.readFileSync(file, 'utf8');
  for (const { pattern, replacement, description } of transforms) {
    if (!pattern.test(content)) {
      throw new Error(`Missing ${description} in ${file}`);
    }
    content = content.replace(pattern, replacement);
  }
  fs.writeFileSync(file, content, 'utf8');
}

patch('backend/app/models/export_settings.py', [
  {
    description: 'GenerationSettings topic_focus validator',
    pattern: /    @field_validator\("topic_focus"\)\r?\n    @classmethod\r?\n    def normalize_topic_focus\(cls, value: str \| None\) -> str \| None:\r?\n        if value is None:\r?\n            return None\r?\n        cleaned = " ".join\(value.split\(\)\)\r?\n        if not cleaned:\r?\n            return None\r?\n        if not re\.fullmatch\(r"\[A-Za-z0-9\\s,.'\\-#\/&\]+", cleaned\):\r?\n            raise ValueError\("topic_focus can only contain letters, numbers, spaces, and simple punctuation\."\)\r?\n        return cleaned\r?\n/,
    replacement: `    @field_validator("topic_focus")
    @classmethod
    def normalize_topic_focus(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = " ".join(value.split())
        if not cleaned:
            return None
        if not re.fullmatch(r"[A-Za-z0-9\s,.'\-#/&]+", cleaned):
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
  },
  {
    description: 'GenerationSettingsInput topic_focus validator',
    pattern: /    @field_validator\("topic_focus"\)\r?\n    @classmethod\r?\n    def normalize_topic_focus\(cls, value: str \| None\) -> str \| None:\r?\n        return GenerationSettings\.normalize_topic_focus\(value\)\r?\n/,
    replacement: `    @field_validator("topic_focus")
    @classmethod
    def normalize_topic_focus(cls, value: str | None) -> str | None:
        return GenerationSettings.normalize_topic_focus(value)

    @field_validator("language")
    @classmethod
    def normalize_language(cls, value: str | None) -> str | None:
        return GenerationSettings.normalize_language(value)
`,
  },
]);

patch('backend/app/models/analysis.py', [
  {
    description: 'AnalyzePodcastRequest block',
    pattern: /class AnalyzePodcastRequest\(BaseModel\):\r?\n    model_config = ConfigDict\(extra="forbid"\)\r?\n\r?\n    transcription: TranscriptionResult \| None = None\r?\n    transcription_model: str = "base"\r?\n    language: str \| None = None\r?\n    topic_focus: str \| None = Field\(default=None, max_length=500\)\r?\n    force: bool = False\r?\n/,
    replacement: `class AnalyzePodcastRequest(BaseModel):
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
  },
]);

patch('backend/app/services/clipping_service.py', [
  {
    description: 're import',
    pattern: /import shutil\r?\n/,
    replacement: 'import re\nimport shutil\n',
  },
  {
    description: 'subtitle formatter',
    pattern: /def _capitalize_initial_character\(text: str\) -> str:\r?\n    if not text:\r?\n        return text\r?\n    first_char = text\[0\]\r?\n    uppered = first_char\.upper\(\)\r?\n    if first_char == uppered:\r?\n        return text\r?\n    return f"\{uppered\}\{text\[1:\]\}"\r?\n/,
    replacement: `def _format_subtitle_text(text: str) -> str:
    cleaned = " ".join(str(text).split())
    if not cleaned:
        return cleaned

    match = re.search(r"[A-Za-zÀ-ÿ]", cleaned)
    if match is None:
        return cleaned

    index = match.start()
    return f"{cleaned[:index]}{cleaned[index].upper()}{cleaned[index + 1:]}"
`,
  },
]);
