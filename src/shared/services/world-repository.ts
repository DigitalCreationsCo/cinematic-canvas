import { db } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq, and, or, inArray, sql } from "drizzle-orm";
import { World, InsertWorld } from "../types/index.js";
import { v7 as uuidv7 } from "uuid";

const { usersToWorlds, usersToTeams, worlds, tagRegistry, worldAccessGrants, characters, locations, props, assetEntries, assetVersions } = schema;

export interface HydrationPayload {
  handle: string;
  name: string;
  description: string | null;
  traits: any | null;
  state: any | null;
  visualSeedData: string | null;
}

export class WorldRepository {
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
      const worldId = uuidv7();
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

  async getWorldEntities(
    worldId: string,
    tx: typeof db = db
  ) {
    if (!tx) throw new Error("Database not initialized");

    const projectsInWorld = await tx
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(eq(schema.projects.worldId, worldId));

    const projectIds = projectsInWorld.map(p => p.id);

    if (projectIds.length === 0) {
      return { characters: [], locations: [], scenes: [] };
    }

    const characters = await tx
      .select()
      .from(schema.characters)
      .where(inArray(schema.characters.projectId, projectIds));

    const locations = await tx
      .select()
      .from(schema.locations)
      .where(inArray(schema.locations.projectId, projectIds));

    return {
      characters,
      locations,
    };
  }

  /**
 * Validates which handles in a list are actually accessible to the user
 * given the current project context and their world licenses.
 */
  async verifyHandleAccessBulk(
    userId: string,
    projectId: string,
    handles: string[],
    tx: typeof db = db
  ): Promise<string[]> {
    if (handles.length === 0) return [];

    const results = await tx
      .select({ handle: tagRegistry.handle })
      .from(tagRegistry)
      // Join with world access if the tag is world-scoped
      .leftJoin(schema.worldAccessGrants, and(
        eq(schema.worldAccessGrants.worldId, tagRegistry.worldId),
        eq(schema.worldAccessGrants.userId, userId)
      ))
      .where(
        and(
          inArray(tagRegistry.handle, handles),
          or(
            eq(tagRegistry.projectId, projectId), // Local to project
            sql`${schema.worldAccessGrants.id} IS NOT NULL` // Licensed World Entity
          )
        )
      );

    return results.map(r => r.handle);
  }

  /**
   * Retrieves the comprehensive context payload for authorized entities.
   * Uses lateral joins/coalesce to unify polymorphic entities (Characters, Props, Locations).
   */
  async getHydrationPayloadsBulk(
    arrayHandlesAuthorized: string[],
    tx: typeof db = db
  ): Promise<HydrationPayload[]> {
    if (arrayHandlesAuthorized.length === 0) return [];

    const recordsPayloads = await tx
      .select({
        handle: tagRegistry.handle,
        entityType: tagRegistry.entityType,
        charName: characters.name,
        charDesc: sql<string>`${characters.physicalTraits}->>'appearanceNotes'`,
        charTraits: characters.physicalTraits,
        charState: characters.state,
        locName: locations.name,
        locDesc: locations.type,
        locState: locations.state,
        propName: props.name,
        propDesc: props.description,
        bestAssetData: assetVersions.data
      })
      .from(tagRegistry)
      .leftJoin(characters, and(eq(tagRegistry.entityType, 'character'), eq(tagRegistry.entityId, characters.id)))
      .leftJoin(locations, and(eq(tagRegistry.entityType, 'location'), eq(tagRegistry.entityId, locations.id)))
      .leftJoin(props, and(eq(tagRegistry.entityType, 'prop'), eq(tagRegistry.entityId, props.id)))
      // Fetch the 'best' visual seed from asset history
      .leftJoin(assetEntries, and(
        inArray(assetEntries.assetKey, ['character_image', 'location_image', 'image_file']),
        or(
          eq(assetEntries.characterId, characters.id),
          eq(assetEntries.locationId, locations.id),
          eq(assetEntries.fileId, props.id) // Assuming props act as files/assets
        )
      ))
      .leftJoin(assetVersions, and(
        eq(assetVersions.assetEntryId, assetEntries.id),
        eq(assetVersions.version, assetEntries.best)
      ))
      .where(inArray(tagRegistry.handle, arrayHandlesAuthorized));

    return recordsPayloads.map(r => ({
      handle: r.handle,
      name: r.charName || r.locName || r.propName || 'Unknown Entity',
      description: r.charDesc || r.locDesc || r.propDesc,
      traits: r.charTraits || null,
      state: r.charState || r.locState || null,
      visualSeedData: r.bestAssetData || null
    }));
  }
}
