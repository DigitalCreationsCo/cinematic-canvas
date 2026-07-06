from datetime import datetime, timezone
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from portals.services.database.models.folder.model import Folder


# ═══════════════════════════════════════════════════════════════════════
# Link table: many folders → one repository
# ═══════════════════════════════════════════════════════════════════════


class ProjectRepositoryLink(SQLModel, table=True):
    """Maps a project (folder) to a NAP repository.

    A single repository can be referenced by multiple projects, each
    potentially pinned to a different tag or commit.  The ``tag`` and
    ``pinned_commit_hash`` fields are **per-project** concerns — they
    live here rather than on ``NapRepository`` itself.
    """

    __tablename__ = "project_repository_link"

    folder_id: UUID = Field(foreign_key="folder.id", primary_key=True)
    repository_id: UUID = Field(foreign_key="nap_repository.id", primary_key=True)
    tag: str = Field(default="latest")
    """The tag this project is pinned to (defaults to ``"latest"``)."""
    pinned_commit_hash: str | None = Field(default=None)
    """The concrete commit hash ``tag`` resolved to when the link was
    created.  ``None`` for brand-new repositories with no commits yet."""

    folder: "Folder" = Relationship(back_populates="repository_links")
    repository: "NapRepository" = Relationship(back_populates="folder_links")


# ═══════════════════════════════════════════════════════════════════════
# Repository model (no longer has folder_id — that lives on the link)
# ═══════════════════════════════════════════════════════════════════════


class NapRepositoryBase(SQLModel):
    name: str = Field(index=True)
    nap_uri: str | None = Field(default=None, nullable=True)
    repo_type: str = Field(default="local")
    remote_url: str | None = Field(default=None, nullable=True)
    entity_count: int = Field(default=0)
    last_commit_hash: str | None = Field(default=None, nullable=True)
    status: str = Field(default="active")
    created_at: datetime | None = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=True)
    updated_at: datetime | None = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=True)


class NapRepository(NapRepositoryBase, table=True):
    __tablename__ = "nap_repository"
    __mapper_args__ = {"confirm_deleted_rows": False}

    id: UUID = Field(default_factory=uuid4, primary_key=True, unique=True)
    error_message: str | None = Field(default=None, nullable=True)

    folder_links: list["ProjectRepositoryLink"] = Relationship(
        back_populates="repository",
        sa_relationship_kwargs={"cascade": "all, delete"},
    )


class NapRepositoryCreate(NapRepositoryBase):
    pass


class NapRepositoryRead(NapRepositoryBase):
    id: UUID
    error_message: str | None = None


class NapRepositoryDetail(NapRepositoryRead):
    entities: list[dict] = Field(default_factory=list)
    recent_commits: list[dict] = Field(default_factory=list)


class NapRepositoryUpdate(SQLModel):
    name: str | None = None
    remote_url: str | None = None
    status: str | None = None
    entity_count: int | None = None
    last_commit_hash: str | None = None
    error_message: str | None = None
