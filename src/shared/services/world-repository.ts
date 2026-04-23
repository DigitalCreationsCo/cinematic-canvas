import { db } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq, or, inArray } from "drizzle-orm";
import { CharacterWithAssets, LocationWithAssets, World } from "../types/index.js";
import { generateId } from "#shared/utils/id.js";
import { ProjectRepository } from "#shared/services/project-repository.js";

const { usersToWorlds, usersToTeams } = schema;

export class WorldRepository {

  projectRepository = new ProjectRepository();

  async createWorld(
    data: {
      name: string;
      description: string;
      teamId: string;
      userId: string;
    },
    tx: typeof db = db
  ): Promise<World> {
    if (!tx) throw new Error("Database not initialized");

    return await tx.transaction(async (innerTx) => {
      const worldId = generateId();
      const worldRepositoryId = `@${data.name}`;

      const [world] = await innerTx
        .insert(schema.worlds)
        .values({
          id: worldId,
          name: data.name,
          description: data.description,
          teamId: data.teamId,
          worldRepository: worldRepositoryId,
        })
        .returning();

      await innerTx.insert(schema.usersToWorlds).values({
        userId: data.userId,
        worldId: worldId,
        accessLevel: "write",
      });

      return world;
    });
  }

  async getWorldsForUser(
    userId: string,
    tx: typeof db = db
  ): Promise<World[]> {
    if (!tx) throw new Error("Database not initialized");

    // Get the teams the user is a part of
    const userTeams = await tx
      .select({ teamId: usersToTeams.teamId })
      .from(usersToTeams)
      .where(eq(usersToTeams.userId, userId));

    const teamIds = userTeams.map((ut) => ut.teamId);

    const worlds = await tx
      .select()
      .from(schema.worlds)
      .leftJoin(usersToWorlds, eq(schema.worlds.id, usersToWorlds.worldId))
      .where(
        or(
          teamIds.length > 0 ? inArray(schema.worlds.teamId, teamIds) : undefined,
          eq(usersToWorlds.userId, userId)
        )
      );

    // The result from the join is { worlds, usersToWorlds }, we only want the worlds part, and unique worlds
    return Object.values(worlds.reduce((acc, { worlds }) => {
      acc[worlds.id] = worlds;
      return acc;
    }, {} as Record<string, World>));
  }

  /**
   * Get all entities for a world
   * @param worldId The ID of the world
   * @param tx The database transaction
   * @returns An object containing all entities for the world
   */
  async getWorldEntities(
    worldId: string,
    tx: typeof db = db
  ): Promise<{ characters: CharacterWithAssets[], locations: LocationWithAssets[] }> {
    if (!tx) throw new Error("Database not initialized");

    const characters = await this.projectRepository.getProjectCharacters(worldId, tx);
    const locations = await this.projectRepository.getProjectLocations(worldId, tx);

    return {
      characters,
      locations,
    };
  }
}
