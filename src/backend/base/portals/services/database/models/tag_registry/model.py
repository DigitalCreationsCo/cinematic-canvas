from uuid import UUID

from sqlalchemy import Index
from sqlmodel import Field, SQLModel


class TagRegistry(SQLModel, table=True):  # type: ignore[call-arg]
    __tablename__ = "tag_registry"
    __mapper_args__ = {"confirm_deleted_rows": False}
    __table_args__ = (
        Index("idx_tag_scope", "project_id"),
        Index(
            "idx_tag_handle_fuzzy",
            "handle",
            postgresql_using="gin",
            postgresql_ops={"handle": "gin_trgm_ops"},
        ),
    )

    handle: str = Field(primary_key=True)
    entity_type: str
    character_id: UUID | None = Field(default=None, foreign_key="characters.id", nullable=True)
    location_id: UUID | None = Field(default=None, foreign_key="locations.id", nullable=True)
    prop_id: UUID | None = Field(default=None, foreign_key="props.id", nullable=True)
    project_id: UUID | None = Field(default=None, foreign_key="folder.id", nullable=True)


class TagRegistryCreate(SQLModel):
    handle: str
    entity_type: str
    character_id: UUID | None = None
    location_id: UUID | None = None
    prop_id: UUID | None = None
    project_id: UUID | None = None


class TagRegistryRead(TagRegistryCreate):
    pass
