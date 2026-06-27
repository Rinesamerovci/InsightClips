const fs = require('fs');

function replaceExact(file, search, replacement) {
  const current = fs.readFileSync(file, 'utf8');
  if (!current.includes(search)) {
    throw new Error(`Missing expected snippet in ${file}`);
  }
  fs.writeFileSync(file, current.replace(search, replacement), 'utf8');
}

replaceExact(
  'backend/app/models/export_settings.py',
  '    @field_validator("topic_focus")\r\n    @classmethod\r\n    def normalize_topic_focus(cls, value: str | None) -> str | None:\r\n        if value is None:\r\n            return None\r\n        cleaned = " ".join(value.split())\r\n        if not cleaned:\r\n            return None\r\n        if not re.fullmatch(r"[A-Za-z0-9\\s,.'\\-#/&]+", cleaned):\r\n            raise ValueError("topic_focus can only contain letters, numbers, spaces, and simple punctuation.")\r\n        return cleaned\r\n\r\n\r\nclass GenerationSettingsInput(BaseModel):',
  '    @field_validator("topic_focus")\r\n    @classmethod\r\n    def normalize_topic_focus(cls, value: str | None) -> str | None:\r\n        if value is None:\r\n            return None\r\n        cleaned = " ".join(value.split())\r\n        if not cleaned:\r\n            return None\r\n        if not re.fullmatch(r"[A-Za-z0-9\\s,.'\\-#/&]+", cleaned):\r\n            raise ValueError("topic_focus can only contain letters, numbers, spaces, and simple punctuation.")\r\n        return cleaned\r\n\r\n    @field_validator("language")\r\n    @classmethod\r\n    def normalize_language(cls, value: str | None) -> str | None:\r\n        if value is None:\r\n            return None\r\n        cleaned = " ".join(value.split()).lower()\r\n        if not cleaned or cleaned in {"auto", "auto-detect", "auto detect", "unknown"}:\r\n            return None\r\n        return cleaned\r\n\r\nclass GenerationSettingsInput(BaseModel):',
);

replaceExact(
  'backend/app/models/export_settings.py',
  '    @field_validator("topic_focus")\r\n    @classmethod\r\n    def normalize_topic_focus(cls, value: str | None) -> str | None:\r\n        return GenerationSettings.normalize_topic_focus(value)\r\n\r\n    def resolve(self, base: GenerationSettings | None = None) -> GenerationSettings:',
  '    @field_validator("topic_focus")\r\n    @classmethod\r\n    def normalize_topic_focus(cls, value: str | None) -> str | None:\r\n        return GenerationSettings.normalize_topic_focus(value)\r\n\r\n    @field_validator("language")\r\n    @classmethod\r\n    def normalize_language(cls, value: str | None) -> str | None:\r\n        return GenerationSettings.normalize_language(value)\r\n\r\n    def resolve(self, base: GenerationSettings | None = None) -> GenerationSettings:',
);

replaceExact(
  'backend/app/models/analysis.py',
  'class AnalyzePodcastRequest(BaseModel):\r\n    model_config = ConfigDict(extra="forbid")\r\n\r\n    transcription: TranscriptionResult | None = None\r\n    transcription_model: str = "base"\r\n    language: str | None = None\r\n    topic_focus: str | None = Field(default=None, max_length=500)\r\n    force: bool = False\r\n\r\n\r\n\r\nclass AnalysisSummary(BaseModel):',
  'class AnalyzePodcastRequest(BaseModel):\r\n    model_config = ConfigDict(extra="forbid")\r\n\r\n    transcription: TranscriptionResult | None = None\r\n    transcription_model: str = "base"\r\n    language: str | None = None\r\n    topic_focus: str | None = Field(default=None, max_length=500)\r\n    force: bool = False\r\n\r\n    @field_validator("language")\r\n    @classmethod\r\n    def normalize_language(cls, value: str | None) -> str | None:\r\n        if value is None:\r\n            return None\r\n        cleaned = " ".join(value.split()).lower()\r\n        if not cleaned or cleaned in {"auto", "auto-detect", "auto detect", "unknown"}:\r\n            return None\r\n        return cleaned\r\n\r\n\r\nclass AnalysisSummary(BaseModel):',
);

replaceExact(
  'backend/app/services/clipping_service.py',
  'import shutil\r\n',
  'import re\r\nimport shutil\r\n',
);

replaceExact(
  'backend/app/services/clipping_service.py',
  'def _capitalize_initial_character(text: str) -> str:\r\n    if not text:\r\n        return text\r\n    first_char = text[0]\r\n    uppered = first_char.upper()\r\n    if first_char == uppered:\r\n        return text\r\n    return f"{uppered}{text[1:]}"\r\n',
  'def _format_subtitle_text(text: str) -> str:\r\n    cleaned = " ".join(str(text).split())\r\n    if not cleaned:\r\n        return cleaned\r\n\r\n    match = re.search(r"[A-Za-zÀ-ÿ]", cleaned)\r\n    if match is None:\r\n        return cleaned\r\n\r\n    index = match.start()\r\n    return f"{cleaned[:index]}{cleaned[index].upper()}{cleaned[index + 1:]}"\r\n',
);
