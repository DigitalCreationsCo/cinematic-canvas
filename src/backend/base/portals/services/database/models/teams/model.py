from datetime import datetime, timezone
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from pydantic import BaseModel
from sqlalchemy import Index, UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel

from portals.schema.serialize import UUIDstr

if TYPE_CHECKING:
    from portals.services.database.models.user.model import User


# ---------------------------------------------------------------------------
# Minimal user DTO for member listings — NEVER expose password/auth fields
# ---------------------------------------------------------------------------


class UserMinimal(BaseModel):
    """Slim, read-only user representation safe for member-list serialization."""

    id: UUID
    username: str
    profile_image: str | None = None


# ---------------------------------------------------------------------------
# Team entity
# ---------------------------------------------------------------------------


class Team(SQLModel, table=True):  # type: ignore[call-arg]
    __tablename__ = "teams"

    id: UUIDstr = Field(default_factory=uuid4, primary_key=True)
    name: str = Field(index=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # ORM-only — back-populated by UserTeamLink.team
    members: list["UserTeamLink"] = Relationship(
        back_populates="team",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class TeamCreate(SQLModel):
    name: str = Field(min_length=1, max_length=255)


class TeamUpdate(SQLModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)


class TeamRead(SQLModel):
    id: UUID
    name: str
    created_at: datetime
    updated_at: datetime
    member_count: int = 0


# ---------------------------------------------------------------------------
# Many-to-many junction: users ↔ teams
# ---------------------------------------------------------------------------


class UserTeamLink(SQLModel, table=True):  # type: ignore[call-arg]
    __tablename__ = "users_to_teams"

    id: UUIDstr = Field(default_factory=uuid4, primary_key=True)
    user_id: UUIDstr = Field(
        foreign_key="user.id",
        ondelete="CASCADE",
        nullable=False,
    )
    team_id: UUIDstr = Field(
        foreign_key="teams.id",
        ondelete="CASCADE",
        nullable=False,
    )
    role: str = Field(default="member", nullable=False)  # 'owner' | 'admin' | 'member'
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # ORM relationships
    user: "User" = Relationship(back_populates="team_links")
    team: Team | None = Relationship(back_populates="members")

    __table_args__ = (
        UniqueConstraint("user_id", "team_id", name="uq_user_team"),
        Index("ix_users_to_teams_team_id", "team_id"),
        Index("ix_users_to_teams_user_id", "user_id"),
    )


# ---------------------------------------------------------------------------
# Membership schemas
# ---------------------------------------------------------------------------


class MemberAdd(SQLModel):
    user_id: UUID
    role: str = "member"


class MemberUpdate(SQLModel):
    role: str


class MemberRead(BaseModel):
    user_id: UUID
    team_id: UUID
    role: str
    user: UserMinimal


# ---------------------------------------------------------------------------
# Paginated response wrappers
# ---------------------------------------------------------------------------


class TeamsResponse(BaseModel):
    total_count: int
    teams: list[TeamRead]


class MembersResponse(BaseModel):
    total_count: int
    members: list[MemberRead]
