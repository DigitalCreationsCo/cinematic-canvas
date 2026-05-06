// src/shared/services/tag-registry.ts
import { db, type DbTransaction } from "#shared/db/index.js";
import * as schema from "#shared/db/schema.js";
import { eq, and, inArray, sql, isNull, or } from "drizzle-orm";
import { TagRegistryEntry, RegisterHandleInput, MentionSuggestion } from "#shared/types/mention.types.js";
import { EntityPrimitiveType } from "#shared/types/entity.types.js";
import { EntityMentionableType } from "#shared/types/entity.types.js";
import { AssetKey } from "#shared/types/assets.types.js";
import { AssetEntry, AssetVersionRow } from "#shared/types/schema.types.js";
import { HydratedEntityEnvelope } from "#shared/types/workflow.types.js";
import { buildRegistryFromEntries } from "#shared/entity/assets.mappers.js";
import { hydrateEntity } from "#shared/utils/entity.utils.js";
import { mapCharacterWithAssetsToDomainCharacter } from "#shared/entity/character-mappers.js";
import { mapLocationWithAssetsToDomainLocation } from "#shared/entity/location-mappers.js";
import { mapPropWithAssetsToDomainProp } from "#shared/entity/prop-mappers.js";
import { generateNanoId } from "#shared/utils/id.js";
import { ProjectRepository } from "#shared/services/project-repository.js";

const { tagRegistry, characters, locations, props, projects, assetEntries, assetVersions } = schema;

/**
 * Tag Registry operations for Entity Mention System
 */
export class TagRegistryService {
  private projectRepository: ProjectRepository;
  constructor(projectRepository?: ProjectRepository) {
    this.projectRepository = projectRepository || new ProjectRepository();
  }
  /**
   * Normalize a handle by removing the '@' symbol if present.
   */
  normalizeHandle(handle: string): string {
    return handle.startsWith("@") ? handle.replace("@", "") : handle;
  }

  /**
   * Register a new handle for an entity.
   * Handles are globally unique.
   */
  async registerHandle(input: RegisterHandleInput, tx: DbTransaction = db, retryCount = 0): Promise<TagRegistryEntry> {
    const MAX_RETRIES = 5;
    if (!tx) throw new Error("Database not initialized");
    if (!input.entityId) throw new Error(`RegisterHandle: entityId is required`);

    const baseHandle = this.normalizeHandle(input.handle);
    // Append suffix only if we are on a retry attempt
    const currentHandle = retryCount === 0 ? baseHandle : `${baseHandle}_${generateNanoId()}`;

    try {
      return await tx.transaction(async (innerTx) => {
        const insertValues = {
          handle: currentHandle,
          entityType: input.entityType as EntityMentionableType,
          characterId: input.entityType === "character" ? input.entityId : null,
          locationId: input.entityType === "location" ? input.entityId : null,
          propId: input.entityType === "prop" ? input.entityId : null,
          worldId: input.worldId || null,
          projectId: input.projectId || null,
        };

        const [entry] = await innerTx.insert(tagRegistry).values(insertValues).returning();

        // 2. If handle was modified with a suffix, sync back to the entity
        if (currentHandle !== baseHandle) {
          await this.projectRepository.patchEntities([
            {
              entityId: input.entityId,
              entityType: input.entityType,
              patch: { referenceId: currentHandle }, // Syncing the new unique handle
            },
          ]);
        }

        return entry as TagRegistryEntry;
      });
    } catch (error: any) {
      // Check for Unique Constraint violation (Postgres: 23505, SQLite: SQLITE_CONSTRAINT)
      const isCollision = error.code === "23505" || error.message?.includes("unique constraint");

      if (isCollision && retryCount < MAX_RETRIES) {
        return this.registerHandle(input, tx, retryCount + 1);
      }

      console.error(`[Trace] Handle registration failed:`, error);
      throw new Error(`Failed to register handle after ${retryCount} retries.`);
    }
  }

  /**
   * Unregister a handle. Uses precise ID targeting - no nuclear deletes.
   */
  async unregisterHandle(handle: string, tx: DbTransaction = db): Promise<boolean> {
    if (!tx) throw new Error("Database not initialized");

    const normalizedHandle = this.normalizeHandle(handle);

    const [deleted] = await tx.delete(tagRegistry).where(eq(tagRegistry.handle, normalizedHandle)).returning();

    return deleted !== undefined;
  }

  /**
   * Get a handle by its name.
   */
  async getHandle(handle: string, tx: typeof db = db): Promise<TagRegistryEntry | null> {
    if (!tx) throw new Error("Database not initialized");

    const normalizedHandle = this.normalizeHandle(handle);

    const [entry] = await tx.select().from(tagRegistry).where(eq(tagRegistry.handle, normalizedHandle)).limit(1);

    return (entry ?? null) as TagRegistryEntry | null;
  }

  async getHandlesForProject(projectId: string, tx: typeof db = db): Promise<TagRegistryEntry[]> {
    if (!tx) throw new Error("Database not initialized");

    const results = await tx.select().from(tagRegistry).where(eq(tagRegistry.projectId, projectId));

    return results as TagRegistryEntry[];
  }

  async getAccessibleHandles(projectId: string, userId: string, tx: DbTransaction = db): Promise<MentionSuggestion[]> {
    if (!tx) throw new Error("Database not initialized");

    const suggestions: MentionSuggestion[] = [];

    await tx.transaction(async (innerTx) => {
      const projectRecord = await innerTx
        .select({ worldId: projects.worldId })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      const projectHandles = await innerTx.select().from(tagRegistry).where(eq(tagRegistry.projectId, projectId));

      for (const entry of projectHandles) {
        const entityType = entry.entityType as EntityMentionableType;
        const entityId = entry.characterId || entry.locationId || entry.propId;
        if (!entityId) continue;
        const entityData = await this.getEntityDisplayData(entityId, entityType, innerTx);
        suggestions.push({
          handle: entry.handle,
          displayName: entityData.displayName,
          entityType,
          avatarUrl: entityData.avatarUrl,
          scope: "project",
          isOrphaned: !entityData.exists,
        });
      }

      if (projectRecord.length > 0 && projectRecord[0].worldId) {
        const worldId = projectRecord[0].worldId;

        const worldHandles = await innerTx
          .select()
          .from(tagRegistry)
          .where(and(eq(tagRegistry.worldId, worldId), isNull(tagRegistry.projectId)));

        const worldAccess = await innerTx
          .select()
          .from(schema.worldAccessGrants)
          .where(and(eq(schema.worldAccessGrants.worldId, worldId), eq(schema.worldAccessGrants.userId, userId)))
          .limit(1);

        if (worldAccess.length > 0 || projectHandles.some((h) => h.worldId === worldId)) {
          for (const entry of worldHandles) {
            const entityType = entry.entityType;
            const entityId = entry.characterId || entry.locationId || entry.propId;
            if (!entityId) continue;
            const entityData = await this.getEntityDisplayData(entityId, entityType, innerTx);
            suggestions.push({
              handle: entry.handle,
              displayName: entityData.displayName,
              entityType,
              avatarUrl: entityData.avatarUrl,
              scope: "world",
              isOrphaned: !entityData.exists,
            });
          }
        }
      }
    });

    return suggestions;
  }

  /**
   * Get entity display data for suggestions.
   */
  private async getEntityDisplayData(
    entityId: string,
    entityType: EntityPrimitiveType,
    tx: DbTransaction,
  ): Promise<{
    displayName: string;
    avatarUrl: string | undefined;
    exists: boolean;
  }> {
    switch (entityType) {
      case "character": {
        const [char] = await tx
          .select({ name: characters.name })
          .from(characters)
          .where(eq(characters.id, entityId))
          .limit(1);

        if (!char)
          return {
            displayName: "Unknown Character",
            avatarUrl: undefined,
            exists: false,
          };

        const avatarUrl = await this.getEntityAvatarUrl(entityId, "character", tx);
        return { displayName: char.name, avatarUrl, exists: true };
      }
      case "location": {
        const [loc] = await tx
          .select({ name: locations.name })
          .from(locations)
          .where(eq(locations.id, entityId))
          .limit(1);

        if (!loc)
          return {
            displayName: "Unknown Location",
            avatarUrl: undefined,
            exists: false,
          };

        const avatarUrl = await this.getEntityAvatarUrl(entityId, "location", tx);
        return { displayName: loc.name, avatarUrl, exists: true };
      }
      case "prop": {
        const [prop] = await tx.select({ name: props.name }).from(props).where(eq(props.id, entityId)).limit(1);

        if (!prop)
          return {
            displayName: "Unknown Prop",
            avatarUrl: undefined,
            exists: false,
          };

        const avatarUrl = await this.getEntityAvatarUrl(entityId, "prop", tx);
        return { displayName: prop.name, avatarUrl, exists: true };
      }
      default:
        return { displayName: "Unknown", avatarUrl: undefined, exists: false };
    }
  }

  /**
   * Get avatar/visual seed URL for an entity.
   */
  private async getEntityAvatarUrl(
    entityId: string,
    entityType: EntityPrimitiveType,
    tx: DbTransaction,
  ): Promise<string | undefined> {
    let assetKey: AssetKey = "character_image";
    let idColumn:
      | typeof schema.assetEntries.characterId
      | typeof schema.assetEntries.locationId
      | typeof schema.assetEntries.fileId = schema.assetEntries.characterId;

    switch (entityType) {
      case "character":
        assetKey = "character_image";
        idColumn = schema.assetEntries.characterId;
        break;
      case "location":
        assetKey = "location_image";
        idColumn = schema.assetEntries.locationId;
        break;
      case "prop":
        assetKey = "image_file";
        idColumn = schema.assetEntries.fileId;
        break;
    }

    const entry = await tx
      .select()
      .from(assetEntries)
      .where(and(eq(assetEntries.assetKey, assetKey), eq(idColumn, entityId)))
      .limit(1);

    if (entry.length === 0) return undefined;

    const version = await tx
      .select({ data: assetVersions.data })
      .from(assetVersions)
      .where(and(eq(assetVersions.assetEntryId, entry[0].id), eq(assetVersions.version, entry[0].best)))
      .limit(1);

    return version[0]?.data ?? undefined;
  }

  /**
   * Filter handles by access permissions.
   * Returns only handles the user can access.
   */
  async verifyHandleAccessBulk(
    { handles, userId, projectId }: { handles: string[]; userId: string; projectId: string },
    tx: typeof db = db,
  ): Promise<string[]> {
    if (handles.length === 0) return [];

    const normalizedHandles = handles.map((h) => this.normalizeHandle(h));

    const results = await tx
      .select({ handle: tagRegistry.handle })
      .from(tagRegistry)
      .leftJoin(
        schema.worldAccessGrants,
        and(eq(schema.worldAccessGrants.worldId, tagRegistry.worldId), eq(schema.worldAccessGrants.userId, userId)),
      )
      .where(
        and(
          inArray(tagRegistry.handle, normalizedHandles),
          or(eq(tagRegistry.projectId, projectId), sql`${schema.worldAccessGrants.id} IS NOT NULL`),
        ),
      );

    return results.map((r) => r.handle);
  }

  /**
   * Optimized hydration query.
   * Aggregates all asset entries and version history into arrays per entity.
   */
  async getHydrationPayloadsBulk(
    arrayHandlesAuthorized: string[],
    tx: typeof db = db,
  ): Promise<HydratedEntityEnvelope<EntityMentionableType>[]> {
    if (arrayHandlesAuthorized.length === 0) return [];

    const recordsPayloads = await tx
      .select({
        handle: tagRegistry.handle,
        entityType: tagRegistry.entityType,
        character: characters,
        location: locations,
        prop: props,
        // Aggregate all entries linked to this entity
        entries: sql<AssetEntry[]>`
        COALESCE(
          jsonb_agg(DISTINCT ${assetEntries})
          FILTER (WHERE ${assetEntries.id} IS NOT NULL),
          '[]'
        )`.as("entries"),
        // Aggregate the entire version history for the registry
        versions: sql<AssetVersionRow[]>`
        COALESCE(
          jsonb_agg(DISTINCT ${assetVersions})
          FILTER (WHERE ${assetVersions.id} IS NOT NULL),
          '[]'
        )`.as("versions"),
      })
      .from(tagRegistry)
      .leftJoin(characters, and(eq(tagRegistry.entityType, "character"), eq(tagRegistry.characterId, characters.id)))
      .leftJoin(locations, and(eq(tagRegistry.entityType, "location"), eq(tagRegistry.locationId, locations.id)))
      .leftJoin(props, and(eq(tagRegistry.entityType, "prop"), eq(tagRegistry.propId, props.id)))
      // Join all entries and versions without version-filtering (Full Hydration)
      .leftJoin(
        assetEntries,
        or(
          eq(assetEntries.characterId, characters.id),
          eq(assetEntries.locationId, locations.id),
          eq(assetEntries.propId, props.id),
        ),
      )
      .leftJoin(assetVersions, eq(assetVersions.assetEntryId, assetEntries.id))
      .where(inArray(tagRegistry.handle, arrayHandlesAuthorized))
      .groupBy(tagRegistry.handle, tagRegistry.entityType, characters.id, locations.id, props.id);

    return recordsPayloads.map((r) => {
      const registry = buildRegistryFromEntries(r.entries, r.versions);

      const baseEntity =
        r.entityType === "character"
          ? mapCharacterWithAssetsToDomainCharacter({
              ...r.character!,
              assets: registry,
            })
          : r.entityType === "location"
            ? mapLocationWithAssetsToDomainLocation({
                ...r.location!,
                assets: registry,
              })
            : mapPropWithAssetsToDomainProp({ ...r.prop!, assets: registry });

      if (!baseEntity) {
        throw new Error(`Failed to resolve base entity for handle: ${r.handle}`);
      }

      const hydrated = hydrateEntity(baseEntity, registry);

      // HANDLE IS ASSUMED TO BE SYNONYMOUS WITH THE REFERENCE ID
      // TODO: TEST AND ENSURE
      return {
        data: {
          ...hydrated,
          assets: registry,
        },
        entityType: r.entityType,
      };
    });
  }
}

export const tagRegistryService = new TagRegistryService();
