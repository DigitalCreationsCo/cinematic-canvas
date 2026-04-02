# Changelog

## April 2, 2026: Scene Editor, Entity Creation & Canvas UX

This week focused on introducing an immersive Scene Editor, comprehensive entity creation forms with validation, and a sweeping canvas UX overhaul including floating panels, performance optimization, and a unified notification system.

**Key Deliverables**:
- **Scene Editor**: Added a full-screen `SceneEditor` component with cinematic workspace-inspired UI for editing scene name, description, mood, and continuity notes with persistence via `patchEntities`. Accessible from context menu and detail panel. (`627d932`)
- **Entity Creation Forms**: Implemented complete Zod-validated entity forms with drag-and-drop file uploads, avoiding duplicate image uploads, and supporting all entity attributes (characters, locations, scenes). (`1afbf6e`, `b0048ce`, `c42360e`, `13f940f`, `de4d310`)
- **Pre-Created Entity Pipeline Support**: Entities created by the user before pipeline execution are now preserved and woven into storyboard generation, preventing duplicates and associating user-provided images. (`5ac6217`, `95ff93c`, `8d40faf`, `cad140c`, `f5559c4`, `95db4cf`)
- **Canvas Performance**: Optimized node graph rendering for 1000s of nodes via comprehensive memoization (`React.memo`, `useCallback`, `useShallow` selectors). (`22520bd`)
- **Floating Panels & Resizable Sidebar**: Converted sidebars to floating panels with absolute positioning and added a resizable `RightSidebar` with grip handle. (`846645a`)
- **Permanent Entity Deletion**: Implemented proper deletion workflow with confirmation dialogs, cross-store synchronization, and async-safe dialog lifecycle. (`e205773`, `026c6bc`)
- **Context Menu Hardening**: Fixed 7 interrelated event propagation bugs across context menu, modal, and dropdown interactions using capture-phase listeners, `EventStopper`, and Zustand menu state coordination. (`7b3e11b`, `3bbaf80`, `91398db`, `da87c14`, `01f985e`, `69c6c9a`, `60747cc`, `b15998b`)
- **Global Notifications**: Replaced `useToast` hook with a unified `GlobalNotifications` system backed by `usePipelineStore`. (`d16b710`)
- **Database Schema Migration**: Added CASCADE deletes to all foreign keys, dropped checkpoint tables, and optimized indexes. (`0265e6a`)

---

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
