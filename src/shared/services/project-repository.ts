import { db } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq, and, inArray, sql, isNull, or } from "drizzle-orm";
import {
  Scene,
  Location,
  Project,
  Character,
  ProjectEntity,
  InsertScene,
  InsertCharacter,
  InsertLocation,
  InsertProject,
  EntityType,
  AssetHistory,
  AssetRegistry,
  SceneQueryResult,
  SceneToCharacterJoinInsert,
  sceneQueryResultToDomain,
  UpdateScene,
} from "../types/index.js";
import {
  mapDbProjectToDomain,
} from "../domain/project-mappers.js";
import {
  mapDomainSceneToInsertSceneDb,
} from "../domain/scene-mappers.js";
import {
  extractCharacterJoins,
  mapDbCharacterToDomain,
  mapDomainCharacterToInsertCharacterDb,
} from "../domain/character-mappers.js";
import {
  mapDbLocationToDomain,
  mapDomainLocationToInsertLocationDb,
} from "../domain/location-mappers.js";
import { getTableColumns } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";

type DbTransaction = Omit<typeof db, "$client">;

const {
  scenes,
  projects,
  characters,
  locations,
  scenesToCharacters,
  assetEntries, 
  assetVersions,
  usersToProjects,
  usersToTeams
} = schema;

/**
 * Helper to dynamically build the 'set' clause for upserts
 */
function buildConflictUpdateColumns(
  table: any,
  excludeColumns: string[] = []
) {
  const columns = getTableColumns(table);
  const updateSet: Record<string, any> = {};

  Object.entries(columns as Record<string, any>).forEach(
    ([ drizzleName, columnObj ]) => {
      const dbName = columnObj.name;
      if (excludeColumns.includes(dbName)) return;
      updateSet[ drizzleName ] = sql.raw(`excluded.${dbName}`);
    }
  );

  return updateSet;
}

/**
 * Ensures IDs are sorted to prevent deadlocks when acquiring row locks
 */
function sortIdsForLocking(ids: string[]): string[] {
  return [...ids].sort();
}

/**
 * Standardized pattern for querying scenes with character relationships
 * Returns minimal data: scene columns + character IDs only
 */
async function querySceneWithRelationships(
  tx: DbTransaction,
  sceneId: string
): Promise<SceneQueryResult> {
  const result = await tx.query.scenes.findFirst({
    where: { id: sceneId },
    with: {
      characters: {
        columns: { id: true },
      },
    },
  });

  if (!result) {
    throw new Error(`Scene ${sceneId} not found`);
  }

  return SceneQueryResult.parse(result);
}

/**
 * Standardized pattern for querying multiple scenes with relationships
 */
async function queryScenesWithRelationships(
  tx: DbTransaction,
  projectId: string
): Promise<SceneQueryResult[]> {
  const results = await tx.query.scenes.findMany({
    where: { projectId },
    orderBy: { sceneIndex: "asc" },
    with: {
      characters: {
        columns: { id: true },
      },
    },
  });

  return results.map((r) => SceneQueryResult.parse(r));
}

/**
 * Standardized pattern for managing scene-character relationships
 * Replaces all character associations for given scenes
 */
async function replaceSceneCharacterRelationships(
  tx: DbTransaction,
  sceneCharacterJoins: SceneToCharacterJoinInsert[]
): Promise<void> {
  if (sceneCharacterJoins.length === 0) return;

  const sceneIds = [...new Set(sceneCharacterJoins.map((j) => j.sceneId))];

  // Delete existing relationships for these scenes
  await tx
    .delete(scenesToCharacters)
    .where(inArray(scenesToCharacters.sceneId, sceneIds));

  // Insert new relationships
  if (sceneCharacterJoins.length > 0) {
    await tx.insert(scenesToCharacters).values(sceneCharacterJoins);
  }
}

export class ProjectRepository {
  // ==========================================================================
  // PROJECT QUERIES
  // ==========================================================================

  /**
   * Checks if an entity is still active and exists.
   * Used by workers to bail early if a user deleted the scene/project mid-task.
   */
  async isEntityActive(type: EntityType, id: string): Promise<boolean> {
    if (!db) throw new Error("Database not initialized");

    const table = type === 'scene' ? scenes : projects;
    const result = await db
      .select({ id: sql`id` })
      .from(table)
      .where(eq(sql`id`, id))
      .limit(1);

    return result.length > 0;
  }

  /**
   * Get project list (minimal data for listing)
   */
  async getProjects() {
    if (!db) throw new Error("Database not initialized");

    const records = await db
      .select({
        id: projects.id,
        metadata: { title: sql`${projects.metadata}->>'title'`.as("title") },
      })
      .from(projects);
    return records;
  }

  /**
   * Get project list (minimal data for listing) for a specific user and optional worldId
   */
  async getProjectsForUser(userId: string, worldId?: string) {
    if (!db) throw new Error("Database not initialized");

    return db.transaction(async (tx) => {
      const userTeams = await tx
        .select({ teamId: usersToTeams.teamId })
        .from(usersToTeams)
        .where(eq(usersToTeams.userId, userId));

      const teamIds = userTeams.map((ut) => ut.teamId);

      const records = await tx
        .select({
          id: projects.id,
          metadata: { title: sql`${projects.metadata}->>'title'`.as("title") },
        })
        .from(projects)
        .leftJoin(usersToProjects, eq(projects.id, usersToProjects.projectId))
        .where(
          or(
            teamIds.length > 0 ? inArray(projects.teamId, teamIds) : undefined,
            eq(usersToProjects.userId, userId),
            worldId ? eq(projects.worldId, worldId) : undefined
          )
        );
      return records;
    });
  }

  /**
   * Get project entity with LITE asset payload.
   * Fetches only asset metadata (head, best) without version data.
   * Use this for project loading and list views.
   */
  async getProject(
    projectId: string,
    tx: DbTransaction = db
  ): Promise<ProjectEntity> {
    if (!tx) throw new Error("Database not initialized");

    const [record] = await tx
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!record) throw new Error(`Project ${projectId} not found`);

    // Fetch lite asset payload (entries only, no versions)
    const assets = await this.fetchProjectAssetsLite(projectId, tx);

    return {
      ...ProjectEntity.parse(record),
      assets,
    };
  }

  /**
   * Get complete project state with all relationships hydrated.
   * Uses FULL asset payload with all version history.
   * Use this for detailed project views and editing.
   */
  async getProjectFullState(
    projectId: string,
    tx: DbTransaction = db
  ): Promise<Project> {
    if (!tx) throw new Error("Database not initialized");

    const projectEntity = await this.getProject(projectId, tx);

    const [dbScenesWithCharIds, dbChars, dbLocs] = await Promise.all([
      queryScenesWithRelationships(tx, projectId),
      tx.query.characters.findMany({ where: { projectId } }),
      tx.query.locations.findMany({ where: { projectId } }),
    ]);

    // Fetch full asset payloads for all entities
    const [
      projectAssetsFull,
      sceneAssetsFull,
      characterAssetsFull,
      locationAssetsFull,
    ] = await Promise.all([
      this.fetchProjectAssetsFull(projectId, tx),
      this.fetchSceneAssetsFull(
        dbScenesWithCharIds.map((s) => s.id),
        tx
      ),
      this.fetchCharacterAssetsFull(dbChars.map((c) => c.id), tx),
      this.fetchLocationAssetsFull(dbLocs.map((l) => l.id), tx),
    ]);

    const domainScenes = dbScenesWithCharIds.map((s, i) =>
      sceneQueryResultToDomain({
        ...s,
        assets: sceneAssetsFull[i] || {},
      })
    );

    const domainCharacters = dbChars.map((c, i) =>
      mapDbCharacterToDomain({
        ...c,
        assets: characterAssetsFull[i] || {},
      })
    );

    const domainLocations = dbLocs.map((l, i) =>
      mapDbLocationToDomain({
        ...l,
        assets: locationAssetsFull[i] || {},
      })
    );

    return {
      ...projectEntity,
      assets: projectAssetsFull,
      scenes: domainScenes,
      characters: domainCharacters,
      locations: domainLocations,
    };
  }

  /**
   * Manifest is a light payload.
   * Returns a map of OwnerID -> AssetKey -> Pointers. No data payloads.
   */
  async getProjectManifest(projectId: string): Promise<{
    project: AssetRegistry;
    scenes: Record<string, AssetRegistry>;
    characters: Record<string, AssetRegistry>;
    locations: Record<string, AssetRegistry>;
  }> {
    // Fetch all asset entries for this project (lite mode)
    const allEntries = await db
      .select()
      .from(assetEntries)
      .where(eq(assetEntries.projectId, projectId));

    const manifest = {
      project: {} as AssetRegistry,
      scenes: {} as Record<string, AssetRegistry>,
      characters: {} as Record<string, AssetRegistry>,
      locations: {} as Record<string, AssetRegistry>,
    };

    for (const entry of allEntries) {
      const history: AssetHistory = {
        head: entry.head,
        best: entry.best,
        versions: [], // Manifest doesn't include version data
      };

      if (entry.sceneId) {
        if (!manifest.scenes[entry.sceneId]) {
          manifest.scenes[entry.sceneId] = {};
        }
        manifest.scenes[entry.sceneId][entry.assetKey] = history;
      } else if (entry.characterId) {
        if (!manifest.characters[entry.characterId]) {
          manifest.characters[entry.characterId] = {};
        }
        manifest.characters[entry.characterId][entry.assetKey] = history;
      } else if (entry.locationId) {
        if (!manifest.locations[entry.locationId]) {
          manifest.locations[entry.locationId] = {};
        }
        manifest.locations[entry.locationId][entry.assetKey] = history;
      } else {
        // Project-level asset
        manifest.project[entry.assetKey] = history;
      }
    }

    return manifest;
  }

  // ==========================================================================
  // ASSET FETCHING (PRIVATE HELPERS)
  // ==========================================================================

  /**
   * Fetch LITE project assets (entries only, no versions).
   */
  private async fetchProjectAssetsLite(
    projectId: string,
    tx: DbTransaction = db
  ): Promise<AssetRegistry> {
    const entries = await tx
      .select()
      .from(assetEntries)
      .where(
        and(
          eq(assetEntries.projectId, projectId),
          isNull(assetEntries.sceneId),
          isNull(assetEntries.characterId),
          isNull(assetEntries.locationId)
        )
      );

    const registry: AssetRegistry = {};
    for (const entry of entries) {
      registry[entry.assetKey] = {
        head: entry.head,
        best: entry.best,
        versions: [],
      };
    }
    return registry;
  }

  /**
   * Fetch FULL project assets (entries + all versions).
   */
  private async fetchProjectAssetsFull(
    projectId: string,
    tx: DbTransaction = db
  ): Promise<AssetRegistry> {
    const results = await tx
      .select({
        entry: assetEntries,
        version: assetVersions,
      })
      .from(assetEntries)
      .leftJoin(
        assetVersions,
        eq(assetVersions.assetEntryId, assetEntries.id)
      )
      .where(
        and(
          eq(assetEntries.projectId, projectId),
          isNull(assetEntries.sceneId),
          isNull(assetEntries.characterId),
          isNull(assetEntries.locationId)
        )
      );

    return this.buildRegistryFromResults(results);
  }

  /**
   * Fetch FULL scene assets for multiple scenes.
   */
  private async fetchSceneAssetsFull(
    sceneIds: string[],
    tx: DbTransaction = db
  ): Promise<AssetRegistry[]> {
    if (sceneIds.length === 0) return [];

    const results = await tx
      .select({
        entry: assetEntries,
        version: assetVersions,
      })
      .from(assetEntries)
      .leftJoin(
        assetVersions,
        eq(assetVersions.assetEntryId, assetEntries.id)
      )
      .where(inArray(assetEntries.sceneId, sceneIds));

    // Group by scene ID
    const byScene = new Map<string, typeof results>();
    for (const row of results) {
      const sceneId = row.entry.sceneId!;
      if (!byScene.has(sceneId)) {
        byScene.set(sceneId, []);
      }
      byScene.get(sceneId)!.push(row);
    }

    // Return in original order
    return sceneIds.map(
      (id) => this.buildRegistryFromResults(byScene.get(id) || [])
    );
  }

  /**
   * Fetch FULL character assets for multiple characters.
   */
  private async fetchCharacterAssetsFull(
    characterIds: string[],
    tx: DbTransaction = db
  ): Promise<AssetRegistry[]> {
    if (characterIds.length === 0) return [];

    const results = await tx
      .select({
        entry: assetEntries,
        version: assetVersions,
      })
      .from(assetEntries)
      .leftJoin(
        assetVersions,
        eq(assetVersions.assetEntryId, assetEntries.id)
      )
      .where(inArray(assetEntries.characterId, characterIds));

    const byCharacter = new Map<string, typeof results>();
    for (const row of results) {
      const characterId = row.entry.characterId!;
      if (!byCharacter.has(characterId)) {
        byCharacter.set(characterId, []);
      }
      byCharacter.get(characterId)!.push(row);
    }

    return characterIds.map(
      (id) => this.buildRegistryFromResults(byCharacter.get(id) || [])
    );
  }

  /**
   * Fetch FULL location assets for multiple locations.
   */
  private async fetchLocationAssetsFull(
    locationIds: string[],
    tx: DbTransaction = db
  ): Promise<AssetRegistry[]> {
    if (locationIds.length === 0) return [];

    const results = await tx
      .select({
        entry: assetEntries,
        version: assetVersions,
      })
      .from(assetEntries)
      .leftJoin(
        assetVersions,
        eq(assetVersions.assetEntryId, assetEntries.id)
      )
      .where(inArray(assetEntries.locationId, locationIds));

    const byLocation = new Map<string, typeof results>();
    for (const row of results) {
      const locationId = row.entry.locationId!;
      if (!byLocation.has(locationId)) {
        byLocation.set(locationId, []);
      }
      byLocation.get(locationId)!.push(row);
    }

    return locationIds.map(
      (id) => this.buildRegistryFromResults(byLocation.get(id) || [])
    );
  }

  /**
   * Build AssetRegistry from JOIN results.
   */
  private buildRegistryFromResults(
    results: Array<{
      entry: typeof assetEntries.$inferSelect;
      version: typeof assetVersions.$inferSelect | null;
    }>
  ): AssetRegistry {
    const registry: AssetRegistry = {};
    const entriesMap = new Map<
      string,
      {
        entry: typeof assetEntries.$inferSelect;
        versions: (typeof assetVersions.$inferSelect)[];
      }
    >();

    // Group versions by entry
    for (const row of results) {
      const entryId = row.entry.id;
      if (!entriesMap.has(entryId)) {
        entriesMap.set(entryId, {
          entry: row.entry,
          versions: [],
        });
      }
      if (row.version) {
        entriesMap.get(entryId)!.versions.push(row.version);
      }
    }

    // Build registry
    for (const { entry, versions } of entriesMap.values()) {
      registry[entry.assetKey] = {
        head: entry.head,
        best: entry.best,
        versions: versions.map((v) => ({
          version: v.version,
          data: v.data,
          type: v.type,
          metadata: v.metadata,
          createdAt: v.createdAt,
        })),
      };
    }

    return registry;
  }

  // ==========================================================================
  // PROJECT MUTATIONS
  // ==========================================================================

  async createProject(
    projectData: z.input<typeof InsertProject>,
    tx: DbTransaction = db
  ): Promise<Project> {
    if (!tx) throw new Error("Database not initialized");

    return await tx.transaction(async (innerTx) => {

        projectData.id  = projectData.id || uuidv7();

      const charactersData = (projectData.characters ?? []).map((c) => InsertCharacter.parse({
        ...c,
        projectId: projectData.id,
      }));

      const locationsData = (projectData.locations?? []).map((l) => InsertLocation.parse({
        ...l,
        projectId: projectData.id,
      }));

      const scenesData = (projectData.scenes??[]).map((s, idx) => InsertScene.parse({
        ...s,
        projectId: projectData.id,
        sceneIndex: idx,
      }));

      const valuesToInsert = Project.parse({
        ...projectData,
        scenes: scenesData,
        characters: charactersData,
        locations: locationsData,
      });

      const [createdScenes, createdCharacters, createdLocations] =
        await Promise.all([
          this.createScenes(projectData.id, scenesData, innerTx),
          this.createCharacters(projectData.id, charactersData, innerTx),
          this.createLocations(projectData.id, locationsData, innerTx),
        ]);

      const [projectRecord] = await innerTx
        .insert(projects)
        .values(valuesToInsert)
        .returning();

      await innerTx.insert(schema.teamsToProjects).values({
        teamId: projectData.teamId,
        projectId: projectData.id,
        accessLevel: "write",
      });

      const project = mapDbProjectToDomain(projectRecord);

      return {
        ...project,
        scenes: createdScenes,
        characters: createdCharacters,
        locations: createdLocations,
      };
    });
  }

  async updateProject(
    projectId: string,
    updates: Partial<Project>
  ): Promise<Project> {
    if (!db) throw new Error("Database not initialized");

    return await db.transaction(async (tx) => {

      const {
                scenes: sceneDrafts,
                characters: charDrafts,
                locations: locDrafts,
            } = updates;

            let sceneEntities: any[] = [];
            let charEntities: any[] = [];
            let locEntities: any[] = [];

            if (charDrafts && charDrafts.length > 0) {
                charEntities = await tx.insert(characters)
                    .values(charDrafts)
                    .onConflictDoUpdate({ target: characters.id, set: buildConflictUpdateColumns(characters) })
                    .returning();
                console.debug({ insertedNumChars: charEntities.length });
            }

            if (locDrafts && locDrafts.length > 0) {
                locEntities = await tx.insert(locations)
                    .values(locDrafts)
                    .onConflictDoUpdate({ target: locations.id, set: buildConflictUpdateColumns(locations) })
                    .returning();
                console.debug({ insertedNumLocs: locEntities.length });
            }

            if (sceneDrafts && sceneDrafts.length > 0) {
                const insertScenes = sceneDrafts.map(s => mapDomainSceneToInsertSceneDb({ ...s, projectId }));
                sceneEntities = await tx.insert(scenes)
                    .values(insertScenes)
                    .onConflictDoUpdate({
                        target: scenes.id,
                        set: buildConflictUpdateColumns(scenes)
                    })
                    .returning();
                console.debug({ insertedNumScenes: sceneEntities.length });

                const characterJoins = extractCharacterJoins(sceneDrafts);

                if (characterJoins.length > 0) {
                    const sceneIds = sceneEntities.map(s => s.id);

                    await tx.transaction(async (innerTx) => {
                        await innerTx
                            .delete(scenesToCharacters)
                            .where(inArray(scenesToCharacters.sceneId, sceneIds));

                        if (characterJoins.length > 0) {
                            await innerTx
                                .insert(scenesToCharacters)
                                .values(characterJoins);
                        }
                    });
                }

                console.debug({ insertedNumScenes: sceneEntities.length, linkedCharacters: characterJoins.length });
            }

      
      const updatePayload: any = { updatedAt: new Date() };

      /**
       * Filters out undefined values from an object.
       * undefined becomes null in JSON, which would overwrite existing values.
       * Explicit null values ARE allowed to pass through (to support clearing fields).
       */
      function filterNullValues<T extends Record<string, any>>(obj: T): Partial<T> {
        const filtered: Partial<T> = {};
        for (const [key, value] of Object.entries(obj)) {
          if (value !== undefined) {
            filtered[ key as keyof T ] = value;
          }
        }
        return filtered;
      }


      if (updates.storyboard) updatePayload.storyboard = updates.storyboard;
      if (updates.status) updatePayload.status = updates.status;
      if (updates.currentSceneIndex) updatePayload.currentSceneIndex = updates.currentSceneIndex;
      if (updates.audioAnalysis) updatePayload.audioAnalysis = updates.audioAnalysis;
      if (updates.generationRules) updatePayload.generationRules = updates.generationRules;
      if (updates.generationRulesHistory) updatePayload.generationRulesHistory = updates.generationRulesHistory;
      
      // Filter out null/undefined values to prevent overwriting existing properties
      if (updates.metadata) {
        const filteredMetadata = filterNullValues(updates.metadata);
        if (Object.keys(filteredMetadata).length > 0) {
          updatePayload.metadata = sql`COALESCE(${projects.metadata}, '{}'::jsonb) || ${JSON.stringify(filteredMetadata)}::jsonb`;
        }
      }
      if (updates.metrics) {
        const filteredMetrics = filterNullValues(updates.metrics);
        if (Object.keys(filteredMetrics).length > 0) {
          updatePayload.metrics = sql`COALESCE(${projects.metrics}, '{}'::jsonb) || ${JSON.stringify(filteredMetrics)}::jsonb`;
        }
      }
      if (updates.forceRegenerateSceneIds !== undefined){
        updatePayload.forceRegenerateSceneIds = updates.forceRegenerateSceneIds.length > 0
                                ? sql`COALESCE(${projects.forceRegenerateSceneIds}, '{}'::text[]) || ${updates.forceRegenerateSceneIds}::text[]`
                                : sql`COALESCE(${projects.forceRegenerateSceneIds}, '{}'::text[])`    
      };
      
      const [updated] = await tx
        .update(projects)
        .set(updatePayload)
        .where(eq(projects.id, projectId))
        .returning();

      return this.getProjectFullState(projectId, tx);
    });
  }

  async deleteProject(projectId: string): Promise<void> {
    if (!db) throw new Error("Database not initialized");

    await db.delete(projects).where(eq(projects.id, projectId));
  }

  // ==========================================================================
  // SCENE QUERIES
  // ==========================================================================

  async getProjectScenes(projectId: string): Promise<Scene[]> {
    if (!db) throw new Error("Database not initialized");

    const dbScenes = await queryScenesWithRelationships(db, projectId);
    const sceneIds = dbScenes.map((s) => s.id);

    // Fetch assets for all scenes
    const sceneAssets = await this.fetchSceneAssetsFull(sceneIds, db);

    return dbScenes.map((s, i) =>
      sceneQueryResultToDomain({
        ...s,
        assets: sceneAssets[i] || {},
      })
    );
  }

  async getScenesByIds(ids: string[]): Promise<Scene[]> {
    if (!db) throw new Error("Database not initialized");
    if (ids.length === 0) return [];

    const dbScenes = await db.query.scenes.findMany({
      where: ((schema: any, { inArray }: any) => inArray(scenes.id, ids)) as any,
      with: {
        characters: {
          columns: { id: true },
        },
      },
    });

    const sceneAssets = await this.fetchSceneAssetsFull(ids, db);

    return dbScenes.map((s, i) =>
      sceneQueryResultToDomain({
        ...SceneQueryResult.parse(s),
        assets: sceneAssets[i] || {},
      })
    );
  }

  // ==========================================================================
  // SCENE MUTATIONS
  // ==========================================================================

  async createScenes(
    projectId: string,
    scenesData: (z.input<typeof InsertScene>[] | Scene[]),
    tx: DbTransaction = db
  ): Promise<Scene[]> {
    if (!tx) throw new Error("Database not initialized");

    return await tx.transaction(async (innerTx) => {
      if (scenesData.length === 0) return [];

      const scenesWithCharacters: Scene[] = [];
        const scenesToUpsert: InsertScene[] = scenesData.map((s) => {
            const _scene = mapDomainSceneToInsertSceneDb({ ...s, projectId });
            if ("characterIds" in s) {
                scenesWithCharacters.push({ ...s, ..._scene, characterIds: s.characterIds });
            }
            return _scene;
        });
        if (scenesToUpsert.length === 0) return [];

      const inserted = await innerTx
        .insert(scenes)
        .values(scenesToUpsert)
        .returning();

      const sceneCharacterJoins = extractCharacterJoins(scenesWithCharacters);

      if (sceneCharacterJoins.length > 0) {
        await replaceSceneCharacterRelationships(innerTx, sceneCharacterJoins);
      }

        console.debug({ insertedNumScenes: inserted.length, linkedCharacters: sceneCharacterJoins.length });
      return inserted.map((s) => sceneQueryResultToDomain(SceneQueryResult.parse(s)));
    });
  }

  async upsertScenes(
    projectId: string,
    scenesData: (z.input<typeof InsertScene>[] | Scene[]),
    tx: DbTransaction = db
  ): Promise<Scene[]> {
    if (!tx) throw new Error("Database not initialized");

    return await tx.transaction(async (innerTx) => {
      if (scenesData.length === 0) return [];

       const scenesWithCharacters: Scene[] = [];
        const scenesToUpsert: InsertScene[] = scenesData.map((s) => {
            const _scene = mapDomainSceneToInsertSceneDb({ ...s, projectId });
            if ("characterIds" in s) {
                scenesWithCharacters.push({ ...s, ..._scene, characterIds: s.characterIds });
            }
            return _scene;
        });
        if (scenesToUpsert.length === 0) return [];

      const upserted = await innerTx
        .insert(scenes)
        .values(scenesToUpsert)
        .onConflictDoUpdate({
          target: scenes.id,
          set: buildConflictUpdateColumns(scenes),
        })
        .returning();

      const sceneCharacterJoins = extractCharacterJoins(scenesWithCharacters);
      
        if (sceneCharacterJoins.length > 0) {
            await replaceSceneCharacterRelationships(innerTx, sceneCharacterJoins);
        }

        console.debug({ upsertedNumScenes: upserted.length, linkedCharacters: sceneCharacterJoins.length });

        return upserted.map((s) => sceneQueryResultToDomain(SceneQueryResult.parse(s)));
    });
  }

  async updateScenes(updates: (Partial<UpdateScene> & { id: string; projectId: string; sceneIndex: number; })[]) {
    if (!db) throw new Error("Database not initialized");

    return Promise.all(
      updates.map(async ({ id, ...scene}) => {
        const [row] = await db
          .update(scenes)
          .set({ ...scene, updatedAt: new Date() })
          .where(eq(scenes.id, id))
          .returning();
        return row;
      })
    );
  }

  async deleteScenes(sceneIds: string[]): Promise<void> {
    if (!db) throw new Error("Database not initialized");
    if (sceneIds.length === 0) return;

    await db.delete(scenes).where(inArray(scenes.id, sceneIds));
  }

  /**
 * Enhanced Delete Scene: Cleans up dependent assets to maintain integrity.
 * Uses a transaction to prevent partial orphans.
 */
  async deleteSceneAndAssets(projectId: string, sceneId: string): Promise<void> {
    await db.transaction(async (tx) => {
      console.debug(`[ProjectRepository] Initiating cascade delete for scene: ${sceneId}`);

      // 1. Remove asset versions first (Deepest leaf)
      await tx.delete(assetVersions)
        .where(inArray(
          assetVersions.assetEntryId,
          tx.select({ id: assetEntries.id })
            .from(assetEntries)
            .where(eq(assetEntries.sceneId, sceneId))
        ));

      // 2. Remove asset entries
      await tx.delete(assetEntries).where(eq(assetEntries.sceneId, sceneId));

      // 3. Remove scene (Parent)
      await tx.delete(scenes).where(and(eq(scenes.id, sceneId), eq(scenes.projectId, projectId)));

      console.info(`[ProjectRepository] Scene ${sceneId} and its assets purged.`);
    });
  }

  // ==========================================================================
  // CHARACTER QUERIES & MUTATIONS
  // ==========================================================================

  async createCharacters(
    projectId: string,
    charactersData: z.input<typeof InsertCharacter>[],
    tx: DbTransaction = db
  ): Promise<Character[]> {
    if (!tx) throw new Error("Database not initialized");

    const rows = charactersData.map((s) =>
      mapDomainCharacterToInsertCharacterDb({ ...s, projectId })
    );
    if (rows.length === 0) return [];

    const inserted = await tx
      .insert(characters)
      .values(rows)
      .returning();
    return inserted.map((c) => mapDbCharacterToDomain(Character.parse(c)));
  }

  async upsertCharacters(
    projectId: string,
    charactersData: z.input<typeof InsertCharacter>[],
    tx: typeof db = db
  ): Promise<Character[]> {
    if (!tx) throw new Error("Database not initialized");

    const rows = charactersData.map((s) =>
      mapDomainCharacterToInsertCharacterDb({ ...s, projectId })
    );
    if (rows.length === 0) return [];

    const upserted = await tx
      .insert(characters)
      .values(rows)
      .onConflictDoUpdate({
        target: characters.id,
        set: buildConflictUpdateColumns(characters),
      })
      .returning();
    return upserted.map((c) => mapDbCharacterToDomain(Character.parse(c)));
  }

  async updateCharacters(updates: Character[]) {
    if (!db) throw new Error("Database not initialized");

    return Promise.all(
      updates.map(async ({id, ...char}) => {
        const [row] = await db
          .update(characters)
          .set({ ...char, updatedAt: new Date() })
          .where(eq(characters.id, id))
          .returning();
        return row;
      })
    );
  }

  async getProjectCharacters(projectId: string): Promise<Character[]> {
    if (!db) throw new Error("Database not initialized");

    const records = await db
      .select()
      .from(characters)
      .where(eq(characters.projectId, projectId));
    
    const characterIds = records.map(c => c.id);
    const characterAssets = await this.fetchCharacterAssetsFull(characterIds, db);

    return records.map((c, i) =>
      Character.parse({ ...c, assets: characterAssets[i] || {} }) as unknown as Character
    );
  }

  async getCharactersByIds(ids: string[]): Promise<Character[]> {
    if (!db) throw new Error("Database not initialized");
    if (ids.length === 0) return [];

    const records = await db
      .select()
      .from(characters)
      .where(inArray(characters.id, ids));
    
    const characterAssets = await this.fetchCharacterAssetsFull(ids, db);

    return records.map((c, i) =>
      Character.parse({ ...c, assets: characterAssets[i] || {} }) as unknown as Character
    );
  }

  // ==========================================================================
  // LOCATION QUERIES & MUTATIONS
  // ==========================================================================

  async createLocations(
    projectId: string,
    locationsData: z.input<typeof InsertLocation>[],
    tx: DbTransaction = db
  ): Promise<Location[]> {
    if (!tx) throw new Error("Database not initialized");

    const rows = locationsData.map((s) => ({
      ...mapDomainLocationToInsertLocationDb({ ...s, projectId }),
      projectId,
    }));
    if (rows.length === 0) return [];

    const inserted = await tx
      .insert(locations)
      .values(rows)
      .returning();
    return inserted.map((c) => mapDbLocationToDomain(Location.parse(c)));
  }

  async upsertLocations(
    projectId: string,
    locationsData: z.input<typeof InsertLocation>[],
    tx: DbTransaction = db
  ): Promise<Location[]> {
    if (!tx) throw new Error("Database not initialized");

    const rows = locationsData.map((s) => ({
      ...mapDomainLocationToInsertLocationDb({ ...s, projectId }),
      projectId,
    }));
    if (rows.length === 0) return [];

    const upserted = await tx
      .insert(locations)
      .values(rows)
      .onConflictDoUpdate({
        target: locations.id,
        set: buildConflictUpdateColumns(locations),
      })
      .returning();
    return upserted.map((c) => mapDbLocationToDomain(Location.parse(c)));
  }

  async updateLocations(updates: Location[]) {
    if (!db) throw new Error("Database not initialized");

    return Promise.all(
      updates.map(async ({id, ...loc}) => {
        const [row] = await db
          .update(locations)
          .set({ ...loc, updatedAt: new Date() })
          .where(eq(locations.id, id))
          .returning();
        return row;
      })
    );
  }

  async getProjectLocations(projectId: string): Promise<Location[]> {
    if (!db) throw new Error("Database not initialized");

    const records = await db
      .select()
      .from(locations)
      .where(eq(locations.projectId, projectId));
    
    const locationIds = records.map(l => l.id);
    const locationAssets = await this.fetchLocationAssetsFull(locationIds, db);

    return records.map((l, i) =>
      Location.parse({ ...l, assets: locationAssets[i] || {} })
    );
  }

  async getLocationsByIds(ids: string[]): Promise<Location[]> {
    if (!db) throw new Error("Database not initialized");
    if (ids.length === 0) return [];

    const records = await db
      .select()
      .from(locations)
      .where(inArray(locations.id, ids));
    
    const locationAssets = await this.fetchLocationAssetsFull(ids, db);

    return records.map((l, i) =>
      Location.parse({ ...l, assets: locationAssets[i] || {} })
    );
  }

  // ==========================================================================
  // UTILITY
  // ==========================================================================

  async appendProjectForceRegenerateSceneIds(
    projectId: string,
    sceneIds: string[]
  ): Promise<Project> {
    if (!db) throw new Error("Database not initialized");

    const updatePayload: any = { updatedAt: new Date() };
    updatePayload.forceRegenerateSceneIds = sql`array_cat(${projects.forceRegenerateSceneIds}, ${sceneIds})`;
    
    const [update] = await db
      .update(projects)
      .set(updatePayload)
      .where(eq(projects.id, projectId))
      .returning();

    return mapDbProjectToDomain(update);
  }
}