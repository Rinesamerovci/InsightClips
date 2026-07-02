from pydantic import BaseModel, ConfigDict, EmailStr
# Request model for deleting a user account
class DeleteAccountRequest(BaseModel):
     # Forbid any extra fields that are not defined in the schema
    model_config = ConfigDict(extra="forbid")
# Email used to confirm account deletion (security check)
    confirmation_email: EmailStr

# Response model after account deletion
class DeleteAccountResponse(BaseModel):
    deleted: bool
    user_id: str
    podcasts_deleted: int = 0
    source_objects_removed: int = 0
    clip_objects_removed: int = 0
    auth_user_deleted: bool = False
    email_notification_sent: bool = False
