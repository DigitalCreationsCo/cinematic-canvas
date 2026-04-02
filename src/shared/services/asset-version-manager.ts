import { ProjectRepository } from "../services/project-repository.js";
import { db, type DbTransaction } from "../db/index.js";
import {
  AssetHistory,
  AssetRegistry,
  AssetType,
  AssetVersion,
  AssetKey,
  Scope,
  CreateVersionedAssetsBaseArgs,
  EntityType,
  UserFeedback,
} from "../types/index.js";
import { assetEntries, assetVersions, mediaObjects, AssetEntry, AssetVersionRow, InsertAssetVersion } from "../db/schema.js";
import { eq, and, desc, inArray, sql, isNull, gte, lte } from "drizzle-orm";
import { entityIdAt, entityTypeOf } from "../utils/assets-utils.js";
import { generateId } from "#shared/utils/id.js";

/**
 * Asset Version Manager - Refactored for Dual-Table Architecture
 * 
 * Architecture:
 * - asset_entries: Metadata about each asset (head, best pointers)
 * - asset_versions: Append-only version history
 * 
 * Features:
 * 1. Tiered fetching (lite vs full hydration)
 * 2. Batch operations for efficiency
 * 3. No locking (optimistic concurrency)
 * 4. Backwards compatible API (returns AssetHistory/AssetVersion)
 * 5. Single-query joins for performance
 */

// ============================================================================
// TYPES
// ============================================================================

interface BatchCreateResult {
  histories: AssetHistory[];
  errors: Array<{ index: number; error: Error; }>;
}

interface AssetEntryWithVersions extends AssetEntry {
  versions: AssetVersionRow[];
}

const MEDIA_TYPES: AssetType[] = ['image', 'video', 'audio'];

// ============================================================================
// MANAGER CLASS
// ============================================================================

export class AssetVersionManager {
  constructor(private projectRepo: ProjectRepository) { }


  isMediaType(type: AssetType): boolean {
    return MEDIA_TYPES.includes(type);
  }
  // ==========================================================================
  // PUBLIC API - ASSET CREATION
  // ==========================================================================

  /**
   * Create one new version per entity in scope.
   * 
   * @param scope - Entity scope (project, scenes, characters, locations)
   * @param assetKeys - Key(s) to create. Polymorphic:
   *   - Single key: all entities get same key
   *   - Multiple keys: entity i gets assetKeys[i] (fallback to [0])
   * @param type - Asset type (polymorphic like assetKeys)
   * @param dataList - Data URLs, one per entity
   * @param metadata - Metadata (polymorphic like assetKeys)
   * @param setBest - Whether to mark new versions as best (polymorphic)
   */
  async createVersionedAssets(
    ...[scope, assetKeys, type, dataList, metadata, setBest = true, startedAt]: CreateVersionedAssetsBaseArgs
  ): Promise<AssetHistory[]> {
    this.validateCreateInput(scope, dataList.length);

    const versionsToCreate = this.prepareVersionsToCreate(
      dataList,
      type,
      metadata,
      dataList.length,
      startedAt ?? new Date(),
    );

    return await this.saveAssetHistories(
      scope,
      assetKeys,
      versionsToCreate,
      setBest,
    );
  }

  /**
   * Batch create multiple asset types at once.
   * More efficient when creating multiple assets for the same entities.
   */
  async batchCreateVersionedAssets(
    operations: CreateVersionedAssetsBaseArgs[]
  ): Promise<BatchCreateResult> {
    const results = await Promise.allSettled(
      operations.map((args) => this.createVersionedAssets(...args))
    );

    const histories: AssetHistory[] = [];
    const errors: Array<{ index: number; error: Error; }> = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        histories.push(...result.value);
      } else {
        errors.push({ index, error: result.reason });
      }
    });

    return { histories, errors };
  }

  // ==========================================================================
  // PUBLIC API - READ QUERIES
  // ==========================================================================

  /**
   * Returns the next version number for each entity in scope.
   * Uses lite fetch (entries only, no version data).
   */
  async getNextVersionNumber(
    scope: Scope,
    assetKeys: AssetKey[]
  ): Promise<number[]> {
    const histories = await this.resolveHistoriesLite(scope, assetKeys);
    return histories.map((h) => h.head + 1);
  }

  /**
   * Returns the "Best" (active) version of an asset for each entity in scope.
   * Uses full fetch to get the actual version data.
   */
  async getBestVersion(
    scope: Scope,
    assetKeys: AssetKey[]
  ): Promise<(AssetVersion | null)[]> {
    const histories = await this.resolveHistoriesFull(scope, assetKeys);
    return histories.map((h) => {
      if (h.best === 0 || !h.versions.length) return null;
      return h.versions.find((v) => v.version === h.best) ?? null;
    });
  }

  /**
   * Get all versions for all assets across all entities in scope, newest first.
   */
  async getAllVersions(
    scope: Scope,
    assetKeys: AssetKey[]
  ): Promise<AssetVersion[][]> {
    const histories = await this.resolveHistoriesFull(scope, assetKeys);
    return histories.map((h) =>
      [...h.versions].sort((a, b) => b.version - a.version)
    );
  }

  /**
   * Get specific version by number for each entity.
   */
  async getVersionByNumber(
    scope: Scope,
    assetKeys: AssetKey[],
    versions: number[]
  ): Promise<(AssetVersion | null)[]> {
    const histories = await this.resolveHistoriesFull(scope, assetKeys);
    this.assertLengthMatch(histories.length, versions.length, "version numbers");

    return histories.map((history, i) => {
      return history.versions.find((v) => v.version === versions[i]) ?? null;
    });
  }

  // ==========================================================================
  // PUBLIC API - VERSION MANAGEMENT
  // ==========================================================================

  /**
   * Move the "best" pointer for each entity in scope.
   * Validates every target version exists before committing.
   */
  async setBestVersion(
    scope: Scope,
    assetKeys: AssetKey[],
    versionNumbers: number[]
  ): Promise<AssetHistory[]> {
    const entityIds = entityIdAt(scope).ids;
    const entityType = entityTypeOf(scope);

    this.assertLengthMatch(entityIds.length, versionNumbers.length, "version numbers");
    this.assertLengthMatch(entityIds.length, assetKeys.length, "asset keys");

    return await db.transaction(async (tx) => {
      // Fetch current entries to validate versions exist
      const entries = await this.fetchEntriesFull(scope, assetKeys, tx);

      const updatedEntries: AssetEntry[] = [];

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const targetVersion = versionNumbers[i];

        if (!entry) {
          throw new Error(
            `No asset entry found for ${entityType} ${entityIds[i]} with key ${assetKeys[i] ?? assetKeys[0]}`
          );
        }

        // Validate version exists
        const versionExists = entry.versions.some(v => v.version === targetVersion);
        if (!versionExists) {
          throw new Error(
            `Version ${targetVersion} not found for asset ${assetKeys[i] ?? assetKeys[0]}`
          );
        }

        // Update best pointer
        const [updated] = await tx
          .update(assetEntries)
          .set({
            best: targetVersion,
            updatedAt: new Date()
          })
          .where(eq(assetEntries.id, entry.id))
          .returning();

        updatedEntries.push(updated);
      }

      // Fetch full histories for return
      return await this.resolveHistoriesFull(scope, assetKeys, tx);
    });
  }

  // ==========================================================================
  // PUBLIC API - USER FEEDBACK
  // ==========================================================================

  /**
   * Record user feedback (liked / disliked) on a specific asset version.
   *
   * - 'liked': writes the feedback, promotes that version to best, and sets
   *   bestLockedByFeedback=true so autonomous generation cannot override it.
   *   New versions will still be created and tracked but won't become best.
   *
   * - 'disliked': writes the feedback only. Does not change best.
   *   If the disliked version was the locked best, the lock is cleared so the
   *   next generated version can reclaim best normally.
   *
   * - null: clears any existing feedback on the version and releases the
   *   like-lock if this version held it.
   */
  async recordUserFeedback(
    scope: Scope,
    assetKey: AssetKey,
    versionNumber: number,
    feedback: UserFeedback | null,
  ): Promise<AssetHistory> {
    const entityIds = entityIdAt(scope).ids;
    if (entityIds.length !== 1) {
      throw new Error("recordUserFeedback operates on a single entity at a time");
    }

    return await db.transaction(async (tx) => {
      const [entry] = await this.fetchEntriesFull(scope, [assetKey], tx);

      if (!entry) {
        throw new Error(
          `No asset entry found for key '${assetKey}' on entity '${entityIds[0]}'`
        );
      }

      const versionExists = entry.versions.some(v => v.version === versionNumber);
      if (!versionExists) {
        throw new Error(`Version ${versionNumber} not found for asset '${assetKey}'`);
      }

      // Write (or clear) feedback on the version row
      await tx
        .update(assetVersions)
        .set({ userFeedback: feedback })
        .where(
          and(
            eq(assetVersions.assetEntryId, entry.id),
            eq(assetVersions.version, versionNumber),
          )
        );

      // Determine best pointer and lock state changes
      let newBest = entry.best;
      let newLocked = entry.bestLockedByFeedback;

      if (feedback?.rating === "liked") {
        newBest = versionNumber;
        newLocked = true;
      } else if (feedback?.rating === "disliked" || feedback === null) {
        // Release the lock if this version was the one holding it
        if (newLocked && entry.best === versionNumber) {
          newLocked = false;
        }
      }

      await tx
        .update(assetEntries)
        .set({ best: newBest, bestLockedByFeedback: newLocked, updatedAt: new Date() })
        .where(eq(assetEntries.id, entry.id));

      const [history] = await this.resolveHistoriesFull(scope, [assetKey], tx);
      return history;
    });
  }

  /**
   * Delete specific versions (mark as deleted or remove from DB).
   * Note: Cannot delete the current "best" version.
   */
  async deleteVersions(
    scope: Scope,
    assetKeys: AssetKey[],
    versionNumbers: number[]
  ): Promise<AssetHistory[]> {
    const entityIds = entityIdAt(scope).ids;

    this.assertLengthMatch(entityIds.length, versionNumbers.length, "version numbers");

    return await db.transaction(async (tx) => {
      const entries = await this.fetchEntriesFull(scope, assetKeys, tx);

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const versionToDelete = versionNumbers[i];

        if (!entry) continue;

        // Cannot delete the best version
        if (entry.best === versionToDelete) {
          throw new Error(
            `Cannot delete version ${versionToDelete} - it is currently marked as best`
          );
        }

        // Fetch the specific version to retrieve its GCS URI prior to deletion
        const [record] = await tx.select({
          mediaId: assetVersions.mediaId
        })
          .from(assetVersions)
          .where(and(eq(assetVersions.assetEntryId, entry.id), eq(assetVersions.version, versionToDelete)));

        if (record) {
          // 1. Delete the asset version leaf record
          await tx
            .delete(assetVersions)
            .where(
              and(
                eq(assetVersions.assetEntryId, entry.id),
                eq(assetVersions.version, versionToDelete)
              )
            );

          // ONLY decrement if there was a media link
          if (record.mediaId) {
            await tx.update(mediaObjects)
              .set({
                refCount: sql`${mediaObjects.refCount} - 1`,
                lastReferencedAt: new Date(),
                status: sql`CASE WHEN ${mediaObjects.refCount} - 1 <= 0 THEN 'pending_deletion' ELSE 'active' END`
              })
              .where(eq(mediaObjects.data, record.mediaId));
          }

          console.debug(`[AssetVersionManager] Decremented ref count for ${record.mediaId}`);
        }

        // Update head if we deleted the highest version
        if (versionToDelete === entry.head) {
          const remainingVersions = entry.versions
            .filter(v => v.version !== versionToDelete)
            .map(v => v.version);

          const newHead = remainingVersions.length > 0
            ? Math.max(...remainingVersions)
            : 0;

          await tx
            .update(assetEntries)
            .set({
              head: newHead,
              updatedAt: new Date()
            })
            .where(eq(assetEntries.id, entry.id));
        }
      }

      return await this.resolveHistoriesFull(scope, assetKeys, tx);
    });
  }

  // ==========================================================================
  // PUBLIC API - REGISTRY QUERIES (for backward compatibility)
  // ==========================================================================

  /**
   * Get complete asset registry for a scene (all asset keys with histories).
   */
  async getAllSceneAssets(sceneId: string): Promise<AssetRegistry> {
    const entries = await db
      .select()
      .from(assetEntries)
      .where(eq(assetEntries.sceneId, sceneId));

    if (entries.length === 0) return {};

    // Fetch all versions for these entries
    const entryIds = entries.map(e => e.id);
    const versions = await db
      .select()
      .from(assetVersions)
      .where(inArray(assetVersions.assetEntryId, entryIds))
      .orderBy(assetVersions.version);

    return this.buildRegistryFromEntries(entries, versions);
  }

  /**
   * Get all assets for a project.
   */
  async getAllProjectAssets(projectId: string): Promise<AssetRegistry> {
    const entries = await db
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

    if (entries.length === 0) return {};

    const entryIds = entries.map(e => e.id);
    const versions = await db
      .select()
      .from(assetVersions)
      .where(inArray(assetVersions.assetEntryId, entryIds))
      .orderBy(assetVersions.version);

    return this.buildRegistryFromEntries(entries, versions);
  }

  /**
   * Get all assets for a character.
   */
  async getAllCharacterAssets(characterId: string): Promise<AssetRegistry> {
    const entries = await db
      .select()
      .from(assetEntries)
      .where(eq(assetEntries.characterId, characterId));

    if (entries.length === 0) return {};

    const entryIds = entries.map(e => e.id);
    const versions = await db
      .select()
      .from(assetVersions)
      .where(inArray(assetVersions.assetEntryId, entryIds))
      .orderBy(assetVersions.version);

    return this.buildRegistryFromEntries(entries, versions);
  }

  /**
   * Get all assets for a location.
   */
  async getAllLocationAssets(locationId: string): Promise<AssetRegistry> {
    const entries = await db
      .select()
      .from(assetEntries)
      .where(eq(assetEntries.locationId, locationId));

    if (entries.length === 0) return {};

    const entryIds = entries.map(e => e.id);
    const versions = await db
      .select()
      .from(assetVersions)
      .where(inArray(assetVersions.assetEntryId, entryIds))
      .orderBy(assetVersions.version);

    return this.buildRegistryFromEntries(entries, versions);
  }

  /**
   * Get all assets for an image.
   */
  async getAllFileAssets(fileId: string): Promise<AssetRegistry> {
    const entries = await db
      .select()
      .from(assetEntries)
      .where(eq(assetEntries.fileId, fileId));

    if (entries.length === 0) return {};

    const entryIds = entries.map(e => e.id);
    const versions = await db
      .select()
      .from(assetVersions)
      .where(inArray(assetVersions.assetEntryId, entryIds))
      .orderBy(assetVersions.version);

    return this.buildRegistryFromEntries(entries, versions);
  }

  async getAssetRegistryForEntity(entityId: string, entityType: EntityType | 'image'): Promise<AssetRegistry> {
    if (entityType === 'character') {
      return this.getAllCharacterAssets(entityId);
    } else if (entityType === 'location') {
      return this.getAllLocationAssets(entityId);
    } else if (entityType === 'scene') {
      return this.getAllSceneAssets(entityId);
    } else if (entityType === 'image') {
      return this.getAllFileAssets(entityId);
    } else {
      return this.getAllProjectAssets(entityId);
    }
  }

  /**
 * Fetches the "best" version of all project-level video renders.
 * Filtered by minimum duration stored in the metadata JSONB.
 */
  async getCompletedProjectVideos(options: {
    startDate?: Date | undefined;
    endDate?: Date;
    limit?: number;
    status?: string;
    minDuration?: number; // New filter
  } = {}) {
    const { startDate, endDate, limit = 50, status, minDuration } = options;

    const conditions = [
      eq(assetEntries.assetKey, "render_video" as AssetKey),
      isNull(assetEntries.sceneId),
      isNull(assetEntries.characterId),
      isNull(assetEntries.locationId),
      sql`${assetEntries.best} > 0`
    ];

    if (startDate) conditions.push(gte(assetVersions.createdAt, startDate));
    if (endDate) conditions.push(lte(assetVersions.createdAt, endDate));
    if (status) conditions.push(sql`${assetVersions.metadata}->>'status' = ${status}`);

    // JSONB extraction and numeric casting for duration
    if (minDuration !== undefined) {
      conditions.push(
        sql`CAST(${assetVersions.metadata}->>'duration' AS NUMERIC) >= ${minDuration}`
      );
    }

    return await db
      .select({
        projectId: assetEntries.projectId,
        assetKey: assetEntries.assetKey,
        version: assetVersions.version,
        url: assetVersions.data,
        metadata: assetVersions.metadata,
        createdAt: assetVersions.createdAt,
      })
      .from(assetEntries)
      .innerJoin(
        assetVersions,
        and(
          eq(assetVersions.assetEntryId, assetEntries.id),
          eq(assetVersions.version, assetEntries.best)
        )
      )
      .where(and(...conditions))
      .orderBy(desc(assetVersions.createdAt))
      .limit(limit);
  }

  // ==========================================================================
  // PRIVATE - SCOPE RESOLUTION
  // ==========================================================================

  /**
   * LITE resolution: Fetch only entry metadata (head, best) without version data.
   * Use this when you only need to know what exists or get next version number.
   */
  private async resolveHistoriesLite(
    scope: Scope,
    assetKeys: AssetKey[],
    tx: DbTransaction = db
  ): Promise<AssetHistory[]> {
    const entries = await this.fetchEntriesLite(scope, assetKeys, tx);

    return entries.map(entry => {
      if (!entry) {
        return { head: 0, best: 0, versions: [] };
      }
      return {
        head: entry.head,
        best: entry.best,
        versions: [] // No version data in lite mode
      };
    });
  }

  /**
   * FULL resolution: Fetch entries with all version history.
   * Use this when you need actual version data.
   */
  private async resolveHistoriesFull(
    scope: Scope,
    assetKeys: AssetKey[],
    tx: DbTransaction = db
  ): Promise<AssetHistory[]> {
    const entries = await this.fetchEntriesFull(scope, assetKeys, tx);

    return entries.map(entry => {
      if (!entry) {
        return { head: 0, best: 0, versions: [] };
      }
      return {
        head: entry.head,
        best: entry.best,
        versions: entry.versions.map(this.dbVersionToAssetVersion)
      };
    });
  }

  /**
   * Fetch LITE entries (metadata only) for entities in scope.
   * Returns entries in same order as scope entities.
   */
  private async fetchEntriesLite(
    scope: Scope,
    assetKeys: AssetKey[],
    tx: DbTransaction = db
  ): Promise<(AssetEntry | null)[]> {
    const entityIds = entityIdAt(scope).ids;
    const entityType = entityTypeOf(scope);

    const entries = await this.queryEntriesByEntityType(
      entityType,
      entityIds,
      tx
    );

    // Map entries back to entity order, matching each entity with its asset key
    return entityIds.map((id, i) => {
      const key = assetKeys[i] ?? assetKeys[0];
      return entries.find(e =>
        this.matchesEntity(e, entityType, id) && e.assetKey === key
      ) ?? null;
    });
  }

  /**
   * Fetch FULL entries (with all versions) for entities in scope.
   * Single query with JOIN for performance.
   */
  private async fetchEntriesFull(
    scope: Scope,
    assetKeys: AssetKey[],
    tx: DbTransaction = db
  ): Promise<(AssetEntryWithVersions | null)[]> {
    const entityIds = entityIdAt(scope).ids;
    const entityType = entityTypeOf(scope);

    // Single query with LEFT JOIN to get all versions
    const results = await tx
      .select({
        entry: assetEntries,
        version: assetVersions
      })
      .from(assetEntries)
      .leftJoin(
        assetVersions,
        eq(assetVersions.assetEntryId, assetEntries.id)
      )
      .where(this.buildEntityFilter(entityType, entityIds));

    // Group results by entry
    const entryMap = new Map<string, AssetEntryWithVersions>();

    for (const row of results) {
      const entry = row.entry;
      if (!entryMap.has(entry.id)) {
        entryMap.set(entry.id, {
          ...entry,
          versions: []
        });
      }
      if (row.version) {
        entryMap.get(entry.id)!.versions.push(row.version);
      }
    }

    // Map back to entity order
    return entityIds.map((id, i) => {
      const key = assetKeys[i] ?? assetKeys[0];
      const entries = Array.from(entryMap.values());
      return entries.find(e =>
        this.matchesEntity(e, entityType, id) && e.assetKey === key
      ) ?? null;
    });
  }

  /**
   * Query entries by entity type and IDs.
   */
  private async queryEntriesByEntityType(
    entityType: EntityType | 'image',
    entityIds: string[],
    tx: DbTransaction = db
  ): Promise<AssetEntry[]> {
    return await tx
      .select()
      .from(assetEntries)
      .where(this.buildEntityFilter(entityType, entityIds));
  }

  /**
   * Build WHERE filter for entity type.
   */
  private buildEntityFilter(entityType: EntityType | 'image', entityIds: string[]) {
    switch (entityType) {
      case 'scene':
        return inArray(assetEntries.sceneId, entityIds);
      case 'character':
        return inArray(assetEntries.characterId, entityIds);
      case 'location':
        return inArray(assetEntries.locationId, entityIds);
      case 'image':
        return inArray(assetEntries.fileId, entityIds);
      case 'project':
        return and(
          inArray(assetEntries.projectId, entityIds),
          isNull(assetEntries.sceneId),
          isNull(assetEntries.characterId),
          isNull(assetEntries.locationId),
          isNull(assetEntries.fileId)
        );
    }
  }

  /**
   * Check if entry matches entity type and ID.
   */
  private matchesEntity(
    entry: AssetEntry,
    entityType: EntityType | 'image',
    entityId: string
  ): boolean {
    switch (entityType) {
      case 'scene':
        return entry.sceneId === entityId;
      case 'character':
        return entry.characterId === entityId;
      case 'location':
        return entry.locationId === entityId;
      case 'image':
        return entry.fileId === entityId;
      case 'project':
        return entry.projectId === entityId &&
          !entry.sceneId &&
          !entry.characterId &&
          !entry.locationId &&
          !entry.fileId;
    }
    return false;
  }

  // ==========================================================================
  // PRIVATE - ASSET PERSISTENCE
  // ==========================================================================

  /**
   * The single write path for new versions.
   * Upserts entries and inserts new versions atomically.
   * REFACTORED: Handles batch-internal duplicates (multiple versions for same key in one payload).
   */
  private async saveAssetHistories(
    scope: Scope,
    assetKeys: AssetKey[],
    newVersionsInput: Omit<AssetVersion, 'version'>[],
    setBest: boolean | boolean[] = false
  ): Promise<AssetHistory[]> {

    const entityIds = entityIdAt(scope).ids;
    const entityType = entityTypeOf(scope);

    return await db.transaction(async (tx) => {
      // Fetch current entries to determine starting version numbers
      const currentEntries = await this.fetchEntriesLite(scope, assetKeys, tx);

      // Track the RUNNING state of entries within this batch
      const entryStateMap = new Map<string, AssetEntry>();

      const versionsToInsert: InsertAssetVersion[] = [];
      const updatedHistories: AssetHistory[] = [];

      for (let i = 0; i < newVersionsInput.length; i++) {
        const entityId = entityIds[i];
        const assetKey = assetKeys[i] ?? assetKeys[0];
        const uniqueKey = `${entityId}:${assetKey}`;

        // Resolve the current state of this entry (from DB or previous loop iteration)
        let entryState: AssetEntry | undefined = entryStateMap.get(uniqueKey);
        if (!entryState) {
          // Init from DB or defaults.
          const dbEntry = currentEntries[i];
          const entryId = dbEntry?.id ?? generateId();

          entryState = {
            id: entryId,
            projectId: scope.projectId,
            sceneId: entityType === 'scene' ? entityId : null,
            characterId: entityType === 'character' ? entityId : null,
            locationId: entityType === 'location' ? entityId : null,
            fileId: entityType === 'file' ? entityId : null,
            assetKey,
            head: dbEntry?.head ?? 0,
            best: dbEntry?.best ?? 0,
            bestLockedByFeedback: dbEntry?.bestLockedByFeedback ?? false,
            createdAt: dbEntry?.createdAt ?? new Date(),
            updatedAt: new Date(),
          };
        }

        const shouldSetBest = Array.isArray(setBest) ? setBest[i] ?? false : setBest;

        // Increment State (Sequential versioning within batch)
        const newVersionNum = entryState.head + 1;
        // If the current best was locked by a user 'like', never auto-override it.
        const isLocked = entryState.bestLockedByFeedback === true;
        const newBest = (entryState.best === 0 || (shouldSetBest && !isLocked)) ? newVersionNum : entryState.best;

        // Update the running state
        entryState.head = newVersionNum;
        entryState.best = newBest;
        entryStateMap.set(uniqueKey, entryState);

        // Prepare Version Insert
        versionsToInsert.push({
          assetEntryId: entryState.id, // Use the ID we resolved/generated
          version: newVersionNum,
          data: newVersionsInput[i].data,
          type: newVersionsInput[i].type,
          metadata: newVersionsInput[i].metadata,
          startedAt: newVersionsInput[i].startedAt,
          createdAt: newVersionsInput[i].createdAt
        });

        // Build History for Return
        updatedHistories.push({
          head: newVersionNum,
          best: newBest,
          versions: [
            {
              version: newVersionNum,
              data: newVersionsInput[i].data,
              type: newVersionsInput[i].type,
              metadata: newVersionsInput[i].metadata,
              startedAt: newVersionsInput[i].startedAt,
              createdAt: newVersionsInput[i].createdAt,
              assetEntryId: entryState.id!,
            }
          ].map((version) => this.dbVersionToAssetVersion(version))
        });
      }

      // Batch Upsert Entries (Deduplicated values only)
      const uniqueEntriesToUpsert = Array.from(entryStateMap.values());
      await this.batchUpsertEntries(uniqueEntriesToUpsert, tx);

      // Batch Insert Versions
      await this.batchInsertVersions(versionsToInsert, tx);

      return updatedHistories;
    });
  }

  /**
   * Batch upsert asset entries.
   * Uses INSERT...ON CONFLICT to update existing or create new.
   */
  private async batchUpsertEntries(
    entries: AssetEntry[],
    tx: DbTransaction = db
  ): Promise<AssetEntry[]> {
    if (entries.length === 0) return [];

    // Sort entries by ID to ensure deterministic lock acquisition order, preventing deadlocks
    const entriesSortedById = [...entries].sort((a, b) => a.id.localeCompare(b.id));

    const results: AssetEntry[] = [];
    // Process in batches to avoid query size limits
    const BATCH_SIZE = 100;

    try {
      for (let i = 0; i < entriesSortedById.length; i += BATCH_SIZE) {
        const batchCurrent = entriesSortedById.slice(i, i + BATCH_SIZE);

        // Maintain previous null-mapping fixes for sparse metadata constraints
        const paramsUpsertBatch = batchCurrent.map(entry => ({
          ...entry,
          characterId: entry.characterId?.trim() || null,
          locationId: entry.locationId?.trim() || null,
        }));

        console.debug(`[AssetVersionManager:batchUpsertEntries] Upserting batch size: ${paramsUpsertBatch.length}`);

        const upserted = await tx
          .insert(assetEntries)
          .values(paramsUpsertBatch)
          .onConflictDoUpdate({
            target: [assetEntries.id],
            set: {
              head: sql`EXCLUDED.head`,
              best: sql`EXCLUDED.best`,
              updatedAt: sql`EXCLUDED.updated_at`
            }
          })
          .returning();

        results.push(...upserted);
      }

      return results;

    } catch (error: any) {
      // Unpack native PG error properties before thread IPC serialization strips them
      const errorPgCode = error.code || 'UNKNOWN_PG_CODE';
      const errorPgDetail = error.detail || 'No PG detail provided';
      const errorPgConstraint = error.constraint || 'No constraint identified';

      console.error(
        `[AssetVersionManager:batchUpsertEntries] Critical Query Failure. ` +
        `Code: ${errorPgCode} | Constraint: ${errorPgConstraint} | Detail: ${errorPgDetail}`,
        error
      );
      throw error;
    }
  }

  /**
   * Batch insert new asset versions.
   * Versions are append-only, never updated.
   */
  private async batchInsertVersions(
    versions: InsertAssetVersion[],
    tx: DbTransaction = db
  ): Promise<void> {
    if (versions.length === 0) return;

    // 1. Identify and update Media Objects (only for physical files)
    const mediaVersions = versions.filter(v => this.isMediaType(v.type));

    if (mediaVersions.length > 0) {
      const dataCounts = mediaVersions.reduce((acc, v) => {
        acc[v.data] = (acc[v.data] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      for (const [uri, count] of Object.entries(dataCounts)) {
        await tx.insert(mediaObjects)
          .values({ data: uri, refCount: count, status: 'active' })
          .onConflictDoUpdate({
            target: mediaObjects.data,
            set: {
              refCount: sql`${mediaObjects.refCount} + ${count}`,
              lastReferencedAt: new Date(),
              status: 'active'
            }
          });
      }
    }

    // 2. Map payload to include mediaId link where applicable
    const processedVersions = versions.map(v => ({
      ...v,
      // mediaId is the FK to the registry; data remains the raw prompt/uri
      mediaId: this.isMediaType(v.type) ? v.data : null
    }));

    // 3. RE-IMPLEMENTED: Defensive Batching for Parameter Limits
    // We use a slightly smaller batch size (100) to account for the overhead 
    // of JSONB and UUID expansion in the query string.
    const DB_BATCH_SIZE = 100;
    for (let i = 0; i < processedVersions.length; i += DB_BATCH_SIZE) {
      const batch = processedVersions.slice(i, i + DB_BATCH_SIZE);
      await tx.insert(assetVersions).values(batch);

      console.debug(`[AssetVersionManager] Flushed batch of ${batch.length} versions to DB.`);
    }
  }

  // ==========================================================================
  // PRIVATE - HELPERS
  // ==========================================================================

  /**
   * Convert DB version row to domain AssetVersion type.
   */
  private dbVersionToAssetVersion(v: InsertAssetVersion): AssetVersion {
    const assetVersion: AssetVersion = AssetVersion.parse(v);
    return assetVersion;
  }

  /**
   * Build AssetRegistry from entries and versions.
   */
  private buildRegistryFromEntries(
    entries: AssetEntry[],
    versions: AssetVersionRow[]
  ): AssetRegistry {
    const registry: AssetRegistry = {};

    for (const entry of entries) {
      const entryVersions = versions
        .filter(v => v.assetEntryId === entry.id)
        .map(this.dbVersionToAssetVersion);

      registry[entry.assetKey] = {
        head: entry.head,
        best: entry.best,
        versions: entryVersions
      };
    }

    return registry;
  }

  /**
   * Expand polymorphic type/metadata arrays into one object per data item.
   */
  private prepareVersionsToCreate(
    dataList: string[],
    type: AssetType | AssetType[],
    metadata: AssetVersion['metadata'] | AssetVersion['metadata'][],
    count: number,
    startedAt: Date,
  ): Omit<AssetVersion, 'version'>[] {
    const out: Omit<AssetVersion, 'version'>[] = [];
    for (let i = 0; i < count; i++) {
      out.push({
        type: Array.isArray(type) ? (type[i] ?? type[0]) : type,
        data: dataList[i],
        metadata: Array.isArray(metadata) ? metadata[i] ?? metadata[0] ?? {} : metadata,
        startedAt,
        createdAt: new Date(),
      });
    }
    return out;
  }

  /**
   * Validate that dataList length matches scope entity count.
   */
  private validateCreateInput(scope: Scope, count: number): void {
    const expected =
      "sceneIds" in scope
        ? scope.sceneIds.length
        : "characterIds" in scope
          ? scope.characterIds.length
          : "locationIds" in scope
            ? scope.locationIds.length
            : 1;

    if (count !== expected) {
      const scopeName =
        "sceneIds" in scope
          ? "Scene"
          : "characterIds" in scope
            ? "Character"
            : "locationIds" in scope
              ? "Location"
              : "Project";
      throw new Error(`${scopeName} scope expects ${expected} data item(s), got ${count}`);
    }
  }

  /**
   * Assert array lengths match.
   */
  private assertLengthMatch(actual: number, expected: number, label: string): void {
    if (actual !== expected) {
      throw new Error(
        `Scope has ${actual} entities but ${expected} ${label} were provided`
      );
    }
  }
}