const fs = require('fs');
const file = 'backend/app/models/export_settings.py';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/class GenerationSettings\(BaseModel\):[\s\S]*?class GenerationSettingsInput\(BaseModel\):/s, `class GenerationSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    clip_duration_seconds: int = Field(default=30, ge=8, le=90)
    number_of_clips: int = Field(default=5, ge=1, le=10)
    topic_focus: str | None = Field(default=None, max_length=500)
    subtitles_enabled: bool = True
    language: str | None = None

    @field_validator("topic_focus")
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

    def resolve(self, base: GenerationSettings | None = None) -> GenerationSettings:
        resolved_base = base or GenerationSettings()
        return resolved_base.model_copy(
            update={
                key: value
                for key, value in {
                    "clip_duration_seconds": self.clip_duration_seconds,
                    "number_of_clips": self.number_of_clips,
                    "topic_focus": self.topic_focus,
                    "subtitles_enabled": self.subtitles_enabled,
                    "language": self.language,
                }.items()
                if value is not None
            }
        )


class GenerationSettingsInput(BaseModel):`);
fs.writeFileSync(file, content, 'utf8');
