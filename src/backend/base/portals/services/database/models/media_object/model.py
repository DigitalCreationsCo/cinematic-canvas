from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


class MediaObject(SQLModel, table=True):  # type: ignore[call-arg]
    __tablename__ = "media_objects"
    __mapper_args__ = {"confirm_deleted_rows": False}

    data: str = Field(primary_key=True)
    ref_count: int = Field(default=0)
    status: str = Field(default="active")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_referenced_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class MediaObjectRead(SQLModel):
    data: str
    ref_count: int
    status: str
    created_at: datetime
    last_referenced_at: datetime
