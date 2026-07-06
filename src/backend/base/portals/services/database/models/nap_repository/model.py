from datetime import datetime, timezone
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from portals.services.database.models.folder.model import Folder


class NapRepositoryBase(SQLModel):
    name: str = Field(index=True)
    nap_uri: str | None = Field(default=None, nullable=True)
    repo_type: str = Field(default="local")
    remote_url: str | None = Field(default=None, nullable=True)
    entity_count: int = Field(default=0)
    last_commit_hash: str | None = Field(default=None, nullable=True)
    status: str = Field(default="active")
    tag: str = Field(default="latest")
    """The tag this project's repository link is pinned to. Defaults to
    the sentinel ``"latest"``, which always tracks the repository's most
    recent commit rather than a fixed point in history. Fixed for the
    life of the link — to point at a different tag, re-link the
    repository (e.g. via a new project)."""
    pinned_commit_hash: str | None = Field(default=None)
    """The concrete commit hash ``tag`` resolved to when the repository
    was linked. ``None`` for brand-new repositories with no commits yet.
    Unlike ``tag``, this CAN be updated independently later — e.g. to
    pull in a newer commit under the same tag — without re-running tag
    selection."""
    created_at: datetime | None = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=True)
    updated_at: datetime | None = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=True)


class NapRepository(NapRepositoryBase, table=True):
    __tablename__ = "nap_repository"
    __mapper_args__ = {"confirm_deleted_rows": False}

    id: UUID = Field(default_factory=uuid4, primary_key=True, unique=True)
    folder_id: UUID = Field(foreign_key="folder.id")
    folder: "Folder" = Relationship(back_populates="nap_repository")
    error_message: str | None = Field(default=None, nullable=True)


class NapRepositoryCreate(NapRepositoryBase):
    folder_id: UUID


class NapRepositoryRead(NapRepositoryBase):
    id: UUID
    folder_id: UUID
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
