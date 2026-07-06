"""CRUD operations for the teams domain.

Every public function accepts an explicit ``AsyncSession`` for dependency-injectable
session scoping.  No module-level state.
"""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from px.log.logger import logger
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import flag_modified
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel.sql.expression import SelectOfScalar

from portals.services.database.models.teams.model import (
    MemberRead,
    Team,
    TeamCreate,
    TeamRead,
    TeamsResponse,
    TeamUpdate,
    UserMinimal,
    UserTeamLink,
)
from portals.services.database.models.user.model import User

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _map_team_to_read(team: Team, role: str | None = None) -> TeamRead:
    """Convert an ORM Team to a TeamRead with member count and optional user role."""
    return TeamRead(
        id=team.id,
        name=team.name,
        created_at=team.created_at,
        updated_at=team.updated_at,
        member_count=len(team.members) if team.members else 0,
        role=role,
    )


def _map_link_to_member_read(link: UserTeamLink) -> MemberRead:
    """Convert a UserTeamLink ORM row to a MemberRead DTO."""
    user = link.user
    return MemberRead(
        user_id=link.user_id,
        team_id=link.team_id,
        role=link.role,
        user=UserMinimal(
            id=user.id,
            username=user.username,
            profile_image=getattr(user, "profile_image", None),
        ),
    )


async def _assert_team_exists(session: AsyncSession, team_id: UUID) -> Team:
    """Return the team or raise 404.

    Eagerly loads ``.members`` so callers don't trigger N+1 queries.
    """
    stmt = select(Team).where(Team.id == team_id).options(selectinload(Team.members).selectinload(UserTeamLink.user))
    team = (await session.exec(stmt)).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return team


async def get_member_link(
    session: AsyncSession,
    team_id: UUID,
    user_id: UUID,
) -> UserTeamLink | None:
    """Return the membership link for *user_id* in *team_id*, or ``None``."""
    stmt = select(UserTeamLink).where(
        UserTeamLink.team_id == team_id,
        UserTeamLink.user_id == user_id,
    )
    return (await session.exec(stmt)).first()


# Backward-compat private alias used internally
_get_membership = get_member_link


async def _assert_not_last_owner(
    session: AsyncSession,
    team_id: UUID,
    *,
    exclude_user_id: UUID | None = None,
) -> None:
    """Raise 409 if removing/excluding *exclude_user_id* would leave the team
    with zero owners.
    """
    stmt = (
        select(func.count())
        .select_from(UserTeamLink)
        .where(
            UserTeamLink.team_id == team_id,
            UserTeamLink.role == "owner",
        )
    )
    if exclude_user_id is not None:
        stmt = stmt.where(UserTeamLink.user_id != exclude_user_id)

    remaining_owner_count = (await session.exec(stmt)).first() or 0
    if remaining_owner_count < 1:
        raise HTTPException(
            status_code=409,
            detail="Cannot remove the last owner of the team. Promote another member to owner first.",
        )


async def _assert_owner_or_admin(membership: UserTeamLink | None) -> None:
    """Raise 403 if the caller is not an owner or admin of the team."""
    if membership is None:
        raise HTTPException(status_code=404, detail="Team not found")
    if membership.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return membership


async def _assert_owner(membership: UserTeamLink | None) -> UserTeamLink:
    """Raise 403 if the caller is not an owner of the team."""
    if membership is None:
        raise HTTPException(status_code=404, detail="Team not found")
    if membership.role != "owner":
        raise HTTPException(status_code=403, detail="Only team owners can perform this action")
    return membership


# ---------------------------------------------------------------------------
# Public CRUD — Team
# ---------------------------------------------------------------------------


async def create_team(
    session: AsyncSession,
    team_create: TeamCreate,
    owner_user_id: UUID,
) -> Team:
    """Create a new team and add *owner_user_id* as its owner.

    Returns the freshly-flushed Team ORM object.
    """
    team = Team.model_validate(team_create, from_attributes=True)
    session.add(team)
    await session.flush()
    await session.refresh(team)

    # Wire the creator as the initial owner
    link = UserTeamLink(user_id=owner_user_id, team_id=team.id, role="owner")
    session.add(link)
    await session.flush()
    await session.refresh(team)

    # Note: Session scope handles commit automatically at end of request
    # Manual commit not needed and can cause issues with session state

    logger.info(f"Team created: {team.id} by user {owner_user_id}")
    return team


async def get_team_by_id(
    session: AsyncSession,
    team_id: UUID,
) -> Team:
    """Fetch a single team with members pre-loaded.

    Raises 404 if not found.
    """
    return await _assert_team_exists(session, team_id)


async def get_teams_for_user(
    session: AsyncSession,
    user_id: UUID,
    *,
    skip: int = 0,
    limit: int = 10,
    search: str | None = None,
) -> TeamsResponse:
    """Return paginated teams the given user is a member of.

    Supports optional name-based search filtering.
    """
    # Subquery: team IDs the user belongs to with their role
    team_links_subq = select(UserTeamLink.team_id, UserTeamLink.role).where(UserTeamLink.user_id == user_id).subquery()

    base_query: SelectOfScalar = select(Team, team_links_subq.c.role).join(
        team_links_subq, Team.id == team_links_subq.c.team_id
    )
    count_query = select(func.count()).select_from(Team).join(team_links_subq, Team.id == team_links_subq.c.team_id)

    if search:
        search_filter = Team.name.ilike(f"%{search}%")
        base_query = base_query.where(search_filter)
        count_query = count_query.where(search_filter)

    total_count = (await session.exec(count_query)).first() or 0

    # Eagerly load members for the member_count
    base_query = base_query.options(
        selectinload(Team.members).selectinload(UserTeamLink.user),
    )
    base_query = base_query.offset(skip).limit(limit).order_by(Team.created_at.desc())

    results = (await session.exec(base_query)).fetchall()

    return TeamsResponse(
        total_count=total_count,
        teams=[_map_team_to_read(team, role) for team, role in results],
    )


async def update_team(
    session: AsyncSession,
    team: Team,
    team_update: TeamUpdate,
) -> Team:
    """Apply partial updates to a Team entity.

    The caller is expected to have already verified write permissions.
    """
    update_data = team_update.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_304_NOT_MODIFIED,
            detail="Nothing to update",
        )

    changed = False
    for attr, value in update_data.items():
        if hasattr(team, attr) and value is not None:
            setattr(team, attr, value)
            changed = True

    if not changed:
        raise HTTPException(
            status_code=status.HTTP_304_NOT_MODIFIED,
            detail="Nothing to update",
        )

    team.updated_at = datetime.now(timezone.utc)
    flag_modified(team, "updated_at")

    try:
        await session.flush()
    except IntegrityError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    return team


async def delete_team(
    session: AsyncSession,
    team_id: UUID,
) -> None:
    """Hard-delete a team.

    The calling user **must** be an owner — verified upstream.
    CASCADE rules remove all ``UserTeamLink`` rows automatically.
    """
    team = await _assert_team_exists(session, team_id)
    await session.delete(team)
    await session.flush()
    logger.info(f"Team deleted: {team_id}")


# ---------------------------------------------------------------------------
# Public CRUD — Membership
# ---------------------------------------------------------------------------


async def add_member(
    session: AsyncSession,
    team_id: UUID,
    user_id: UUID,
    role: str = "member",
) -> MemberRead:
    """Add a user to a team.

    Raises 404 if the user does not exist.
    Raises 409 if the user is already a member.
    """
    # Verify the target user exists
    user_stmt = select(User).where(User.id == user_id)
    user = (await session.exec(user_stmt)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Verify not already a member
    existing = await _get_membership(session, team_id, user_id)
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail="User is already a member of this team",
        )

    link = UserTeamLink(user_id=user_id, team_id=team_id, role=role)
    session.add(link)
    await session.flush()
    await session.refresh(link)

    # Attach the user relationship for serialization
    link.user = user

    return _map_link_to_member_read(link)


async def remove_member(
    session: AsyncSession,
    team_id: UUID,
    user_id: UUID,
) -> None:
    """Remove a user from a team.

    Raises 409 if *user_id* is the last owner.
    """
    link = await _get_membership(session, team_id, user_id)
    if link is None:
        raise HTTPException(status_code=404, detail="Member not found")

    # Guard: last owner
    if link.role == "owner":
        await _assert_not_last_owner(session, team_id, exclude_user_id=user_id)

    await session.delete(link)
    await session.flush()


async def update_member_role(
    session: AsyncSession,
    team_id: UUID,
    user_id: UUID,
    new_role: str,
) -> MemberRead:
    """Change a member's role.

    Raises 409 if demoting the last owner from ``owner``.
    """
    link = await _get_membership(session, team_id, user_id)
    if link is None:
        raise HTTPException(status_code=404, detail="Member not found")

    # Guard: last owner demotion
    if link.role == "owner" and new_role != "owner":
        await _assert_not_last_owner(session, team_id, exclude_user_id=user_id)

    link.role = new_role
    await session.flush()

    # Reload user relationship for serialization
    stmt = select(UserTeamLink).where(UserTeamLink.id == link.id).options(selectinload(UserTeamLink.user))
    link = (await session.exec(stmt)).first()

    return _map_link_to_member_read(link)


async def list_members(
    session: AsyncSession,
    team_id: UUID,
    *,
    skip: int = 0,
    limit: int = 10,
) -> tuple[int, list[MemberRead]]:
    """List team members with pagination.

    Returns ``(total_count, page)`` where *total_count* is the unfiltered
    member count (for accurate pagination metadata).
    """
    # Verify team exists (returns 404 if not)
    team = await _assert_team_exists(session, team_id)

    total_count = len(team.members)

    members_sorted = sorted(
        team.members,
        key=lambda m: (  # owners first, then admins, then members
            {"owner": 0, "admin": 1, "member": 2}.get(m.role, 3),
            m.created_at,
        ),
    )
    page = members_sorted[skip : skip + limit]
    return total_count, [_map_link_to_member_read(m) for m in page]


async def get_member_count(
    session: AsyncSession,
    team_id: UUID,
) -> int:
    """Return the number of members in a team."""
    stmt = select(func.count()).select_from(UserTeamLink).where(UserTeamLink.team_id == team_id)
    return (await session.exec(stmt)).first() or 0


# ---------------------------------------------------------------------------
# Dependency helpers (used by the API layer)
# ---------------------------------------------------------------------------


async def verify_team_membership(
    session: AsyncSession,
    team_id: UUID,
    user_id: UUID,
) -> tuple[Team, UserTeamLink]:
    """Fetch the team and the caller's membership in a single round-trip.

    Raises 404 if either the team does not exist or the user is not a member
    (information-leak-safe — non-members cannot distinguish "team exists" from
    "team does not exist").

    Returns ``(team, membership)``.
    """
    team = await _assert_team_exists(session, team_id)
    membership = await _get_membership(session, team_id, user_id)
    if membership is None:
        raise HTTPException(status_code=404, detail="Team not found")
    return team, membership
