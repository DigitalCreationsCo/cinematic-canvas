from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import Index
from sqlmodel import JSON, Column, Field, SQLModel


class CharacterBase(SQLModel):
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc), nullable=False, sa_column_kwargs={"server_default": None}
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc), nullable=False, sa_column_kwargs={"server_default": None}
    )
    project_id: UUID = Field(foreign_key="folder.id")
    reference_id: str
    name: str = Field(index=True)
    aliases: list[str] = Field(
        default_factory=list,
        sa_column=Column(
            "aliases",
            JSON,
            nullable=False,
        ),
    )
    physical_traits: dict = Field(sa_column=Column(JSON, nullable=False))
    state: dict = Field(sa_column=Column(JSON, nullable=False))
    guidance_level: int | None = None

    # NAP (Narrative Addressing Protocol) columns — temporary migration
    # scaffolding.  These are thin pointers so the existing SQL-based
    # read paths can resolve URIs during the migration period.  Full
    # removal is deferred to a later PR.
    nap_uri: str | None = Field(default=None, nullable=True)
    nap_commit_hash: str | None = Field(default=None, nullable=True)


class Character(CharacterBase, table=True):  # type: ignore[call-arg]
    __tablename__ = "characters"
    __mapper_args__ = {"confirm_deleted_rows": False}
    __table_args__ = (Index("characters_guidance_idx", "guidance_level"),)

    id: UUID = Field(default_factory=uuid4, primary_key=True, unique=True)


class CharacterCreate(CharacterBase):
    pass


class CharacterRead(CharacterBase):
    id: UUID


class CharacterUpdate(SQLModel):
    name: str | None = None
    aliases: list[str] | None = None
    physical_traits: dict | None = None
    state: dict | None = None
    guidance_level: int | None = None
    reference_id: str | None = None
