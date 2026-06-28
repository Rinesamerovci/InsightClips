const fs = require('fs');
const file = 'backend/app/models/export_settings.py';
let content = fs.readFileSync(file, 'utf8');
const anchor = '\n\nclass ExportSettings(BaseModel):';
if (!content.includes(anchor)) throw new Error('Missing ExportSettings anchor');
const insertion = `\n\nclass GenerationSettingsInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    clip_duration_seconds: int | None = Field(default=None, ge=8, le=90)
    number_of_clips: int | None = Field(default=None, ge=1, le=10)
    topic_focus: str | None = Field(default=None, max_length=500)
    subtitles_enabled: bool | None = None
    language: str | None = None

    @field_validator("topic_focus")
    @classmethod
    def normalize_topic_focus(cls, value: str | None) -> str | None:
        return GenerationSettings.normalize_topic_focus(value)

    @field_validator("language")
    @classmethod
    def normalize_language(cls, value: str | None) -> str | None:
        return GenerationSettings.normalize_language(value)

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
        )`;
content = content.replace(anchor, insertion + anchor.trimStart());
fs.writeFileSync(file, content, 'utf8');
