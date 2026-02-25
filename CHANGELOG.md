# Changelog

## February 2026: UI Refinement, Batch Generation & Documentation

This period focused on **user experience polish**, **batch generation reliability**, and **documentation infrastructure**. Key achievements include redesigned UI components, enhanced video playback, automated deployment pipelines, and comprehensive testing improvements.

---

## February 25, 2026

### Automated Deployment & UI Design System
**Commit**: `71de24d4` - *feat: automate Netlify deploys for website and docs; update UI redesign prompt*

- Implemented automated Netlify deployment pipeline for documentation website
- Updated UI redesign prompt specifications for consistent design language

---

## February 23, 2026

### Documentation Navigation & Design System Consolidation
**Commits**:
- `6001acbe` - *fix: undo bad tailwind config and css by agent*
  - Reverted problematic Tailwind configuration changes
  
- `ff5c0541` - *feat(website): add collapsible sidebar with 4-category doc navigation*
  - Implemented collapsible sidebar with 4 major categories: Introduction, Getting Started, Architecture, Features, Operations
  - Sections now collapse by default, auto-expand when viewing nested child pages
  - All titles display in Title Case format
  - Added frontmatter to intro.md

- `00bea33a` - *refactor(build): configure tailwind to use shared design system*
  - **Critical Fix**: Consolidated all styles from separate applications into central `design-system.css`
  - Added `design-system` package to both `client` and `website` applications
  - Updated Tailwind content paths to include shared design system directory
  - Corrected `@layer` order to ensure shared design loads first
  - Deleted redundant style files

**Impact**: Unified design language across all applications, eliminated style duplication

- `158ea7f6` - *refactor(docs): docs content is now located in docs/. Symlinked to website content dir*
  - Moved documentation to root `docs/` directory for better organization
  - Created symlink to website content directory for seamless integration

- `626a3b8e` - *Refactor documentation: Reorganize into Getting Started, Architecture, Features, and Operations*
  - Complete documentation restructuring for improved discoverability
  - Consolidated redundant files and added frontmatter

- `be71e58f` - *ignore logs*

- `8ec0eb70` - *feat(client): disable browser swipe navigation*
  - Prevents accidental back/forward navigation on touchpad swipes

### UI Polish & Video Playback
**Commits**:
- `bbe9f154` - *fix(ui): improve progress message and seekbar styling*
  - **SceneCard**: Matched progress message style to SceneDetailPanel with `RefreshCw` spinner
  - **Dashboard**: Styled logs tab icon with count badge inside message icon
  - **PlaybackControls**: Fixed seekbar to fill full container width with no margin

- `260d3bc6` - *fix(client): resolve video playback issues in dashboard and detail panels*
  - **Critical Fix**: Updated `VideoPlayer` to correctly use `media-chrome/react` components
  - Registered custom elements properly
  - Removed `crossOrigin='anonymous'` to fix playback from GCS buckets without CORS headers
  - Refactored `PlaybackControls` to use hidden native video for sync and visible player for fullscreen
  - Ensured video sources resolved to public HTTPS URLs using `resolvePublicUrl`

- `9077e30c` - *feat(ui): improve detail panel navigation and generation actions*
  - Added previous/next navigation buttons to `CharacterDetailPanel` and `SceneDetailPanel`
  - Removed regenerate button from toolbar, added to video overlay
  - Updated generation buttons with vibrant gradient styling
  - Enabled scrollable `FramePreview` for full character portraits
  - Fixed scene navigation logic in Dashboard

---

## February 22, 2026

### Prompt Engineering & Retry Logic Fixes
**Commits**:
- `f16ec20c` - *refactor(prompt): rename prompt files for accuracy, purpose. add jsdocs info*
  - Improved prompt file organization and documentation

- `d294587e` - *fix(retry): correct inverted retry logic and add missing test mock*
  - **Critical Bug Fix**: Fixed inverted condition that threw error when retries remained instead of when exhausted
  - Corrected calculation of `hasRetriesRemaining` (`attemptOffset + 1 < maxAttempts`)
  - Moved backoff multiplication to loop start to avoid double delay on first retry
  - Added missing `logPromptSanitized` mock that caused silent failures on safety errors
  - Updated test expectations for sanitize calls

- `21f57f5f` - *fix(worker): pass partial updates to updateProject to prevent metadata overwrites*
  - **Critical State Management Fix**: Prevented accidental overwrites of JSONB fields with stale values
  - Now passes only changed fields to `updateProject` instead of full `Project` objects
  - Fixed incorrect `Set` constructor syntax (missing array brackets)
  - Updated import path from `generation-rules-presets` to `domain-rules-presets`
  - Affected job types: `GENERATE_STORYBOARD`, `PROCESS_AUDIO_TO_SCENES`, `ENHANCE_STORYBOARD`, `SEMANTIC_ANALYSIS`, `GENERATE_SCENE_VIDEO`

---

## February 21, 2026

### Batch Generation Resilience & Testing Infrastructure
**Commits**:
- `8542dc04` - *fix(pipeline): add prompt-based cache buster and resilient batch execution*
  - Hashed `promptModifications` into `uniqueKey` for `GENERATE_SCENE_FRAMES` to enable regeneration
  - Replaced `Promise.all` with `Promise.allSettled` in `generateSceneFramesBatch` for fault tolerance
  - Added staggered execution (500ms delay) to prevent rate limiting

- `f8eb8b09` - *fix(pipeline): add cache buster and staggered batch execution for scene frames*
  - Added timestamp to `uniqueKey` hash to ensure unique requests always create new jobs
  - Replaced `Promise.all` with `Promise.allSettled` for partial batch success
  - Added 500ms stagger to input preparation

**Debugging & Logging**:
- `6d3a7ed3` - *fix: resolve type errors and bugs in prompt logger and video player*
- `a2036e1e` - *feat(logging): implement prompt logging system for model controllers*
  - Comprehensive prompt logging for debugging and analysis
- `e53f3185` - *chore(test): standalone image generation testing scripts*

**Test Coverage Expansion**:
- `85884cf5` - *test: improve coverage for worker service and graph*
  - Added comprehensive tests for `WorkerService` covering all job types
  - Added initial tests for `CinematicVideoWorkflow` graph
  - Fixed type errors and mocking issues
  - Achieved **>62% coverage** for `worker-service.ts` (up from <30%)

**Media Player Integration**:
- `aca37030` - *feat(ui): implement media-chrome video player across client and website*
  - Unified video player component using media-chrome library

**Video Rendering Optimization**:
- `eaebeb56` - *refactor(pipeline): streamline video rendering architecture*
  - Enabled inline video rendering in `WorkerService` for sequential workflows
  - Added `renderInProgress` flag to `GENERATE_SCENE_VIDEO` job payload
  - Updated graph to skip redundant final render if inline render succeeds
  - Added safety check to ensure video asset exists before skipping final node
  - Fixed and expanded worker service tests

**Asset Management Fixes**:
- `3c4516cb` - *fix(agents): use GCS URI instead of public URL for frame assets*
- `23b66ecb` - *chore(types): updated valid video durations*
- `63233beb` - *fix(scene): generateVideos image parameter shape corrected*
- `3344e4b4` - *fix: debug configuration improvements to load sources and sourcemaps*
- `25c7dca9` - *chore(test): pubsub fixtures now accepts dispatchJob override parameters*

**Repository Enhancements**:
- `1fe7c0dc` - *feat: added ProjectRepository methods*
  - Added `isEntityActive` to check for existing entities during asset generation
  - Added `deleteScene` with asset dependency cleanup

- `174229df` - *fix(assets): batchUpsertEntries sort entries to ensure lock row acquisition order*
  - Prevents deadlocks in concurrent batch operations

- `20d92d00` - *feat(provider): added guidance level parameter to projects, scenes, characters, locations*
  - Guidance feeds into `generateImages` request for fine-tuned control

**Pipeline Refactoring**:
- `0f49ab7d` - *refactor(pipeline): job uniqueKey for GENERATE_FRAME_SCENES is now string suffix*
  - Changed from strictly `assetKey` to more flexible string suffix

- `e56492fb` - *refactor(provider): Added modelPriorityMode config prop to modelControllers*
  - Determines model fallback order
  - Added reference image parsing for each content object depending on `referenceType`

- `9e7a3318` - *fix(pipeline): enable parallel batch scene frame generation with deterministic hashing*
  - Updated `GENERATE_SCENE_FRAMES` `uniqueKey` to include hash of sorted `sceneIds`
  - Refactored `generateSceneFramesBatch` to use `Promise.all` for concurrent input preparation

- `e5cf309f` - *fix(agents): ensure consistent asset saving in frame composition*
  - Updated `FrameCompositionAgent` to strictly save image and prompt assets after generation in all modes (SEQUENTIAL, PARALLEL, BATCH)
  - Removed redundant prompt saving in `ContinuityManagerAgent`
  - Propagated prompt metadata through internal batch wrappers

**Development Workflow**:
- `170f2431` - *fix(worker): update debug configuration and dev-runner*
  - Updated `launch.json` to run TypeScript source files directly via `tsx` instead of compiled JS
  - Updated `scripts/dev-runner.ts` to correctly pass debug arguments
  - Fixed type errors in `dev-runner.ts`

- `a385a89d` - *fix(build): replace tsgo with tsc for reliable compilation*
  - Switched to standard TypeScript compiler for stability

---

## February 20, 2026

### Testing & Documentation Infrastructure
**Commits**:
- `20dce1cd` - *chore(test): added integration tests for generative workflow and package.json script*
- `cbe261b9` - *chore(agent): moved .openpackage index to user config, installed rules*
- `8aecff95` - *refactor(docs): moved docs to root dir*

**Job Reliability Hardening**:
- `c61329a6` - *fix(worker): stop double-incrementing attempt count on failure*
  - **Critical Bug Fix**: Eliminated double-increment that was causing incorrect retry behavior

- `1248dbbc` - *fix(pipeline): reliability hardening for control flow*
  - **Dispatcher**: Added 2-min staleness check for pending jobs
  - **Dispatcher**: Added race condition recovery for unique constraint violations
  - **Worker**: Await DB writes and rethrow errors to prevent swallowed failures
  - **Monitor**: Increased stale timeout to 15m and enforced max retry limits

- `67733b2d` - *fix(agent): add heartbeat to scene generator to prevent stale job kills*
  - Long-running generation jobs now send heartbeats to prevent premature timeout

- `1f96c7aa` - *fix(pipeline): refactor job monitor to use recursive setTimeout*
  - More reliable than `setInterval` for long-running monitors

**Website Deployment**:
- `d25e4e93` - *chore: add docs symlink script for website build*
  - Added `website/scripts/link-docs.js` to automatically symlink root `docs/` to `website/content/docs/`
  - Updated `website/package.json` to run symlink script before dev and build commands

**Job Lifecycle Management**:
- `7c9f2801` - *Fix zombie job handling and unify attempt counters*
  - **JobLifecycleMonitor**: Fail stale jobs if retries exhausted
  - **JobLifecycleMonitor**: Increased stale threshold to 15m
  - **JobControlPlane**: Increment both current and total attempts on retry
  - **JobControlPlane**: Removed unsafe SQL attempt arithmetic

---

## February 18, 2026

### Logging & Asset History
**Commits**:
- `e26e70d0` - *feat(logger): configure logger to write to stdout and filesystem*
  - Dual output for better debugging and audit trails

- `25d90d67` - *chore: update redesign spec*

- `c7331aa8` - *fix(client): support multi-entity asset history fetching to prevent state clearing*
  - Prevents asset history from being cleared when switching between entities

**Generation Pipeline Unification**:
- `3be015cf` - *Refactor generation pipeline for unified batch/parallel support*
  - Refactored `QualityRetryHandler` to support `executeBatch` for handling lists of items with partial retries
  - Refactored `FrameCompositionAgent` to implement `generateFrames` using Strategy pattern for SEQUENTIAL, PARALLEL, and BATCH modes
  - Simplified `ContinuityManagerAgent` to delegate batch generation, removing duplicated logic
  - Fixed TypeScript errors in `GoogleProvider` by ensuring `assetKey` is present in batch failure responses

**Deployment**:
- `ae31bca6` - *chore(deploy): restrict website deployments to main branch only*

**Batch Generation Iteration** (Work in Progress):
- `24d17417` - *fix(batch): pivoted from batch generation due to difficulties with api*
  - Acknowledged challenges with batch API and quality checks
  - Planning more comprehensive extensible generation solution

- `cbed832b` - *bug: batch-generation results not writing, resolving batch generation params (WIP)*

---

## February 17, 2026

### Testing & Infrastructure
**Commits**:
- `ef1a439a` - *test: update storage-manager tests for 90% coverage*
  - Comprehensive test coverage for storage operations

- `2e317587` - *fix(pipeline): correct custom_id parameter in batch request metadata*
- `ef6916c6` - *chore(infra): run pubsub emulator docker script*
- `29136fac` - *fix(pipeline): batch generation bug fix: dest.gcsuri is dir, not file*

---

## February 16, 2026

### UI Simplification & Batch Testing
**Commits**:
- `912088c2` - *Simplify UI by removing extraneous styling*
  - Removed borders, rounded corners, text size utilities, shadows, and filters
  - Created simplified, flat aesthetic while preserving layout, colors, and typography
  - Badge components explicitly excluded from changes

- `d02f6b90` - *Simplify UI by removing extraneous styling* (duplicate/refinement)

**Batch Stress Testing**:
- `2aae0af5` - *feat(pubsub): add batch generation stress testing infrastructure*
  - Implemented `batchStressTest` scenario in `fixtures.ts`
  - Triggers global batch processing for characters, locations, and scenes
  - Added interactive "Batch Stress Test" options to Job Events and Workflows menus in CLI
  - Enhanced `repl.ts` with `dispatchBatchStressTest` and `givenBatchStressTest` helpers
  - Refactored TestScenarios factories to be async for robust job creation
  - Added comprehensive vitest coverage for new fixture scenarios

- `13aadb9b` - *chore(workspace): add agent files*
- `a840dbe2` - *chore(scripts): organize scripts into subdir*
- `8f874fe1` - *chore: ignore credentials*

**Batch Workflow Refinement**:
- `cd35bdd8` - *fix(pipeline): Troubleshooting and refine batch workflow (WIP)*
  - Ongoing work on GCS requests file, `pollBatchJob`, `handleBatchResults`

---

## February 15, 2026

### UI Components & Batch Generation
**Commits**:
- `86d99241` - *feat(client): CharacterDetailPanel and LocationDetailPanel*
  - New detail panels for character and location asset management

- `78a6c5e5` - *agent test rules: vitest*
- `bab354c5` - *refactor(web): merge website components from previous site*
- `6261980c` - *chore: revise ts config for website and subprojects*
  - Added `compositeMode` to website, removed redundant properties

**Batch Generation Architecture**:
- `4ede119f` - *refactor(batch): generateBatchContent: handle inlineResponses and gcsUri response*
  - Added `StorageManager` dependency to `GoogleProvider` class
  - Updated `composeFrameGenerationPrompt` to support batch generation
  - Removed `projectId` dependency from `StorageManager`

- `2c368456` - *chore: reinstall nm, package-lock.json changed*
  - Pipeline: Catch graph diagram filepath error

**Configuration & Environment**:
- `6d944b74` - *config(opencode): Google vertex ai configuration*
- `1a54d927` - *feat(server): Added endpoint to fetch completed videos for gallery*
  - Updated Google Cloud project env var names (`project`, `bucket`)
  - Added `tsx` to dev-runner script for source file compilation
  - Updated tailwind vite config
  - Added `.envrc` file for direnv export

**Design System Integration**:
- `cea08d1f` - *refactor(ui): implemented shared ui theme: design-system*
  - Saved ui-redesign prompt
  - Updated client styles, dark mode default

- `d877627d` - *feat(website): improved website UI layout, sorted docs*
  - Integrated shared styles (no build required)

- `6370a438` - *chore: gitignore: .netlify*

---

## February 14, 2026

### Media Processing & Video Gallery
**Commit**: `2f042298` - *feat(pipeline): Revise MediaController, MediaProcessingAgent + tests*

**Key Features**:
- Thumbnail generation now implemented
- Return type of `render_video` jobs includes: `gcsUri`, `thumbnailGcsUri`, `duration`, project title
- Created `/api/videos` endpoint to get project videos
- Added `fetchVideos` server getter for docs website gallery
- Implemented internal API key validation for videos endpoint
- Added join query to `getBestVideos` in `AssetVersionManager`
- Updated `MediaProcessingAgent` variable names

**Agent Infrastructure**:
- `31016efa` - *fix: remove claude models from agent definitions*
- `d3e360a2` - *feat(agent): openpackage skills for diverse agents*
- `627a423a` - *config(client): tooltip faster delay*

**Asset Management Fixes**:
- `52dbab81` - *fix(assets): AssetVersionManager.saveAssetHistories revised*
  - Fixed asset ID bug and insert query bug

- `49602dfc` - *fix(ai): standard contents input shape: parts*
  - Fixed Google params output types: `GenerateContentParameters` from base provider
  - Relocated google-specific utils under google provider
  - Added `BatchResultItem` and `BatchImageResultItem` interfaces

- `d0804752` - *chore: ring-1 outline in client components*
- `587d34c0` - *fix(website): fix path aliases*
- `f2cd6e4d` - *update changelog*

**Agent Development Tools**:
- `f1197e99` - *feat(agent): install openpackage, various development skills*
  - Synced coding agent skills, rules, and workflows

- `ab70b314` - *feat(ai): tContent transformer util for contents inputs*

**Documentation**:
- `5e5604c7` - *Update README with What's New section*

---

## February 13-12, 2026

### Documentation Migration & Testing
**Commits**:
- `5bc75909` - *fix: switch to static export for reliable docs deployment*
- `0003a75d` - *feat: migrate docs to new Next.js app with modern theme and structure*
- `2c7f7b5f` - *config(client): tooltip faster delay*

**Testing & Metrics**:
- `d5e2a137` - *feat(test): enhance pubsub testing fixtures with live createJob mocks*
  - Observe dispatch and worker processing in real-time

- `47a1e3cd` - *feat(metrics): update global regression and local regression types*
  - Implemented regression calculation and append to workflow metrics

**Provider Improvements**:
- `2eab823e` - *fix(pipeline): implement buildReferenceImageFromParams util*
  - Clarified `ReferenceImage` type properties
  - Commented out unused `referenceImageFrom` util

**UI Enhancements**:
- `b21521f1` - *fix(client): Revise compoundmodal: userapproval modal ui, memo render bug fix*
- `6cc71551` - *feat: enhance AssetHistoryPicker with media preloading, scene history tracking*
  - UX improvements and tests

- `1a263d5f` - *fix(client): resolve video publicurl in scenedetailpanel*

---

## February 11, 2026

### Logical Addressing & Human-in-the-Loop
**Commit**: `94f15d92` - *refactor(pipeline): implement logical addressing and non-blocking preview renders*

**Critical Architecture Changes**:
- Updated Dispatcher signature to require explicit parameters for `uniqueKey` generation, resolving job identity collisions
- Introduced fire-and-forget tasks for auxiliary renders without interrupting LangGraph workflow state
- Fixed infinite loop in node execution by ensuring state index increments on asset-skip paths
- Optimized sequential processing to only trigger preview renders at transition point between skipped and pending scenes

**Human-in-the-Loop Approval**:
- Introduced dedicated `user_approval` node to pause workflow after asset generation
- Prevents automated progression to expensive video rendering until user validates storyboard and character assets
- Added `userApprovedProcessing` state channel to persist approval status across graph re-entries

**Commits**:
- `4b3e8bda` - *chore: optimize interrupt error handling and re-entrancy logic*
  - Refined `user_approval` node for re-entry scenarios
  - Updated START conditional logic to respect approval gate during resumption
  - Standardized `LlmRetryInterruptValue` payload

- `399438734` - *Refactor: replace technical intervention modal with asset review workflow*
  - Simplified `ModalContentUserApproval` component
  - Replaced "Human Intervention Required" with "Review Project Assets"
  - Consolidated actions to "Close" and "Resume Project"

**Quality Retry Handler**:
- `5c4038bb` - *feat(pipeline): refactor quality retry handler to return execution state*
  - Simplified retry logic by removing internal side-effect callbacks
  - Decoupled generation logic from infrastructure concerns
  - Improved traceability with full execution metadata

**Developer Experience**:
- `b14efd9d` - *chore(pipeline): developer experience improvements*
  - TypeScript non-truncated messages
  - Client log error messages
  - Accurate pipeline status feedback
  - Comprehensive pipeline tests: dispatcher, interrupt handler, stream-helper
  - Updated `.gitignore` to include client src files

- `275008df` - *chore: agent rules*

**Unified LLM Retry Handler**:
- `8e35d6cf` - *feat(pipeline): implement unified LLM retry handler with global cooldown and state sync*
  - **Unified Retry Logic**: Single `QualityRetryHandler` orchestrates generation, evaluation, prompt correction
  - **Global Cooldown**: Provider-wide rate-limit mechanism prevents cascading 429 errors
  - **State Synchronization**: `QualityGenerationSession` ensures atomic state updates
  - **Error Handling**: Robust bubbling for `GraphInterrupt` and `OPTIMISTIC_LOCK_FAILURE`

**Vertex AI Unification**:
- `48ff07f0` - *feat: unify Vertex AI content and image generation APIs*
  - Centralized interface for Gemini and Imagen models
  - Normalized input handling for multimodal content
  - Unified response wrapper

**Normalized Asset Versioning**:
- `9913373e` - *feat: implement normalized asset versioning and tiered data resolution*
  - Migrated from JSONB to relational model: `asset_entries` + `asset_versions`
  - Atomic version sequencing via PostgreSQL `ON CONFLICT`
  - Tiered fetching for optimized loading
  - Comprehensive Vitest suites

**Model Fallback Mechanism**:
- `44aa92ae` - *feat: implement model fallback mechanism and modernize asset access patterns*
  - Robust model fallback: 2x primary, 1x fallback attempts
  - Comma-separated model lists via plural env vars
  - 429-triggered fallback only
  - Updated all asset access patterns

**Interactive Testing CLI**:
- `e0c66d57` - *feat(scripts): add interactive PubSub testing CLI*
  - Persistent, menu-driven CLI for PubSub testing
  - Continuous session state with operation history
  - Smart ID management
  - Comprehensive menu for publishing, dispatching, triggering lifecycle events

**Dual-Target Logging**:
- `53ec63a9` - *feat(logging): implement dual-target transport with rolling file persistence*
  - Multi-target pipeline: stdout + local storage
  - Integrated `pino-roll` for 48-hour retention with daily rotation

---

## February 8, 2026

### REPL Testing Module
**Commit**: `4217576f` - *feat(testing): add REPL-friendly pubsub testing module*

**Comprehensive Testing Suite**:
- Type-safe testing utilities for Google Cloud PubSub with interactive REPL support
- Main testing module (`repl.ts`) with callable functions:
  - `givenFullState()`, `givenJobDispatch()`, `givenJobChain()`
  - `givenWorkflow()`, `givenJobDispatched/Started/Completed/Failed()`
- `publisher.ts`: `PubSubTestPublisher` with batch publishing
- `fixtures.ts`: Test factories using exact type definitions
- All 10 job types with correct `AssetKey` mappings
- Documentation for prompt testing frameworks (Promptfoo, LangSmith, Zod validation, A/B testing)

**Usage**:
```bash
npx tsx scripts/pubsub-testing/repl.ts
> await pubsubTesting.givenFullState({ scenario: 'rich' })
> await pubsubTesting.givenJobChain('proj-123', 500)
```