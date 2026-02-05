# Changelog

## Overview

This week's updates prioritize aggressive performance scaling, specifically targeting database contention and data integrity during high-volume operations.
- Added support for parallel workflow tasks.
- Added support for batched generation operations.
- The Cinematic Canvas client now features a more responsive event-driven UI with instant workflow and asset generation feedback. Additionally, we’ve deployed a sophisticated Metrics UI panel to give stakeholders visibility into generation and asset quality.

---

### February 5, 2026

### Asset Management & Performance Optimization

**Commit**: `79614625` - *feat: optimize asset versioning system with 90%+ performance improvements*

**High-Performance Versioning**:

* **Query Optimization**: Eliminated N+1 bottlenecks by batch fetching entities, reducing query volume from 50 to 5 for 10-scene clusters.
* **Client-Side Caching**: Implemented a `WeakMap`-based cache with TTL invalidation, achieving a 95%+ hit rate.
* **Rendering Efficiency**: Applied strategic memoization to reduce UI re-renders by 80%.
* **Optimistic Updates**: Integrated instant UI feedback with robust rollback support for asset operations.

**Breaking Changes**:

* `ignoreAssetUrls` transitioned from `Array` to `Set` (use `.has()` instead of `.includes`).
* `setBestVersionFast` now implements immutable patterns, returning new objects.
* New cache management interface: `cacheAssets`, `getCachedAssets`, and `invalidateAssetCache`.

**Commit**: `867611b5` - *fix(assets): Complete asset lifecycle overhaul - client/backend synchronization*

* Resolved "re-render storms" in `useMediaPreloader` caused by global Map subscriptions.
* Fixed `Dashboard` selector equality failures and `DebugStatePanel` Map serialization bugs.
* Corrected 7 polymorphic `assetKeys` access bugs in `AssetVersionManager` regarding cardinality and update logic.

---

### Observability & Metrics Infrastructure

**Commit**: `1626fcb1` - *Feat: Enhanced metrics tracking for all asset types*

**Enterprise-Grade Analytics**:

* **Multi-Asset Tracking**: Granular tracking for `scene_video`, `scene_image`, `scene_prompt`, and more, including quality scores and generation durations.
* **Information-Rich UI**: Introduced a three-tab dashboard (Overview, Assets, Trends) featuring 8+ dynamic cards and a real-time activity feed.
* **Predictive Trends**: Implemented incremental linear regression to track performance trends over time.
* **Visual Indicators**: Color-coded quality health thresholds (Green  80%, Amber  60%, Red < 60%).

**Commit**: `ac1d95ad` - *Unified Attempt Tracking*

* Standardized `totalAttempts` as a monotonic, non-resetting counter for accurate longitudinal metrics.
* Separated `currentAttempt` to track retries within specific job lifecycles.

---

### Pipeline Resilience & Distributed Coordination

**Commit**: `32275ded` - *Feat: batch payloads to reduce database contention and increase throughput*

* **Batch Processing**: Refactored `WorkerService` and `ContinuityManagerAgent` to aggregate requests into single agent calls.
* **Atomic Reservation**: Implemented versioning reservation in `AssetVersionManager` to ensure consistency across distributed workers before batch submission.
* **Event Optimization**: Minimized network overhead by emitting unified `NEW_ASSETS_BATCH` events.

**Commit**: `82184852` - *feat(pipeline): implement unified quality retry handler with decoupled state session*

* Introduced `QualityRetryHandler` to standardize generation-evaluation-correction loops.
* Extracted `QualityGenerationSession` to manage distributed state synchronization and immutable versioning.
* Improved handling for `GraphInterrupt` and RAI safety triggers.

**Commit**: `b9d4f6c4` - *feat(jobs): implement resilient attempt increment hook with optimistic locking*

* Integrated atomic updates and optimistic concurrency control to eliminate race conditions in job increments.
* Standardized successor job recovery flow within the Dispatcher.

---

### Core Infrastructure & Developer Experience

**Commit**: `eb688e7e` - *fix(db): Nullable column modifier*

* Developed a type-safe `nullable()` modifier for Drizzle ORM to automate `null`  `undefined` conversions across all supported types.

**Commit**: `3fa5c462` - *fix: Address TSServer latency issues*

* Decoupled the Website Project from the root composite graph, significantly reducing Next.js-related type-checking overhead for core logic development.

**Commit**: `29126425` - *fix: robust resolution of gs:// and https:// URLs*

* Refactored `resolvePublicUrl` to ensure stable handling of Google Cloud Storage URIs and prevent malformed output.

**Commit**: `3967925e` - *fix(pipeline): Dont terminate workflow after interrupt error*

* Hardened pipeline stability by preventing workflow termination on specific interrupt errors.

---

### Database Maintenance

**Commit**: `d7a9baac` - *fix: update drop-all script: drop public schema*

* Updated destructive maintenance scripts to include public schema removal for clean environment resets.

---

### January 27, 2026

#### Graph Workflow Resume Logic & Build System Hardening
**Commit**: `31cf331b` - *fix(pipeline): revised graph workflow resume logic, added resume options*

**Workflow Resumption**:
- Revised graph workflow resume logic with new `forceResume` option for explicit restart control
- Enhanced interrupt value handling for more predictable recovery from suspended states
- Improved routing logic after job completion in `resumePipeline`

**Build System**:
- Enforced relative path imports and strict `rootDir` boundaries to resolve build-breaking absolute import patterns
- This prevents TypeScript compilation errors when importing across service boundaries
- Ensures clean separation between `src/pipeline`, `src/worker`, `src/server`, and `src/shared`

**Commit**: `206da982` - *fix(pipeline): workflowService resumePipeline: handle and route after jobComplete correctly*

---

### January 27, 2026

#### Documentation Website & Content Management
**Commit**: `bbc85c7c` - *feat(website): integrate documentation website with blog updates*

- Integrated full documentation website with blog functionality
- Added dev-only WYSIWYG markdown editor for content authoring
- Implemented content API for managing documentation and blog posts
- This provides a user-friendly interface for maintaining project documentation

---

### January 24, 2026

#### Multi-Service Debugging Infrastructure
**Commit**: `1f92445d` - *build(debug): implement multi-service dev runner and compound launch configs*

**Revolutionary Developer Experience**: Complete overhaul of the development workflow to support concurrent debugging of multiple services without conflicts.

**Key Features**:
- **Dynamic Port Allocation**: Updated `dev-runner.ts` to accept `--port` argument for Node inspector (defaults to 9229)
- **Dedicated Service Configurations**: Each service (Server, Worker, Pipeline) has its own VS Code debug configuration using integrated terminal
- **"Launch All Services" Compound Task**: Orchestrate the full stack with a single command
- **Environment Standardization**: Unified `NODE_ENV=development` and source map resolution across all debug targets

**Build System Improvements**:
- Fixed path resolution in `setupVite` to correctly locate `index.html` in nested `src/client` structure
- Standardized Watch Client (Build) to use absolute `${workspaceFolder}` paths for reliable `dist/server/public` routing
- Hardened `problemMatcher` regex in `tasks.json` to handle ANSI formatting and build timing logs
- Unified presentation blocks across all watchers to minimize terminal noise
- Configured Watch All compounds with shared background matchers for parallel service initialization

**Test Infrastructure**:
- Fixed failing workflow and agent tests
- Aligned infrastructure mocks with current architecture

**Migration to ES Modules**:
- Migrated codebase to use `.js` extensions for `nodenext` compatibility
- Ensures proper ES module resolution in TypeScript

**Impact**: Developers can now use keyboard shortcuts `[r]` and `[d]` within VS Code while setting simultaneous breakpoints across services. This dramatically improves debugging efficiency in distributed scenarios.

**Commit**: `42f3038f` - *refactor: modernize dev-runner and resolve TS rootDir boundary errors*

- Adjusted `tsconfig.json` `rootDir` to project root to allow `vite.config.ts` imports within server-side logic
- Updated `dev-runner.ts` to use `--import tsx` and `-r dotenv/config` for reliable environment variable inheritance in child processes
- Synced `vite.config.ts` aliases with `tsconfig` paths for unified resolution
- Streamlined build strategy with `--experimental-transform-types` and automated debug inspector attachment on port 9229

**Commit**: `6e27086f` - *feat: implement dev/debug runner with key-bound recompile*

- Initial implementation of keyboard-driven recompile workflow
- Enables rapid iteration cycles during development

---

### January 23, 2026

#### State Synchronization & Logging Fixes
**Commits**:
- `2f1afed0` - *fix(client): implemented requestFullState on project connect*
  - Client now explicitly requests full state when connecting to a project
  - Resolves race conditions where UI would load before state was available
  
- `03a2bcaf` - *fix(log): implemented internal pipeline message publisher*
  - Created internal message publisher to continue logging publish events
  - Prevents recursive errors when logging Pub/Sub operations
  - Maintains observability without creating circular dependencies

---

### January 22, 2026

#### Database Connection Pooling & Resilient Worker Lifecycle
**Commit**: `026aad1f` - *refactor(infra): unify database pooling and implement resilient worker lifecycle*

**Critical Infrastructure Overhaul**: This commit represents a fundamental re-architecture of database connection management and service lifecycle, eliminating a major class of production failures.

**PoolManager with Circuit Breaker**:
- Implemented centralized `PoolManager` with Circuit Breaker pattern
- Automated connection leak detection prevents resource exhaustion
- Monitors connection acquisition latency and error rates
- Trips circuit breaker when error thresholds are exceeded, preventing cascading failures
- Automatically attempts recovery with exponential backoff

**Unified Connection Strategy**:
- Centralized DB initialization ensures Drizzle ORM and Service Managers share a single connection pool
- Eliminates connection pool fragmentation that was causing intermittent "pool exhausted" errors
- Reduces total connections to database, improving performance and stability

**Distributed Lock Manager**:
- Implemented `DistributedLockManager` using DB-backed advisory locks
- Automated heartbeat mechanism prevents orphaned locks
- Integrates with PoolManager metrics for proactive pressure warnings
- Ensures locks are released even if process crashes

**Graceful Shutdown Protocol**:
Standardized shutdown sequence across Pipeline and Worker services:
1. Close PubSub consumers (stop receiving new work)
2. Stop background monitors and heartbeats
3. Release all active distributed locks
4. Drain and close Postgres connection pool

**Connection Safety**:
- Added connection release guards to prevent "double-release" crashes in high-concurrency scenarios
- Implemented connection leak detection with automatic cleanup
- Enhanced error handling for edge cases (network partitions, database restarts)

**Observability**:
- Improved logging using `AsyncLocalStorage` for job-scoped trace contexts
- Every database operation now includes correlation IDs for end-to-end tracing
- Metrics emission for external monitoring integration

**Impact**: This change eliminates the "connection pool exhausted" errors that were causing workers to hang in production, and provides the foundation for reliable distributed locking.

**Commit**: `baaa024f` - *feat(pool): implement background metrics collection and health monitoring*

- Implemented `metrics` event emission for integration with external monitoring systems
- Tracks connection acquisition latency and error rates for performance auditing
- Integrated metrics feedback into LockManager for proactive pressure warnings
- Enables real-time monitoring dashboards and alerting

---