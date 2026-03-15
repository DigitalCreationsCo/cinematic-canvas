import { db } from "../db/index.js";
import { worldAccessGrants, worlds, users, teams, usersToTeams, scenes, characters, locations } from "../db/schema.js";
import { eq, and, ilike } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

export class UsersAndTeamsDbService {
  async getWorldAccessGrant(worldId: string, userId: string) {
    const grants = await db
      .select()
      .from(worldAccessGrants)
      .where(
        and(
          eq(worldAccessGrants.worldId, worldId),
          eq(worldAccessGrants.userId, userId)
        )
      )
      .limit(1);

    return grants[0];
  }

  async updateWorldSacRepo(worldId: string, sacRepoId: string, sacRepoUrl: string) {
    await db.update(worlds).set({ sacRepoId, sacRepoUrl }).where(eq(worlds.id, worldId));
  }

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
      const teamId = uuidv7();
      await db.transaction(async (tx) => {
        await tx.insert(users).values({ id: userId, email: userEmail }).onConflictDoNothing();
        const [newTeam] = await tx.insert(teams).values({ id: teamId, name }).returning();
        await tx.insert(usersToTeams).values({ teamId, userId, role: 'owner' });
      });
      return { id: teamId, name, created: true };
    }
  }

  async patchEntities(updates: any[]) {
    return await db.transaction(async (tx) => {
      const updatedEntities: any[] = [];
      for (const update of updates) {
        const { entityId, entityType, patch } = update;
        let table: any;
        if (entityType === 'scene') table = scenes;
        else if (entityType === 'character') table = characters;
        else if (entityType === 'location') table = locations;
        else continue;

        await tx.update(table).set({ ...patch, updatedAt: new Date() }).where(eq(table.id, entityId));

        updatedEntities.push({
          entityId,
          entityType,
          entity: patch
        });
      }
      return updatedEntities;
    });
  }

  async createEntity(type: string, projectId: string, data: any) {
    let table: any;
    if (type === 'character') table = characters;
    else if (type === 'location') table = locations;
    else if (type === 'scene') table = scenes;
    else throw new Error("Invalid entity type");

    const newId = uuidv7();
    const insertData = { ...data, id: newId, projectId };

    const result = await db.insert(table).values(insertData).returning();
    const newEntity = (result as any[])[0];
    return newEntity;
  }
}

export const usersAndTeamsDbService = new UsersAndTeamsDbService();