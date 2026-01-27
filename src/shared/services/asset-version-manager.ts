import { ProjectRepository } from "../services/project-repository.js";
import { AssetHistory, AssetRegistry, AssetType, AssetVersion, Project, Scene, Character, Location, AssetKey, Scope, CreateVersionedAssetsBaseArgs } from "../types/workflow.types.js";
import { mapDbProjectToDomain } from "../domain/project-mappers.js";



export class AssetVersionManager {
    constructor(
        private projectRepo: ProjectRepository,
    ) { }

    /**
     * Registers new attempts/versions of an asset for a list of entities.
     * Atomically increments the version counter and saves to DB.
     * 
     * @param scope - Defines which entities (Project, Scene, Characters, Locations) are being updated.
     * @param assetKey - The type of asset being versioned.
     * @param type - The content type (video, image, text, etc.).
     * @param dataList - An array of data corresponding to the entities in the scope.
     *                   If scope is singular (Project/Scene), this should be an array of length 1.
     *                   If scope is plural (Characters/Locations), it must match the order of IDs.
     * @param metadata - Metadata to attach to the version.
     * @param setBest - Whether to automatically set this new version as "Best".
     */
    async createVersionedAssets(
        ...[ scope, assetKey, type, dataList, metadata, setBest = false ]: CreateVersionedAssetsBaseArgs
    ): Promise<AssetVersion[]> {

        const count = dataList.length;
        const versionsToCreate: Omit<AssetVersion, 'version'>[] = [];

        for (let i = 0; i < count; i++) {
            const data = dataList[ i ];

            // --- Polymorphic Fallback Logic ---

            // Resolve Type
            let specificType: AssetType;
            if (Array.isArray(type)) {
                specificType = type[ i ] ?? type[ 0 ];
            } else {
                specificType = type;
            }

            // Resolve Metadata
            let specificMetadata: AssetVersion[ 'metadata' ];
            if (Array.isArray(metadata)) {
                specificMetadata = metadata[ i ] ?? metadata[ 0 ];
            } else {
                specificMetadata = metadata;
            }

            versionsToCreate.push({
                type: specificType,
                data,
                metadata: specificMetadata,
                createdAt: new Date(),
            });
        }

        return await this.saveAssetHistories(scope, assetKey, versionsToCreate, setBest);
    }

    /**
     * Returns the next version number that WILL be created for each entity in scope.
     * Does not modify the DB.
     */
    async getNextVersionNumber(scope: Scope, assetKey: AssetKey): Promise<number[]> {
        const histories = await this.getAssetHistories(scope, assetKey);
        return histories.map(h => h.head + 1);
    }

    /**
     * Returns the "Best" (active) version of an asset for each entity in scope.
     */
    async getBestVersion(scope: Scope, assetKey: AssetKey): Promise<(AssetVersion | null)[]> {
        const histories = await this.getAssetHistories(scope, assetKey);
        return histories.map(h => {
            if (h.best === 0 || !h.versions[ h.best ]) return null;
            return h.versions[ h.best ];
        });
    }

    /**
   * Update best version pointer (based on highest quality score)
   */
    setBestVersionFast(
        registry: AssetRegistry,
        key: AssetKey,
        version: number
    ): void {
        if (registry[ key ] && version <= registry[ key ].head) {
            registry[ key ].best = version;
        }
    }

    /**
     * Updates which version is considered "Best" for each entity in scope.
     * IMPORTANT: Expects `versions` array to match the order of entities.
     */
    async setBestVersion(scope: Scope, assetKey: AssetKey, versions: number[]): Promise<void> {
        const histories = await this.getAssetHistories(scope, assetKey);

        if (histories.length !== versions.length) {
            throw new Error(`Mismatch between scope entities (${histories.length}) and version numbers (${versions.length})`);
        }

        for (let i = 0; i < histories.length; i++) {
            const history = histories[ i ];
            const version = versions[ i ];

            // Allow setting best to 0 (none)
            if (version !== 0 && !history.versions.find(v => v.version === version)) {
                const entityId = this.getEntityIdFromScope(scope, i);
                console.warn(`Version ${version} does not exist for entity ${entityId}`);
                continue;
            }

            history.best = version;

            // Persist atomically
            if ("sceneId" in scope) {
                await this.projectRepo.updateSceneAssets(scope.sceneId, assetKey, history);
            } else if ("characterIds" in scope) {
                const charId = scope.characterIds[ i ];
                if (charId) {
                    await this.projectRepo.updateCharacterAssets(charId, assetKey, history);
                }
            } else if ("locationIds" in scope) {
                const locId = scope.locationIds[ i ];
                if (locId) {
                    await this.projectRepo.updateLocationAssets(locId, assetKey, history);
                }
            } else {
                await this.projectRepo.updateProjectAssets(scope.projectId, assetKey, history);
            }
        }
    }

    async getAllSceneAssets(sceneId: string): Promise<AssetRegistry> {
        const scene = await this.projectRepo.getScene(sceneId);
        const assetsMap = scene.assets || {};
        return assetsMap;
    }

    // TODO implement compile error if required scope key is missing
    private async getAssetHistories(scope: Scope, assetKey: AssetKey): Promise<AssetHistory[]> {
        let assetsHistoryList: Partial<Record<AssetKey, AssetHistory>>[] = [];

        if ("sceneId" in scope) {
            const scene = await this.projectRepo.getScene(scope.sceneId);
            assetsHistoryList = [ scene.assets || {} ];
        } else if ("characterIds" in scope) {
            const characters = await this.projectRepo.getProjectCharacters(scope.projectId);
            for (let i = 0; i < scope.characterIds.length; i++) {
                assetsHistoryList.push(characters.find(c => c.id === scope.characterIds[ i ])?.assets || {});
            }
        } else if ("locationIds" in scope) {
            const locations = await this.projectRepo.getProjectLocations(scope.projectId);
            for (let i = 0; i < scope.locationIds.length; i++) {
                assetsHistoryList.push(locations.find(l => l.id === scope.locationIds[ i ])?.assets || {});
            }
        }
        else {
            const project = await this.projectRepo.getProject(scope.projectId);
            assetsHistoryList = [ project.assets || {} ];
        }

        return assetsHistoryList.map(assetsMap => assetsMap[ assetKey ] || { head: 0, best: 0, versions: [] });
    }

    /**
     * Updates asset history for each entity in scope.
     * Fetches current histories, increments versions, and persists atomically.
     */
    async saveAssetHistories(
        scope: Scope,
        assetKey: AssetKey,
        newVersionsInput: Omit<AssetVersion, 'version'>[],
        setBest: boolean | boolean[] = false
    ): Promise<AssetVersion[]> {
        const histories = await this.getAssetHistories(scope, assetKey);
        const count = newVersionsInput.length;
        const finalVersions: AssetVersion[] = [];

        for (let i = 0; i < count; i++) {
            const history = histories[ i ] || { head: 0, best: 0, versions: [] };
            const versionInput = newVersionsInput[ i ];

            // Resolve SetBest
            let specificSetBest: boolean;
            if (Array.isArray(setBest)) {
                specificSetBest = setBest[ i ] ?? false;
            } else {
                specificSetBest = setBest;
            }

            const newVersionNum = history.head + 1;
            const newVersion: AssetVersion = {
                ...versionInput,
                version: newVersionNum,
            };

            history.head = newVersionNum;
            history.versions.push(newVersion);

            if (history.best === 0 || specificSetBest) {
                history.best = newVersionNum;
            }

            finalVersions.push(newVersion);

            // Persist atomically
            if ("sceneId" in scope) {
                await this.projectRepo.updateSceneAssets(scope.sceneId, assetKey, history);
            } else if ("characterIds" in scope) {
                const charId = scope.characterIds[ i ];
                if (charId) {
                    await this.projectRepo.updateCharacterAssets(charId, assetKey, history);
                }
            } else if ("locationIds" in scope) {
                const locId = scope.locationIds[ i ];
                if (locId) {
                    await this.projectRepo.updateLocationAssets(locId, assetKey, history);
                }
            } else {
                await this.projectRepo.updateProjectAssets(scope.projectId, assetKey, history);
            }
        }

        return finalVersions;
    }

    /**
  * Update version metadata (e.g., add evaluation result)
  */
    updateVersionMetadata(
        registry: AssetRegistry,
        key: AssetKey,
        version: number,
        metadata: Partial<AssetVersion[ 'metadata' ]>
    ): void {
        const versionObj = registry[ key ]?.versions.find(v => v.version === version);
        if (versionObj) {
            versionObj.metadata = { ...versionObj.metadata, ...metadata };
        }
    }

    private getEntityIdFromScope(scope: Scope, index: number): string {
        if ("sceneId" in scope) return scope.sceneId;
        if ("characterIds" in scope) return scope.characterIds[ index ] || "unknown";
        if ("locationIds" in scope) return scope.locationIds[ index ] || "unknown";
        return scope.projectId;
    }
}
