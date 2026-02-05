import { db } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq, asc, inArray, sql, } from "drizzle-orm";
import {
    Scene, Location, Project, Character,
    SceneAttributes,
    CharacterAttributes,
    LocationAttributes,
    Storyboard,
    SceneEntity, ProjectEntity,
    InsertScene,
    InsertCharacter,
    InsertLocation,
    InsertProject,
    UpdateProject,
    EntityType,
    AssetKey,
    AssetHistory,
    SceneQueryResult,
    SceneToCharacterJoinInsert,
    sceneQueryResultToDomain,
    UpdateScene,
} from "../types/index.js";
import { mapDbProjectToDomain, mapDomainProjectToInsertProjectDb } from "../domain/project-mappers.js";
import { mapDbSceneToDomain, mapDomainSceneToInsertSceneDb } from "../domain/scene-mappers.js";
import { extractCharacterJoins, mapDbCharacterToDomain, mapDomainCharacterToInsertCharacterDb } from "../domain/character-mappers.js";
import { mapDbLocationToDomain, mapDomainLocationToInsertLocationDb } from "../domain/location-mappers.js";
import { getTableColumns } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { z } from "zod";



type DbTransaction = Omit<typeof db, "$client">;

const { scenes, projects, characters, locations, scenesToCharacters } = schema;
/* 
  * Helper to dynamically build the 'set' clause for upserts
  * This tells Postgres: "If conflict, update these columns with the new values"
  * 
  */
function buildConflictUpdateColumns(table: any) {
    const columns = getTableColumns(table);
    const updateSet: Record<string, any> = {};

    Object.entries(columns as Record<string, any>).forEach(([ drizzleName, columnObj ]) => {
        const dbName = columnObj.name;
        updateSet[ drizzleName ] = sql.raw(`excluded.${dbName}`);
    });

    return updateSet;
};

/**
* Ensures IDs are sorted to prevent deadlocks when acquiring row locks
*/
function sortIdsForLocking(ids: string[]): string[] {
    return [ ...ids ].sort();
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

    return results.map(r => SceneQueryResult.parse(r));
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

    const sceneIds = [ ...new Set(sceneCharacterJoins.map(j => j.sceneId)) ];

    // Delete existing relationships for these scenes
    await tx
        .delete(scenesToCharacters)
        .where(inArray(scenesToCharacters.sceneId, sceneIds));

    // Insert new relationships
    if (sceneCharacterJoins.length > 0) {
        await tx
            .insert(scenesToCharacters)
            .values(sceneCharacterJoins);
    }
}

export class ProjectRepository {

    /**
   * Get project list (minimal data for listing)
   */
    async getProjects() {
        if (!db) throw new Error("Database not initialized");

        const records = await db.select({
            id: projects.id,
            metadata: { title: sql`${projects.metadata}->>'title'`.as('title'), }
        })
            .from(projects);
        return records;
    }

    /**
   * Get project entity (no relationships)
   */
    async getProject(projectId: string, tx: Omit<typeof db, "$client"> = db): Promise<ProjectEntity> {
        if (!tx) throw new Error("Database not initialized");

        const [ record ] = await tx.select().from(projects).where(eq(projects.id, projectId));

        console.debug('\ngetProject returned:');
        Object.entries(record).forEach(([ key, value ]) => {
            console.debug({ key, value: JSON.stringify(value).slice(0, 50) });
        });
        if (!record) throw new Error(`Project ${projectId} not found`);

        return ProjectEntity.parse(record);
    }

    /**
   * Get project with row lock (for concurrent updates)
   */
    async getProjectWithLock(projectId: string, tx: Omit<typeof db, "$client">): Promise<ProjectEntity> {
        const [ record ] = await tx.select()
            .from(projects)
            .where(eq(projects.id, projectId))
            .for('update');
        if (!record) throw new Error(`Project ${projectId} not found`);

        return ProjectEntity.parse(record);
    }

    /**
   * Get complete project state with all relationships hydrated
   */
    async getProjectFullState(projectId: string, tx: Omit<typeof db, "$client"> = db): Promise<Project> {
        if (!tx) throw new Error("Database not initialized");

        console.debug('getProjectFullState');
        const projectEntity = await this.getProject(projectId, tx);
        console.debug({ storyboardNumScenes: projectEntity.storyboard.scenes.length });
        console.debug({ storyboardNumChars: projectEntity.storyboard.characters.length });
        console.debug({ storyboardNumLocs: projectEntity.storyboard.locations.length });


        const [ dbScenesWithCharIds, dbChars, dbLocs ] = await Promise.all([
            queryScenesWithRelationships(tx, projectId),
            tx.query.characters.findMany({ where: { projectId } }),
            tx.query.locations.findMany({ where: { projectId } }),
        ]);

        const domainScenes = dbScenesWithCharIds.map(sceneQueryResultToDomain);
        const domainCharacters = dbChars.map(c => mapDbCharacterToDomain(c));
        const domainLocations = dbLocs.map(l => mapDbLocationToDomain(l));

        console.debug({ returnedNumScenes: domainScenes.length });
        console.debug({ returnedNumChars: domainCharacters.length });
        console.debug({ returnedNumLocs: domainLocations.length });

        return {
            ...projectEntity,
            scenes: domainScenes,
            characters: domainCharacters,
            locations: domainLocations,
        };
    }

    /**
 * Create new project with all relationships
 */
    async createProject(insert: z.input<typeof InsertProject>): Promise<Project> {
        if (!db) throw new Error("Database not initialized");

        return await db.transaction(async (tx) => {

            const projectId = insert.id || uuidv7();
            insert.id = projectId;


            let charactersToInsert = (insert.characters || []).map(c => InsertCharacter.parse({
                ...c,
                projectId,
            }));
            let locationsToInsert = (insert.locations || []).map(l => InsertLocation.parse({
                ...l,
                projectId,
            }));
            let scenesToInsert = (insert.scenes || []).map(s => InsertScene.parse({
                ...s,
                projectId,
            }));

            if (insert.characters && insert.characters.length > 0) {
                charactersToInsert = await this.createCharacters(projectId, insert.characters, tx);
            }
            if (insert.locations && insert.locations.length > 0) {
                locationsToInsert = await this.createLocations(projectId, insert.locations, tx);
            }
            if (insert.scenes && insert.scenes.length > 0) {
                scenesToInsert = await this.createScenes(projectId, insert.scenes, tx);
            }

            const projectEntity: Project = Project.parse({
                ...insert,
                scenes: scenesToInsert,
                characters: charactersToInsert,
                locations: locationsToInsert,
            });
            const [ record ] = await tx.insert(projects).values(projectEntity).returning();

            return mapDbProjectToDomain(record);
        });
    }

    /**
 * Update project and optionally its relationships
 */
    async updateProject(projectId: string, input: Partial<Project>): Promise<Project> {
        if (!db) throw new Error("Database not initialized");

        return await db.transaction(async (tx) => {

            const {
                scenes: sceneDrafts,
                characters: charDrafts,
                locations: locDrafts,
                ...projectFields
            } = input;

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

            const updatePayload: Record<string, any> = {
                updatedAt: new Date(),
                status: projectFields.status,
                currentSceneIndex: projectFields.currentSceneIndex,
                audioAnalysis: projectFields.audioAnalysis,
                storyboard: projectFields.storyboard,
                generationRules: projectFields.generationRules || [],
                generationRulesHistory: projectFields.generationRulesHistory || [],
            };


            for (const [ key, value ] of Object.entries(updatePayload)) {
                if (value && typeof value === 'object' && value.constructor.name === 'Object') {
                    // This is a plain JS object, Drizzle will stringify it.
                } else if (value && value.constructor.name === 'SQL') {
                    // This is a Drizzle SQL fragment.
                }

                console.debug(`Payload Key: ${key} | Type: ${typeof value} | Value: `, value);
            }

            Object.keys(updatePayload).forEach(key => updatePayload[ key ] === undefined && delete updatePayload[ key ]);

            if (Object.keys(updatePayload).length > 0 || projectFields.metadata || projectFields.metrics) {
                await tx.update(projects)
                    .set({
                        ...updatePayload,

                        ...(projectFields.metadata && {
                            metadata: sql`COALESCE(${projects.metadata}, '{}'::jsonb) || ${JSON.stringify(projectFields.metadata)}::jsonb`
                        }),

                        ...(projectFields.metrics && {
                            metrics: sql`COALESCE(${projects.metrics}, '{}'::jsonb) || ${JSON.stringify(projectFields.metrics)}::jsonb`
                        }),

                        ...(projectFields.forceRegenerateSceneIds !== undefined && {
                            forceRegenerateSceneIds: projectFields.forceRegenerateSceneIds.length > 0
                                ? sql`COALESCE(${projects.forceRegenerateSceneIds}, '{}'::text[]) || ${projectFields.forceRegenerateSceneIds}::text[]`
                                : sql`COALESCE(${projects.forceRegenerateSceneIds}, '{}'::text[])`
                        })
                    })
                    .where(eq(projects.id, projectId));
            }

            return this.getProjectFullState(projectId, tx);
        });
    }

    /**
 * Get single scene with relationships
 */
    async getScene(sceneId: string, tx: Omit<typeof db, "$client"> = db): Promise<Scene> {
        if (!tx) throw new Error("Database not initialized");

        // const record = await tx.query.scenes.findFirst({
        //     where: { id: sceneId },
        //     with: {
        //         characters: {
        //             columns: {
        //                 id: true,
        //             }
        //         }
        //     }
        // });
        const record = await querySceneWithRelationships(tx, sceneId);
        if (!record) throw new Error(`Scene ${sceneId} not found`);
        return sceneQueryResultToDomain(record);
        // return mapDbSceneToDomain(Scene.parse(record));
    }

    /**
 * Get scene with row lock
 */
    async getSceneWithLock(sceneId: string, tx: Omit<typeof db, "$client">): Promise<Scene> {
        const [ record ] = await tx.select()
            .from(scenes)
            .where(eq(scenes.id, sceneId))
            .for('update');

        if (!record) throw new Error(`Scene ${sceneId} not found`);

        // Fetch character relationships separately
        const chars = await tx
            .select({ id: scenesToCharacters.characterId })
            .from(scenesToCharacters)
            .where(eq(scenesToCharacters.sceneId, sceneId));

        return mapDbSceneToDomain(Scene.parse({
            ...record,
            characterIds: chars.map(c => ({ id: c.id }))
        }));
    }

    /**
 * Get scenes with row lock
 */
    async getScenesWithLock(ids: string[], tx: Omit<typeof db, "$client">): Promise<Scene[]> {
        if (ids.length === 0) return [];

        const sortedIds = sortIdsForLocking(ids);

        const records = await tx.select()
            .from(scenes)
            .where(inArray(scenes.id, sortedIds))
            .for('update');

        return records.map(c => Scene.parse(c));
    }

    /**
 * Get all scenes for a project
 */
    async getProjectScenes(projectId: string): Promise<Scene[]> {
        if (!db) throw new Error("Database not initialized");

        // const records = await db.query.scenes.findMany({
        //     where: { projectId },
        //     orderBy: { sceneIndex: "asc" },
        //     with: {
        //         characters: {
        //             columns: {
        //                 id: true
        //             }
        //         },
        //         location: { columns: { id: true } },
        //     }
        // });

        // return records.map(r => Scene.parse(r));
        const results = await queryScenesWithRelationships(db, projectId);
        return results.map(sceneQueryResultToDomain);
    }

    async createScenes(projectId: string, scenesData: (z.input<typeof InsertScene>[] | Scene[]), tx: Omit<typeof db, "$client"> = db): Promise<SceneEntity[]> {
        if (!tx) throw new Error("Database not initialized");

        const scenesWithCharacters: Scene[] = [];
        const scenesToInsert: InsertScene[] = scenesData.map((s) => {
            const _scene = mapDomainSceneToInsertSceneDb({ ...s, projectId });
            if ("characterIds" in s) {
                scenesWithCharacters.push({ ...s, ..._scene, characterIds: s.characterIds });
            }
            return _scene;
        });
        if (scenesToInsert.length === 0) return [];

        const inserted = await tx
            .insert(scenes)
            .values(scenesToInsert)
            .returning();

        const characterJoins = extractCharacterJoins(scenesWithCharacters);

        if (characterJoins.length > 0) {
            await replaceSceneCharacterRelationships(tx, characterJoins);

            // const sceneIds = inserted.map(s => s.id);

            // await tx.transaction(async (innerTx) => {
            //     await innerTx
            //         .delete(scenesToCharacters)
            //         .where(inArray(scenesToCharacters.sceneId, sceneIds));

            //     if (characterJoins.length > 0) {
            //         await innerTx
            //             .insert(scenesToCharacters)
            //             .values(characterJoins);
            //     }
            // });
        }

        console.debug({ insertedNumScenes: inserted.length, linkedCharacters: characterJoins.length });

        return inserted.map(c => SceneEntity.parse(c));
    }

    async upsertScenes(projectId: string, scenesData: (z.input<typeof InsertScene>[] | Scene[]), tx: Omit<typeof db, "$client"> = db): Promise<SceneEntity[]> {
        if (!tx) throw new Error("Database not initialized");

        const scenesWithCharacters: Scene[] = [];
        const scenesToUpsert: InsertScene[] = scenesData.map((s) => {
            const _scene = mapDomainSceneToInsertSceneDb({ ...s, projectId });
            if ("characterIds" in s) {
                scenesWithCharacters.push({ ...s, ..._scene, characterIds: s.characterIds });
            }
            return _scene;
        });
        if (scenesToUpsert.length === 0) return [];

        const upserted = await tx
            .insert(scenes)
            .values(scenesToUpsert)
            .onConflictDoUpdate({
                target: scenes.id,
                set: buildConflictUpdateColumns(scenes)
            })
            .returning();

        const characterJoins = extractCharacterJoins(scenesWithCharacters);

        if (characterJoins.length > 0) {
            await replaceSceneCharacterRelationships(tx, characterJoins);

            // const sceneIds = inserted.map(s => s.id);

            // await tx.transaction(async (innerTx) => {
            //     await innerTx
            //         .delete(scenesToCharacters)
            //         .where(inArray(scenesToCharacters.sceneId, sceneIds));

            //     if (characterJoins.length > 0) {
            //         await innerTx
            //             .insert(scenesToCharacters)
            //             .values(characterJoins);
            //     }
            // });
        }

        console.debug({ upsertedNumScenes: upserted.length, linkedCharacters: characterJoins.length });

        return upserted.map(c => SceneEntity.parse(c));
    }

    async updateScenes(updates: (Partial<UpdateScene> & { id: string; projectId: string; sceneIndex: number; })[]) {
        if (!db) throw new Error("Database not initialized");

        return Promise.all(updates.map(async scene => {
            const [ row ] = await db.update(scenes)
                .set({ ...scene, updatedAt: new Date() })
                .where(eq(scenes.id, scene.id))
                .returning();
            return UpdateScene.parse(row);
        }));
    };

    /**
 * Update scene status (common operation)
 */
    async updateSceneStatus(sceneId: string, status: string): Promise<Scene> {
        if (!db) throw new Error("Database not initialized");

        return await db.transaction(async (tx) => {
            await tx.update(scenes)
                .set({ status: status as any })
                .where(eq(scenes.id, sceneId))
                .returning({ id: scenes.id });

            return this.getScene(sceneId, tx);
        });
    }

    async createCharacters(projectId: string, charactersData: z.input<typeof InsertCharacter>[], tx: Omit<typeof db, "$client"> = db): Promise<Character[]> {
        if (!tx) throw new Error("Database not initialized");

        const rows = charactersData.map(s => mapDomainCharacterToInsertCharacterDb({ ...s, projectId }));
        if (rows.length === 0) return [];

        const inserted = await tx
            .insert(characters)
            .values(rows)
            .returning();
        return inserted.map(c => mapDbCharacterToDomain(Character.parse(c)));
    }

    async upsertCharacters(projectId: string, charactersData: z.input<typeof InsertCharacter>[], tx: Omit<typeof db, "$client"> = db): Promise<Character[]> {
        if (!tx) throw new Error("Database not initialized");

        const rows = charactersData.map(s => mapDomainCharacterToInsertCharacterDb({ ...s, projectId }));
        if (rows.length === 0) return [];

        const upserted = await tx
            .insert(characters)
            .values(rows)
            .onConflictDoUpdate({
                target: characters.id,
                set: buildConflictUpdateColumns(characters)
            })
            .returning();
        return upserted.map(c => mapDbCharacterToDomain(Character.parse(c)));
    }

    async updateCharacters(updates: Character[]) {
        if (!db) throw new Error("Database not initialized");

        return Promise.all(updates.map(async char => {
            const [ row ] = await db.update(characters)
                .set({ ...char, updatedAt: new Date() })
                .where(eq(characters.id, char.id))
                .returning();
            return row;
        }));
    };

    async createLocations(projectId: string, locationsData: z.input<typeof InsertLocation>[], tx: Omit<typeof db, "$client"> = db): Promise<Location[]> {
        if (!tx) throw new Error("Database not initialized");

        const rows = locationsData.map(s => ({
            ...mapDomainLocationToInsertLocationDb({ ...s, projectId }),
            projectId
        }));
        if (rows.length === 0) return [];

        const inserted = await tx
            .insert(locations)
            .values(rows)
            .returning();
        return inserted.map(c => mapDbLocationToDomain(Location.parse(c)));
    }

    async upsertLocations(projectId: string, locationsData: z.input<typeof InsertLocation>[], tx: Omit<typeof db, "$client"> = db): Promise<Location[]> {
        if (!tx) throw new Error("Database not initialized");

        const rows = locationsData.map(s => ({
            ...mapDomainLocationToInsertLocationDb({ ...s, projectId }),
            projectId
        }));
        if (rows.length === 0) return [];

        const upserted = await tx
            .insert(locations)
            .values(rows)
            .onConflictDoUpdate({
                target: locations.id,
                set: buildConflictUpdateColumns(locations)
            })
            .returning();
        return upserted.map(c => mapDbLocationToDomain(Location.parse(c)));
    }

    async updateLocations(updates: Location[]) {
        if (!db) throw new Error("Database not initialized");

        return Promise.all(updates.map(async loc => {
            const [ row ] = await db.update(locations)
                .set({ ...loc, updatedAt: new Date() })
                .where(eq(locations.id, loc.id))
                .returning();
            return row;
        }));
    };

    async getProjectCharacters(projectId: string): Promise<Character[]> {
        if (!db) throw new Error("Database not initialized");

        const records = await db.select().from(characters).where(eq(characters.projectId, projectId));
        return records.map(c => Character.parse(c) as unknown as Character);
    }

    async getCharactersByIds(ids: string[]): Promise<Character[]> {
        if (!db) throw new Error("Database not initialized");

        if (ids.length === 0) {
            return [];
        }

        const records = await db
            .select()
            .from(characters)
            .where(inArray(characters.id, ids));
        return records.map(c => Character.parse(c) as unknown as Character);
    }

    async getCharactersWithLock(ids: string[], tx: Omit<typeof db, "$client">): Promise<Character[]> {
        if (ids.length === 0) return [];

        const sortedIds = sortIdsForLocking(ids);

        const records = await tx.select()
            .from(characters)
            .where(inArray(characters.id, sortedIds))
            .for('update');

        return records.map(c => Character.parse(c));
    }

    async getProjectLocations(projectId: string): Promise<Location[]> {
        if (!db) throw new Error("Database not initialized");

        const records = await db.select().from(locations).where(eq(locations.projectId, projectId));
        return records.map(l => Location.parse(l));
    }

    async getLocationsByIds(ids: string[]): Promise<Location[]> {
        if (!db) throw new Error("Database not initialized");

        if (ids.length === 0) {
            return [];
        }

        const records = await db
            .select()
            .from(locations)
            .where(inArray(locations.id, ids));
        return records.map(l => Location.parse(l));
    }

    async getLocationsWithLock(ids: string[], tx: Omit<typeof db, "$client">): Promise<Location[]> {
        if (ids.length === 0) return [];

        const sortedIds = sortIdsForLocking(ids);

        const records = await tx.select()
            .from(locations)
            .where(inArray(locations.id, sortedIds))
            .for('update');

        return records.map(l => Location.parse(l));
    }

    /**
   * Update assets for any entity type
   * Uses JSONB merge to preserve existing assets
   */
    async updateAssetsForTable(
        table: typeof projects | typeof scenes | typeof characters | typeof locations,
        operations: {
            entityId: string;
            entityType: EntityType;
            assetKey: AssetKey;
            history: AssetHistory;
        }[],
        tx: Omit<typeof db, "$client">
    ): Promise<void> {
        for (const op of operations) {
            await tx
                .update(table)
                .set({
                    assets: sql`COALESCE(assets, '{}'::jsonb) || jsonb_build_object(${op.assetKey}::text, ${op.history}::jsonb)`,
                    updatedAt: new Date(),
                })
                .where(eq(table.id, op.entityId));
        }
    }

    async appendProjectForceRegenerateSceneIds(projectId: string, sceneIds: string[]): Promise<Project> {
        if (!db) throw new Error("Database not initialized");

        const updatePayload: any = { updatedAt: new Date() };
        updatePayload.forceRegenerateSceneIds =
            sql`array_cat(${projects.forceRegenerateSceneIds}, ${sceneIds})`;
        const [ update ] = await db.update(projects)
            .set(updatePayload)
            .where(eq(projects.id, projectId))
            .returning();

        return mapDbProjectToDomain(update);
    }
}
