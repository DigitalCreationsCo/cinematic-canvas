from typing import TYPE_CHECKING, Any, Optional
from uuid import UUID, uuid4

from pydantic import ConfigDict
from sqlmodel import JSON, Column, Field, Relationship, SQLModel

from portals.services.database.models import Folder

if TYPE_CHECKING:
    from portals.services.database.models.user.model import User


class Storyboard(SQLModel, table=True):  # type: ignore[call-arg]
    __tablename__ = "storyboard"
    __mapper_args__ = {"confirm_deleted_rows": False}

    id: UUID | None = Field(default_factory=uuid4, primary_key=True)

    folder_id: UUID = Field(foreign_key="folder.id")
    folder: "Folder" = Relationship()

    user_id: UUID | None = Field(default=None, foreign_key="user.id")
    user: Optional["User"] = Relationship()

    characters: list[Any] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    locations: list[Any] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    scenes: list[Any] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    props: list[Any] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))

    metadata_: dict[str, Any] = Field(default_factory=dict, sa_column=Column("metadata", JSON, nullable=False))
    audio_analysis: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON, nullable=True))

    generation_rules: list[Any] = Field(
        default_factory=list,
        sa_column=Column("generation_rules", JSON, nullable=False),
    )

    style_references: list = Field(
        default_factory=list,
        sa_column=Column(
            "style_references",
            JSON,
            nullable=False,
        ),
    )


class StoryboardSnapshot(SQLModel):
    """The immutable, read-only snapshot representation of a Storyboard."""

    model_config = ConfigDict(
        frozen=True,
        title="Storyboard Snapshot",
        description="The immutable project snapshot layer for processing and responses",
    )

    id: UUID

    folder_id: UUID
    user_id: UUID | None = None

    characters: list[Any]
    locations: list[Any]
    scenes: list[Any]
    props: list[Any]
    metadata_: dict[str, Any]
    audio_analysis: dict[str, Any] | None = None
    generation_rules: list[Any]
    style_references: list[Any]
