// src/shared/services/tag-registry.ts
// Tag Registry CRUD operations for Entity Mention System

import { db, type DbTransaction } from '../db/index.js';
import * as schema from '../db/schema.js';
import { eq, and, inArray, sql, isNull, or } from 'drizzle-orm';
import {
  TagRegistryEntry,
  RegisterHandleInput,
  EntityType,
  MentionSuggestion,
} from '../types/mention.types.js';
import { v7 as uuidv7 } from 'uuid';

const { tagRegistry, characters, locations, props, projects, worlds, assetEntries, assetVersions } = schema;

export class TagRegistryService {
  /**
   * Register a new handle for an entity.
   * Handles are globally unique.
   */
  async registerHandle(
    input: RegisterHandleInput,
    tx: DbTransaction = db
  ): Promise<TagRegistryEntry> {
    if (!tx) throw new Error('Database not initialized');

    const normalizedHandle = input.handle.startsWith('@')
      ? input.handle
      : `@${input.handle}`;

    return await tx.transaction(async (innerTx) => {
      const existingEntry = await innerTx
        .select()
        .from(tagRegistry)
        .where(eq(tagRegistry.handle, normalizedHandle))
        .limit(1);

      if (existingEntry.length > 0) {
        throw new Error(`Handle '${normalizedHandle}' is already registered`);
      }

      const [entry] = await innerTx
        .insert(tagRegistry)
        .values({
          handle: normalizedHandle,
          entityId: input.entityId,
          entityType: input.entityType as 'character' | 'location' | 'prop',
          worldId: input.worldId,
          projectId: input.projectId,
        })
        .returning();

      return entry as TagRegistryEntry;
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

    const normalizedHandle = handle.startsWith('@') ? handle : `@${handle}`;

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

    const normalizedHandle = handle.startsWith('@') ? handle : `@${handle}`;

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
        const entityType = entry.entityType as EntityType;
        const entityData = await this.getEntityDisplayData(entry.entityId, entityType, innerTx);
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
            const entityType = entry.entityType as EntityType;
            const entityData = await this.getEntityDisplayData(entry.entityId, entityType, innerTx);
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
    let assetKey: string;
    let idColumn: typeof schema.assetEntries.characterId | typeof schema.assetEntries.locationId | typeof schema.assetEntries.fileId;

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
          eq(assetEntries.assetKey, assetKey as any),
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
    handles: string[],
    userId: string,
    projectId: string,
    tx: typeof db = db
  ): Promise<string[]> {
    if (handles.length === 0) return [];

    const normalizedHandles = handles.map(h => h.startsWith('@') ? h : `@${h}`);

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
   * Get hydration payloads for authorized handles.
   * Uses lateral joins to unify polymorphic entities.
   */
  async getHydrationPayloadsBulk(
    handlesAuthorized: string[],
    tx: typeof db = db
  ) {
    if (handlesAuthorized.length === 0) return [];

    const records = await tx
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
        bestAssetData: assetVersions.data,
      })
      .from(tagRegistry)
      .leftJoin(characters, and(
        eq(tagRegistry.entityType, 'character'),
        eq(tagRegistry.entityId, characters.id)
      ))
      .leftJoin(locations, and(
        eq(tagRegistry.entityType, 'location'),
        eq(tagRegistry.entityId, locations.id)
      ))
      .leftJoin(props, and(
        eq(tagRegistry.entityType, 'prop'),
        eq(tagRegistry.entityId, props.id)
      ))
      .leftJoin(assetEntries, and(
        inArray(assetEntries.assetKey, ['character_image', 'location_image', 'image_file']),
        or(
          eq(assetEntries.characterId, characters.id),
          eq(assetEntries.locationId, locations.id),
          eq(assetEntries.fileId, props.id)
        )
      ))
      .leftJoin(assetVersions, and(
        eq(assetVersions.assetEntryId, assetEntries.id),
        eq(assetVersions.version, assetEntries.best)
      ))
      .where(inArray(tagRegistry.handle, handlesAuthorized));

    return records.map(r => ({
      handle: r.handle,
      name: r.charName || r.locName || r.propName || 'Unknown Entity',
      description: r.charDesc || r.locDesc || r.propDesc,
      traits: r.charTraits || null,
      state: r.charState || r.locState || null,
      visualSeedData: r.bestAssetData || null,
      entityType: r.entityType,
    }));
  }
}

export const tagRegistryService = new TagRegistryService();
