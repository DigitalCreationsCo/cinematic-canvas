# Changelog

## April 24, 2026: Agentic Chat, tRPC Migration & LangChain Integration

This week introduced conversational AI directly into the workspace, migrated the entire API surface to tRPC for end-to-end type safety, integrated LangChain as the model orchestration layer, and shipped optimistic UI, batch image processing, and cinematic page transitions.

**Key Deliverables**:
- **Agentic Chat with Persistent History**: Full in-workspace chat sidebar backed by persistent message history. Mutually exclusive tools/messages sidebars with smooth mount animations and improved sidebar UX. (`a083d12`, `d804b1b`, `c67f2c3`)
- **tRPC API Migration**: Complete migration from ts-rest to tRPC for fully inferred, type-safe client-server contracts. Typed `requestFullState` input using `Parameters<T>` for precise tRPC inference. Intermediate ts-rest contracts with Zod validation also shipped before the final tRPC migration. (`641d910`, `3ebb37a`, `94e8068`, `2667e45`, `dfef978`)
- **LangChain Provider Integration**: Migrated the model provider layer to LangChain `BaseChatModel` with `bindTools()` via `RunnableBinding`. Bidirectional `BaseMessage ↔ Google Content` conversion with `SystemMessage → systemInstruction` hoisting, consecutive `ToolMessage` merging (Vertex AI constraint), and tool call ID round-trip fidelity. (`dfe444d`)
- **Optimistic Placeholder Nodes**: Entities now appear instantly on the canvas via pending placeholder nodes, confirmed or replaced when the server echoes back the `pendingId`. Includes `createPendingNode()`, `promotePendingNode()`, and 68 new tests. (`9c43aad`)
- **Batch Image Processing with Order Preservation**: Explicit `BATCH`, `PARALLEL`, and `SEQUENTIAL` execution modes for character and location image generation tools, with `entityIndexMap` sorting to guarantee output order matches input order. (`720ddb4`, `5b235bc`, `8902e96`)
- **Entity Creation from Image Import**: Dropped images now create character/location entities directly. Bulk staging panel supports entity type classification and batch DB creation. (`1d9ca73`, `8d18fc5`)
- **CREATE_SCENE_WITH_ENTITIES Job Handler**: Finalized hybrid search using type-safe Drizzle Query Builder for vector and FTS operations, with strict ordering on entity retrieval and parallel image/attribute generation. (`eee1b3f`, `9ebf19a`)
- **Cinematic Page Transitions**: Animated cinematic transitions for project and world navigation actions in the workspace root. (`efe900e`)
- **Database & Type Fixes**: `worldId` null→undefined conversion in props table and Zod mappers; `notNull()` constraint added to `projectId`. (`a6d46c7`, `7539642`)
- **Centralized Test Mocks**: 6 new mock files for GCS, Pub/Sub, StorageManager, FrameComposer, QualityAgent, and AssetManager, exported from `shared/mocks/*`. (`1f6f206`)

---

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



