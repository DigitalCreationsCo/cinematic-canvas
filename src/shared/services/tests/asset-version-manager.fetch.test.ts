import { describe, it, expect, beforeEach } from 'vitest';
import { AssetVersionManager } from '../asset-version-manager.js';
import { db } from '../../db/index.js';
import { sql } from 'drizzle-orm';
import { assetEntries } from "../../db/schema.js";
import { ProjectRepository } from '../project-repository.js';
import { createMockRepository} from "../../mocks/mock-db.js";

describe('Data Fetching Strategies', () => {
  let repo: ProjectRepository;
  let manager: AssetVersionManager;
  const projectId = 'proj_fetch_test';
  const sceneId = 'scene_fetch_test';

  beforeEach(async () => {
    // ... Setup DB with project and scene
    repo = createMockRepository();
    manager = new AssetVersionManager(repo);

    // SEED DATA:
    // Scene Video: V1, V2(best), V3
    const scope = { projectId, sceneIds: [sceneId] };
    await manager.executeBatchUpdates([scope, ['scene_video'], 'video', ['v1.mov'], {}, false]); // v1
    await manager.executeBatchUpdates([scope, ['scene_video'], 'video', ['v2_BEST.mov'], {}, true]); // v2 best
    await manager.executeBatchUpdates([scope, ['scene_video'], 'video', ['v3.mov'], {}, false]); // v3

    // Storyboard: V1(best)
    await manager.executeBatchUpdates([{ projectId }, ['storyboard'], 'json', ['{sb_v1}'], {}, true]);
  });

  it('R4: Client "Lite Load" - Should fetch pointers only, no payloads', async () => {
    const manifest = await repo.getProjectAssetManifest(projectId);

    // Check Scene Assets
    expect(manifest[sceneId]['scene_video']).toBeDefined();
    expect(manifest[sceneId]['scene_video'].head).toBe(3);
    expect(manifest[sceneId]['scene_video'].best).toBe(2);
    // CRITICAL: Versions array must be empty in manifest mode
    expect(manifest[sceneId]['scene_video'].versions).toEqual([]);

    // Check Project Assets
    expect(manifest[projectId]['storyboard'].head).toBe(1);
    expect(manifest[projectId]['storyboard'].best).toBe(1);
    expect(manifest[projectId]['storyboard'].versions).toEqual([]);
  });

  it('R3: Pipeline "Active State" - Should fetch ONLY current best payloads', async () => {
    // Use a specific method meant for the pipeline execution context
    const activeScene = await repo.getSceneWithActiveAssets(sceneId);

    const videoAsset = activeScene.assets['scene_video'];
    expect(videoAsset).toBeDefined();
    // CRITICAL: Should only have one version, and it must be the "best" one (V2)
    expect(videoAsset.versions.length).toBe(1);
    expect(videoAsset.versions[0].version).toBe(2);
    expect(videoAsset.versions[0].data).toBe('v2_BEST.mov');
    // V1 and V3 data should not be present in memory
  });

  it('Client "Inspect" - Should fetch full history on demand', async () => {
    // 1. Get manifest to find the entry ID
    const [entryRow] = await db.select().from(assetEntries)
       .where(sql`${assetEntries.sceneId} = ${sceneId} AND ${assetEntries.assetKey} = 'scene_video'`);
    
    // 2. Request full history for that entry
    const history = await repo.getAssetHistory(entryRow.id);

    expect(history.head).toBe(3);
    expect(history.versions.length).toBe(3);
    // Verify ordered history with payloads
    expect(history.versions[0].data).toBe('v1.mov');
    expect(history.versions[1].data).toBe('v2_BEST.mov');
    expect(history.versions[2].data).toBe('v3.mov');
  });
});