const fs = require('fs');

function patch(file, pattern, replacement) {
  let content = fs.readFileSync(file, 'utf8');
  if (!pattern.test(content)) {
    throw new Error(`Missing pattern in ${file}`);
  }
  content = content.replace(pattern, replacement);
  fs.writeFileSync(file, content, 'utf8');
}

patch(
  'backend/app/models/export_settings.py',
  /    @field_validator\("topic_focus"\)[\s\S]*?        return cleaned\r?\n\r?\n\r?\nclass GenerationSettingsInput/s,
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

class GenerationSettingsInput`,
);

patch(
  'backend/app/models/export_settings.py',
  /    @field_validator\("topic_focus"\)[\s\S]*?        return GenerationSettings\.normalize_topic_focus\(value\)\r?\n\r?\n    def resolve/s,
  `    @field_validator("topic_focus")
    @classmethod
    def normalize_topic_focus(cls, value: str | None) -> str | None:
        return GenerationSettings.normalize_topic_focus(value)

    @field_validator("language")
    @classmethod
    def normalize_language(cls, value: str | None) -> str | None:
        return GenerationSettings.normalize_language(value)

    def resolve`,
);

patch(
  'backend/app/models/analysis.py',
  /class AnalyzePodcastRequest\(BaseModel\):[\s\S]*?force: bool = False\r?\n\r?\n\r?\nclass AnalysisSummary/s,
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


class AnalysisSummary`,
);

patch(
  'backend/app/services/clipping_service.py',
  /import shutil\r?\n/, 
  `import re
import shutil
`,
);

patch(
  'backend/app/services/clipping_service.py',
  /def _capitalize_initial_character\(text: str\) -> str:[\s\S]*?return f"\{uppered\}\{text\[1:\]\}"\r?\n/s,
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
