from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import Index, text
from sqlmodel import Field, SQLModel


class AssetEntryBase(SQLModel):
    project_id: UUID = Field(foreign_key="folder.id")
    scene_id: UUID | None = Field(default=None, foreign_key="scenes.id", nullable=True)
    character_id: UUID | None = Field(default=None, foreign_key="characters.id", nullable=True)
    location_id: UUID | None = Field(default=None, foreign_key="locations.id", nullable=True)
    prop_id: UUID | None = Field(default=None, foreign_key="props.id", nullable=True)
    file_id: UUID | None = Field(default=None, nullable=True)
    asset_key: str
    head: int = Field(default=0)
    best: int = Field(default=0)
    best_locked_by_feedback: bool = Field(default=False)


class AssetEntry(AssetEntryBase, table=True):  # type: ignore[call-arg]
    __tablename__ = "asset_entries"
    __mapper_args__ = {"confirm_deleted_rows": False}
    __table_args__ = (
        Index(
            "idx_unq_project_asset",
            "project_id",
            "asset_key",
            unique=True,
            postgresql_where=text(
                "scene_id IS NULL AND character_id IS NULL AND location_id IS NULL AND file_id IS NULL"
            ),
        ),
        Index("idx_unq_scene_asset", "scene_id", "asset_key", unique=True),
        Index("idx_unq_char_asset", "character_id", "asset_key", unique=True),
        Index("idx_unq_loc_asset", "location_id", "asset_key", unique=True),
        Index("idx_unq_file_asset", "file_id", "asset_key", unique=True),
        Index("idx_asset_entries_project", "project_id"),
        Index("idx_asset_entries_scene", "scene_id"),
        Index("idx_asset_entries_character", "character_id"),
        Index("idx_asset_entries_location", "location_id"),
        Index("idx_asset_entries_file", "file_id"),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True, unique=True)
    created_at: datetime | None = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=True)
    updated_at: datetime | None = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=True)


class AssetEntryCreate(AssetEntryBase):
    pass


class AssetEntryRead(AssetEntryBase):
    id: UUID
    created_at: datetime | None = None
    updated_at: datetime | None = None
