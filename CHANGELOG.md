# Changelog

## March 25, 2026: Hybrid Node Storage & Entity Intelligence

This week focused on stabilizing the spatial workspace, introducing robust dual-tier layout persistence, and laying the foundation for context-aware entity mentions within the canvas.

**Key Deliverables**:
- **Dual-Tier Layout Persistence**: Implemented `HybridNodeStorage` combining debounced local IndexedDB with reliable Supabase cloud synchronization. (`98c699a`, `f24a639`)
- **OCC Auto-Recovery**: Hardened Optimistic Concurrency Control (OCC) logic to prevent layout version drift and gracefully recover from cross-session conflicts. (`589239e`, `88dbb56`, `0621509`)
- **Entity Mention System**: Introduced a new tag registry and `KBHydrator` to support intelligent, context-aware mentions across the world-building graph. (`c2b4539`)
- **Canvas Rendering Stability**: Resolved critical race conditions during entity spawning and fixed infinite render loops in scene nodes. (`7b31672`, `f6c6017`, `0e97a5f`)

---

## March 18, 2026: Centralized API, Advanced Asset Management & Canvas UI Enhancements

This week focused on major architectural improvements, including a centralized API, a more robust asset management system, and significant enhancements to the new node-based canvas UI.

**Key Deliverables**:
- **Centralized API Routes**: Implemented a centralized API routing system to improve maintainability and type safety. (`a058470`, `938609c`, `88f7565`, `19136d5`)
- **Advanced Asset Management**: Introduced a decentralized asset store architecture, polymorphic media reference counting, and a like/dislike feedback mechanism for asset versions. (`f505226`, `d4f84c1`, `9387507`)
- **Canvas UI Enhancements**: Numerous improvements to the node-based canvas UI, including a new metadata inspector, improved node handle styling, and a confirmation dialog for node removal. (`2bcd0ff`, `4f23b8a`, `e7b12a1`)
- **Performance and Reliability**: Addressed performance issues in the canvas and implemented debouncing for undo/redo functionality. (`1090f20`, `c5432a6`)

---

## March 2026: Node-Based Canvas UI & Scene-as-Code (SAC)

This massive refactor transitions Cinematic Canvas from a linear dashboard interface to a spatial, node-based workflow (`@xyflow/react`). We've also laid the groundwork for the Scene-as-Code (SAC) collaborative ledger.

**Key Deliverables**:
- **Canvas Interaction**: Introduced `WorldBuilderCanvas` and `ProjectBuilderCanvas` for spatial entity management. Nodes map 1:1 with DB entities.
- **Scene-as-Code Ledger**: Initialized `SacGitService` stubs and Drizzle schema migrations to support branching, commits, and PRs for world lore data.
- **OCC Persistence**: Implemented Optimistic Concurrency Control (OCC) for batch-saving canvas layouts.
- **RBAC Locking**: Visual and logical lockdown of UI panels for inherited World entities inside Project forks.
- **Composite Support**: Added `GENERATE_COMPOSITE` to the pipeline to merge multiple canvas inputs via prompt engineering.

---

## March 5, 2026

### Pipeline Resiliency & RAI Safety
**Commits**:
- `ac3e038` - *feat(pipeline): implement RAI safety error intervention flow*
  - Added structured interception for Responsible AI (RAI) blocks during generation.
  - Implemented graceful pipeline pauses instead of catastrophic failures, allowing users to modify blocked prompts.
- `0844e9a` - *refactor(continuity): implement robust dependency-aware batch scene generation*
  - Refactored continuity manager to handle complex, dependent asset batches gracefully.
- `09d540b` - *feat(agents): implement batch retry logic for continuity manager assets*
  - Hardened batch continuity with precise retry logic for isolated failures.
- `0812f83` - *fix(retry): increase global cooldown to mitigate 429 errors*
  - Adjusted API request limits and cooldowns to prevent cascading rate-limit blocks.
- `7c03a88` - *fix(repository): Prevent metadata overwrite from undefined values*
  - Protected database state from null-value overwrites during partial updates.

### Prompt Engineering & Logging Analytics
**Commits**:
- `eb80b17` - *feat(core): enhance cinematography types and system prompt precision*
  - Tightened prompt schemas for characters, locations, and scenes, improving output consistency.
- `291d7ad` - *refactor(prompts): Refine sceneframe prompt, scene prompt, character image gen prompt*
  - Cleaned up redundant schema properties to optimize token usage and inference speed.
- `b57669f` - *feat(logging): integrate PromptLayer and refactor PromptLogger for non-blocking I/O*
  - Integrated PromptLayer for advanced prompt evaluation and performance tracking.
  - Offloaded logging tasks to non-blocking processes to eliminate I/O latency bottlenecks.

### UI/UX Polish & Developer Experience
**Commits**:
- `b97a89b` - *Refine UI/UX: Vertical center hero, update layouts, and polish styles*
  - Refined core aesthetic for landing and internal dashboards.
- `dd20882` - *feat(website): refactor case studies to interactive horizontal accordion*
  - Upgraded project showcase interactions.
- `438d48a` - *feat: add test_mode to run workflow without calling LLM endpoints*
  - Enabled complete offline graph execution for a rapid pipeline testing without API costs.
- `a38c1d9` - *fix(scene-status): ensure scene status and progress messages are resolved correctly*
  - Improved user feedback accuracy during long-running background tasks.
- `5bd6dfc` - *fix: correct invalid json in tsconfig files and finalize performance optimizations*
  - Streamlined TypeScript configurations and resolved compilation bugs.