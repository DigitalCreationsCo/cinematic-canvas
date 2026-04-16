# Changelog

## April 16, 2026: Real-Time Job Visibility, Unified Architecture & Inspector UX

This week focused on giving creators real-time visibility into pipeline jobs, unifying the server/pipeline/worker architecture behind an event bus facade, and polishing inspector and toolbar UX.

**Key Deliverables**:
- **Real-Time Job Visibility**: Full client-side job tracking via Server-Sent Events with per-user PubSub filtering. Creators can view active jobs, monitor progress, and cancel pending work directly from the canvas toolbar. (`e3ed09d`, `3737b20`, `d88ac2d`, `3936ad6`, `6d803b7`, `baa5919`)
- **Job Requeue & Lifecycle**: Added `requeueJob` with extra params handling and simplified requeue call sites across dispatcher and lifecycle monitor. (`c194802`, `2d9d2d2`)
- **IEventBus Facade & Monolith Mode**: Abstracted GCP Pub/Sub behind a unified `IEventBus` interface, enabling seamless swap to `InMemoryEventBus` for single-process monolith deployment. Domain entry points now accept injected dependencies via IoC. (`92f2629`)
- **Monolith Dockerfile**: Multi-stage Docker build for single-process deployment of server, pipeline, and worker. Includes build/run scripts with env-based secret injection. (`0e7521b`)
- **Dynamic Aspect Ratio Inspector**: Image previews now adapt to actual image dimensions (16:9, 4:3, etc.) instead of forcing 1:1 crops, via a new `DynamicAspectRatioImage` component. (`c5fe9ac`)
- **Audio Player in Inspector**: Replaced static audio badge with an inline `AudioPlayer` component for direct media playback. (`6115784`)
- **Animated Collapsible Sidebar Sections**: Sidebar sections now expand/collapse with smooth height animation. (`c4b3eba`)
- **Bulk Staging Panel**: New `BulkFilesStagingPanel` for multi-file operations from the canvas toolbar. (`bc24af3`)
- **Viewport Persistence**: Graph viewport position and zoom now persist in local IndexedDB across sessions. (`4fdb39e`)
- **Next.js → Astro Website Rebuild**: Complete website migration to Astro with Tailwind v4, custom Zalando Sans typography, dark-mode-first design, and animated hero gradients. (`fd1dfaf`, `3f33616`)
- **Unified Hybrid REPL CLI**: PubSub testing suite migrated from nested menus to a continuous command shell with direct argument execution and improved error boundaries. (`52a0ebc`, `cb5b28e`)
- **Gemini Schema Compatibility**: Refactored schema conversion logic in pipeline agents for compatibility with Gemini's strict JSON schema parser. (`f8dd09b`)
- **100 New Tests**: Comprehensive Vitest coverage for `CompositeNode`, `Inspector`, and aspect ratio components. (`0322f09`)

---

## April 8, 2026: Team Authorization & Intelligent @Mentions

This week focused on hardening the security model with team-scoped authorization and completing the intelligent @mention system for linking entities across the workspace.

**Key Deliverables**:
- **Team Authorization Middleware**: Implemented cached team authorization middleware across all routes. Users can only access resources belonging to their active team context, ensuring workspace isolation in multi-tenant environments. (`91078ef`)
- **DOM-Based Mention Extraction**: Replaced Tiptap with a native contentEditable-based mention system. @mentions now extract via DOM traversal instead of editor-specific AST parsing, eliminating the dependency on Tiptap internals. (`c497200`)
- **@Mention Auto-Fill**: Characters and locations auto-populate when typing @mentions in scene description fields via the `useMentionAutoFill` hook. (`855090b`)
- **Mention Integration in Dialogs**: Integrated @mentions into all editable dialogs and fixed entityId references for proper cross-entity linking. (`31f900e`, `bd442a1`)
- **Production Mention Hardening**: Auto-register mention handles on entity creation so labels are immediately searchable without manual registration. (`397c1f9`)
- **Project-Wide Authorization**: Hardened project-scoped authorization, blocking unauthorized access to cross-team resources. (`b7cdde9`)

---

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
