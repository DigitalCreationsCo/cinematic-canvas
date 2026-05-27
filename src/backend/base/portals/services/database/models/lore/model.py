from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel


class LoreBase(SQLModel):
    project_id: UUID = Field(foreign_key="folder.id")
    content: str
    is_active: bool = Field(default=True)
    happened_at: datetime | None = None


class Lore(LoreBase, table=True):  # type: ignore[call-arg]
    __tablename__ = "lore"
    __mapper_args__ = {"confirm_deleted_rows": False}

    id: UUID = Field(default_factory=uuid4, primary_key=True, unique=True)
    created_at: datetime | None = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=True)


class LoreCreate(LoreBase):
    pass


class LoreRead(LoreBase):
    id: UUID
    created_at: datetime | None = None
