"""Tests for the Teams API.

Uses the same fixture patterns as ``test_users.py``:

  * ``client`` — an ``httpx.AsyncClient`` pointed at the test app.
  * ``logged_in_headers`` — bearer token for ``active_user`` (non-superuser).
  * ``active_user`` — a pre-created active ``User``.
  * ``logged_in_headers_super_user`` — bearer token for a superuser.
"""

from fastapi import status
from httpx import AsyncClient

# ======================================================================
# Helpers
# ======================================================================

TEAMS_URL = "api/v1/teams"


async def _create_team(client: AsyncClient, headers: dict, name: str = "Test Team"):
    """Helper — create a team and return the JSON body."""
    resp = await client.post(TEAMS_URL, json={"name": name}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ======================================================================
# Team CRUD
# ======================================================================


class TestCreateTeam:
    async def test_create_team_success(self, client: AsyncClient, logged_in_headers):
        """A logged-in user can create a team and becomes the owner."""
        body = {"name": "My Team"}
        resp = await client.post(TEAMS_URL, json=body, headers=logged_in_headers)

        assert resp.status_code == status.HTTP_201_CREATED
        data = resp.json()
        assert data["name"] == "My Team"
        assert data["id"] is not None
        assert data["member_count"] == 1  # creator is the first member/owner
        assert "created_at" in data
        assert "updated_at" in data

    async def test_create_team_requires_auth(self, client: AsyncClient):
        """Unauthenticated requests are rejected."""
        resp = await client.post(TEAMS_URL, json={"name": "No Auth"})
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED


class TestListTeams:
    async def test_list_teams_empty(self, client: AsyncClient, logged_in_headers):
        """User with no teams gets an empty list."""
        resp = await client.get(TEAMS_URL, headers=logged_in_headers)

        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        assert data["total_count"] == 0
        assert data["teams"] == []

    async def test_list_teams_shows_owned_team(self, client: AsyncClient, logged_in_headers):
        """A team the user created appears in their list."""
        team = await _create_team(client, logged_in_headers)

        resp = await client.get(TEAMS_URL, headers=logged_in_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_count"] >= 1
        team_ids = [t["id"] for t in data["teams"]]
        assert team["id"] in team_ids

    async def test_list_teams_pagination(self, client: AsyncClient, logged_in_headers):
        """Pagination parameters are respected."""
        for i in range(3):
            await _create_team(client, logged_in_headers, name=f"Team {i}")

        resp = await client.get(TEAMS_URL, params={"skip": 0, "limit": 2}, headers=logged_in_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["teams"]) <= 2

    async def test_list_teams_search(self, client: AsyncClient, logged_in_headers):
        """Search filter narrows results by team name."""
        await _create_team(client, logged_in_headers, name="Alpha Squad")
        await _create_team(client, logged_in_headers, name="Beta Squad")
        await _create_team(client, logged_in_headers, name="Gamma Other")

        resp = await client.get(
            TEAMS_URL,
            params={"search": "Squad"},
            headers=logged_in_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_count"] >= 2


class TestGetTeam:
    async def test_get_team_as_member(self, client: AsyncClient, logged_in_headers):
        """A team member can retrieve team details."""
        team = await _create_team(client, logged_in_headers)

        resp = await client.get(f"{TEAMS_URL}/{team['id']}", headers=logged_in_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == team["id"]
        assert data["name"] == team["name"]

    async def test_get_team_non_member_404(self, client: AsyncClient, logged_in_headers, logged_in_headers_super_user):
        """Non-members get 404 (team existence is hidden)."""
        team = await _create_team(client, logged_in_headers)

        # Superuser *without* membership should also get 404
        resp = await client.get(
            f"{TEAMS_URL}/{team['id']}",
            headers=logged_in_headers_super_user,
        )
        assert resp.status_code == status.HTTP_404_NOT_FOUND

    async def test_get_team_not_found(self, client: AsyncClient, logged_in_headers):
        """Nonexistent team ID returns 404."""
        fake_id = "00000000-0000-0000-0000-000000000000"
        resp = await client.get(f"{TEAMS_URL}/{fake_id}", headers=logged_in_headers)
        assert resp.status_code == status.HTTP_404_NOT_FOUND


class TestUpdateTeam:
    async def test_update_name_as_owner(self, client: AsyncClient, logged_in_headers):
        """Owner can update the team name."""
        team = await _create_team(client, logged_in_headers)

        resp = await client.patch(
            f"{TEAMS_URL}/{team['id']}",
            json={"name": "Updated Team Name"},
            headers=logged_in_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated Team Name"

    async def test_update_name_non_member_404(
        self, client: AsyncClient, logged_in_headers, logged_in_headers_super_user
    ):
        """Non-members cannot update (404)."""
        team = await _create_team(client, logged_in_headers)

        resp = await client.patch(
            f"{TEAMS_URL}/{team['id']}",
            json={"name": "Hacked"},
            headers=logged_in_headers_super_user,
        )
        assert resp.status_code == status.HTTP_404_NOT_FOUND

    async def test_update_name_not_modified(self, client: AsyncClient, logged_in_headers):
        """Empty update returns 304."""
        team = await _create_team(client, logged_in_headers)

        resp = await client.patch(
            f"{TEAMS_URL}/{team['id']}",
            json={},
            headers=logged_in_headers,
        )
        assert resp.status_code == status.HTTP_304_NOT_MODIFIED


class TestDeleteTeam:
    async def test_delete_team_as_owner(self, client: AsyncClient, logged_in_headers):
        """Owner can delete the team."""
        team = await _create_team(client, logged_in_headers)

        resp = await client.delete(
            f"{TEAMS_URL}/{team['id']}",
            headers=logged_in_headers,
        )
        assert resp.status_code == status.HTTP_204_NO_CONTENT

        # Verify it's gone
        get_resp = await client.get(
            f"{TEAMS_URL}/{team['id']}",
            headers=logged_in_headers,
        )
        assert get_resp.status_code == status.HTTP_404_NOT_FOUND


# ======================================================================
# Membership
# ======================================================================


class TestAddMember:
    async def test_owner_can_add_member(
        self,
        client: AsyncClient,
        logged_in_headers,
        active_user,
        logged_in_headers_super_user,
        active_super_user,
    ):
        """Owner can add another user as a regular member."""
        team = await _create_team(client, logged_in_headers)

        member_user_id = str(active_super_user.id)  # Use superuser as the member target
        resp = await client.post(
            f"{TEAMS_URL}/{team['id']}/members",
            json={"user_id": member_user_id, "role": "member"},
            headers=logged_in_headers,
        )
        assert resp.status_code == status.HTTP_201_CREATED
        data = resp.json()
        assert data["user_id"] == member_user_id
        assert data["role"] == "member"
        assert data["user"]["username"] == active_super_user.username

    async def test_duplicate_member_409(
        self,
        client: AsyncClient,
        logged_in_headers,
        active_user,
        logged_in_headers_super_user,
        active_super_user,
    ):
        """Adding the same user twice returns 409."""
        team = await _create_team(client, logged_in_headers)
        member_user_id = str(active_super_user.id)

        # First add — OK
        await client.post(
            f"{TEAMS_URL}/{team['id']}/members",
            json={"user_id": member_user_id, "role": "member"},
            headers=logged_in_headers,
        )

        # Second add — conflict
        resp = await client.post(
            f"{TEAMS_URL}/{team['id']}/members",
            json={"user_id": member_user_id, "role": "member"},
            headers=logged_in_headers,
        )
        assert resp.status_code == status.HTTP_409_CONFLICT

    async def test_add_nonexistent_user_404(self, client: AsyncClient, logged_in_headers):
        """Adding a non-existent user returns 404."""
        team = await _create_team(client, logged_in_headers)
        fake_id = "00000000-0000-0000-0000-000000000000"

        resp = await client.post(
            f"{TEAMS_URL}/{team['id']}/members",
            json={"user_id": fake_id, "role": "member"},
            headers=logged_in_headers,
        )
        assert resp.status_code == status.HTTP_404_NOT_FOUND


class TestListMembers:
    async def test_list_members_includes_owner(self, client: AsyncClient, logged_in_headers, active_user):
        """Member list includes the creator (owner)."""
        team = await _create_team(client, logged_in_headers)

        resp = await client.get(
            f"{TEAMS_URL}/{team['id']}/members",
            headers=logged_in_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        user_ids = [m["user_id"] for m in data["members"]]
        assert str(active_user.id) in user_ids

    async def test_list_members_non_member_404(
        self, client: AsyncClient, logged_in_headers, logged_in_headers_super_user
    ):
        """Non-members cannot list members (404)."""
        team = await _create_team(client, logged_in_headers)

        resp = await client.get(
            f"{TEAMS_URL}/{team['id']}/members",
            headers=logged_in_headers_super_user,
        )
        assert resp.status_code == status.HTTP_404_NOT_FOUND


class TestUpdateMemberRole:
    async def test_owner_can_promote_to_admin(
        self,
        client: AsyncClient,
        logged_in_headers,
        logged_in_headers_super_user,
        active_super_user,
    ):
        """Owner can promote a member to admin."""
        team = await _create_team(client, logged_in_headers)
        member_user_id = str(active_super_user.id)

        # Add member
        await client.post(
            f"{TEAMS_URL}/{team['id']}/members",
            json={"user_id": member_user_id, "role": "member"},
            headers=logged_in_headers,
        )

        # Promote to admin
        resp = await client.patch(
            f"{TEAMS_URL}/{team['id']}/members/{member_user_id}",
            json={"role": "admin"},
            headers=logged_in_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["role"] == "admin"

    async def test_cannot_demote_last_owner(self, client: AsyncClient, logged_in_headers, active_user):
        """Demoting the last owner returns 409."""
        team = await _create_team(client, logged_in_headers)
        owner_user_id = str(active_user.id)

        resp = await client.patch(
            f"{TEAMS_URL}/{team['id']}/members/{owner_user_id}",
            json={"role": "member"},
            headers=logged_in_headers,
        )
        assert resp.status_code == status.HTTP_409_CONFLICT

    async def test_admin_cannot_demote_owner(
        self,
        client: AsyncClient,
        logged_in_headers,
        active_user,
        logged_in_headers_super_user,
        active_super_user,
    ):
        """An admin cannot demote an owner — only owners can."""
        team = await _create_team(client, logged_in_headers)
        owner_user_id = active_user.id  # logged_in_headers user is the owner

        # Add superuser as member and promote to admin
        await client.post(
            f"{TEAMS_URL}/{team['id']}/members",
            json={"user_id": str(active_super_user.id), "role": "member"},
            headers=logged_in_headers,
        )
        await client.patch(
            f"{TEAMS_URL}/{team['id']}/members/{active_super_user.id}",
            json={"role": "admin"},
            headers=logged_in_headers,
        )

        # Admin (superuser) tries to demote the owner
        resp = await client.patch(
            f"{TEAMS_URL}/{team['id']}/members/{owner_user_id}",
            json={"role": "member"},
            headers=logged_in_headers_super_user,
        )
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    async def test_admin_cannot_promote_to_owner(
        self,
        client: AsyncClient,
        logged_in_headers,
        logged_in_headers_super_user,
        active_super_user,
    ):
        """An admin cannot promote someone to owner — only owners can."""
        team = await _create_team(client, logged_in_headers)

        # Add superuser as member and promote to admin
        await client.post(
            f"{TEAMS_URL}/{team['id']}/members",
            json={"user_id": str(active_super_user.id), "role": "member"},
            headers=logged_in_headers,
        )
        await client.patch(
            f"{TEAMS_URL}/{team['id']}/members/{active_super_user.id}",
            json={"role": "admin"},
            headers=logged_in_headers,
        )

        # Admin (superuser) tries to promote another user to owner
        resp = await client.post(
            f"{TEAMS_URL}/{team['id']}/members",
            json={"user_id": str(active_super_user.id), "role": "owner"},
            headers=logged_in_headers_super_user,
        )
        assert resp.status_code == status.HTTP_403_FORBIDDEN


class TestRemoveMember:
    async def test_owner_can_remove_member(
        self,
        client: AsyncClient,
        logged_in_headers,
        logged_in_headers_super_user,
        active_super_user,
    ):
        """Owner can remove a member."""
        team = await _create_team(client, logged_in_headers)
        member_user_id = str(active_super_user.id)

        # Add member
        await client.post(
            f"{TEAMS_URL}/{team['id']}/members",
            json={"user_id": member_user_id, "role": "member"},
            headers=logged_in_headers,
        )

        # Remove
        resp = await client.delete(
            f"{TEAMS_URL}/{team['id']}/members/{member_user_id}",
            headers=logged_in_headers,
        )
        assert resp.status_code == status.HTTP_204_NO_CONTENT

    async def test_cannot_remove_last_owner(self, client: AsyncClient, logged_in_headers, active_user):
        """Removing the last owner returns 409."""
        team = await _create_team(client, logged_in_headers)
        owner_user_id = str(active_user.id)

        resp = await client.delete(
            f"{TEAMS_URL}/{team['id']}/members/{owner_user_id}",
            headers=logged_in_headers,
        )
        assert resp.status_code == status.HTTP_409_CONFLICT

    async def test_self_removal(
        self,
        client: AsyncClient,
        logged_in_headers,
        logged_in_headers_super_user,
        active_super_user,
    ):
        """A user can remove themselves from a team."""
        team = await _create_team(client, logged_in_headers)
        member_user_id = str(active_super_user.id)

        # Add superuser as a member
        await client.post(
            f"{TEAMS_URL}/{team['id']}/members",
            json={"user_id": member_user_id, "role": "member"},
            headers=logged_in_headers,
        )

        # Self-removal via superuser's own auth
        resp = await client.delete(
            f"{TEAMS_URL}/{team['id']}/members/{member_user_id}",
            headers=logged_in_headers_super_user,
        )
        assert resp.status_code == status.HTTP_204_NO_CONTENT

    async def test_admin_cannot_remove_owner(
        self,
        client: AsyncClient,
        logged_in_headers,
        active_user,
        logged_in_headers_super_user,
        active_super_user,
    ):
        """Admin cannot remove an owner — only owners can."""
        team = await _create_team(client, logged_in_headers)
        owner_user_id = active_user.id

        # Add superuser as admin
        await client.post(
            f"{TEAMS_URL}/{team['id']}/members",
            json={"user_id": str(active_super_user.id), "role": "member"},
            headers=logged_in_headers,
        )
        await client.patch(
            f"{TEAMS_URL}/{team['id']}/members/{active_super_user.id}",
            json={"role": "admin"},
            headers=logged_in_headers,
        )

        # Admin tries to remove the owner
        resp = await client.delete(
            f"{TEAMS_URL}/{team['id']}/members/{owner_user_id}",
            headers=logged_in_headers_super_user,
        )
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    async def test_non_member_removal_404(self, client: AsyncClient, logged_in_headers, logged_in_headers_super_user):
        """A non-member cannot remove others (404, not 403)."""
        team = await _create_team(client, logged_in_headers)

        # Superuser is not a member — should get 404 on the team
        some_other_id = "00000000-0000-0000-0000-000000000000"
        resp = await client.delete(
            f"{TEAMS_URL}/{team['id']}/members/{some_other_id}",
            headers=logged_in_headers_super_user,
        )
        assert resp.status_code == status.HTTP_404_NOT_FOUND
