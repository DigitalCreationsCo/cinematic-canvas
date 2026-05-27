from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import Index, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Column, Field, SQLModel


class AssetVersionBase(SQLModel):
    asset_entry_id: UUID = Field(foreign_key="asset_entries.id")
    version: int
    data: str
    media_id: str | None = Field(default=None, foreign_key="media_objects.data", nullable=True)
    type: str
    metadata_: dict = Field(
        default_factory=dict,
        sa_column=Column("metadata", JSONB, nullable=True, server_default=text("'{}'::jsonb")),
    )
    user_feedback: dict | None = Field(default=None, sa_column=Column(JSONB, nullable=True))
    started_at: datetime | None = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=True)
    created_at: datetime | None = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=True)


class AssetVersionRow(AssetVersionBase, table=True):  # type: ignore[call-arg]
    __tablename__ = "asset_versions"
    __mapper_args__ = {"confirm_deleted_rows": False}
    __table_args__ = (
        Index("idx_unq_asset_version_seq", "asset_entry_id", "version", unique=True),
        Index("idx_asset_history_lookup", "asset_entry_id", "version"),
        Index("idx_entry_version", "asset_entry_id", "version"),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True, unique=True)


class AssetVersionCreate(AssetVersionBase):
    pass


class AssetVersionRead(AssetVersionBase):
    id: UUID
