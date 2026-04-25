import { db } from "../db/index.js";
import { worldAccessGrants, worlds, users, teams, usersToTeams, scenes, characters, locations } from "../db/schema.js";
import { eq, and, ilike } from "drizzle-orm";
import { generateId } from "#shared/utils/id.js";
import { BatchEntityInsertRequest, BatchEntityUpdateRequest } from "../types/index.js";
import { ProjectRepository } from "./project-repository.js";

export type EntityType = 'scene' | 'character' | 'location';

export class UsersAndTeamsDbService {

  async isUserMemberOfTeam(userId: string, teamId: string): Promise<boolean> {
    const membership = await db.query.usersToTeams.findFirst({
      where: { userId, teamId }
    });

    return !!membership;
  }

  async getTeams(userId: string) {
    const [user] = await db.query.users.findMany({
      where: { id: userId },
      with: { teams: true },
    });
    return user.teams;
  }

  async joinOrCreateTeam(userId: string, userEmail: string, name: string) {
    const [existingTeam] = await db
      .select()
      .from(teams)
      .where(ilike(teams.name, name))
      .limit(1);

    if (existingTeam) {
      await db.transaction(async (tx) => {
        await tx.insert(users).values({ id: userId, email: userEmail }).onConflictDoNothing();

        if (!await this.isUserMemberOfTeam(userId, existingTeam.id)) {
          await tx.insert(usersToTeams).values({ teamId: existingTeam.id, userId, role: 'member' });
        }
      });
      return { id: existingTeam.id, name: existingTeam.name, created: false };
    } else {
      const teamId = generateId();
      await db.transaction(async (tx) => {
        await tx.insert(users).values({ id: userId, email: userEmail }).onConflictDoNothing();
        const [newTeam] = await tx.insert(teams).values({ id: teamId, name }).returning();
        await tx.insert(usersToTeams).values({ teamId, userId, role: 'owner' });
      });
      return { id: teamId, name, created: true };
    }
  }
}

export const usersAndTeamsDbService = new UsersAndTeamsDbService();