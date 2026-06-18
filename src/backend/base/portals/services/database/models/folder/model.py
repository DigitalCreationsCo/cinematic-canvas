from typing import TYPE_CHECKING, Optional
from uuid import UUID, uuid4

from sqlalchemy import String, Text, UniqueConstraint
from sqlmodel import JSON, Column, Field, Relationship, SQLModel

from portals.services.database.models.flow.model import FlowRead

if TYPE_CHECKING:
    from portals.services.database.models.deployment.model import Deployment
    from portals.services.database.models.file.model import File
    from portals.services.database.models.flow.model import Flow
    from portals.services.database.models.user.model import User


class FolderBase(SQLModel):
    name: str = Field(index=True)
    description: str | None = Field(default=None, sa_column=Column(Text))
    auth_settings: dict | None = Field(
        default=None,
        sa_column=Column(JSON, nullable=True),
        description="Authentication settings for the folder/project",
    )


class Folder(FolderBase, table=True):  # type: ignore[call-arg]
    __tablename__ = "folder"
    __mapper_args__ = {"confirm_deleted_rows": False}

    id: UUID | None = Field(default_factory=uuid4, primary_key=True)
    parent_id: UUID | None = Field(default=None, foreign_key="folder.id")

    parent: Optional["Folder"] = Relationship(
        back_populates="children",
        sa_relationship_kwargs={"remote_side": "Folder.id"},
    )
    children: list["Folder"] = Relationship(back_populates="parent")
    user_id: UUID | None = Field(default=None, foreign_key="user.id")
    user: "User" = Relationship(back_populates="folders")
    flows: list["Flow"] = Relationship(
        back_populates="folder",
        sa_relationship_kwargs={"cascade": "all, delete, delete-orphan"},
    )
    files: list["File"] = Relationship(
        back_populates="folder",
        sa_relationship_kwargs={"cascade": "all, delete, delete-orphan"},
    )
    deployments: list["Deployment"] = Relationship(
        back_populates="folder",
        sa_relationship_kwargs={"cascade": "all, delete, delete-orphan"},
    )
    storyboard: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    metadata_: dict = Field(default_factory=dict, sa_column=Column("metadata", JSON, nullable=False))
    audio_analysis: dict | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    status: str = Field(default="pending")
    current_scene_index: int = Field(default=0)
    force_regenerate_scene_ids: str = Field(
        default="",
        sa_column=Column(
            "force_regenerate_scene_ids",
            String,
            nullable=False,
        ),
    )
    generation_rules: str = Field(
        default="",
        sa_column=Column(
            "generation_rules",
            String,
            nullable=False,
        ),
    )
    generation_rules_history: list = Field(
        default_factory=list,
        sa_column=Column(
            "generation_rules_history",
            JSON,
            nullable=False,
        ),
    )
    guidance_level: int = Field(default=2)
    style_references: str = Field(
        default="",
        sa_column=Column(
            "style_references",
            String,
            nullable=False,
        ),
    )

    __table_args__ = (UniqueConstraint("user_id", "name", name="unique_folder_name"),)


class FolderCreate(FolderBase):
    components_list: list[UUID] | None = None
    flows_list: list[UUID] | None = None


class FolderRead(FolderBase):
    id: UUID
    parent_id: UUID | None = Field()
    storyboard: dict = Field(default_factory=dict)
    metadata_: dict = Field(default_factory=dict)
    audio_analysis: dict | None = None
    status: str = "pending"
    current_scene_index: int = 0
    force_regenerate_scene_ids: str = Field(default="")
    generation_rules: str = Field(default="")
    generation_rules_history: list = Field(default_factory=list)
    guidance_level: int = 2
    style_references: str = Field(default="")


class FolderReadWithFlows(FolderBase):
    id: UUID
    parent_id: UUID | None = Field()
    flows: list[FlowRead] = Field(default=[])


class FolderUpdate(SQLModel):
    name: str | None = None
    description: str | None = None
    parent_id: UUID | None = None
    components: list[UUID] = Field(default_factory=list)
    flows: list[UUID] = Field(default_factory=list)
    auth_settings: dict | None = None
