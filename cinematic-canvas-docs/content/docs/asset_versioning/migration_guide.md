// MIGRATION_GUIDE.md

# Asset System Refactor - Migration Guide

## Overview

The asset system has been refactored from a single JSONB column to a dual-table architecture:
- **`asset_entries`**: Metadata about each asset (head, best version pointers)
- **`asset_versions`**: Append-only version history

## Key Benefits

1. **Better Performance**: Indexed queries, efficient JOINs, no full JSONB scans
2. **Tiered Loading**: Fetch only what you need (lite vs full)
3. **Data Integrity**: Foreign key constraints, unique indexes prevent corruption
4. **Scalability**: Assets can grow independently of entity tables
5. **Auditability**: Complete immutable version history

## Breaking Changes

### Schema Changes

**REMOVED:**
- `assets` JSONB column from `projects`, `scenes`, `characters`, `locations` tables

**ADDED:**
- `asset_entries` table (metadata)
- `asset_versions` table (version data)

### API Changes

#### ProjectRepository

**Changed Methods:**
- `getProject()` - Now returns lite asset payload (head, best, no versions)
- `getProjectFullState()` - Now returns full asset payload (head, best, all versions)
- All entity queries now fetch assets separately

**Removed Methods:**
- `updateAssetsForTable()` - Asset updates now handled by `AssetVersionManager`

**New Methods:**
- `getProjectManifest()` - Get asset metadata for entire project tree

#### AssetVersionManager

**Removed:**
- All locking methods (`*WithLock`)
- `fetchRegistries()`, `fetchRegistriesWithLock()` - Replaced with new fetch methods

**New Internal Methods:**
- `resolveHistoriesLite()` - Fetch without version data
- `resolveHistoriesFull()` - Fetch with all versions
- `fetchEntriesLite()`, `fetchEntriesFull()` - Low-level DB access
- `batchUpsertEntries()`, `batchInsertVersions()` - Efficient writes

**No Changes to Public API:**
- `createVersionedAssets()` - Same signature
- `batchCreateVersionedAssets()` - Same signature
- `getNextVersionNumber()` - Same signature
- `getBestVersion()` - Same signature
- `getAllVersions()` - Same signature
- `setBestVersion()` - Same signature
- `deleteVersions()` - Same signature

## Migration Steps

### 1. Database Schema Migration

```sql
-- Create new tables
CREATE TABLE asset_entries (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_id UUID REFERENCES scenes(id) ON DELETE SET NULL,
  character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  asset_key TEXT NOT NULL,
  head INTEGER NOT NULL DEFAULT 0,
  best INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE asset_versions (
  id UUID PRIMARY KEY,
  asset_entry_id UUID NOT NULL REFERENCES asset_entries(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  data TEXT NOT NULL,
  type TEXT NOT NULL,
  metadata JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE UNIQUE INDEX idx_unq_project_asset ON asset_entries(project_id, asset_key) 
  WHERE scene_id IS NULL AND character_id IS NULL AND location_id IS NULL;
CREATE UNIQUE INDEX idx_unq_scene_asset ON asset_entries(scene_id, asset_key);
CREATE UNIQUE INDEX idx_unq_char_asset ON asset_entries(character_id, asset_key);
CREATE UNIQUE INDEX idx_unq_loc_asset ON asset_entries(location_id, asset_key);
CREATE UNIQUE INDEX idx_unq_asset_version_seq ON asset_versions(asset_entry_id, version);

CREATE INDEX idx_asset_entries_project ON asset_entries(project_id);
CREATE INDEX idx_asset_entries_scene ON asset_entries(scene_id);
CREATE INDEX idx_asset_entries_character ON asset_entries(character_id);
CREATE INDEX idx_asset_entries_location ON asset_entries(location_id);
CREATE INDEX idx_asset_history_lookup ON asset_versions(asset_entry_id, version);
CREATE INDEX idx_entry_version ON asset_versions(asset_entry_id, version);

-- Note: If migrating existing data, create migration script here
-- For fresh start, skip to step 2
```

### 2. Code Updates

**Update imports:**
```typescript
// OLD
import { projects, scenes, characters, locations } from './db/schema.js';

// NEW
import { projects, scenes, characters, locations } from './db/schema.js';
import { assetEntries, assetVersions } from './db/schema-assets.js';
```

**Update entity queries:**
```typescript
// OLD - entities had assets column
const project = await db.select().from(projects).where(eq(projects.id, id));
// project.assets was JSONB

// NEW - assets fetched separately
const project = await projectRepo.getProject(id);
// project.assets is AssetRegistry (lite - no version data)

const projectFull = await projectRepo.getProjectFullState(id);
// projectFull.assets is AssetRegistry (full - with all versions)
```

### 3. Update Domain Mappers

**Remove asset handling from entity mappers:**
```typescript
// OLD - mappers handled assets
export function mapDbProjectToDomain(db: DbProject): Project {
  return {
    ...db,
    assets: db.assets || {} // REMOVE THIS
  };
}

// NEW - assets handled separately
export function mapDbProjectToDomain(db: DbProject): Project {
  return {
    ...db
    // No assets - will be added by repository
  };
}
```

## Usage Examples

### Example 1: Loading Projects (Lite)

Use lite fetch for lists, previews, and initial loads:

```typescript
// Load project with minimal asset data
const project = await projectRepo.getProject(projectId);

// project.assets structure:
// {
//   'storyboard': { head: 3, best: 2, versions: [] },
//   'enhanced_prompt': { head: 1, best: 1, versions: [] }
// }

// You know what assets exist and which versions are active,
// but you don't have the actual data (URIs, prompts, etc.)
```

### Example 2: Loading Projects (Full)

Use full fetch for editing, version history, detailed views:

```typescript
// Load project with complete asset data
const project = await projectRepo.getProjectFullState(projectId);

// project.assets structure:
// {
//   'storyboard': {
//     head: 3,
//     best: 2,
//     versions: [
//       { version: 1, data: '...', type: 'json', metadata: {...}, createdAt: Date },
//       { version: 2, data: '...', type: 'json', metadata: {...}, createdAt: Date },
//       { version: 3, data: '...', type: 'json', metadata: {...}, createdAt: Date }
//     ]
//   }
// }
```

### Example 3: Creating Assets

No changes to the public API:

```typescript
const manager = new AssetVersionManager(projectRepo);

// Create scene videos (same as before)
const histories = await manager.createVersionedAssets(
  { projectId, sceneIds: ['scene-1', 'scene-2'] },
  ['scene_video'],
  'video',
  ['gs://bucket/video1.mp4', 'gs://bucket/video2.mp4'],
  { model: 'runway-gen3', jobId: 'job-123' },
  true // set as best
);

// Returns: AssetHistory[] (same structure as before)
```

### Example 4: Batch Operations

```typescript
// Create multiple asset types at once
const result = await manager.batchCreateVersionedAssets([
  [scope, ['scene_start_frame'], 'image', startUrls, metadata1],
  [scope, ['scene_end_frame'], 'image', endUrls, metadata2],
  [scope, ['scene_video'], 'video', videoUrls, metadata3],
]);

// result.histories: All successful creations
// result.errors: Failed operations with index and error
```

### Example 5: Version Management

```typescript
// Get next version number (uses lite fetch)
const [nextVersion] = await manager.getNextVersionNumber(
  { projectId, sceneIds: ['scene-1'] },
  ['scene_video']
);
// Returns: [4] if head is 3

// Get best version data (uses full fetch)
const [bestVersion] = await manager.getBestVersion(
  { projectId, sceneIds: ['scene-1'] },
  ['scene_video']
);
// Returns: AssetVersion | null

// Set new best version
await manager.setBestVersion(
  { projectId, sceneIds: ['scene-1'] },
  ['scene_video'],
  [3] // version numbers
);
```

### Example 6: Project Manifest

Get lightweight overview of all assets:

```typescript
const manifest = await projectRepo.getProjectManifest(projectId);

// Structure:
// {
//   project: { 'storyboard': { head: 2, best: 2, versions: [] } },
//   scenes: {
//     'scene-1': { 'scene_video': { head: 3, best: 2, versions: [] } },
//     'scene-2': { 'scene_video': { head: 1, best: 1, versions: [] } }
//   },
//   characters: {
//     'char-1': { 'character_image': { head: 2, best: 1, versions: [] } }
//   },
//   locations: {
//     'loc-1': { 'location_image': { head: 1, best: 1, versions: [] } }
//   }
// }
```

## Performance Considerations

### Query Optimization

**Lite Queries (Fast):**
- Project listing: Only fetch entries table
- Navigation: Check what assets exist
- Version selection UI: Show available versions

**Full Queries (Slower):**
- Editing views: Need actual data
- Version history panels: Show all versions
- Export/download: Need complete data

### Batch Operations

The new system batches operations efficiently:

```typescript
// Single transaction, batched inserts
await manager.createVersionedAssets(
  { projectId, sceneIds: Array(100).fill('...') },
  ['scene_video'],
  'video',
  Array(100).fill('...'),
  metadata
);

// Internally:
// 1. Upsert 100 entries in batches of 100
// 2. Insert 100 versions in batches of 100
// 3. Single transaction commit
```

### Index Usage

Queries automatically use optimal indexes:

```typescript
// Uses: idx_asset_entries_scene
await manager.getBestVersion(
  { projectId, sceneIds: ['scene-1', 'scene-2'] },
  ['scene_video']
);

// Uses: idx_entry_version for JOIN
const project = await projectRepo.getProjectFullState(projectId);

// Uses: idx_unq_scene_asset for conflict detection
await manager.createVersionedAssets(...);
```

## Troubleshooting

### Issue: Assets not appearing

**Check:**
1. Are you using `getProjectFullState()` when you need version data?
2. Did you call `createVersionedAssets()` successfully?
3. Check database for entries: `SELECT * FROM asset_entries WHERE ...`

### Issue: Duplicate key errors

**Cause:** Trying to create entry that already exists

**Solution:** Use polymorphic asset keys correctly:
```typescript
// WRONG - creates same key for all scenes
await manager.createVersionedAssets(
  scope,
  ['scene_video', 'scene_video', 'scene_video'], // duplicate keys!
  ...
);

// RIGHT - single key broadcasts to all
await manager.createVersionedAssets(
  scope,
  ['scene_video'], // single key
  ...
);
```

### Issue: Performance slow on full fetch

**Solution:** Use lite fetch when possible:
```typescript
// SLOW - fetches all versions
const project = await projectRepo.getProjectFullState(projectId);

// FAST - only metadata
const project = await projectRepo.getProject(projectId);

// OPTIMAL - fetch full data only when needed
if (userOpensVersionHistory) {
  const fullAssets = await manager.getAllVersions(scope, keys);
}
```

## Testing

### Unit Tests

```typescript
describe('AssetVersionManager', () => {
  it('creates asset with lite fetch', async () => {
    await manager.createVersionedAssets(...);
    
    const histories = await manager.getNextVersionNumber(scope, keys);
    expect(histories[0]).toBe(2); // head + 1
  });

  it('fetches full asset data', async () => {
    await manager.createVersionedAssets(...);
    
    const [version] = await manager.getBestVersion(scope, keys);
    expect(version?.data).toBeDefined();
    expect(version?.version).toBe(1);
  });
});
```

### Integration Tests

```typescript
describe('ProjectRepository', () => {
  it('loads project with lite assets', async () => {
    const project = await projectRepo.getProject(id);
    
    expect(project.assets).toBeDefined();
    expect(project.assets.storyboard?.versions).toEqual([]);
  });

  it('loads project with full assets', async () => {
    const project = await projectRepo.getProjectFullState(id);
    
    expect(project.assets.storyboard?.versions.length).toBeGreaterThan(0);
  });
});
```

## Rollback Plan

If you need to rollback to the old system:

1. **Keep old schema:** Don't drop the `assets` JSONB columns yet
2. **Dual-write pattern:** Write to both old and new systems during transition
3. **Feature flag:** Use environment variable to switch between implementations
4. **Data sync script:** Keep old JSONB in sync with new tables

```typescript
// Dual-write example
async function createAsset(...) {
  // New system
  await newAssetManager.createVersionedAssets(...);
  
  // Old system (backup)
  if (process.env.DUAL_WRITE_ASSETS === 'true') {
    await oldUpdateAssetsForTable(...);
  }
}
```

## Support

For questions or issues with the migration, please contact the development team.