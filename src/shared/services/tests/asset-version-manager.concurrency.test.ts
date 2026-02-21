import { describe, it, expect, beforeEach } from 'vitest';
import { AssetVersionManager } from '../asset-version-manager.js';
import { sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { assetEntries, assetVersions } from '../../db/schema.js';
import { createMockRepository } from '../../mocks/mock-db.js';

// Helper to inspect DB state directly
const getEntry = async (projectId: string, key: string) => 
  db.select().from(assetEntries).where(sql`${assetEntries.projectId} = ${projectId} AND ${assetEntries.assetKey} = ${key}`);

const getVersions = async (entryId: string) => 
  db.select().from(assetVersions).where(sql`${assetVersions.assetEntryId} = ${entryId} ORDER BY version ASC`);

describe('Requirement R1: Atomic Append-Only History', () => {
  let manager: AssetVersionManager;
  const projectId = 'proj_race_test_' + Date.now();
  const sceneId = 'scene_race_test_' + Date.now();
  const scope = { projectId, sceneIds: [sceneId] };
  const assetKey = 'scene_video';

  beforeEach(async () => {
    // Setup: Create project and scene placeholders in DB so FKs work
    // await db.insert(projects)...
    // await db.insert(scenes)...
    manager = new AssetVersionManager(createMockRepository());
  });

  it('R1.1: Should handle simultaneous creation of the FIRST version (The "Genesis Race")', async () => {
    // Two workers try to create V1 at the exact same time
    const workerA = manager.executeBatchUpdates([
      scope, [assetKey], 'video', ['video_A.mp4'], { model: 'modelA', jobId: 'jobA' }, true
    ]);
    const workerB = manager.executeBatchUpdates([
      scope, [assetKey], 'video', ['video_B.mp4'], { model: 'modelB', jobId: 'jobB' }, true
    ]);

    await Promise.all([workerA, workerB]);

    // Assertions:
    // 1. Only one entry exists
    const entries = await getEntry(projectId, assetKey);
    expect(entries.length).toBe(1);
    const entryId = entries[0].id;

    // 2. Head version is 2 (one won V1, the other got pushed to V2)
    expect(entries[0].headVersionNumber).toBe(2);

    // 3. Two distinct versions exist with correct data
    const versions = await getVersions(entryId);
    expect(versions.length).toBe(2);
    expect(versions[0].version).toBe(1);
    expect(versions[1].version).toBe(2);
    
    // Verify payloads are distinct (we don't know which won V1, but they shouldn't overwrite)
    const payloads = versions.map(v => v.data).sort();
    expect(payloads).toEqual(['video_A.mp4', 'video_B.mp4']);
  });

  it('R1.2: Should handle simultaneous appends to existing history (The "Mid-stream Race")', async () => {
    // Setup: V1 exists
    await manager.executeBatchUpdates([
      scope, [assetKey], 'video', ['v1.mp4'], { jobId: 'init' }, true
    ]);

    // Four parallel workers try to add versions
    const tasks = Array.from({ length: 4 }).map((_, i) => 
       manager.executeBatchUpdates([
        scope, [assetKey], 'video', [`v${i+2}.mp4`], { jobId: `job${i+2}` }, true
      ])
    );

    await Promise.all(tasks);

    const entries = await getEntry(projectId, assetKey);
    expect(entries[0].headVersionNumber).toBe(5); // V1 + 4 new ones

    const versions = await getVersions(entries[0].id);
    expect(versions.length).toBe(5);
    // Verify sequence is unbroken: 1, 2, 3, 4, 5
    expect(versions.map(v => v.version)).toEqual([1, 2, 3, 4, 5]);
  });

  it('R2.1: Updates to "best" pointer must not modify immutable version payloads', async () => {
    // Create V1 (set as best)
    await manager.executeBatchUpdates([scope, [assetKey], 'video', ['v1_data'], { meta: 'v1' }, true]);
    
    // Create V2 (set as best), V3 (not best)
    await manager.executeBatchUpdates([scope, [assetKey], 'video', ['v2_data'], { meta: 'v2' }, true]);
    await manager.executeBatchUpdates([scope, [assetKey], 'video', ['v3_data'], { meta: 'v3' }, false]);

    const [entry] = await getEntry(projectId, assetKey);
    expect(entry.bestVersionNumber).toBe(2);
    expect(entry.headVersionNumber).toBe(3);

    // Verify V1 data is untouched
    const versions = await getVersions(entry.id);
    const v1 = versions.find(v => v.version === 1);
    expect(v1?.data).toBe('v1_data');
    expect(v1?.metadata).toEqual({ meta: 'v1' });
  });
});

describe('AssetVersionManager - Concurrency Safe Upserts', () => {
  it('should lexicographically sort entries by ID before dispatching batch to prevent deadlocks', async () => {
    const mockDb = {
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onConflictDoUpdate: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([])
    };
    const manager = new AssetVersionManager({} as any);

    // Provide entries completely out of order
    const mockEntriesOutOfOrder = [
      { id: 'Z-123', assetKey: 'audio' },
      { id: 'A-123', assetKey: 'video' },
      { id: 'M-123', assetKey: 'prompt' }
    ] as any[];

    // @ts-ignore - testing private method
    await manager.batchUpsertEntries(mockEntriesOutOfOrder, mockDb as any);

    // Verify the db layer received the batch perfectly sorted
    const calledParamsBatch = mockDb.values.mock.calls[ 0 ][ 0 ];

    expect(calledParamsBatch[ 0 ].id).toBe('A-123');
    expect(calledParamsBatch[ 1 ].id).toBe('M-123');
    expect(calledParamsBatch[ 2 ].id).toBe('Z-123');
  });
});