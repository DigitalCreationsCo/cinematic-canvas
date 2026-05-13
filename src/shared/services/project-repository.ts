import { db, type DbTransaction } from "#shared/db/index.js";
import * as schema from "#shared/db/schema.js";
import { eq, and, inArray, sql, isNull, or } from "drizzle-orm";
import {
  Scene,
  Character,
  SceneWithAssets,
  CharacterWithAssets,
  LocationWithAssets,
  PropWithAssets,
  Prop,
} from "#shared/types/workflow.types.js";
import { Storyboard } from "#shared/types/storyboard.types.js";
import {
  Project,
  UpdateScene,
  UpdateCharacter,
  UpdateLocation,
  ProjectEntity,
  InsertScene,
  InsertCharacter,
  InsertLocation,
  InsertProject,
  SceneQueryResult,
  SceneToCharacterJoinInsert,
  InsertProp,
  UpdateProp,
  UpdateProject,
} from "#shared/types/schema.types.js";
import { EntityPrimitiveType, EntityCreatableType } from "#shared/types/entity.types.js";
import { AssetHistory, AssetRegistry, AssetKey } from "#shared/types/assets.types.js";
import { InsertEntitiesInput, BatchEntityUpdateRequest, GetEntitiesInput } from "#shared/types/editable.types.js";
import { AssetVersion } from "#shared/types/assets.types.js";
import { PipelineCommand } from "#shared/types/pipeline.types.js";
import { ProjectMetadata } from "#shared/types/metadata.types.js";
import { EntityUnion } from "#shared/types/entity.types.js";
import { mapDbProjectToDomainProject } from "#shared/entity/project-mappers.js";
import { mapSceneWithAssetsToDomainScene, mapDomainSceneToInsertScene } from "#shared/entity/scene-mappers.js";
import {
  extractCharacterJoins,
  mapCharacterWithAssetsToDomainCharacter,
  mapDomainCharacterToInsertCharacter,
} from "#shared/entity/character-mappers.js";
import {
  mapLocationWithAssetsToDomainLocation,
  mapDomainLocationToInsertLocation,
} from "#shared/entity/location-mappers.js";
import { getColumns } from "drizzle-orm";
import { generateId } from "#shared/utils/id.js";
import { z } from "zod";
import { getSacGitService } from "#shared/services/sac/SacGitServiceStub.js";
import { groupEntitiesByEntityPrimitiveType, hydrateEntity } from "#shared/utils/entity.utils.js";
import { mapDomainPropToInsertProp, mapPropWithAssetsToDomainProp } from "#shared/entity/prop-mappers.js";
import { props } from "#shared/db/schema.js";

const {
  scenes,
  projects,
  characters,
  locations,
  scenesToCharacters,
  assetEntries,
  assetVersions,
  usersToProjects,
  usersToTeams,
} = schema;

/**
 * Helper to dynamically build the 'set' clause for upserts
 */
function buildConflictUpdateColumns(table: any, excludeColumns: string[] = []) {
  const columns = getColumns(table);
  const updateSet: Record<string, any> = {};

  Object.entries(columns as Record<string, any>).forEach(([drizzleName, columnObj]) => {
    const dbName = columnObj.name;
    if (excludeColumns.includes(dbName)) return;
    updateSet[drizzleName] = sql.raw(`excluded.${dbName}`);
  });

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
async function querySceneWithRelationships(tx: DbTransaction, sceneId: string): Promise<SceneQueryResult> {
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
 * Standardized pattern for managing scene-character relationships
 * Replaces all character associations for given scenes
 */
async function replaceSceneCharacterRelationships(
  tx: DbTransaction,
  sceneCharacterJoins: SceneToCharacterJoinInsert[],
): Promise<void> {
  if (sceneCharacterJoins.length === 0) return;

  const sceneIds = [...new Set(sceneCharacterJoins.map((j) => j.sceneId).filter((id): id is string => !!id))];

  // Delete existing relationships for these scenes
  await tx.delete(scenesToCharacters).where(inArray(scenesToCharacters.sceneId, sceneIds));

  // Insert new relationships
  if (sceneCharacterJoins.length > 0) {
    await tx.insert(scenesToCharacters).values(sceneCharacterJoins);
  }
}

const sacRepository = getSacGitService();

export class ProjectRepository {
  // ==========================================================================
  // PROJECT QUERIES
  // ==========================================================================

  /**
   * Checks if an entity is still active and exists.
   * Used by workers to bail early if a user deleted the scene/project mid-task.
   */
  async isEntityActive(type: EntityPrimitiveType, id: string): Promise<boolean> {
    if (!db) throw new Error("Database not initialized");

    const table = type === "scene" ? scenes : projects;
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
  async getProjectsForUser(userId: string, worldId?: string): Promise<{ id: string; metadata: { title: string } }[]> {
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
          metadata: {
            title: sql<string>`${projects.metadata}->>'title'`.as("title"),
          },
        })
        .from(projects)
        .leftJoin(usersToProjects, eq(projects.id, usersToProjects.projectId))
        .where(
          or(
            teamIds.length > 0 ? inArray(projects.teamId, teamIds) : undefined,
            eq(usersToProjects.userId, userId),
            worldId ? eq(projects.worldId, worldId) : undefined,
          ),
        );
      return records;
    });
  }

  /**
   * Get project entity with LITE asset payload.
   * Fetches only asset metadata (head, best) without version data.
   * Use this for project loading and list views.
   */
  async getProject(projectId: string, tx: DbTransaction = db): Promise<ProjectEntity & { assets: AssetRegistry }> {
    if (!tx) throw new Error("Database not initialized");

    const [record] = await tx.select().from(projects).where(eq(projects.id, projectId));

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
  async getProjectFullState(projectId: string, tx: DbTransaction = db): Promise<Project> {
    if (!tx) throw new Error("Database not initialized");

    const projectEntity = await this.getProject(projectId, tx);

    const [dbScenesWithCharIds, dbChars, dbLocs, dbProps] = await Promise.all([
      this.queryScenesWithRelationships(tx, projectId),
      tx.query.characters.findMany({ where: { projectId } }),
      tx.query.locations.findMany({ where: { projectId } }),
      tx.query.props.findMany({ where: { projectId } }),
    ]);

    // Fetch full asset payloads for all entities
    const [projectAssetsFull, sceneAssetsFull, characterAssetsFull, locationAssetsFull, propAssetsFull] =
      await Promise.all([
        this.fetchProjectAssetsFull(projectId, tx),
        this.fetchSceneAssetsFull(
          dbScenesWithCharIds.map((s) => s.id),
          tx,
        ),
        this.fetchCharacterAssetsFull(
          dbChars.map((c) => c.id),
          tx,
        ),
        this.fetchLocationAssetsFull(
          dbLocs.map((l) => l.id),
          tx,
        ),
        this.fetchPropAssetsFull(
          dbProps.map((p) => p.id),
          tx,
        ),
      ]);

    const domainScenes = dbScenesWithCharIds.map((s, i) =>
      mapSceneWithAssetsToDomainScene({
        ...s,
        assets: sceneAssetsFull[i] || {},
      }),
    );

    const domainCharacters = dbChars.map((c, i) =>
      mapCharacterWithAssetsToDomainCharacter({
        ...c,
        assets: characterAssetsFull[i] || {},
      }),
    );

    const domainLocations = dbLocs.map((l, i) =>
      mapLocationWithAssetsToDomainLocation({
        ...l,
        assets: locationAssetsFull[i] || {},
      }),
    );

    const domainProps = dbProps.map((l, i) =>
      mapPropWithAssetsToDomainProp({
        ...l,
        assets: propAssetsFull[i] || {},
      }),
    );

    return {
      ...projectEntity,
      assets: projectAssetsFull,
      scenes: domainScenes,
      characters: domainCharacters,
      locations: domainLocations,
      props: domainProps,
    } as unknown as Project; // TODO Revise Project schema to include props, if necessary
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
    props: Record<string, AssetRegistry>;
  }> {
    // Fetch all asset entries for this project (lite mode)
    const allEntries = await db.select().from(assetEntries).where(eq(assetEntries.projectId, projectId));

    const manifest = {
      project: {} as AssetRegistry,
      scenes: {} as Record<string, AssetRegistry>,
      characters: {} as Record<string, AssetRegistry>,
      locations: {} as Record<string, AssetRegistry>,
      props: {} as Record<string, AssetRegistry>,
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
        manifest.scenes[entry.sceneId][entry.assetKey as AssetKey] = history;
      } else if (entry.characterId) {
        if (!manifest.characters[entry.characterId]) {
          manifest.characters[entry.characterId] = {};
        }
        manifest.characters[entry.characterId][entry.assetKey as AssetKey] = history;
      } else if (entry.locationId) {
        if (!manifest.locations[entry.locationId]) {
          manifest.locations[entry.locationId] = {};
        }
        manifest.locations[entry.locationId][entry.assetKey as AssetKey] = history;
      } else if (entry.propId) {
        if (!manifest.props[entry.propId]) manifest.props[entry.propId] = {};
        manifest.props[entry.propId][entry.assetKey as AssetKey] = history;
      } else {
        // Project-level asset
        manifest.project[entry.assetKey as AssetKey] = history;
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
  private async fetchProjectAssetsLite(projectId: string, tx: DbTransaction = db): Promise<AssetRegistry> {
    const entries = await tx
      .select()
      .from(assetEntries)
      .where(
        and(
          eq(assetEntries.projectId, projectId),
          isNull(assetEntries.sceneId),
          isNull(assetEntries.characterId),
          isNull(assetEntries.locationId),
          isNull(assetEntries.propId),
          isNull(assetEntries.fileId),
        ),
      );

    const registry: AssetRegistry = {};
    for (const entry of entries) {
      registry[entry.assetKey as AssetKey] = {
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
  private async fetchProjectAssetsFull(projectId: string, tx: DbTransaction = db): Promise<AssetRegistry> {
    const results = await tx
      .select({
        entry: assetEntries,
        version: assetVersions,
      })
      .from(assetEntries)
      .leftJoin(assetVersions, eq(assetVersions.assetEntryId, assetEntries.id))
      .where(
        and(
          eq(assetEntries.projectId, projectId),
          isNull(assetEntries.sceneId),
          isNull(assetEntries.characterId),
          isNull(assetEntries.locationId),
          isNull(assetEntries.propId),
          isNull(assetEntries.fileId),
        ),
      );

    return this.buildRegistryFromResults(results);
  }

  /**
   * Fetch FULL scene assets for multiple scenes.
   */
  private async fetchSceneAssetsFull(sceneIds: string[], tx: DbTransaction = db): Promise<AssetRegistry[]> {
    if (sceneIds.length === 0) return [];

    const results = await tx
      .select({
        entry: assetEntries,
        version: assetVersions,
      })
      .from(assetEntries)
      .leftJoin(assetVersions, eq(assetVersions.assetEntryId, assetEntries.id))
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
    return sceneIds.map((id) => this.buildRegistryFromResults(byScene.get(id) || []));
  }

  /**
   * Fetch FULL character assets for multiple characters.
   */
  private async fetchCharacterAssetsFull(characterIds: string[], tx: DbTransaction = db): Promise<AssetRegistry[]> {
    if (characterIds.length === 0) return [];

    const results = await tx
      .select({
        entry: assetEntries,
        version: assetVersions,
      })
      .from(assetEntries)
      .leftJoin(assetVersions, eq(assetVersions.assetEntryId, assetEntries.id))
      .where(inArray(assetEntries.characterId, characterIds));

    const byCharacter = new Map<string, typeof results>();
    for (const row of results) {
      const characterId = row.entry.characterId!;
      if (!byCharacter.has(characterId)) {
        byCharacter.set(characterId, []);
      }
      byCharacter.get(characterId)!.push(row);
    }

    return characterIds.map((id) => this.buildRegistryFromResults(byCharacter.get(id) || []));
  }

  /**
   * Fetch FULL prop assets for multiple props.
   */
  private async fetchPropAssetsFull(propIds: string[], tx: DbTransaction = db): Promise<AssetRegistry[]> {
    if (propIds.length === 0) return [];

    const results = await tx
      .select({
        entry: assetEntries,
        version: assetVersions,
      })
      .from(assetEntries)
      .leftJoin(assetVersions, eq(assetVersions.assetEntryId, assetEntries.id))
      .where(inArray(assetEntries.propId, propIds));

    const byProp = new Map<string, typeof results>();
    for (const row of results) {
      const propId = row.entry.propId!;
      if (!byProp.has(propId)) {
        byProp.set(propId, []);
      }
      byProp.get(propId)!.push(row);
    }

    return propIds.map((id) => this.buildRegistryFromResults(byProp.get(id) || []));
  }

  /**
   * Fetch FULL location assets for multiple locations.
   */
  private async fetchLocationAssetsFull(locationIds: string[], tx: DbTransaction = db): Promise<AssetRegistry[]> {
    if (locationIds.length === 0) return [];

    const results = await tx
      .select({
        entry: assetEntries,
        version: assetVersions,
      })
      .from(assetEntries)
      .leftJoin(assetVersions, eq(assetVersions.assetEntryId, assetEntries.id))
      .where(inArray(assetEntries.locationId, locationIds));

    const byLocation = new Map<string, typeof results>();
    for (const row of results) {
      const locationId = row.entry.locationId!;
      if (!byLocation.has(locationId)) {
        byLocation.set(locationId, []);
      }
      byLocation.get(locationId)!.push(row);
    }

    return locationIds.map((id) => this.buildRegistryFromResults(byLocation.get(id) || []));
  }

  /**
   * Build AssetRegistry from JOIN results.
   */
  private buildRegistryFromResults(
    results: Array<{
      entry: typeof assetEntries.$inferSelect;
      version: typeof assetVersions.$inferSelect | null;
    }>,
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
      registry[entry.assetKey as AssetKey] = {
        head: entry.head,
        best: entry.best,
        versions: versions.map((v) => AssetVersion.parse(v)),
      };
    }

    return registry;
  }

  // ==========================================================================
  // PROJECT MUTATIONS
  // ==========================================================================

  async buildInitialProject(
    projectId: string,
    payload: Extract<PipelineCommand, { type: "START_PIPELINE" }>["payload"],
  ): Promise<Project> {
    try {
      console.log(`[WorkflowOperator] Building initial state from DB for ${projectId}`);
      const project = await this.getProject(projectId);

      if (project) {
        return Project.parse(project);
      }
    } catch (error) {
      console.warn({ shouldPublish: false }, "No existing project found in DB");
      console.log("Starting fresh workflow");
    }

    let { guidanceLevel, audioGcsUri, initialPrompt, title, systemInstructions, negativePrompt } = payload;

    let metadata: z.input<typeof ProjectMetadata> = {
      ...payload,
      projectId,
    };
    metadata = ProjectMetadata.parse(metadata);

    let storyboard: z.input<typeof Storyboard> = {
      metadata,
    };
    storyboard = Storyboard.parse(storyboard);

    // create project ledger repository where new immutable assets are stored (characters, scenes, locations, events, etc)
    // When creating a project, a new repo is created as a new workspace
    // When creating a world, a new repo is created as.
    // When creating a project within an existing world, the world repo is forked to create the project repo. The world repo is the base ledger and the project repo is the working copy. A submodule of the world repo is included in the project repo for importing assets from the world.
    // Project repos without a world can be retroactively connected to a world.
    const { repoId, repoUrl } = await sacRepository.createRepo(projectId);

    const projectInput: z.input<typeof Project> = {
      id: projectId,
      metadata,
      storyboard,
      guidanceLevel: guidanceLevel ?? undefined,
      teamId: payload.teamId,
      worldId: payload.worldId,
      sacForkRepoId: repoId,
      sacForkRepoUrl: repoUrl,
      // systemInstructions, // not included in schema yet
      // negativePrompt,
    };

    return Project.parse(projectInput);
  }

  async createProject(projectData: z.input<typeof InsertProject>, tx: DbTransaction = db): Promise<Project> {
    if (!tx) throw new Error("Database not initialized");

    return await tx.transaction(async (innerTx) => {
      projectData.id = projectData.id || generateId();

      const charactersData = (projectData.characters ?? []).map((c) =>
        InsertCharacter.parse({
          ...c,
          projectId: projectData.id,
        }),
      );

      const locationsData = (projectData.locations ?? []).map((l) =>
        InsertLocation.parse({
          ...l,
          projectId: projectData.id,
        }),
      );

      const scenesData = (projectData.scenes ?? []).map((s, idx) =>
        InsertScene.parse({
          ...s,
          projectId: projectData.id,
          sceneIndex: idx,
        }),
      );

      const valuesToInsert = Project.parse({
        ...projectData,
        scenes: scenesData,
        characters: charactersData,
        locations: locationsData,
      });

      const [createdScenes, createdCharacters, createdLocations] = await Promise.all([
        this.createScenes(projectData.id, scenesData, innerTx),
        this.createCharacters(projectData.id, charactersData, innerTx),
        this.createLocations(projectData.id, locationsData, innerTx),
      ]);

      const [projectRecord] = await innerTx.insert(projects).values(valuesToInsert).returning();

      await innerTx.insert(schema.teamsToProjects).values({
        teamId: projectData.teamId,
        projectId: projectData.id,
        accessLevel: "write",
      });

      const [projectAssetsFull, sceneAssetsFull, characterAssetsFull, locationAssetsFull] = await Promise.all([
        this.fetchProjectAssetsFull(projectRecord.id, innerTx),
        this.fetchSceneAssetsFull(
          createdScenes.map((s) => s.id),
          innerTx,
        ),
        this.fetchCharacterAssetsFull(
          createdCharacters.map((c) => c.id),
          innerTx,
        ),
        this.fetchLocationAssetsFull(
          createdLocations.map((l) => l.id),
          innerTx,
        ),
      ]);

      const project = mapDbProjectToDomainProject({
        ...projectRecord,
        scenes: createdScenes.map((s, i) => ({ ...s, assets: sceneAssetsFull[i] || {} })),
        characters: createdCharacters.map((c, i) => ({
          ...c,
          assets: characterAssetsFull[i] || {},
        })),
        locations: createdLocations.map((l, i) => ({
          ...l,
          assets: locationAssetsFull[i] || {},
        })),
      });

      return project;
    });
  }

  async updateProject(projectId: string, updates: UpdateProject): Promise<Project> {
    if (!db) throw new Error("Database not initialized");

    return await db.transaction(async (tx) => {
      const { scenes: scenePatches, characters: characterPatches, locations: locationPatches } = updates;

      let sceneEntities: any[] = [];
      let charEntities: any[] = [];
      let locEntities: any[] = [];

      if (characterPatches && characterPatches.length > 0) {
        charEntities = await tx
          .insert(characters)
          .values(characterPatches)
          .onConflictDoUpdate({
            target: characters.id,
            set: buildConflictUpdateColumns(characters),
          })
          .returning();
        console.debug({ insertedNumChars: charEntities.length });
      }

      if (locationPatches && locationPatches.length > 0) {
        locEntities = await tx
          .insert(locations)
          .values(locationPatches)
          .onConflictDoUpdate({
            target: locations.id,
            set: buildConflictUpdateColumns(locations),
          })
          .returning();
        console.debug({ insertedNumLocs: locEntities.length });
      }

      if (scenePatches && scenePatches.length > 0) {
        const insertScenes = scenePatches.map((s) => mapDomainSceneToInsertScene({ ...s, projectId }));
        sceneEntities = await tx
          .insert(scenes)
          .values(insertScenes)
          .onConflictDoUpdate({
            target: scenes.id,
            set: buildConflictUpdateColumns(scenes),
          })
          .returning();
        console.debug({ insertedNumScenes: sceneEntities.length });

        const characterJoins = extractCharacterJoins(scenePatches);

        if (characterJoins.length > 0) {
          const sceneIds = sceneEntities.map((s) => s.id);

          await tx.transaction(async (innerTx) => {
            await innerTx.delete(scenesToCharacters).where(inArray(scenesToCharacters.sceneId, sceneIds));

            if (characterJoins.length > 0) {
              await innerTx.insert(scenesToCharacters).values(characterJoins);
            }
          });
        }

        console.debug({
          insertedNumScenes: sceneEntities.length,
          linkedCharacters: characterJoins.length,
        });
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
            filtered[key as keyof T] = value;
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
      if (updates.styleReferences) updatePayload.styleReferences = updates.styleReferences;

      // Filter out null/undefined values to prevent overwriting existing properties
      if (updates.metadata) {
        const filteredMetadata = filterNullValues(updates.metadata);
        if (Object.keys(filteredMetadata).length > 0) {
          updatePayload.metadata = sql`COALESCE(${projects.metadata}, '{}'::jsonb) || ${JSON.stringify(filteredMetadata)}::jsonb`;
        }
      }
      if (updates.forceRegenerateSceneIds !== undefined) {
        updatePayload.forceRegenerateSceneIds =
          updates.forceRegenerateSceneIds.length > 0
            ? sql`COALESCE(${projects.forceRegenerateSceneIds}, '{}'::text[]) || ${updates.forceRegenerateSceneIds}::text[]`
            : sql`COALESCE(${projects.forceRegenerateSceneIds}, '{}'::text[])`;
      }

      const [updated] = await tx.update(projects).set(updatePayload).where(eq(projects.id, projectId)).returning();

      return this.getProjectFullState(projectId, tx);
    });
  }

  /**
   * Because of database-level ON DELETE CASCADE, wiping a project or scene bypasses application-level decrementing. We must intercept these operations to reconcile media_objects.
   * @param projectId
   */
  async deleteProject(projectId: string): Promise<void> {
    if (!db) throw new Error("Database not initialized");

    await db.transaction(async (tx) => {
      console.info(`[ProjectRepository] Initiating cascade delete for project: ${projectId}`);

      // 1. Gather all asset URIs associated with this project
      const versionsToDelete = await tx
        .select({ data: assetVersions.data })
        .from(assetVersions)
        .innerJoin(assetEntries, eq(assetVersions.assetEntryId, assetEntries.id))
        .where(eq(assetEntries.projectId, projectId));

      // 2. Decrement media references atomically
      const dataCounts = versionsToDelete.reduce(
        (acc, v) => {
          acc[v.data] = (acc[v.data] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      for (const [dataUri, count] of Object.entries(dataCounts)) {
        await tx
          .update(schema.mediaObjects)
          .set({
            refCount: sql`${schema.mediaObjects.refCount} - ${count}`,
            lastReferencedAt: new Date(),
            status: sql`CASE WHEN ${schema.mediaObjects.refCount} - ${count} <= 0 THEN 'pending_deletion' ELSE 'active' END`,
          })
          .where(eq(schema.mediaObjects.data, dataUri));
      }

      console.debug(
        `[ProjectRepository] Decremented ${versionsToDelete.length} media references for project ${projectId}.`,
      );

      // 3. Execute normal delete (cascades will drop asset_versions safely)
      await tx.delete(projects).where(eq(projects.id, projectId));
    });
  }

  /**
   * Enhanced Delete Scene: Cleans up dependent assets to maintain integrity.
   * Uses a transaction to prevent partial orphans.
   * Because of database-level ON DELETE CASCADE, wiping a project or scene bypasses application-level decrementing. We must intercept these operations to reconcile media_objects.
   */
  async deleteSceneAndAssets(projectId: string, sceneId: string): Promise<void> {
    await db.transaction(async (tx) => {
      console.debug(`[ProjectRepository] Initiating cascade delete for scene: ${sceneId}`);

      const versionsToDelete = await tx
        .select({ data: assetVersions.data })
        .from(assetVersions)
        .innerJoin(assetEntries, eq(assetVersions.assetEntryId, assetEntries.id))
        .where(eq(assetEntries.sceneId, sceneId));

      const dataCounts = versionsToDelete.reduce(
        (acc, v) => {
          acc[v.data] = (acc[v.data] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      for (const [dataUri, count] of Object.entries(dataCounts)) {
        await tx
          .update(schema.mediaObjects)
          .set({
            refCount: sql`${schema.mediaObjects.refCount} - ${count}`,
            lastReferencedAt: new Date(),
            status: sql`CASE WHEN ${schema.mediaObjects.refCount} - ${count} <= 0 THEN 'pending_deletion' ELSE 'active' END`,
          })
          .where(eq(schema.mediaObjects.data, dataUri));
      }

      await tx
        .delete(assetVersions)
        .where(
          inArray(
            assetVersions.assetEntryId,
            tx.select({ id: assetEntries.id }).from(assetEntries).where(eq(assetEntries.sceneId, sceneId)),
          ),
        );
      await tx.delete(assetEntries).where(eq(assetEntries.sceneId, sceneId));
      await tx.delete(scenes).where(and(eq(scenes.id, sceneId), eq(scenes.projectId, projectId)));

      console.info(`[ProjectRepository] Scene ${sceneId} and its assets purged.`);
    });
  }

  // ==========================================================================
  // SCENE QUERIES
  // ==========================================================================

  /**
   * Standardized pattern for querying multiple scenes with relationships
   */
  async queryScenesWithRelationships(tx: DbTransaction, projectId: string): Promise<SceneQueryResult[]> {
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

  async getProjectScenes(projectId: string): Promise<SceneWithAssets[]> {
    if (!db) throw new Error("Database not initialized");

    return db.transaction(async (innerTx) => {
      const dbScenes = await this.queryScenesWithRelationships(innerTx, projectId);
      const sceneIds = dbScenes.map((s) => s.id);

      // Fetch assets for all scenes
      const sceneAssets = await this.fetchSceneAssetsFull(sceneIds, innerTx);

      return dbScenes.map((s, i) =>
        mapSceneWithAssetsToDomainScene({
          ...s,
          assets: sceneAssets[i] || {},
        }),
      );
    });
  }

  async getScenesByIds(ids: string[]): Promise<SceneWithAssets[]> {
    if (!db) throw new Error("Database not initialized");
    if (ids.length === 0) return [];

    return db.transaction(async (innerTx) => {
      const dbScenes = await innerTx.query.scenes.findMany({
        where: ((schema: any, { inArray }: any) => inArray(schema.scenes.id, ids)) as any,
        with: {
          characters: {
            columns: { id: true },
          },
        },
      });

      const sceneAssets = await this.fetchSceneAssetsFull(ids, innerTx);

      const domainScenesWithAssets: SceneWithAssets[] = dbScenes.map((s, i) =>
        mapSceneWithAssetsToDomainScene({
          ...SceneQueryResult.parse(s),
          assets: sceneAssets[i] || {},
        }),
      );

      return domainScenesWithAssets;
    });
  }

  // ==========================================================================
  // SCENE MUTATIONS
  // ==========================================================================

  async createScenes(
    projectId: string,
    scenesData: z.input<typeof InsertScene>[] | Scene[],
    tx: DbTransaction = db,
  ): Promise<SceneWithAssets[]> {
    if (!tx) throw new Error("Database not initialized");

    return await tx.transaction(async (innerTx) => {
      if (scenesData.length === 0) return [];

      const scenesWithCharacterIds: Scene[] = [];
      const scenesToUpsert: InsertScene[] = scenesData.map((s) => {
        const _scene = mapDomainSceneToInsertScene({ ...s, projectId });
        if ("characterIds" in s) {
          scenesWithCharacterIds.push({ ...s, ..._scene, characterIds: s.characterIds });
        }
        return _scene;
      });
      if (scenesToUpsert.length === 0) return [];

      const inserted = await innerTx.insert(scenes).values(scenesToUpsert).returning();

      const assets = await this.fetchSceneAssetsFull(
        inserted.map((s) => s.id),
        innerTx,
      );
      const sceneCharacterJoins = extractCharacterJoins(
        scenesWithCharacterIds.map((s, i) => ({ ...s, assets: assets[i] || {} })),
      );

      if (sceneCharacterJoins.length > 0) {
        await replaceSceneCharacterRelationships(innerTx, sceneCharacterJoins);
      }

      console.debug({
        insertedNumScenes: inserted.length,
        linkedCharacters: sceneCharacterJoins.length,
      });
      return inserted.map((s, i) =>
        mapSceneWithAssetsToDomainScene({
          ...SceneQueryResult.parse(s),
          assets: assets[i] || {},
        }),
      );
    });
  }

  async upsertScenes(
    projectId: string,
    scenesData: z.input<typeof InsertScene>[] | Scene[],
    tx: DbTransaction = db,
  ): Promise<SceneWithAssets[]> {
    if (!tx) throw new Error("Database not initialized");

    return await tx.transaction(async (innerTx) => {
      if (scenesData.length === 0) return [];

      const scenesWithCharacters: Scene[] = [];
      const scenesToUpsert: InsertScene[] = scenesData.map((s) => {
        const _scene = mapDomainSceneToInsertScene({ ...s, projectId });
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

      const assets = await this.fetchSceneAssetsFull(
        upserted.map((s) => s.id),
        innerTx,
      );

      const sceneCharacterJoins = extractCharacterJoins(
        scenesWithCharacters.map((s, i) => ({ ...s, assets: assets[i] || {} })),
      );

      if (sceneCharacterJoins.length > 0) {
        await replaceSceneCharacterRelationships(innerTx, sceneCharacterJoins);
      }

      console.debug({
        upsertedNumScenes: upserted.length,
        linkedCharacters: sceneCharacterJoins.length,
      });

      return upserted.map((s, i) =>
        mapSceneWithAssetsToDomainScene({
          ...SceneQueryResult.parse(s),
          assets: assets[i] || {},
        }),
      );
    });
  }

  async updateScenes(updates: (Partial<UpdateScene> & { id: string; projectId: string })[], tx: DbTransaction = db) {
    if (!tx) throw new Error("Database not initialized");

    return Promise.all(
      updates.map(async ({ id, ...scene }) => {
        const [row] = await tx
          .update(scenes)
          .set({ ...scene, updatedAt: new Date() })
          .where(eq(scenes.id, id))
          .returning();
        return row;
      }),
    );
  }

  async deleteScenes(sceneIds: string[]): Promise<void> {
    if (!db) throw new Error("Database not initialized");
    if (sceneIds.length === 0) return;

    await db.delete(scenes).where(inArray(scenes.id, sceneIds));
  }

  // ==========================================================================
  // CHARACTER QUERIES & MUTATIONS
  // ==========================================================================

  async createCharacters(
    projectId: string,
    charactersData: z.input<typeof InsertCharacter>[],
    tx: DbTransaction = db,
  ): Promise<CharacterWithAssets[]> {
    if (!tx) throw new Error("Database not initialized");

    return tx.transaction(async (innerTx) => {
      const rows = charactersData.map((s) => mapDomainCharacterToInsertCharacter({ ...s, projectId }));
      if (rows.length === 0) return [];

      const inserted = await innerTx.insert(characters).values(rows).returning();

      const assets = await this.fetchCharacterAssetsFull(
        inserted.map((s) => s.id),
        innerTx,
      );

      return inserted.map((c, i) =>
        mapCharacterWithAssetsToDomainCharacter({
          ...c,
          worldId: c.worldId ?? undefined,
          assets: assets[i] || {},
        }),
      );
    });
  }

  async upsertCharacters(
    projectId: string,
    charactersData: z.input<typeof InsertCharacter>[],
    tx: typeof db = db,
  ): Promise<CharacterWithAssets[]> {
    if (!tx) throw new Error("Database not initialized");

    return tx.transaction(async (innerTx) => {
      const rows = charactersData.map((s) => mapDomainCharacterToInsertCharacter({ ...s, projectId }));
      if (rows.length === 0) return [];

      const upserted = await innerTx
        .insert(characters)
        .values(rows)
        .onConflictDoUpdate({
          target: characters.id,
          set: buildConflictUpdateColumns(characters),
        })
        .returning();

      const assets = await this.fetchCharacterAssetsFull(
        upserted.map((c) => c.id),
        innerTx,
      );
      return upserted.map((c, i) =>
        mapCharacterWithAssetsToDomainCharacter({
          ...Character.parse(c),
          assets: assets[i] || {},
        }),
      );
    });
  }

  async updateCharacters(
    updates: (Partial<UpdateCharacter> & { id: string; projectId: string })[],
    tx: DbTransaction = db,
  ) {
    if (!tx) throw new Error("Database not initialized");

    return Promise.all(
      updates.map(async ({ id, ...char }) => {
        const [row] = await tx
          .update(characters)
          .set({ ...char, updatedAt: new Date() })
          .where(eq(characters.id, id))
          .returning();
        return row;
      }),
    );
  }

  async getProjectCharacters(projectId: string, tx: DbTransaction = db): Promise<CharacterWithAssets[]> {
    if (!tx) throw new Error("Database not initialized");

    return tx.transaction(async (innerTx) => {
      const records = await innerTx.select().from(characters).where(eq(characters.projectId, projectId));

      const characterIds = records.map((c) => c.id);
      const characterAssets = await this.fetchCharacterAssetsFull(characterIds, innerTx);

      return records.map((c, i) => CharacterWithAssets.parse({ ...c, assets: characterAssets[i] || {} }));
    });
  }

  async getCharactersByIds(ids: string[]): Promise<CharacterWithAssets[]> {
    if (!db) throw new Error("Database not initialized");
    if (ids.length === 0) return [];

    const records = await db.select().from(characters).where(inArray(characters.id, ids));

    const characterAssets = await this.fetchCharacterAssetsFull(ids, db);

    return records.map((c, i) => CharacterWithAssets.parse({ ...c, assets: characterAssets[i] || {} }));
  }

  // ==========================================================================
  // PROP QUERIES & MUTATIONS
  // ==========================================================================

  async createProps(
    projectId: string,
    propsData: z.input<typeof InsertProp>[],
    tx: DbTransaction = db,
  ): Promise<PropWithAssets[]> {
    if (!tx) throw new Error("Database not initialized");

    return tx.transaction(async (innerTx) => {
      const rows = propsData.map((s) => mapDomainPropToInsertProp({ ...s, projectId }));
      if (rows.length === 0) return [];

      const inserted = await innerTx.insert(props).values(rows).returning();

      const assets = await this.fetchPropAssetsFull(
        inserted.map((s) => s.id),
        innerTx,
      );

      return inserted.map((p, i) =>
        mapPropWithAssetsToDomainProp({
          ...p,
          worldId: p.worldId ?? undefined,
          assets: assets[i] || {},
        }),
      );
    });
  }

  async upsertProps(
    projectId: string,
    propsData: z.input<typeof InsertProp>[],
    tx: typeof db = db,
  ): Promise<PropWithAssets[]> {
    if (!tx) throw new Error("Database not initialized");

    return tx.transaction(async (innerTx) => {
      const rows = propsData.map((s) => mapDomainPropToInsertProp({ ...s, projectId }));
      if (rows.length === 0) return [];

      const upserted = await innerTx
        .insert(props)
        .values(rows)
        .onConflictDoUpdate({
          target: props.id,
          set: buildConflictUpdateColumns(props),
        })
        .returning();

      const assets = await this.fetchPropAssetsFull(
        upserted.map((c) => c.id),
        innerTx,
      );
      return upserted.map((c, i) => mapPropWithAssetsToDomainProp({ ...Prop.parse(c), assets: assets[i] || {} }));
    });
  }

  async updateProps(updates: (Partial<UpdateProp> & { id: string; projectId: string })[], tx: DbTransaction = db) {
    if (!tx) throw new Error("Database not initialized");

    return Promise.all(
      updates.map(async ({ id, ...prop }) => {
        const [row] = await tx
          .update(props)
          .set({ ...prop, updatedAt: new Date() })
          .where(eq(props.id, id))
          .returning();
        return row;
      }),
    );
  }

  async getProjectProps(projectId: string): Promise<PropWithAssets[]> {
    if (!db) throw new Error("Database not initialized");

    return db.transaction(async (innerTx) => {
      const records = await innerTx.select().from(props).where(eq(props.projectId, projectId));

      const propIds = records.map((c) => c.id);
      const propAssets = await this.fetchPropAssetsFull(propIds, innerTx);

      return records.map((c, i) => PropWithAssets.parse({ ...c, assets: propAssets[i] || {} }));
    });
  }

  async getPropsByIds(ids: string[]): Promise<PropWithAssets[]> {
    if (!db) throw new Error("Database not initialized");
    if (ids.length === 0) return [];

    const records = await db.select().from(props).where(inArray(props.id, ids));

    const propAssets = await this.fetchPropAssetsFull(ids, db);

    return records.map((p, i) => PropWithAssets.parse({ ...p, assets: propAssets[i] || {} }));
  }

  // ==========================================================================
  // LOCATION QUERIES & MUTATIONS
  // ==========================================================================

  async createLocations(
    projectId: string,
    locationsData: z.input<typeof InsertLocation>[],
    tx: DbTransaction = db,
  ): Promise<LocationWithAssets[]> {
    if (!tx) throw new Error("Database not initialized");

    return tx.transaction(async (innerTx) => {
      const rows = locationsData.map((s) => ({
        ...mapDomainLocationToInsertLocation({ ...s, projectId }),
        projectId,
      }));
      if (rows.length === 0) return [];

      const inserted = await innerTx.insert(locations).values(rows).returning();

      const assets = await this.fetchLocationAssetsFull(
        inserted.map((l) => l.id),
        innerTx,
      );

      return inserted.map((c, i) => LocationWithAssets.parse({ ...c, assets: assets[i] || {} }));
    });
  }

  async upsertLocations(
    projectId: string,
    locationsData: z.input<typeof InsertLocation>[],
    tx: DbTransaction = db,
  ): Promise<LocationWithAssets[]> {
    if (!tx) throw new Error("Database not initialized");

    return tx.transaction(async (innerTx) => {
      const rows = locationsData.map((s) => ({
        ...mapDomainLocationToInsertLocation({ ...s, projectId }),
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

      const assets = await this.fetchLocationAssetsFull(
        upserted.map((l) => l.id),
        innerTx,
      );

      return upserted.map((l, i) =>
        mapLocationWithAssetsToDomainLocation({
          ...l,
          worldId: l.worldId ?? undefined,
          assets: assets[i] || {},
        }),
      );
    });
  }

  async updateLocations(
    updates: (Partial<UpdateLocation> & { id: string; projectId: string })[],
    tx: DbTransaction = db,
  ) {
    if (!tx) throw new Error("Database not initialized");

    return Promise.all(
      updates.map(async ({ id, ...loc }) => {
        const [row] = await tx
          .update(locations)
          .set({ ...loc, updatedAt: new Date() })
          .where(eq(locations.id, id))
          .returning();
        return row;
      }),
    );
  }

  async getProjectLocations(projectId: string, tx: DbTransaction = db): Promise<LocationWithAssets[]> {
    if (!tx) throw new Error("Database not initialized");

    const records = await tx.select().from(locations).where(eq(locations.projectId, projectId));

    const locationIds = records.map((l) => l.id);
    const locationAssets = await this.fetchLocationAssetsFull(locationIds, db);

    return records.map((l, i) => LocationWithAssets.parse({ ...l, assets: locationAssets[i] || {} }));
  }

  async getLocationsByIds(ids: string[]): Promise<LocationWithAssets[]> {
    if (!db) throw new Error("Database not initialized");
    if (ids.length === 0) return [];

    const records = await db.select().from(locations).where(inArray(locations.id, ids));

    const locationAssets = await this.fetchLocationAssetsFull(ids, db);

    return records.map((l, i) => LocationWithAssets.parse({ ...l, assets: locationAssets[i] || {} }));
  }

  async getLocationsByReferenceIds(referenceIds: string[]): Promise<LocationWithAssets[]> {
    if (!db) throw new Error("Database not initialized");
    if (referenceIds.length === 0) return [];

    const records = await db.select().from(locations).where(inArray(locations.referenceId, referenceIds));

    const locationIds = records.map((l) => l.id);
    const locationAssets = await this.fetchLocationAssetsFull(locationIds, db);

    return records.map((l, i) => LocationWithAssets.parse({ ...l, assets: locationAssets[i] || {} }));
  }

  // ==========================================================================
  // UTILITY
  // ==========================================================================

  async appendProjectForceRegenerateSceneIds(projectId: string, sceneIds: string[]): Promise<Project> {
    if (!db) throw new Error("Database not initialized");

    const updatePayload: any = { updatedAt: new Date() };
    updatePayload.forceRegenerateSceneIds = sql`array_cat(${projects.forceRegenerateSceneIds}, ${sceneIds})`;

    const [update] = await db.update(projects).set(updatePayload).where(eq(projects.id, projectId)).returning();

    return mapDbProjectToDomainProject(update);
  }

  async getEntities(
    entities: GetEntitiesInput,
  ): Promise<Array<{ entityType: EntityCreatableType; entity: EntityUnion }>> {
    if (!db) throw new Error("Database not initialized");

    // Group entity IDs by type
    const grouped = entities.reduce(
      (acc, { entityId, entityType }) => {
        if (!acc[entityType]) acc[entityType] = [];
        acc[entityType].push(entityId);
        return acc;
      },
      {} as Partial<Record<EntityCreatableType, string[]>>,
    );

    // Fetch all entity types in parallel
    const [characters, locations, props, scenes] = await Promise.all([
      grouped.character?.length ? this.getCharactersByIds(grouped.character) : [],
      grouped.location?.length ? this.getLocationsByIds(grouped.location) : [],
      grouped.prop?.length ? this.getPropsByIds(grouped.prop) : [],
      grouped.scene?.length ? this.getScenesByIds(grouped.scene) : [],
    ]);

    // Tag each result with its entityType and flatten
    const results: Array<{ entityType: EntityCreatableType; entity: EntityUnion }> = [
      ...characters.map((entity) => ({ entityType: "character" as const, entity })),
      ...locations.map((entity) => ({ entityType: "location" as const, entity })),
      ...props.map((entity) => ({ entityType: "prop" as const, entity })),
      ...scenes.map((entity) => ({ entityType: "scene" as const, entity })),
    ];

    return results;
  }

  async createEntities(
    projectId: string,
    inserts: InsertEntitiesInput,
  ): Promise<Array<{ entityType: EntityCreatableType; entity: EntityUnion }>> {
    if (!db) throw new Error("Database not initialized");

    const groups = groupEntitiesByEntityPrimitiveType(inserts);

    const results: Array<{
      entityId: string;
      entityType: EntityCreatableType;
      entity: EntityUnion;
    }> = [];

    // 2. Validate and insert characters using validated createCharacters method
    if (groups.character && groups.character.length > 0) {
      const validatedCharacters = groups.character.map((item) => {
        // Validate against InsertCharacter schema - this ensures all required fields
        // and field types are correct before insertion
        const parsed = InsertCharacter.parse({
          ...item.data,
          id: generateId(),
          projectId,
        });
        return parsed;
      });

      const createdCharacters = await this.createCharacters(projectId, validatedCharacters, db);

      createdCharacters.forEach((char) => {
        results.push({
          entityId: char.id,
          entityType: "character" as const,
          entity: char,
        });
      });
    }

    // 3. Validate and insert locations using validated createLocations method
    if (groups.location && groups.location.length > 0) {
      const validatedLocations = groups.location.map((item) => {
        // Validate against InsertLocation schema
        const parsed = InsertLocation.parse({
          ...item.data,
          id: generateId(),
          projectId,
        });
        return parsed;
      });

      const createdLocations = await this.createLocations(projectId, validatedLocations, db);

      createdLocations.forEach((loc) => {
        results.push({
          entityId: loc.id,
          entityType: "location" as const,
          entity: loc,
        });
      });
    }

    if (groups.prop && groups.prop.length > 0) {
      const validatedProps = groups.prop.map((item) => {
        // Validate against InsertProp schema
        const parsed = InsertProp.parse({
          ...item.data,
          id: generateId(),
          projectId,
        });
        return parsed;
      });

      const createdProps = await this.createProps(projectId, validatedProps, db);

      createdProps.forEach((prop) => {
        results.push({
          entityId: prop.id,
          entityType: "prop" as const,
          entity: prop,
        });
      });
    }

    // 4. Validate and insert scenes using validated createScenes method
    if (groups.scene && groups.scene.length > 0) {
      const validatedScenes = groups.scene.map((item, idx) => {
        // Validate against InsertScene schema - note: sceneIndex will be assigned
        const parsed = InsertScene.parse({
          ...item.data,
          id: generateId(),
          projectId,
          sceneIndex: idx,
        });
        return parsed;
      });

      const createdScenes = await this.createScenes(projectId, validatedScenes, db);

      createdScenes.forEach((scene) => {
        results.push({
          entityId: scene.id,
          entityType: "scene" as const,
          entity: scene,
        });
      });
    }

    return results;
  }

  async patchEntities(updates: BatchEntityUpdateRequest["updates"]) {
    return await db.transaction(async (tx) => {
      const updatedEntities: any[] = [];
      for (const update of updates) {
        const { entityId, entityType, patch } = update;
        let table: any;
        if (entityType === "scene") table = scenes;
        else if (entityType === "character") table = characters;
        else if (entityType === "location") table = locations;
        else continue;

        await tx
          .update(table)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(table.id, entityId));

        updatedEntities.push({
          entityId,
          entityType,
          entity: patch,
        });
      }
      return updatedEntities;
    });
  }

  async deleteEntity(entityId: string, entityType: EntityCreatableType): Promise<{ success: boolean; error?: string }> {
    try {
      let table: typeof scenes | typeof characters | typeof locations;
      let idColumn: typeof scenes.id | typeof characters.id | typeof locations.id;

      switch (entityType) {
        case "scene":
          table = scenes;
          idColumn = scenes.id;
          break;
        case "character":
          table = characters;
          idColumn = characters.id;
          break;
        case "location":
          table = locations;
          idColumn = locations.id;
          break;
        default:
          return { success: false, error: `Unknown entity type: ${entityType}` };
      }

      await db.delete(table).where(eq(idColumn, entityId));
      console.debug(`[UsersAndTeamsDbService] Deleted ${entityType} entity: ${entityId}`);
      return { success: true };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      console.error(`[UsersAndTeamsDbService] Failed to delete ${entityType} entity:`, error);
      return { success: false, error: errMsg };
    }
  }
}
