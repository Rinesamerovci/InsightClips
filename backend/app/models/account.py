from pydantic import BaseModel, ConfigDict, EmailStr


class DeleteAccountRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    confirmation_email: EmailStr


class DeleteAccountResponse(BaseModel):
    deleted: bool
    user_id: str
    podcasts_deleted: int = 0
    source_objects_removed: int = 0
    clip_objects_removed: int = 0
    auth_user_deleted: bool = False
    email_notification_sent: bool = False
