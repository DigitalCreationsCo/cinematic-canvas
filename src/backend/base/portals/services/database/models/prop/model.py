from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel


class PropBase(SQLModel):
    project_id: UUID = Field(foreign_key="folder.id")
    reference_id: str
    name: str
    type: str
    guidance_level: int | None = None
    created_at: datetime | None = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=True)
    updated_at: datetime | None = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=True)


class Prop(PropBase, table=True):  # type: ignore[call-arg]
    __tablename__ = "props"
    __mapper_args__ = {"confirm_deleted_rows": False}

    id: UUID = Field(default_factory=uuid4, primary_key=True, unique=True)


class PropCreate(PropBase):
    pass


class PropRead(PropBase):
    id: UUID


class PropUpdate(SQLModel):
    reference_id: str | None = None
    name: str | None = None
    type: str | None = None
    guidance_level: int | None = None
