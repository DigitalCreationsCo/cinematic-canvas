// backend/managers/asset-version-manager.optimized.ts
import { ProjectRepository } from "../services/project-repository.js";
import { db } from "../db/index.js";
import {
  AssetHistory,
  AssetRegistry,
  AssetType,
  AssetVersion,
  AssetKey,
  Scope,
  CreateVersionedAssetsBaseArgs,
  EntityType,
} from "../types/index.js";
import { characters, locations, projects, scenes } from "../db/schema.js";
import { eq, sql } from "drizzle-orm";
import { entityIdAt, entityTypeOf } from "../utils/assets-utils.js";

/**
 * Asset Version Manager
 * 
 * Features:
 * 1. Batch operations to reduce DB round-trips (N+1 query elimination)
 * 2. Proper transaction boundaries with rollback support
 * 3. Efficient scope resolution with single queries
 * 4. Compile-time type safety for scope validation
 * 5. Immutable update patterns
 * 6. Comprehensive error handling
 * 
 * POLYMORPHIC assetKeys PATTERN:
 *   Single key → broadcast to all entities (assetKeys = ["scene_video"])
 *   Per-entity keys → zip with entities (assetKeys = ["start", "end", "video"])
 *   Accessed via: assetKeys[i] ?? assetKeys[0]
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Result of batch asset creation
 */
interface BatchCreateResult {
  histories: AssetHistory[];
  errors: Array<{ index: number; error: Error }>;
}

/**
 * Scope resolution result with entity data
 */
interface ScopeResolution {
  entities: Array<{
    id: string;
    assets: AssetRegistry;
    type: 'project' | 'scene' | 'character' | 'location';
  }>;
}

/**
 * Update operation for batch execution
 */
interface AssetUpdateOperation {
  entityId: string;
  entityType: EntityType;
  assetKey: AssetKey;
  history: AssetHistory;
}

/**
 * Maps each EntityType to its Drizzle table reference.
 * Single source of truth — adding a new entity type means adding one entry here.
 */
const ENTITY_TABLE_MAP = {
  project: projects,
  scene: scenes,
  character: characters,
  location: locations,
} as const;

// ============================================================================
// MANAGER CLASS
// ============================================================================

/**
 * Backend-only persistence layer for versioned assets.
 *
 * Responsibilities (and ONLY these):
 *   1. Derive the next version number from the current head.
 *   2. Persist new versions inside a transaction with row-level locking.
 *   3. Persist best-version and metadata changes the same way.
 *   4. Answer read queries that require the DB (next version, best version, etc.).
 *
 * It does NOT own in-memory registry mutations — that is the client store's job.
 */
export class AssetVersionManager {
  constructor(private projectRepo: ProjectRepository) {}

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
    ...[ scope, assetKeys, type, dataList, metadata, setBest = false ]: CreateVersionedAssetsBaseArgs
  ): Promise<AssetHistory[]> {
    // Validate input lengths early
    this.validateCreateInput(scope, dataList.length);

    // Prepare versions with polymorphic resolution
    const versionsToCreate = this.prepareVersionsToCreate(
      dataList,
      type,
      metadata,
      dataList.length
    );

    // Execute with transaction safety
    return await this.saveAssetHistories(
      scope,
      assetKeys,
      versionsToCreate,
      setBest
    );
  }

  /**
   * Batch create multiple asset types at once.
   * More efficient when creating multiple assets for the same entities.
   * Each element is its own scope+key pair; they are independent transactions.
   * 
   * @example
   * await manager.batchCreateVersionedAssets([
   *   [scope, 'scene_start_frame', 'image', urls1, metadata1],
   *   [scope, 'scene_end_frame', 'image', urls2, metadata2],
   * ]);
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
   * DB Read - Does not modify the DB.
   * 
   * Performance: O(1) DB queries with batched entity fetch
   */
  async getNextVersionNumber(
    scope: Scope,
    assetKeys: AssetKey[]
  ): Promise<number[]> {
    const histories = await this.resolveHistories(scope, assetKeys);
    return histories.map((h) => h.head + 1);
  }

  /**
   * Returns the "Best" (active) version of an asset for each entity in scope.
   * DB Read - Does not modify the DB.
   * 
   * Performance: O(1) DB queries with batched entity fetch
   */
  async getBestVersion(
    scope: Scope,
    assetKeys: AssetKey[]
  ): Promise<(AssetVersion | null)[]> {
    const histories = await this.resolveHistories(scope, assetKeys);
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
    const histories = await this.resolveHistories(scope, assetKeys);
    return histories.map((h) => [...h.versions].sort((a, b) => b.version - a.version));
  }

  /**
   * Get specific version by number for each entity.
   */
  async getVersionByNumber(
    scope: Scope,
    assetKeys: AssetKey[],
    versions: number[]
  ): Promise<(AssetVersion | null)[]> {
    const histories = await this.resolveHistories(scope, assetKeys);
    this.assertLengthMatch(histories.length, versions.length, "version numbers");

    return histories.map((history, i) => {
      return history.versions.find((v) => v.version === versions[ i ]) ?? null;
    });
  }

  // ==========================================================================
  // PUBLIC API - VERSION MANAGEMENT
  // ==========================================================================

  /**
   * Move the "best" pointer for each entity in scope.
   * Validates every target version exists before committing any change.
   */
  async setBestVersion(
    scope: Scope,
    assetKeys: AssetKey[],
    versions: number[]
  ): Promise<void> {
    const histories = await this.resolveHistories(scope, assetKeys);
    this.assertLengthMatch(histories.length, versions.length, "version numbers");

    // Validate all versions exist before making any changes
    const validationErrors: string[] = [];
    for (let i = 0; i < histories.length; i++) {
      const v = versions[ i ];
      if (v !== 0 && !histories[ i ].versions.find((ver) => ver.version === v)) {
        validationErrors.push(`Version ${v} does not exist for entity ${entityIdAt(scope, i)}`);
      }
    }

    if (validationErrors.length > 0) {
      throw new Error(`Version validation failed:\n${validationErrors.join('\n')}`);
    }

    const updateOps = histories.map((history, i) => ({
      entityId: entityIdAt(scope, i),
      entityType: entityTypeOf(scope),
      assetKey: assetKeys[ i ] ?? assetKeys[ 0 ], // polymorphic access
      history: { ...history, best: versions[ i ] },
    }));

    await this.executeBatchUpdates(updateOps);
  }

  /**
   * Fast, in-memory best version update (no DB persistence).
   * Use for temporary UI state or when persistence is handled separately.
   */
  // setBestVersionFast(
  //   registry: AssetRegistry,
  //   key: AssetKey,
  //   version: number
  // ): void {
  //   const history = registry[key];
  //   if (history && version <= history.head) {
  //     // Create new history object for immutability
  //     registry[key] = { ...history, best: version };
  //   }
  // }

  /**
   * Update version metadata (e.g., add evaluation result).
   * This creates a new version object for immutability.
   */
  // updateVersionMetadataFast(
  //   registry: AssetRegistry,
  //   key: AssetKey,
  //   version: number,
  //   metadata: Partial<AssetVersion['metadata']>
  // ): void {
  //   const history = registry[key];
  //   if (!history) return;

  //   const versionIndex = history.versions.findIndex((v) => v.version === version);
  //   if (versionIndex === -1) return;

  //   // Create new versions array with updated metadata (immutable)
  //   const updatedVersions = [...history.versions];
  //   updatedVersions[versionIndex] = {
  //     ...updatedVersions[versionIndex],
  //     metadata: { ...updatedVersions[versionIndex].metadata, ...metadata },
  //   };

  //   registry[key] = { ...history, versions: updatedVersions };
  // }

  /**
   * Merge `metadata` into a specific version for every entity in scope.
   */
  async updateVersionMetadata(
    scope: Scope,
    assetKeys: AssetKey[],
    version: number,
    metadata: Partial<AssetVersion['metadata']>
  ): Promise<void> {
    const histories = await this.resolveHistories(scope, assetKeys);
    const updateOps: AssetUpdateOperation[] = [];

    for (let i = 0; i < histories.length; i++) {
      const history = histories[i];
      const versionIndex = history.versions.findIndex((v) => v.version === version);

      if (versionIndex === -1) continue;

      const updatedVersions = [...history.versions];
      updatedVersions[versionIndex] = {
        ...updatedVersions[versionIndex],
        metadata: { ...updatedVersions[versionIndex].metadata, ...metadata },
      };

      updateOps.push({
        entityId: entityIdAt(scope, i),
        entityType: entityTypeOf(scope),
        assetKey: assetKeys[ i ] ?? assetKeys[ 0 ], // polymorphic access
        history: { ...history, versions: updatedVersions, },
      });
    }

    await this.executeBatchUpdates(updateOps);
  }

  // ==========================================================================
  // PUBLIC API - ASSET REGISTRY QUERIES
  // ==========================================================================

  /**
   * Get all assets for a scene.
   * Results should be cached on the client.
   */
  async getAllSceneAssets(sceneId: string): Promise<AssetRegistry> {
    const scene = await this.projectRepo.getScene(sceneId);
    return scene.assets || {};
  }

  /**
   * Get all assets for a project.
   */
  async getAllProjectAssets(projectId: string): Promise<AssetRegistry> {
    const project = await this.projectRepo.getProject(projectId);
    return project.assets || {};
  }

  /**
   * Get all assets for a character.
   */
  async getAllCharacterAssets(characterId: string): Promise<AssetRegistry> {
    const [character] = await this.projectRepo.getCharactersByIds([characterId]);
    return character.assets || {};
  }

  /**
   * Get all assets for a location.
   */
  async getAllLocationAssets(locationId: string): Promise<AssetRegistry> {
    const [location] = await this.projectRepo.getLocationsByIds([locationId]);
    return location.assets || {};
  }

  // ==========================================================================
  // PRIVATE - SCOPE RESOLUTION
  // ==========================================================================

  /**
   * Read-only resolution: fetch histories for every entity described by scope.
   * Single query per scope shape (no N+1).
   * @returns registries.length histories (one per entity)
   */
  private async resolveHistories(scope: Scope, assetKeys: AssetKey[]): Promise<AssetHistory[]> {
    const registries = await this.fetchRegistries(scope);
    return registries.map((reg, i) => {
      const key = assetKeys[ i ] ?? assetKeys[ 0 ];
      return reg[ key ] ?? { head: 0, best: 0, versions: [] };
    });
  }

  /**
   * Locked resolution: same as above but acquires row - level locks.
   * MUST be called inside the transaction that will write.
   * @returns registries.length histories (one per entity)
   */
  private async resolveHistoriesForUpdate(
    scope: Scope,
    assetKeys: AssetKey[],
    tx: Omit<typeof db, "$client">
  ): Promise<AssetHistory[]> {
    const registries = await this.fetchRegistriesWithLock(scope, tx);
    return registries.map((reg, i) => {
      const key = assetKeys[ i ] ?? assetKeys[ 0 ];
      return reg[ key ] ?? { head: 0, best: 0, versions: [] };
    });
  }

  /** Read registries without locking. */
  private async fetchRegistries(
    scope: Scope,
  ): Promise<Partial<Record<AssetKey, AssetHistory>>[]> {
    if ("sceneIds" in scope) {
      const all = await this.projectRepo.getProjectScenes(scope.projectId);
      return scope.sceneIds.map((id) => all.find((s) => s.id === id)?.assets || {});
    } else if ("characterIds" in scope) {
      const all = await this.projectRepo.getProjectCharacters(scope.projectId);
      return scope.characterIds.map(
        (id) => all.find((c) => c.id === id)?.assets || {}
      );
    } else if ("locationIds" in scope) {
      const all = await this.projectRepo.getProjectLocations(scope.projectId);
      return scope.locationIds.map((id) => all.find((l) => l.id === id)?.assets || {});
    } else {
      const project = await this.projectRepo.getProject(scope.projectId);
      return [ project.assets || {} ];
    }
  }

  /** Read registries WITH row-level locks (inside tx). */
  private async fetchRegistriesWithLock(
    scope: Scope,
    tx: Omit<typeof db, "$client">
  ): Promise<Partial<Record<AssetKey, AssetHistory>>[]> {
    if ("sceneIds" in scope) {
      const rows = await this.projectRepo.getScenesWithLock(scope.sceneIds, tx);
      return scope.sceneIds.map((id) => rows.find((s) => s.id === id)?.assets ?? {});
    }
    if ("characterIds" in scope) {
      const rows = await this.projectRepo.getCharactersWithLock(scope.characterIds, tx);
      return scope.characterIds.map((id) => rows.find((c) => c.id === id)?.assets ?? {});
    }
    if ("locationIds" in scope) {
      const rows = await this.projectRepo.getLocationsWithLock(scope.locationIds, tx);
      return scope.locationIds.map((id) => rows.find((l) => l.id === id)?.assets ?? {});
    }
    const project = await this.projectRepo.getProjectWithLock(scope.projectId, tx);
    return [ project.assets ?? {} ];
  }

  // ==========================================================================
  // PRIVATE - ASSET PERSISTENCE (OPTIMIZED)
  // ==========================================================================

  /**
  * The single write path for new versions.
  * Wraps everything in one transaction: lock → compute → write.
  */
  async saveAssetHistories(
    scope: Scope,
    assetKeys: AssetKey[],
    newVersionsInput: Omit<AssetVersion, 'version'>[],
    setBest: boolean | boolean[] = false
  ): Promise<AssetHistory[]> {

    return await db.transaction(async (tx) => {
      const histories = await this.resolveHistoriesForUpdate(scope, assetKeys, tx);

      const updatedHistories: AssetHistory[] = [];
      const updateOps: AssetUpdateOperation[] = [];

      for (let i = 0; i < newVersionsInput.length; i++) {
        const history = histories[ i ] || { head: 0, best: 0, versions: [] };
        const shouldSetBest = Array.isArray(setBest)
          ? setBest[ i ] ?? false
          : setBest;

        const newVersionNum = history.head + 1;
        const newVersion: AssetVersion = {
          ...newVersionsInput[ i ],
          version: newVersionNum,
        };

        const updatedHistory: AssetHistory = {
          head: newVersionNum,
          best: (history.best === 0 || shouldSetBest) ? newVersionNum : history.best,
          versions: [ ...history.versions, newVersion ],
        };

        updatedHistories.push(updatedHistory);

        updateOps.push({
          entityId: entityIdAt(scope, i),
          entityType: entityTypeOf(scope),
          assetKey: assetKeys[ i ] ?? assetKeys[ 0 ], // polymorphic access
          history: updatedHistory,
        });
      }

      await this.executeBatchUpdates(updateOps, tx);
      return updatedHistories;
    });
  }

  /**
    * Write all pending operations, grouped by entity type for locality,
    * executed in parallel across types.
    *
    */
  private async executeBatchUpdates(
    operations: AssetUpdateOperation[],
    tx: Omit<typeof db, "$client"> = db
  ): Promise<void> {
    // Group operations by entity type for efficient batch processing
    const grouped = new Map<EntityType, AssetUpdateOperation[]>();
    for (const op of operations) {
      (grouped.get(op.entityType) ?? (grouped.set(op.entityType, []), grouped.get(op.entityType)!)).push(op);
    }

    // Execute updates in parallel by type
    await Promise.all(
      Array.from(grouped.entries()).map(([ type, ops ]) =>
        this.projectRepo.updateAssetsForTable(ENTITY_TABLE_MAP[ type ], ops, tx)
      )
    );
  }

  // ==========================================================================
  // PRIVATE - HELPERS
  // ==========================================================================

  /**
   * Expand polymorphic type/metadata arrays into one object per data item.
   * If caller passes a scalar, every item gets the same value.
   */
  private prepareVersionsToCreate(
    dataList: string[],
    type: AssetType | AssetType[],
    metadata: AssetVersion['metadata'] | AssetVersion['metadata'][],
    count: number
  ): Omit<AssetVersion, 'version'>[] {
    const out: Omit<AssetVersion, 'version'>[] = [];
    for (let i = 0; i < count; i++) {
      out.push({
        type: Array.isArray(type) ? (type[ i ] ?? type[ 0 ]) : type,
        data: dataList[ i ],
        metadata: Array.isArray(metadata) ? metadata[ i ] ?? metadata[ 0 ] : metadata,
        createdAt: new Date(),
      });
    }
    return out;
  }

  /**
   * Ensure dataList length matches the number of entities in scope.
   */
  private validateCreateInput(scope: Scope, count: number): void {
    const expected =
      "sceneIds" in scope
        ? scope.sceneIds.length
        : "characterIds" in scope
          ? scope.characterIds.length
          : "locationIds" in scope
            ? scope.locationIds.length
            : 1; // project

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

  /** Shared guard for scope-length vs provided-array-length mismatches. */
  private assertLengthMatch(actual: number, expected: number, label: string): void {
    if (actual !== expected) {
      throw new Error(
        `Scope has ${actual} entities but ${expected} ${label} were provided`
      );
    }
  }
}