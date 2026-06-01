from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import Index, String
from sqlmodel import Column, Field, SQLModel


class BlockBase(SQLModel):
    index: int
    project_id: UUID = Field(foreign_key="folder.id")
    title: str | None = None
    content: str
    dialogue: str | None = None
    happened_at: datetime | None = None
    is_notable: bool = Field(default=False)


class Block(BlockBase, table=True):  # type: ignore[call-arg]
    __tablename__ = "blocks"
    __mapper_args__ = {"confirm_deleted_rows": False}
    __table_args__ = (
        Index("idx_blocks_project_id", "project_id"),
        Index("idx_blocks_search", "search_vector", postgresql_using="gin"),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True, unique=True)
    image_url: str | None = None
    search_vector: Any | None = Field(
        default=None,
        sa_column=Column(
            "search_vector",  # see sqlitevec for vector columns
            String,
            # Computed("to_tsvector('english', content)", persisted=True),
            nullable=True,
        ),
    )
    created_at: datetime | None = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=True)


class BlockCreate(BlockBase):
    pass


class BlockRead(BlockBase):
    id: UUID
    image_url: str | None = None
    created_at: datetime | None = None
