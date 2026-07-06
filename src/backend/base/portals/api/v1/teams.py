"""Teams API — team CRUD and membership management.

Every endpoint enforces role-based access control (RBAC):

  * **Owner** … full control (delete team, change any role, add/remove).
  * **Admin** … can manage members (except owners) and update team name.
  * **Member** … read-only access to team info and member list.
  * **Non-member** … 404 (team existence is not leaked).
"""

from uuid import UUID

from fastapi import APIRouter, HTTPException
from px.log.logger import logger
from sqlalchemy.orm import selectinload
from sqlmodel import select

from portals.api.utils import CurrentActiveUser, DbSession
from portals.services.database.models.teams.crud import (
    add_member,
    create_team,
    delete_team,
    get_member_link,
    get_teams_for_user,
    list_members,
    remove_member,
    update_member_role,
    update_team,
    verify_team_membership,
)
from portals.services.database.models.teams.model import (
    MemberAdd,
    MemberRead,
    MembersResponse,
    MemberUpdate,
    Team,
    TeamCreate,
    TeamRead,
    TeamsResponse,
    TeamUpdate,
    UserTeamLink,
)

router = APIRouter(tags=["Teams"], prefix="/teams")

# ---------------------------------------------------------------------------
# Team CRUD
# ---------------------------------------------------------------------------


@router.post("/", response_model=TeamRead, status_code=201)
async def add_team(
    team_create: TeamCreate,
    session: DbSession,
    current_user: CurrentActiveUser,
) -> Team:
    """Create a new team. The calling user becomes the initial **owner**."""
    team = await create_team(session, team_create, current_user.id)

    # Reload with members for the member_count
    stmt = select(Team).where(Team.id == team.id).options(selectinload(Team.members).selectinload(UserTeamLink.user))
    team = (await session.exec(stmt)).first()

    return TeamRead(
        id=team.id,
        name=team.name,
        created_at=team.created_at,
        updated_at=team.updated_at,
        member_count=len(team.members),
        role="owner",  # Creator is always the owner
    )


@router.get("/", response_model=TeamsResponse)
async def read_all_teams(
    *,
    skip: int = 0,
    limit: int = 10,
    search: str | None = None,
    session: DbSession,
    current_user: CurrentActiveUser,
) -> TeamsResponse:
    """List all teams the current user is a member of, with pagination."""
    return await get_teams_for_user(
        session,
        current_user.id,
        skip=skip,
        limit=limit,
        search=search,
    )


@router.get("/{team_id}", response_model=TeamRead)
async def read_team(
    team_id: UUID,
    session: DbSession,
    current_user: CurrentActiveUser,
) -> Team:
    """Get a single team's details. Accessible to members only."""
    team, _membership = await verify_team_membership(session, team_id, current_user.id)
    return TeamRead(
        id=team.id,
        name=team.name,
        created_at=team.created_at,
        updated_at=team.updated_at,
        member_count=len(team.members),
    )


@router.patch("/{team_id}", response_model=TeamRead)
async def patch_team(
    team_id: UUID,
    team_update: TeamUpdate,
    session: DbSession,
    current_user: CurrentActiveUser,
) -> Team:
    """Update a team's name. Requires **owner** or **admin** role."""
    team, membership = await verify_team_membership(session, team_id, current_user.id)

    if membership.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    team = await update_team(session, team, team_update)
    return TeamRead(
        id=team.id,
        name=team.name,
        created_at=team.created_at,
        updated_at=team.updated_at,
        member_count=len(team.members),
    )


@router.delete("/{team_id}", status_code=204)
async def remove_team(
    team_id: UUID,
    session: DbSession,
    current_user: CurrentActiveUser,
) -> None:
    """Delete a team. Requires **owner** role (cascades to all members)."""
    _team, membership = await verify_team_membership(session, team_id, current_user.id)

    if membership.role != "owner":
        raise HTTPException(status_code=403, detail="Only team owners can delete the team")

    await delete_team(session, team_id)
    logger.info(f"Team {team_id} deleted by user {current_user.id}")


# ---------------------------------------------------------------------------
# Membership management
# ---------------------------------------------------------------------------


@router.get("/{team_id}/members", response_model=MembersResponse)
async def read_members(
    team_id: UUID,
    *,
    skip: int = 0,
    limit: int = 10,
    session: DbSession,
    current_user: CurrentActiveUser,
) -> MembersResponse:
    """List team members. Accessible to all team members."""
    await verify_team_membership(session, team_id, current_user.id)

    total_count, members = await list_members(session, team_id, skip=skip, limit=limit)

    return MembersResponse(
        total_count=total_count,
        members=members,
    )


@router.post("/{team_id}/members", response_model=MemberRead, status_code=201)
async def add_team_member(
    team_id: UUID,
    member_add: MemberAdd,
    session: DbSession,
    current_user: CurrentActiveUser,
) -> MemberRead:
    """Add a user to the team. Requires **owner** or **admin** role."""
    _team, membership = await verify_team_membership(session, team_id, current_user.id)

    if membership.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    # Only owners can assign the 'owner' role
    if member_add.role == "owner" and membership.role != "owner":
        raise HTTPException(status_code=403, detail="Only owners can assign the owner role")

    return await add_member(session, team_id, member_add.user_id, member_add.role)


@router.patch("/{team_id}/members/{user_id}", response_model=MemberRead)
async def patch_member_role(
    team_id: UUID,
    user_id: UUID,
    member_update: MemberUpdate,
    session: DbSession,
    current_user: CurrentActiveUser,
) -> MemberRead:
    """Change a member's role. Requires **owner** or **admin** role.

    * Only owners can promote someone to ``owner`` or demote an owner.
    * Admins can change ``member`` ↔ ``admin`` roles.
    * Prevents removing the last owner.
    """
    _team, membership = await verify_team_membership(session, team_id, current_user.id)

    if membership.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    # Fetch the target's current role to enforce owner-scoped changes
    target_link = await get_member_link(session, team_id, user_id)
    if target_link is None:
        raise HTTPException(status_code=404, detail="Member not found")

    # Only owners can change roles that involve 'owner' status
    target_is_currently_owner = target_link.role == "owner"
    target_becoming_owner = member_update.role == "owner"

    if (target_is_currently_owner or target_becoming_owner) and membership.role != "owner":
        raise HTTPException(
            status_code=403,
            detail="Only owners can change the owner role",
        )

    return await update_member_role(session, team_id, user_id, member_update.role)


@router.delete("/{team_id}/members/{user_id}", status_code=204)
async def remove_team_member(
    team_id: UUID,
    user_id: UUID,
    session: DbSession,
    current_user: CurrentActiveUser,
) -> None:
    """Remove a member from the team.

    * Users can remove **themselves** (self-serve leave).
    * **Owners** and **admins** can remove any non-owner member.
    * Prevents removing the last owner.
    """
    is_self_removal = user_id == current_user.id

    if not is_self_removal:
        # Verify caller has permissions to remove others
        _team, membership = await verify_team_membership(session, team_id, current_user.id)
        if membership.role not in ("owner", "admin"):
            raise HTTPException(status_code=403, detail="Insufficient permissions")

        # Only owners can remove other owners
        target_link = await get_member_link(session, team_id, user_id)
        if target_link and target_link.role == "owner" and membership.role != "owner":
            raise HTTPException(
                status_code=403,
                detail="Only owners can remove other owners",
            )

    await remove_member(session, team_id, user_id)
    logger.info(
        f"User {user_id} removed from team {team_id} by user {current_user.id}",
    )
