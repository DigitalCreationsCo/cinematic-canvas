// src/shared/services/tag-registry.ts
import { db, type DbTransaction } from '../db/index.js';
import * as schema from '../db/schema.js';
import { eq, and, inArray, sql, isNull, or } from 'drizzle-orm';
import {
  TagRegistryEntry,
  RegisterHandleInput,
  EntityType,
  MentionSuggestion,
  MentionEntityType,
  AssetKey,
} from '../types/index.js';
import { HydratedEntity } from '#shared/types/index.js';
import { buildRegistryFromEntries } from '#shared/entity/assets.mappers.js';
import { hydrateEntity } from '#shared/utils/entity.utils.js';

const { tagRegistry, characters, locations, props, projects, worlds, assetEntries, assetVersions } = schema;

/**
 * Tag Registry operations for Entity Mention System
 */
export class TagRegistryService {

  /**
   * Normalize a handle by removing the '@' symbol if present.
   */
  normalizeHandle(handle: string): string {
    return handle.startsWith('@') ? handle.replace('@', '') : handle;
  }

  /**
   * Register a new handle for an entity.
   * Handles are globally unique.
   */
  async registerHandle(
    input: RegisterHandleInput,
    tx: DbTransaction = db
  ): Promise<TagRegistryEntry> {
    if (!tx) throw new Error('Database not initialized');

    if (!input.entityId) {
      throw new Error(`RegisterHandle: entityId is required`);
    }

    const normalizedHandle = this.normalizeHandle(input.handle);

    return await tx.transaction(async (innerTx) => {
      const existingEntry = await innerTx
        .select()
        .from(tagRegistry)
        .where(eq(tagRegistry.handle, normalizedHandle))
        .limit(1);

      if (existingEntry.length > 0) {
        throw new Error(`Handle '${normalizedHandle}' is already registered`);
      }

      const insertValues = {
        handle: normalizedHandle,
        entityType: input.entityType as MentionEntityType,
        characterId: input.entityType === 'character' ? input.entityId : null,
        locationId: input.entityType === 'location' ? input.entityId : null,
        propId: input.entityType === 'prop' ? input.entityId : null,
        worldId: input.worldId || null,
        projectId: input.projectId || null,
      };

      try {
        const [entry] = await innerTx
          .insert(tagRegistry)
          .values(insertValues)
          .returning();

        return entry as TagRegistryEntry;
      } catch (errorDb) {
        console.error(`[Trace] Database error during handle registration:`, errorDb);
        throw new Error('Failed to register handle: Database constraint violation.');
      }
    });
  }

  /**
   * Unregister a handle. Uses precise ID targeting - no nuclear deletes.
   */
  async unregisterHandle(
    handle: string,
    tx: DbTransaction = db
  ): Promise<boolean> {
    if (!tx) throw new Error('Database not initialized');

    const normalizedHandle = this.normalizeHandle(handle);

    const [deleted] = await tx
      .delete(tagRegistry)
      .where(eq(tagRegistry.handle, normalizedHandle))
      .returning();

    return deleted !== undefined;
  }

  /**
   * Get a handle by its name.
   */
  async getHandle(
    handle: string,
    tx: typeof db = db
  ): Promise<TagRegistryEntry | null> {
    if (!tx) throw new Error('Database not initialized');

    const normalizedHandle = this.normalizeHandle(handle);

    const [entry] = await tx
      .select()
      .from(tagRegistry)
      .where(eq(tagRegistry.handle, normalizedHandle))
      .limit(1);

    return (entry ?? null) as TagRegistryEntry | null;
  }

  async getHandlesForProject(
    projectId: string,
    tx: typeof db = db
  ): Promise<TagRegistryEntry[]> {
    if (!tx) throw new Error('Database not initialized');

    const results = await tx
      .select()
      .from(tagRegistry)
      .where(eq(tagRegistry.projectId, projectId));

    return results as TagRegistryEntry[];
  }

  async getAccessibleHandles(
    projectId: string,
    userId: string,
    tx: DbTransaction = db
  ): Promise<MentionSuggestion[]> {
    if (!tx) throw new Error('Database not initialized');

    const suggestions: MentionSuggestion[] = [];

    await tx.transaction(async (innerTx) => {
      const projectRecord = await innerTx
        .select({ worldId: projects.worldId })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      const projectHandles = await innerTx
        .select()
        .from(tagRegistry)
        .where(eq(tagRegistry.projectId, projectId));

      for (const entry of projectHandles) {
        const entityType = entry.entityType as MentionEntityType;
        const entityId = entry.characterId || entry.locationId || entry.propId;
        if (!entityId) continue;
        const entityData = await this.getEntityDisplayData(entityId, entityType, innerTx);
        suggestions.push({
          handle: entry.handle,
          displayName: entityData.displayName,
          entityType,
          avatarUrl: entityData.avatarUrl,
          scope: 'project',
          isOrphaned: !entityData.exists,
        });
      }

      if (projectRecord.length > 0 && projectRecord[0].worldId) {
        const worldId = projectRecord[0].worldId;

        const worldHandles = await innerTx
          .select()
          .from(tagRegistry)
          .where(
            and(
              eq(tagRegistry.worldId, worldId),
              isNull(tagRegistry.projectId)
            )
          );

        const worldAccess = await innerTx
          .select()
          .from(schema.worldAccessGrants)
          .where(
            and(
              eq(schema.worldAccessGrants.worldId, worldId),
              eq(schema.worldAccessGrants.userId, userId)
            )
          )
          .limit(1);

        if (worldAccess.length > 0 || projectHandles.some(h => h.worldId === worldId)) {
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
              scope: 'world',
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
    entityType: EntityType,
    tx: DbTransaction
  ): Promise<{ displayName: string; avatarUrl: string | undefined; exists: boolean }> {
    switch (entityType) {
      case 'character': {
        const [char] = await tx
          .select({ name: characters.name })
          .from(characters)
          .where(eq(characters.id, entityId))
          .limit(1);

        if (!char) return { displayName: 'Unknown Character', avatarUrl: undefined, exists: false };

        const avatarUrl = await this.getEntityAvatarUrl(entityId, 'character', tx);
        return { displayName: char.name, avatarUrl, exists: true };
      }
      case 'location': {
        const [loc] = await tx
          .select({ name: locations.name })
          .from(locations)
          .where(eq(locations.id, entityId))
          .limit(1);

        if (!loc) return { displayName: 'Unknown Location', avatarUrl: undefined, exists: false };

        const avatarUrl = await this.getEntityAvatarUrl(entityId, 'location', tx);
        return { displayName: loc.name, avatarUrl, exists: true };
      }
      case 'prop': {
        const [prop] = await tx
          .select({ name: props.name })
          .from(props)
          .where(eq(props.id, entityId))
          .limit(1);

        if (!prop) return { displayName: 'Unknown Prop', avatarUrl: undefined, exists: false };

        const avatarUrl = await this.getEntityAvatarUrl(entityId, 'prop', tx);
        return { displayName: prop.name, avatarUrl, exists: true };
      }
      default:
        return { displayName: 'Unknown', avatarUrl: undefined, exists: false };
    }
  }

  /**
   * Get avatar/visual seed URL for an entity.
   */
  private async getEntityAvatarUrl(
    entityId: string,
    entityType: EntityType,
    tx: DbTransaction
  ): Promise<string | undefined> {
    let assetKey: AssetKey = 'character_image';
    let idColumn: typeof schema.assetEntries.characterId | typeof schema.assetEntries.locationId | typeof schema.assetEntries.fileId = schema.assetEntries.characterId;

    switch (entityType) {
      case 'character':
        assetKey = 'character_image';
        idColumn = schema.assetEntries.characterId;
        break;
      case 'location':
        assetKey = 'location_image';
        idColumn = schema.assetEntries.locationId;
        break;
      case 'prop':
        assetKey = 'image_file';
        idColumn = schema.assetEntries.fileId;
        break;
    }

    const entry = await tx
      .select()
      .from(assetEntries)
      .where(
        and(
          eq(assetEntries.assetKey, assetKey),
          eq(idColumn, entityId)
        )
      )
      .limit(1);

    if (entry.length === 0) return undefined;

    const version = await tx
      .select({ data: assetVersions.data })
      .from(assetVersions)
      .where(
        and(
          eq(assetVersions.assetEntryId, entry[0].id),
          eq(assetVersions.version, entry[0].best)
        )
      )
      .limit(1);

    return version[0]?.data ?? undefined;
  }

  /**
   * Filter handles by access permissions.
   * Returns only handles the user can access.
   */
  async verifyHandleAccessBulk(
    { handles, userId, projectId }: { handles: string[]; userId: string; projectId: string; },
    tx: typeof db = db
  ): Promise<string[]> {
    if (handles.length === 0) return [];

    const normalizedHandles = handles.map(h => this.normalizeHandle(h));

    const results = await tx
      .select({ handle: tagRegistry.handle })
      .from(tagRegistry)
      .leftJoin(
        schema.worldAccessGrants,
        and(
          eq(schema.worldAccessGrants.worldId, tagRegistry.worldId),
          eq(schema.worldAccessGrants.userId, userId)
        )
      )
      .where(
        and(
          inArray(tagRegistry.handle, normalizedHandles),
          or(
            eq(tagRegistry.projectId, projectId),
            sql`${schema.worldAccessGrants.id} IS NOT NULL`
          )
        )
      );

    return results.map(r => r.handle);
  }

  /**
* Optimized hydration query.
* Aggregates all asset entries and version history into arrays per entity.
*/
  async getHydrationPayloadsBulk(
    arrayHandlesAuthorized: string[],
    tx: typeof db = db
  ): Promise<HydratedEntity<any>[]> {
    if (arrayHandlesAuthorized.length === 0) return [];

    const recordsPayloads = await tx
      .select({
        handle: tagRegistry.handle,
        entityType: tagRegistry.entityType,
        character: characters,
        location: locations,
        prop: props,
        // Aggregate all entries linked to this entity
        entries: sql<schema.AssetEntry[]>`
        COALESCE(
          jsonb_agg(DISTINCT ${assetEntries}) 
          FILTER (WHERE ${assetEntries.id} IS NOT NULL), 
          '[]'
        )`.as('entries'),
        // Aggregate the entire version history for the registry
        versions: sql<schema.AssetVersionRow[]>`
        COALESCE(
          jsonb_agg(DISTINCT ${assetVersions}) 
          FILTER (WHERE ${assetVersions.id} IS NOT NULL), 
          '[]'
        )`.as('versions'),
      })
      .from(tagRegistry)
      .leftJoin(characters, and(eq(tagRegistry.entityType, 'character'), eq(tagRegistry.characterId, characters.id)))
      .leftJoin(locations, and(eq(tagRegistry.entityType, 'location'), eq(tagRegistry.locationId, locations.id)))
      .leftJoin(props, and(eq(tagRegistry.entityType, 'prop'), eq(tagRegistry.propId, props.id)))
      // Join all entries and versions without version-filtering (Full Hydration)
      .leftJoin(assetEntries, or(
        eq(assetEntries.characterId, characters.id),
        eq(assetEntries.locationId, locations.id),
        eq(assetEntries.propId, props.id)
      ))
      .leftJoin(assetVersions, eq(assetVersions.assetEntryId, assetEntries.id))
      .where(inArray(tagRegistry.handle, arrayHandlesAuthorized))
      .groupBy(
        tagRegistry.handle,
        tagRegistry.entityType,
        characters.id,
        locations.id,
        props.id
      );

    return recordsPayloads.map(r => {
      // 1. Build the full AssetRegistry from aggregated arrays
      const registry = buildRegistryFromEntries(r.entries, r.versions);

      // 2. Resolve the base entity object
      const baseEntity =
        r.entityType === "character" ? r.character
          : r.entityType === "location" ? r.location
            : r.prop;

      if (!baseEntity) {
        throw new Error(`Failed to resolve base entity for handle: ${r.handle}`);
      }

      // 3. Hydrate with "best" overrides and attach registry
      return hydrateEntity(baseEntity, registry);
    });
  }
}

export const tagRegistryService = new TagRegistryService();
