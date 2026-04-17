from datetime import datetime

from pydantic import BaseModel, ConfigDict


class PodcastRecord(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    user_id: str
    title: str
    duration: int
    status: str
    storage_path: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class PodcastResponse(BaseModel):
    id: str
    user_id: str
    title: str
    duration: int
    status: str
    storage_path: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class PodcastsResponse(BaseModel):
    podcasts: list[PodcastResponse]
    is_mock: bool = False
