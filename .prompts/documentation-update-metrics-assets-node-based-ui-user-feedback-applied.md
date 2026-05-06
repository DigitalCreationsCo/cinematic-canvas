# Documentation Refactoring Instructions
## Reflecting the Asset Registry Architecture Refactor

This document is the authoritative instruction set for updating, reorganising, and pruning the project's documentation. It covers every meaningful change made during the refactor — organised by concern — and specifies exactly what to write, what to remove, and where each piece belongs.

---

## How to Use This Document

Work through each section in order. Each section identifies:
- **Location** — where the doc lives or should live
- **Action** — CREATE / REWRITE / EXTEND / DELETE
- **Content** — what the doc must say

---

## 1. DELETE — Deprecated Documents

Remove these entirely. They describe systems that no longer exist or have been fully superseded.

| Document | Reason |
|---|---|
| Any doc describing `SceneWithAssets` or `assets` as a field on `Scene` | Assets are no longer attached to scene rows. Dual-table schema replaced this. |
| Any doc describing `WorkflowMetrics` or `VersionMetric` types | These types are dead. Metrics are now derived from `AssetRegistry`. |
| Any doc describing `RecordMetricsCallback` or `createAttemptMetricCallback` | Dead code. Remove. |
| Any doc describing `metrics-worker.ts` / `recordVersionMetric` | Dead code. Remove. |
| Any doc describing `calculateAssetMetrics` or `getAssetVersionMetrics` with `SceneWithAssets` signatures | These functions were replaced. |
| Any doc describing `calculateGlobalMetrics` accepting `Scene[]` | Replaced by `deriveGlobalMetrics` accepting `Record<string, AssetRegistry>`. |
| Generic "getting started" boilerplate that doesn't reflect the actual pipeline | Remove. Not useful to solo developer. |

---

## 2. REWRITE — Core Architecture Overview

**Location:** `docs/architecture/overview.md`
**Action:** REWRITE

### Content to cover:

#### Asset Storage — Dual-Table Schema

The project stores all generated assets in two Postgres tables, not on scene/character/location rows directly.

**`asset_entries`** — One row per (entity, assetKey) pair. Stores:
- `head` — the highest version number ever created for this asset
- `best` — the version currently selected as active (shown to user, used in renders)
- `bestLockedByFeedback` — boolean; when `true`, autonomous generation cannot override `best`. Set by user likes.
- Polymorphic FK columns: `sceneId`, `characterId`, `locationId` (only one is non-null per row)

**`asset_versions`** — Append-only. One row per version per entry. Stores:
- `version` — monotonically incrementing integer per entry
- `data` — GCS URI (for files) or raw text content (for prompts, JSON)
- `type` — `video | image | audio | text | json`
- `metadata` — JSONB: `{ model, jobId, evaluation, prompt, duration, width, height, fps, bitrate }`
- `userFeedback` — nullable JSONB: `{ rating: 'liked'|'disliked', userId, note?, recordedAt }`
- `startedAt` — when the user triggered the generation action (job claim time for batch; click time for manual)
- `createdAt` — when the version record was written (generation complete). `createdAt - startedAt = generation duration`

**Why two tables?** Version history is append-only and unbounded. Keeping it separate from entry metadata avoids full-row rewrites on every new version, enables efficient best-version JOINs (`WHERE version = best`), and decouples the "what exists" query (entries-only) from the "what's in it" query (full hydration).

#### Domain Type Hierarchy

```
AssetRegistry         — Partial<Record<AssetKey, AssetHistory>>
  AssetHistory        — { head, best, versions: AssetVersion[] }
    AssetVersion      — { version, data, type, metadata, userFeedback, startedAt, createdAt }
      UserFeedback    — { rating, userId, note?, recordedAt }
```

`AssetRegistry` is the unit passed around the frontend. Each entity (scene, character, location, project) owns one registry. The key is an `AssetKey` literal union covering all asset types the system generates.

#### Entity Ownership

| Entity | Registry contains |
|---|---|
| Scene | `scene_video`, `scene_start_frame`, `scene_end_frame`, `scene_prompt`, `scene_description` |
| Character | `character_image`, `character_prompt`, `character_description` |
| Location | `location_image`, `location_prompt`, `location_description` |
| Project | `storyboard`, `enhanced_prompt`, `render_video`, `thumbnail`, `audio_analysis`, `generation_rules` |

---

## 3. REWRITE — Asset Version Manager

**Location:** `docs/services/asset-version-manager.md`
**Action:** REWRITE

### Content to cover:

#### Purpose

`AssetVersionManager` is the single write path for all asset data. Nothing writes directly to `asset_entries` or `asset_versions` except through this class. It provides:
- Tiered fetching: lite (entries only, no version data) vs full (entries + all versions via single JOIN)
- Batch operations with deduplication for same-key multi-entity payloads
- Optimistic concurrency — no distributed locks, sequential version numbers maintained in-memory within a transaction
- User feedback recording with best-lock semantics

#### Key Methods

**`createVersionedAssets(...CreateVersionedAssetsBaseArgs)`**

The primary write path called by all agents via `SaveAssetsCallback`. Arguments are polymorphic — single values or arrays — to support batch operations over multiple entities in one call.

```typescript
type CreateVersionedAssetsBaseArgs = [
  scope: Scope,             // which entities are affected
  assetKeys: AssetKey[],    // key per entity (or single key applied to all)
  type: AssetType | AssetType[],
  dataList: string[],       // one URI or text value per entity
  metadata: AssetVersion['metadata'] | AssetVersion['metadata'][],
  setBest?: boolean | boolean[],
  startedAt?: Date,         // when the user triggered generation (job claim time)
]
```

The `startedAt` parameter is always provided by `WorkerService.createSaveAssetsCallback`, which captures the job's claim timestamp at job start. This ensures `createdAt - startedAt` accurately measures generation duration for every version.

**`recordUserFeedback(scope, assetKey, versionNumber, feedback | null)`**

Records a user like or dislike on a specific version. Operates on a single entity.

- `liked` → writes feedback to `asset_versions.user_feedback`, sets `asset_entries.best = versionNumber`, sets `bestLockedByFeedback = true`
- `disliked` → writes feedback only. If the disliked version was the locked best, clears the lock so the next generation can reclaim best normally
- `null` → clears feedback, releases lock if this version held it

**`setBestVersion(scope, assetKeys, versionNumbers)`**

Manual best-pointer override. Does not check or modify `bestLockedByFeedback`. Use for admin operations or explicit user selection (separate from the feedback flow).

**`getAllSceneAssets(sceneId)`** / **`getAllCharacterAssets`** / **`getAllLocationAssets`**

Returns a full `AssetRegistry` for an entity. Used by the frontend store on load and by agents needing to inspect current state.

#### The `bestLockedByFeedback` Lock

When `true`, `saveAssetHistories` will not advance the `best` pointer even when `setBest=true` is passed. New versions continue to be created and tracked (`head` still increments), but the liked version remains displayed to the user. The `hasNewerVersionsThanBest(history)` utility detects this state (`head > best > 0`) and the UI surfaces a banner.

The lock is stored on `asset_entries` (not on the version) because it's a property of the selection state, not of any individual version.

#### Internal Type: `AssetEntryState`

Because `bestLockedByFeedback` is added by migration and Drizzle's `$inferSelect` won't include it until the schema is regenerated, the manager defines a local `AssetEntryState` interface that extends `AssetEntry`:

```typescript
interface AssetEntryState extends AssetEntry {
  bestLockedByFeedback: boolean;
}
```

Once `drizzle-kit generate && migrate` runs, `AssetEntry` will include the field and this interface becomes a passthrough.

---

## 4. REWRITE — Worker Service / Job Pipeline

**Location:** `docs/services/worker-service.md`
**Action:** REWRITE

### Content to cover:

#### Job Claim and `startTime`

When a job is claimed via `jobControlPlane.claimJob(jobId)`, the claim returns `[job, claimedAtISO]`. The ISO string is immediately converted to a Unix timestamp:

```typescript
const startTime = new Date(claimedAtISO).getTime();
```

This `startTime` is passed to every `createSaveAssetsCallback(job, startTime)` call throughout the job's execution. All asset versions created during this job will have `startedAt = new Date(startTime)`, making generation duration `createdAt - startedAt` meaningful for observability.

#### `createSaveAssetsCallback(job, startTime)`

A closure factory that returns the `SaveAssetsCallback` passed into every agent. The callback:
1. Calls `assetManager.createVersionedAssets(...)` with `startedAt = new Date(startTime)`
2. Publishes a `NEW_ASSETS_BATCH` pipeline event so the frontend store receives the new versions in real time

Every call site across all job cases (`GENERATE_STORYBOARD`, `PROCESS_AUDIO_TO_SCENES`, `ENHANCE_STORYBOARD`, `GENERATE_CHARACTER_ASSETS`, `GENERATE_LOCATION_ASSETS`, `GENERATE_SCENE_FRAMES`, `GENERATE_SCENE_VIDEO`, `RENDER_VIDEO`) passes `startTime`.

#### Dead Code to Remove

`createAttemptMetricCallback` and the `saveMetric` callback it produces no longer serve any purpose. `WorkflowMetrics` / `VersionMetric` / `RecordMetricsCallback` and `metrics-worker.ts` are all dead. Remove them.

---

## 5. REWRITE — Metrics System

**Location:** `docs/features/metrics.md`
**Action:** REWRITE (was likely a stub or missing)

### Content to cover:

#### Design Principle

All metrics are derived on-read from `AssetRegistry` objects. There is no separately maintained metrics state, no `WorkflowMetrics` object, no manual recording step. The `metrics-utils.ts` module is a library of pure functions — no side effects, no external dependencies.

#### Data Flow

```
DB (asset_entries + asset_versions)
  → AssetVersionManager.getAllSceneAssets()
  → AssetRegistry (in frontend store: Map<sceneId, AssetRegistry>)
  → metrics-utils pure functions
  → MetricsPanel / MetricCard (display)
```

#### Key Utility Functions

**`deriveAssetKeyMetrics(histories: AssetHistory[]): AssetKeyMetrics`**

Derives aggregate metrics for one asset key across all scenes. Reads only the `best` version per history for quality/duration/rule metrics, but reads all versions for feedback counts. Returns:

| Field | Description |
|---|---|
| `totalAttempts` | Sum of `history.head` — includes failed attempts |
| `avgAttempts` | `totalAttempts / sceneCount` |
| `completedCount` | Scenes where `best > 0` |
| `completionRate` | `completedCount / sceneCount` |
| `avgScore` | Average eval score of best versions |
| `successRate` | Proportion of best versions scoring ≥ 0.7 |
| `avgDuration` | Average `createdAt - startedAt` of best versions |
| `rulesAddedCount` | Best versions that triggered a rule suggestion |
| `recentTrend` | `improving / declining / stable` — compares last 5 vs previous 5 best scores |
| `likedCount` | All versions across all scenes with `rating='liked'` |
| `dislikedCount` | All versions with `rating='disliked'` |
| `userSentimentRate` | `liked / (liked + disliked)`, 0 if no feedback |

**`deriveGlobalMetrics(sceneRegistries, assetKeys): GlobalMetrics`**

Top-level summary across all scenes and all tracked asset keys. Scene completion is determined solely by `scene_video.best > 0`. Includes a linear regression `trend` object computed from all best versions in chronological order.

**`deriveRollingTrend / calculateLearningTrends`**

These are the same function (`calculateLearningTrends` is an exported alias). Replays all best versions in `createdAt` order, building a regression state incrementally. Emits a `TrendSnapshot` at each step after the second data point. Used to render the "Learning Curve" chart in the Trends tab.

**`flattenVersionActivity(sceneRegistries, assetKeys, limit)`**

Returns all asset versions across all scenes, sorted newest-first, truncated to `limit`. Used for the Recent Activity feed. Includes `userFeedback` on each entry.

**`getSceneAssetHistory(registry, assetKey)`**

Returns all versions for one asset key in one scene, sorted newest-first, with `isBest` flag. Used for the Selected Scene panel.

**`hasNewerVersionsThanBest(history)`**

Returns `true` when `head > best > 0`. Signals that new versions exist beyond the user's liked best — used to show the "Newer version available — best is locked by a like" banner.

**`predictRemainingWork(trend, remainingScenes)`**

Projects total attempts and expected quality score for unfinished scenes based on current trend slopes.

#### Regression / Trend Computation

A lightweight incremental linear regression runs entirely in-memory inside the utility functions. It maintains six running sums (`sumX`, `sumY_a`, `sumY_q`, `sumXY_a`, `sumXY_q`, `sumX2`) and computes slopes on demand. No state is persisted — the regression is always recomputed from the version history on each render cycle.

Two slopes are tracked:
- `attemptTrendSlope` — negative means the workflow is getting more efficient (fewer attempts needed per asset)
- `qualityTrendSlope` — positive means output quality is improving over time

---

## 6. REWRITE — User Feedback

**Location:** `docs/features/user-feedback.md`
**Action:** CREATE

### Content to cover:

#### Purpose

User feedback (like/dislike) is a signal for reporting and observability, not a generation input. The workflow intentionally generates diverse output; user feedback measures how well autonomous generation aligns with user taste over time, without constraining future generations to converge on a style.

#### Full Flow: Client → Backend → Database

**Step 1 — User interaction (client)**

The user clicks like or dislike on a rendered asset version in the asset viewer. The UI calls an API endpoint (or tRPC procedure):

```
POST /api/assets/feedback
Body: { sceneId, assetKey, version, rating: 'liked' | 'disliked', note? }
```

The `userId` is injected server-side from the authenticated session — never trusted from the client.

**Step 2 — API handler**

The handler resolves the scope from `sceneId`, constructs the `UserFeedback` object with `userId` from session, and calls:

```typescript
await assetManager.recordUserFeedback(
  { projectId, sceneIds: [sceneId] },
  assetKey,
  version,
  { rating, userId, note, recordedAt: new Date() }
)
```

**Step 3 — `AssetVersionManager.recordUserFeedback` (database)**

Inside a single transaction:
1. Verifies the entry and version exist
2. Writes `userFeedback` JSON to `asset_versions.user_feedback` for the specific version row
3. If `liked`:
   - Updates `asset_entries.best = versionNumber`
   - Sets `asset_entries.best_locked_by_feedback = true`
4. If `disliked` or `null`:
   - If the targeted version was the locked best, sets `best_locked_by_feedback = false`
5. Returns the updated `AssetHistory`

**Step 4 — Pipeline event**

The API handler publishes a `NEW_ASSETS_BATCH` or equivalent pipeline event so connected clients receive the updated history in real time via the existing WebSocket/SSE pipeline.

**Step 5 — Store update (client)**

The frontend asset store receives the updated `AssetHistory` and replaces the affected registry entry. `MetricsPanel` re-derives automatically because it subscribes to the store.

#### Like-Lock Semantics

When a user likes a version, `bestLockedByFeedback = true` on the entry. From that point:
- `AssetVersionManager.saveAssetHistories` will NOT advance `best` even if `setBest=true` is passed
- New versions continue to be generated and tracked (`head` still increments)
- `hasNewerVersionsThanBest(history)` returns `true`, triggering the UI banner
- The lock is released when the user dislikes or clears the liked version, or explicitly likes a different version

#### Clearing Feedback

Pass `null` as the feedback argument to `recordUserFeedback`. This:
- Clears `user_feedback` on the version row
- Releases the lock if this version held it (sets `best_locked_by_feedback = false`)
- Does not change `best` — the version remains best until the next generation

---

## 7. EXTEND — Frontend Store

**Location:** `docs/frontend/store.md`
**Action:** EXTEND (add asset store section)

### Content to add:

#### `useAssetStore`

The asset store holds `assets: Map<entityId, AssetRegistry>`. The key is always the entity's UUID (sceneId, characterId, locationId, or projectId for project-level assets).

**Deriving `sceneRegistries` for `MetricsPanel`:**

```typescript
const sceneRegistries = useStoreWithEqualityFn(
  useAssetStore,
  (s) => Object.fromEntries(s.assets),
  (a, b) => a === b  // reference equality — store replaces Map on any write
);
```

Do not cross-read `useProjectStore` inside an `useAssetStore` selector or vice versa. The store that owns the data should be the subscription target for that data.

**`totalSceneCount` for `MetricsPanel`:**

Use the project store's scene count, not `Object.keys(sceneRegistries).length`. Scene registries may be sparse early in the workflow (scenes with no generated assets won't have entries), so the registry key count underestimates total scenes.

```typescript
const totalSceneCount = useProjectStore(s => Object.keys(s.scenes).length);
```

---

## 8. CREATE — Database Migration Guide

**Location:** `docs/database/migrations.md`
**Action:** CREATE

### Content to cover:

#### New Columns (Asset Registry Refactor)

Two new columns require a migration:

**`asset_versions.started_at` (NOT NULL)**

Records when the generation action was triggered by the user or job system. Required for computing generation duration (`created_at - started_at`).

Migration note: existing rows will have `NULL` for `started_at`. The `dbVersionToAssetVersion` method falls back to `created_at` in this case, resulting in `duration = 0ms` for historical versions. This is expected and will self-correct as new versions are generated.

```sql
ALTER TABLE asset_versions ADD COLUMN started_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
-- After migration, remove the DEFAULT so future inserts must supply it explicitly:
ALTER TABLE asset_versions ALTER COLUMN started_at DROP DEFAULT;
```

**`asset_entries.best_locked_by_feedback` (NOT NULL, DEFAULT FALSE)**

Controls whether autonomous generation can override the `best` pointer.

```sql
ALTER TABLE asset_entries ADD COLUMN best_locked_by_feedback BOOLEAN NOT NULL DEFAULT FALSE;
```

**`asset_versions.user_feedback` (nullable JSONB)**

Stores user like/dislike ratings.

```sql
ALTER TABLE asset_versions ADD COLUMN user_feedback JSONB;
```

#### Type Regeneration

After running migrations:
```bash
drizzle-kit generate
drizzle-kit migrate
```

`AssetEntry` and `InsertAssetVersion` will automatically include the new fields. The `AssetEntryState` interface in `asset-version-manager.ts` (which currently extends `AssetEntry` to add `bestLockedByFeedback`) becomes a redundant passthrough and can be removed, or kept as documentation of intent.

---

## 9. EXTEND — API Reference

**Location:** `docs/api/assets.md`
**Action:** EXTEND

### New endpoint to document:

#### `POST /api/assets/feedback`

Record a user like or dislike on a specific asset version.

**Request body:**
```typescript
{
  projectId: string;
  sceneId: string;       // or characterId / locationId for other entity types
  assetKey: AssetKey;
  version: number;
  rating: 'liked' | 'disliked';
  note?: string;
}
```

**Behaviour:**
- `userId` is read from the authenticated session, never from the request body
- A `liked` rating promotes the version to `best` and locks it against autonomous override
- A `disliked` rating records the signal without changing `best`; if the disliked version was the locked best, the lock is released
- Returns the updated `AssetHistory` for the affected entry

**Clear feedback:**

Send `rating: null` (or a DELETE variant if preferred) to clear feedback and release any lock.

---

## 10. CREATE — Observability / Metrics Reference

**Location:** `docs/features/observability.md`
**Action:** CREATE

This document is aimed at the product owner (you) interpreting what the metrics panel is telling you about workflow health.

### What Each Metric Means

**Completion** — Percentage of scenes where `scene_video.best > 0`. This is your headline progress number.

**Avg Quality** — Average autonomous eval score of all best-selected videos. The eval rubric checks cinematic quality, prompt adherence, and continuity. Scores above 70% are considered successful.

**Avg Attempts** — Average number of generation attempts per scene video. A high number means the eval agent is rejecting outputs frequently — check generation rules or model choice. A declining trend (negative `attemptTrendSlope`) means the workflow is getting more efficient.

**Rules Added** — Count of generation rule suggestions captured from eval results. Rules accumulate on the project and are injected into future generation prompts. A rising count means the workflow is actively self-correcting.

**Liked / Disliked** — User approval signals. `userSentimentRate` (`liked / (liked + disliked)`) is the key alignment metric: how often does the user actually prefer what the autonomous system selected as best?

**Learning Curve (Trends tab)** — Rolling regression snapshots showing whether `qualityTrendSlope` is positive (improving) and `attemptTrendSlope` is negative (more efficient) over time. Both positive = the workflow is genuinely learning. Flat or diverging = investigate the eval rubric or model.

**Newer version available (banner)** — Appears in the Selected Scene panel when `head > best > 0`. Means the user liked an earlier version and subsequent generations were not promoted. The user can review the new versions and update their like if the newer output is better.

### What User Sentiment Rate Tells You

A `userSentimentRate` well below the success rate (proportion scoring ≥ 0.7) means the eval rubric and user taste are misaligned — the system is selecting versions the user doesn't like. A rate close to 1.0 means the autonomous selection matches user preference reliably.

---

## Summary of All Changed Files

| File | Change |
|---|---|
| `shared/types/assets.types.ts` | Added `UserFeedback` schema; added `userFeedback` field to `AssetVersion`; added `startedAt` to `AssetVersion`; added `startedAt?` to `CreateVersionedAssetsBaseArgs` |
| `shared/db/schema.ts` | Added `started_at` to `asset_versions`; added `user_feedback` JSONB to `asset_versions`; added `best_locked_by_feedback` boolean to `asset_entries` |
| `shared/services/asset-version-manager.ts` | Added `recordUserFeedback`; lock-aware `saveAssetHistories`; `startedAt` in `prepareVersionsToCreate`; `userFeedback` in `dbVersionToAssetVersion`; `AssetEntryState` local type |
| `shared/services/worker-service.ts` | `startTime` threaded into `createSaveAssetsCallback`; all 9 call sites updated |
| `shared/utils/metrics-utils.ts` | Full rewrite — pure functions over `AssetRegistry`; added `calculateLearningTrends` alias; added `hasNewerVersionsThanBest`; feedback fields on all return types |
| `components/MetricsPanel.tsx` | New props (`sceneRegistries`, `totalSceneCount`); all `useMemo` blocks rewritten; feedback indicators; like-lock banner; `WorkflowMetrics` dependency removed |
| `components/MetricCard.tsx` | Fixed broken classNames; compact text sizing filled in |
| `shared/utils/metrics-utils.test.ts` | Full rewrite — 50+ test cases against new API, `makeVersion`/`makeHistory` fixture factory |

### Dead Code to Delete

| File / Export | Status |
|---|---|
| `shared/services/metrics-worker.ts` | Delete entire file |
| `WorkflowMetrics`, `VersionMetric` types | Delete |
| `RecordMetricsCallback` in `pipeline.types.ts` | Delete |
| `createAttemptMetricCallback` in `worker-service.ts` | Delete |
| `calculateAssetMetrics` (old signature) | Already replaced |
| `addVersionMetric`, `updateRegression` (exported) | Already replaced |