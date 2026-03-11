(This was prompt was generated from the node-based-ui-requirements-prompt, after a long question  between Andres and Claude Sonnet 4.6 Extended. The result is this fully self-contained specification for refactoring of the application's frontend and backend to support a node-based canvas workflow. The prompt is designed to implement every section completely in a single pass. No external clarification is needed. Every architectural decision, schema definition, component contract, store topology, service interface, and interaction behavior is specified below. The prompt is saved here to be used as a reference for future prompt development. )

# CineNode — Node-Based UI Refactor: One-Shot Implementation Prompt

> **Purpose:** This is a fully self-contained specification. Implement every section completely in a single pass. No external clarification is needed. Every architectural decision, schema definition, component contract, store topology, service interface, and interaction behavior is specified below.

---

## TABLE OF CONTENTS

1. [Project Overview & Scope](#1-project-overview--scope)
2. [Tech Stack](#2-tech-stack)
3. [Directory Structure](#3-directory-structure)
4. [Routing Architecture](#4-routing-architecture)
5. [Node Types & Data Model](#5-node-types--data-model)
6. [Database Schema Changes](#6-database-schema-changes)
7. [Zustand Store Topology](#7-zustand-store-topology)
8. [Domain Services Layer](#8-domain-services-layer)
9. [Canvas Layout Architecture](#9-canvas-layout-architecture)
10. [Top Asset Panel](#10-top-asset-panel)
11. [Left Sidebar](#11-left-sidebar)
12. [Right Sidebar — Node Inspection Panel](#12-right-sidebar--node-inspection-panel)
13. [Top Toolbar](#13-top-toolbar)
14. [Pipeline Integration & PubSub Event Mapping](#14-pipeline-integration--pubsub-event-mapping)
15. [Parallel Execution](#15-parallel-execution)
16. [World Builder Canvas](#16-world-builder-canvas)
17. [Project Builder Canvas](#17-project-builder-canvas)
18. [Scene-as-Code (SAC) Ledger System](#18-scene-as-code-sac-ledger-system)
19. [RBAC Enforcement](#19-rbac-enforcement)
20. [Composite Node](#20-composite-node)
21. [Auto-Layout & Sequence Modes](#21-auto-layout--sequence-modes)
22. [Undo / Redo](#22-undo--redo)
23. [Persistence Strategy](#23-persistence-strategy)
24. [Legacy Migration](#24-legacy-migration)
25. [New Job Type: GENERATE_COMPOSITE](#25-new-job-type-generate_composite)
26. [New API Endpoints](#26-new-api-endpoints)
27. [Complete Implementation Checklist](#27-complete-implementation-checklist)

---

## 1. Project Overview & Scope

### What is being built

The application is refactored from a static project dashboard to a **node-based canvas workflow** using React Flow (`@xyflow/react`). Two new canvas routes are created:

| Route | Component | Purpose |
|---|---|---|
| `/world/:worldId` | `WorldBuilderCanvas` | Define world assets — characters, locations, lore, style references — and commit Scene-as-Code (.sac) ledgers to a versioned git repository |
| `/project/:projectId` | `ProjectBuilderCanvas` | Consume world assets, build storyboard on canvas, run the generative pipeline, produce video |

### What is deprecated

The existing **Project Dashboard** static UI is deprecated as the primary interface. It is **retained as a mobile-only fallback** (`viewport < 768px`). Do not delete it. Conditionally render it based on viewport width inside `/project/:projectId`, or provide a `/project/:projectId/classic` alias.

### What does NOT change

- All existing LangGraph pipeline nodes and job types (except the addition of `GENERATE_COMPOSITE`)
- All existing Pub/Sub event types (no new events required — existing per-entity events are sufficient)
- All existing shared TypeScript types in `shared/types/` (extend only, never break)
- All existing DB tables: `projects`, `scenes`, `characters`, `locations`, `worlds`, `jobs`
- The `StartPipelineCommand` and pipeline execution flow
- The existing project creation modal (title + prompt + optional audio track)

### Key architectural principle

**The canvas IS the pipeline configuration.** The project creation modal creates the project and opens the canvas. The user populates the canvas and selects assets. The toolbar Run button starts the pipeline using canvas state as context. There is no separate configuration step.

---

## 2. Tech Stack

### Frontend
- **Framework:** Vite + React (TypeScript)
- **Node Canvas:** `@xyflow/react` v12+
- **State:** Zustand with:
  - `zundo` — temporal undo/redo middleware
  - `zustand/middleware/subscribeWithSelector` — for subscription-based side effects
- **Local persistence:** Dexie.js (IndexedDB)
- **Styling:** Tailwind CSS (existing)

### Backend
- **Runtime:** Node.js + Express
- **Pipeline:** LangGraph JS/TS
- **Database:** PostgreSQL via Drizzle ORM
- **Realtime:** Google Pub/Sub
- **Storage:** Google Cloud Storage

---

## 3. Directory Structure

Create the following new directories and files. Do not reorganize existing directories.

```
src/
├── domain/
│   └── canvas/
│       ├── NodeFactory.ts            ← Single factory for ALL node creation
│       ├── CoordinateSystem.ts       ← screenToWorld viewport transform
│       ├── AutoLayout.ts             ← Row-based auto-layout heuristic
│       ├── LegacyMigration.ts        ← StoryboardAttributes → React Flow DAG
│       └── PubSubCanvasAdapter.ts    ← Maps PubSub events → NodeFactory calls
├── store/
│   ├── useNodeStore.ts               ← React Flow nodes[], edges[], viewport
│   ├── useEntityStore.ts             ← characters{}, locations{}, scenes{} by id
│   ├── usePipelineStore.ts           ← status, jobIds, interrupts, event log
│   ├── useCanvasUIStore.ts           ← selectedNodeId, panelTab, layoutMode
│   ├── useWorldStore.ts              ← worldId, role, licenseType, sac state
│   └── middleware/
│       └── indexedDBStorage.ts       ← Dexie connector + debounced persist
├── components/
│   └── canvas/
│       ├── WorldBuilderCanvas.tsx
│       ├── ProjectBuilderCanvas.tsx
│       ├── nodes/
│       │   ├── SceneNode.tsx
│       │   ├── CharacterNode.tsx
│       │   ├── LocationNode.tsx
│       │   ├── ImageNode.tsx         ← polymorphic via nodeTypeFlag
│       │   ├── CompositeNode.tsx
│       │   ├── AudioNode.tsx
│       │   ├── MetadataNode.tsx
│       │   └── RenderNode.tsx
│       ├── panels/
│       │   ├── TopAssetPanel.tsx
│       │   ├── LeftSidebar.tsx
│       │   └── RightSidebar.tsx
│       ├── toolbar/
│       │   └── CanvasToolbar.tsx
│       └── inspection/
│           ├── SceneInspector.tsx
│           ├── CharacterInspector.tsx
│           ├── LocationInspector.tsx
│           ├── ImageInspector.tsx
│           └── CompositeInspector.tsx

# Backend additions
src/
├── services/
│   └── sac/
│       ├── ISacGitService.ts         ← Abstract interface
│       └── SacGitServiceStub.ts      ← No-op stub, real provider added later
├── routes/
│   └── canvas.ts                     ← Canvas layout REST endpoints
```

---

## 4. Routing Architecture

```tsx
// App.tsx
<Route path="/world/:worldId"           element={<WorldBuilderCanvas />} />
<Route path="/project/:projectId"       element={<ProjectBuilderCanvas />} />
<Route path="/project/:projectId/classic" element={<ProjectDashboard />} />
```

### Project canvas load sequence (`/project/:projectId`)
1. Fetch project entity + scenes + characters + locations from backend
2. Query `canvas_node_layouts` WHERE `id_context = projectId`
3. If zero rows → run `LegacyMigration.generateLayout(project)` → write results to `canvas_node_layouts`
4. Hydrate `useEntityStore` with fetched entities
5. Hydrate `useNodeStore` with layout rows mapped to React Flow nodes/edges
6. Restore viewport from `localStorage` key `viewport_${projectId}`
7. Check `world_access_grants` for current user's role if project has a `worldId`
8. Initialize `PubSubCanvasAdapter` for this `projectId`

### World canvas load sequence (`/world/:worldId`)
1. Fetch world entity + characters + locations from backend
2. Query `world_access_grants` for current user → set `useWorldStore` role + licenseType
3. Query `canvas_node_layouts` WHERE `id_context = worldId`
4. If zero rows → run `LegacyMigration.generateLayout()` with world entities
5. Hydrate stores — same pattern as project
6. If new world (no entities) → spawn single `metadata` node at `(0, 0)`

---

## 5. Node Types & Data Model

### CanvasNodeType registry

```typescript
// src/domain/canvas/NodeTypes.ts

export type CanvasNodeType =
  | 'scene'       // video + start/end frames + cinematography
  | 'character'   // portrait + traits + state
  | 'location'    // image + attributes + weather/mood
  | 'image'       // polymorphic — see ImageNodeFlag
  | 'composite'   // multi-input image merge with prompt + mask
  | 'audio'       // track or segment reference
  | 'metadata'    // project/world root node
  | 'render';     // final video assembly output node

// image node is polymorphic — same component, different behavior per flag
export type ImageNodeFlag =
  | 'style_reference'    // mood board / visual style guide
  | 'import'             // user-imported image
  | 'composite_output'   // output slot from a composite node
  | 'lore';              // world-building text/image (influences generation)

export type EdgeType =
  | 'scene_sequence'      // Scene → Scene (temporal order)
  | 'character_in_scene'  // Character → Scene
  | 'location_in_scene'   // Location → Scene
  | 'style_applied'       // Image(style_ref) → Scene | Character | Location
  | 'audio_sync'          // Audio → Scene
  | 'composite_input'     // Any → Composite
  | 'composite_output'    // Composite → Scene | Composite
  | 'lore_context';       // Image(lore) → Character | Location | Scene
```

### React Flow node data shape

**Critical rule:** Node `data` NEVER embeds entity attribute objects (CharacterAttributes, SceneAttributes, etc.). Node components always read entity data from `useEntityStore.getState()[type][entityId]`. This keeps `useNodeStore` lean and avoids duplication.

```typescript
interface CanvasNodeData {
  entityId: string;               // FK to char/scene/loc/etc in useEntityStore
  contextId: string;              // projectId or worldId
  contextType: 'project' | 'world';
  nodeTypeFlag?: ImageNodeFlag;   // only for 'image' nodes
  scope: 'world' | 'project';    // origin scope of the entity
  isLocked: boolean;              // true = world-scoped + user has no edit rights
  pipelineSelected: boolean;      // included in pipeline context when Run fires
  collapsed: boolean;
  idxVersion: number;             // OCC version from canvas_node_layouts
}

// Full node type (extends React Flow Node)
interface CanvasNode extends Node {
  type: CanvasNodeType;
  data: CanvasNodeData;
}
```

### Edge visual styling

```typescript
const EDGE_STYLES: Record<EdgeType, React.CSSProperties> = {
  scene_sequence:     { stroke: '#6366f1', strokeWidth: 2 },
  character_in_scene: { stroke: '#f59e0b', strokeWidth: 1.5, strokeDasharray: '4 2' },
  location_in_scene:  { stroke: '#10b981', strokeWidth: 1.5, strokeDasharray: '4 2' },
  style_applied:      { stroke: '#8b5cf6', strokeWidth: 1,   strokeDasharray: '2 4' },
  audio_sync:         { stroke: '#06b6d4', strokeWidth: 1.5 },
  composite_input:    { stroke: '#f97316', strokeWidth: 1.5 },
  composite_output:   { stroke: '#f97316', strokeWidth: 2 },
  lore_context:       { stroke: '#94a3b8', strokeWidth: 1,   strokeDasharray: '6 3' },
};
```

---

## 6. Database Schema Changes

### New table: `canvas_node_layouts`

```typescript
// shared/db/schema.ts — add this table

export const canvasNodeLayouts = pgTable('canvas_node_layouts', {
  idLayout:       uuid('id_layout').primaryKey().defaultRandom(),
  idContext:      uuid('id_context').notNull(),       // projectId OR worldId
  contextType:    text('context_type').notNull(),     // 'project' | 'world'
  idEntity:       uuid('id_entity').notNull(),        // entityId this node represents
  nodeType:       text('node_type').notNull(),        // CanvasNodeType value
  valPosX:        real('val_pos_x').notNull(),
  valPosY:        real('val_pos_y').notNull(),
  valWidth:       real('val_width'),
  valHeight:      real('val_height'),
  jsonUiMetadata: jsonb('json_ui_metadata').default({}),
  // jsonUiMetadata shape: {
  //   nodeTypeFlag?: ImageNodeFlag,
  //   pipelineSelected: boolean,
  //   collapsed: boolean
  // }
  idxVersion:     integer('idx_version').default(1),
  tsUpdated:      timestamp('ts_updated', { withTimezone: true }).defaultNow(),
}, (t) => ({
  constraintUniqueContextEntity: unique('unq_context_entity').on(t.idContext, t.idEntity),
}));
```

**Intentionally omitted from schema (reasons below):**
- `idParent` — React Flow manages parent-child in memory via `node.parentId`; not a persistence concern
- `valZIndex` — React Flow manages z-index internally via selection state
- `idScene` — replaced by the more general `idContext` + `contextType` pattern

### Data Access Layer: `canvasLayoutService.ts`

Implement OCC-guarded transactional batch upsert exactly as specified below. This is the only write path to `canvas_node_layouts`.

```typescript
// src/services/canvasLayoutService.ts
export interface LayoutNodeInput {
  idContextTarget: string;
  contextTypeTarget: 'project' | 'world';
  idEntityTarget: string;
  nodeTypeTarget: string;
  valPosXTarget: number;
  valPosYTarget: number;
  valWidthTarget?: number;
  valHeightTarget?: number;
  jsonUiMetadataTarget?: Record<string, unknown>;
  idxVersionCurrent: number;
}

export async function upsertBatchCanvasLayouts(
  listNodes: LayoutNodeInput[]
): Promise<void> {
  if (!listNodes.length) return;

  await db.transaction(async (tx) => {
    for (const node of listNodes) {
      const result = await tx
        .insert(canvasNodeLayouts)
        .values({
          idContext:       node.idContextTarget,
          contextType:     node.contextTypeTarget,
          idEntity:        node.idEntityTarget,
          nodeType:        node.nodeTypeTarget,
          valPosX:         node.valPosXTarget,
          valPosY:         node.valPosYTarget,
          valWidth:        node.valWidthTarget,
          valHeight:       node.valHeightTarget,
          jsonUiMetadata:  node.jsonUiMetadataTarget ?? {},
          idxVersion:      node.idxVersionCurrent + 1,
        })
        .onConflictDoUpdate({
          target: [canvasNodeLayouts.idContext, canvasNodeLayouts.idEntity],
          set: {
            valPosX:        sql`EXCLUDED.val_pos_x`,
            valPosY:        sql`EXCLUDED.val_pos_y`,
            valWidth:       sql`EXCLUDED.val_width`,
            valHeight:      sql`EXCLUDED.val_height`,
            jsonUiMetadata: sql`EXCLUDED.json_ui_metadata`,
            nodeType:       sql`EXCLUDED.node_type`,
            idxVersion:     sql`EXCLUDED.idx_version`,
            tsUpdated:      sql`NOW()`,
          },
          where: eq(canvasNodeLayouts.idxVersion, node.idxVersionCurrent),
        })
        .returning({ id: canvasNodeLayouts.idLayout });

      if (result.length === 0) {
        throw new Error(`OCC conflict for entity: ${node.idEntityTarget}`);
      }
    }
  });
}
```

### Modified table: `worlds`

Add columns via Drizzle migration:

```typescript
sacRepoId:  text('sac_repo_id'),
sacRepoUrl: text('sac_repo_url'),
```

### Modified table: `projects`

Add columns via Drizzle migration:

```typescript
sacForkRepoId:  text('sac_fork_repo_id'),
sacForkRepoUrl: text('sac_fork_repo_url'),
```

### New table: `world_access_grants`

```typescript
export const worldAccessGrants = pgTable('world_access_grants', {
  id:          uuid('id').primaryKey().defaultRandom(),
  worldId:     uuid('world_id').notNull().references(() => worlds.id),
  userId:      uuid('user_id').notNull(),
  role:        text('role').notNull(),
  // role values: 'owner' | 'editor' | 'collaborator' | 'viewer' | 'licensed_creator'
  licenseType: text('license_type'),
  // licenseType is a slug referencing a license definition in the .sac base ledger
  createdAt:   timestamp('created_at').defaultNow(),
}, (t) => ({
  uniqueWorldUser: unique('unq_world_user').on(t.worldId, t.userId),
}));
```

Generate and run Drizzle migration after all schema changes.

---

## 7. Zustand Store Topology

### Store 1: `useNodeStore`

Owns React Flow graph state. Wrapped with `zundo` temporal middleware for undo/redo. Uses `subscribeWithSelector` for debounced persistence subscription.

```typescript
// src/store/useNodeStore.ts
import { create } from 'zustand';
import { temporal } from 'zundo';
import { subscribeWithSelector } from 'zustand/middleware';

interface NodeStore {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: Viewport;

  addNode: (node: CanvasNode) => void;
  updateNodePosition: (id: string, pos: { x: number; y: number }, version: number) => void;
  updateNodeData: (id: string, patch: Partial<CanvasNodeData>) => void;
  deleteNode: (id: string) => void;
  addEdge: (edge: CanvasEdge) => void;
  deleteEdge: (id: string) => void;
  setNodes: (nodes: CanvasNode[]) => void;
  setEdges: (edges: CanvasEdge[]) => void;
  setViewport: (viewport: Viewport) => void;
  applyAutoLayout: () => void;
}

export const useNodeStore = create<NodeStore>()(
  subscribeWithSelector(
    temporal(
      (set, get) => ({
        // ... implementations
      }),
      {
        // Only track nodes and edges — NOT viewport
        partialize: (state) => ({ nodes: state.nodes, edges: state.edges }),
        limit: 50,
      }
    )
  )
);

// Debounced subscription → IndexedDB + Postgres
// Fires 1500ms after last change, NOT on every pixel of movement
useNodeStore.subscribe(
  (state) => state.nodes,
  (nodes) => { debouncedPersistLayout(nodes); },
  { fireImmediately: false }
);
```

**Undo/redo history tracks:**
- Node position moves — `updateNodePosition` batched, committed on drag-end only
- Node additions — both user-created and agent-spawned
- Node deletions
- Edge creation and deletion
- Entity attribute edits (mirrored from `useEntityStore`)

**NOT tracked:**
- Viewport changes (zoom/pan)
- Pipeline trigger
- Asset generation status/thumbnail updates

---

### Store 2: `useEntityStore`

Source of truth for all domain entity attribute data.

```typescript
interface EntityStore {
  characters: Record<string, Character>;
  locations:  Record<string, Location>;
  scenes:     Record<string, Scene>;

  addCharacter:    (c: Character) => void;
  updateCharacter: (id: string, patch: Partial<CharacterAttributes>) => void;
  addLocation:     (l: Location) => void;
  updateLocation:  (id: string, patch: Partial<LocationAttributes>) => void;
  addScene:        (s: Scene) => void;
  updateScene:     (id: string, patch: Partial<SceneAttributes & { status: AssetStatus; progressMessage: string }>) => void;
  hydrate:         (data: { characters: Character[]; locations: Location[]; scenes: Scene[] }) => void;
}
```

---

### Store 3: `usePipelineStore`

```typescript
interface PipelineStore {
  status: PipelineStatus;
  activeJobIds: Record<string, string>;    // jobType → jobId
  interruptState: InterruptValue | null;
  eventLog: PipelineMessage[];
  currentSceneIndex: number;

  setStatus:       (s: PipelineStatus) => void;
  pushEvent:       (e: PipelineMessage) => void;
  setInterrupt:    (v: InterruptValue | null) => void;
  resolveInterrupt:(action: ResolveInterventionCommand['payload']) => Promise<void>;
}
```

---

### Store 4: `useCanvasUIStore`

```typescript
interface CanvasUIStore {
  selectedNodeId:       string | null;
  propertiesPanelTab:   'prompt' | 'camera' | 'gen' | 'traits' | 'attributes' | 'composite';
  topPanelOpenSections: Set<string>;  // section keys: 'characters' | 'locations' | 'audio' | 'style' | 'props' | 'lore'
  layoutMode:           'timeline' | 'freeform';
  snapToGrid:           boolean;
  sequenceMode:         'canvas' | 'explicit';
  // canvas mode: sceneIndex derived from left→right x-position
  // explicit mode: user drag-reorders scenes in left sidebar list

  selectNode:           (id: string | null) => void;
  setPanelTab:          (tab: CanvasUIStore['propertiesPanelTab']) => void;
  toggleTopSection:     (section: string) => void;
  setLayoutMode:        (mode: 'timeline' | 'freeform') => void;
  setSnapToGrid:        (v: boolean) => void;
  setSequenceMode:      (mode: 'canvas' | 'explicit') => void;
}
```

---

### Store 5: `useWorldStore`

```typescript
interface WorldStore {
  worldId:        string | null;
  accessRole:     'owner' | 'editor' | 'collaborator' | 'viewer' | 'licensed_creator' | null;
  licenseType:    string | null;        // slug → resolves to license def in .sac ledger
  sacRepoId:      string | null;
  sacCommitHistory: SacCommit[];
  pendingChanges: boolean;             // dirty since last commit

  setWorld:       (w: World, role: string, licenseType: string | null) => void;
  markDirty:      () => void;
  markClean:      () => void;
  setSacHistory:  (commits: SacCommit[]) => void;
}
```

---

### IndexedDB Storage

```typescript
// src/store/middleware/indexedDBStorage.ts
import Dexie from 'dexie';

class CanvasLayoutDB extends Dexie {
  layouts!: Dexie.Table<{ contextId: string; nodes: CanvasNode[] }, string>;
  viewport!: Dexie.Table<{ contextId: string; viewport: Viewport }, string>;

  constructor() {
    super('CineNodeCanvas');
    this.version(1).stores({
      layouts:  'contextId',
      viewport: 'contextId',
    });
  }
}

export const canvasLayoutDB = new CanvasLayoutDB();
```

**Persistence flow (RAM → IndexedDB → Postgres):**
1. During drag: position updates only in RAM (`useNodeStore` state, no writes)
2. On drag-end: `updateNodePosition()` called → enters undo history
3. Subscription fires after 1500ms debounce → writes to IndexedDB (fast, local)
4. Same debounce flush → calls `upsertBatchCanvasLayouts()` (Postgres, OCC-guarded)
5. Viewport (zoom/pan): stored in `localStorage` key `viewport_${contextId}` only — never Postgres

---

## 8. Domain Services Layer

### 8.1 NodeFactory

**This is the single mandatory entry point for all node creation in the entire application.** User drag, agent PubSub event, legacy migration, and programmatic creation all call `NodeFactory.createNode()`. No node objects are constructed inline in React components.

```typescript
// src/domain/canvas/NodeFactory.ts
import { v7 as uuidv7 } from 'uuid';

export const NodeFactory = {

  createNode: (params: {
    type: CanvasNodeType;
    entityId: string;
    contextId: string;
    contextType: 'project' | 'world';
    posCanvas: { x: number; y: number };
    scope: 'world' | 'project';
    nodeTypeFlag?: ImageNodeFlag;
    pipelineSelected?: boolean;
    isLocked?: boolean;
    width?: number;
    height?: number;
  }): CanvasNode => ({
    id:       params.entityId,   // node.id === entityId for O(1) lookup
    type:     params.type,
    position: params.posCanvas,
    width:    params.width,
    height:   params.height,
    data: {
      entityId:        params.entityId,
      contextId:       params.contextId,
      contextType:     params.contextType,
      nodeTypeFlag:    params.nodeTypeFlag,
      scope:           params.scope,
      isLocked:        params.isLocked ?? false,
      pipelineSelected:params.pipelineSelected ?? true,
      collapsed:       false,
      idxVersion:      1,
    },
  }),

  createEdge: (params: {
    sourceId: string;
    targetId: string;
    type: EdgeType;
    animated?: boolean;
  }): CanvasEdge => ({
    id:       `${params.sourceId}__${params.type}__${params.targetId}`,
    source:   params.sourceId,
    target:   params.targetId,
    type:     params.type,
    animated: params.animated ?? false,
    style:    EDGE_STYLES[params.type],
  }),
};
```

---

### 8.2 CoordinateSystem

**Must be called on every drag/drop event.** Not calling it causes the "teleporting node" bug (spawning at `event.clientX` without accounting for zoom/pan offset).

```typescript
// src/domain/canvas/CoordinateSystem.ts

export interface ViewportTransform {
  x: number;
  y: number;
  zoom: number;
}

export const screenToWorld = (
  screenX: number,
  screenY: number,
  transform: ViewportTransform
): { x: number; y: number } => ({
  x: (screenX - transform.x) / transform.zoom,
  y: (screenY - transform.y) / transform.zoom,
});
```

Usage in drag-drop handler:

```typescript
const onDrop = (event: DragEvent) => {
  const { viewport } = useNodeStore.getState();
  const worldPos = screenToWorld(event.clientX, event.clientY, viewport);
  const node = NodeFactory.createNode({ ..., posCanvas: worldPos });
  useNodeStore.getState().addNode(node);
};
```

---

### 8.3 AutoLayout

```typescript
// src/domain/canvas/AutoLayout.ts

// Fixed row Y positions per node type
const ROW_Y: Record<CanvasNodeType, number> = {
  metadata:  0,
  audio:     0,       // same row as metadata, offset right
  character: 200,
  location:  400,
  image:     400,     // style refs, lore, imports in location row zone
  composite: 600,
  scene:     800,
  render:    800,     // same row as scene, appended after last scene
};

const H_GAP = 260;   // horizontal gap between nodes of same row
const NODE_W = 200;

export function computeAutoLayout(
  nodes: CanvasNode[],
  entities: ReturnType<typeof useEntityStore.getState>
): CanvasNode[] {
  const sorted = [...nodes];

  // 1. Metadata node → (0, 0)
  // 2. Audio node → (H_GAP, 0)
  // 3. Scene nodes → sorted by sceneIndex from entities.scenes
  //    x = sceneIndex * H_GAP, y = ROW_Y.scene
  // 4. Character nodes → sorted by index of first scene they appear in
  //    x = firstSceneIndex * H_GAP, y = ROW_Y.character
  // 5. Location nodes → sorted by first scene reference, same x logic
  // 6. Image nodes → evenly spaced in image row
  // 7. Composite nodes → placed between input zone and target scene
  // 8. Render node → x = (lastSceneIndex + 1) * H_GAP, y = ROW_Y.render

  return sorted.map(node => ({ ...node, position: computedPositions[node.id] }));
}
```

**Auto-layout triggers:**
1. Snap-to-grid toggle in toolbar → calls `useNodeStore.getState().applyAutoLayout()`
2. After agent storyboard wave completes — auto-runs once after `WORKFLOW_STARTED` + initial entity creation events settle

---

### 8.4 PubSubCanvasAdapter

Maps incoming Pub/Sub pipeline events to store updates. **Never directly constructs node objects** — always delegates to `NodeFactory`.

```typescript
// src/domain/canvas/PubSubCanvasAdapter.ts

export function initPubSubCanvasAdapter(projectId: string) {
  const pubSub = getPubSubClient(projectId);

  // WORKFLOW_STARTED — hydrate entities, spawn metadata node
  pubSub.on('WORKFLOW_STARTED', (event: WorkflowStartedEvent) => {
    useEntityStore.getState().hydrate(event.payload.project);
    const metaNode = NodeFactory.createNode({
      type: 'metadata', entityId: event.payload.project.id,
      contextId: projectId, contextType: 'project',
      posCanvas: { x: 0, y: 0 }, scope: 'project',
    });
    useNodeStore.getState().addNode(metaNode);
    usePipelineStore.getState().setStatus('analyzing');
  });

  // SCENE_STARTED — set scene node to generating/animated state
  pubSub.on('SCENE_STARTED', (event: SceneStartedEvent) => {
    useEntityStore.getState().updateScene(event.payload.scene.id, {
      status: 'generating', progressMessage: 'Generating...',
    });
    // Animate edge from metadata to this scene node
    useNodeStore.getState().addEdge(
      NodeFactory.createEdge({
        sourceId: projectId, targetId: event.payload.scene.id,
        type: 'scene_sequence', animated: true,
      })
    );
  });

  // SCENE_UPDATE — update scene entity data in entity store
  pubSub.on('SCENE_UPDATE', (event: SceneUpdateEvent) => {
    event.payload.updates.forEach(update => {
      useEntityStore.getState().updateScene(update.id, update);
    });
  });

  // NEW_ASSETS_BATCH — update asset registry, spawn nodes for new entities
  pubSub.on('NEW_ASSETS_BATCH', (event: NewAssetsBatchEvent) => {
    event.payload.forEach(({ entityId, assetKey, history }) => {
      // Update asset in entity store (find entity by id across chars/locs/scenes)
      // If this is the first image asset for a char/loc → spawn node via NodeFactory
      // Position via AutoLayout heuristic for the entity type
      const existing = useNodeStore.getState().nodes.find(n => n.id === entityId);
      if (!existing) {
        const entityType = getEntityType(entityId); // checks chars/locs/scenes
        const pos = AutoLayout.computeSpawnPosition(entityType, entityId);
        const node = NodeFactory.createNode({
          type: entityType, entityId,
          contextId: projectId, contextType: 'project',
          posCanvas: pos, scope: 'project',
        });
        useNodeStore.getState().addNode(node);
      }
    });
  });

  // LLM_INTERVENTION_NEEDED — isolate failed node, others continue
  pubSub.on('LLM_INTERVENTION_NEEDED', (event: LlmInterventionNeededEvent) => {
    const affectedSceneId = event.payload.params?.sceneId;
    if (affectedSceneId) {
      useEntityStore.getState().updateScene(affectedSceneId, {
        status: 'error', progressMessage: event.payload.error,
      });
      // Auto-select the affected node to open right sidebar
      useCanvasUIStore.getState().selectNode(affectedSceneId);
    }
    usePipelineStore.getState().setInterrupt(event.payload as InterruptValue);
    // Other in-flight parallel jobs continue — do NOT set global status to error
  });

  // WORKFLOW_COMPLETED — mark all nodes complete, unlock render node
  pubSub.on('WORKFLOW_COMPLETED', () => {
    usePipelineStore.getState().setStatus('complete');
    // Set all scene nodes to complete
    const { scenes } = useEntityStore.getState();
    Object.keys(scenes).forEach(id =>
      useEntityStore.getState().updateScene(id, { status: 'complete' })
    );
  });

  // WORKFLOW_FAILED — set pipeline to error
  pubSub.on('WORKFLOW_FAILED', (event: WorkflowFailedEvent) => {
    usePipelineStore.getState().setStatus('error');
    usePipelineStore.getState().pushEvent({
      id: uuidv7(), type: 'error',
      message: event.payload.error, timestamp: new Date(),
    });
  });

  // LOG — push to pipeline event log
  pubSub.on('LOG', (event: LogEvent) => {
    usePipelineStore.getState().pushEvent({
      id: uuidv7(), type: event.payload.level,
      message: event.payload.message, timestamp: new Date(),
      sceneId: event.payload.sceneId,
    });
  });
}
```

---

### 8.5 LegacyMigration

```typescript
// src/domain/canvas/LegacyMigration.ts

export function generateLayoutFromProject(
  project: Project,
  contextId: string,
  contextType: 'project' | 'world'
): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const nodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];

  // 1. Metadata node at (0, 0)
  nodes.push(NodeFactory.createNode({
    type: 'metadata', entityId: project.id,
    contextId, contextType, posCanvas: { x: 0, y: 0 }, scope: contextType,
  }));

  // 2. Character nodes
  project.characters.forEach((char, i) => {
    nodes.push(NodeFactory.createNode({
      type: 'character', entityId: char.id,
      contextId, contextType, posCanvas: { x: i * 260, y: 200 }, scope: contextType,
    }));
  });

  // 3. Location nodes
  project.locations.forEach((loc, i) => {
    nodes.push(NodeFactory.createNode({
      type: 'location', entityId: loc.id,
      contextId, contextType, posCanvas: { x: i * 260, y: 400 }, scope: contextType,
    }));
  });

  // 4. Scene nodes + sequence edges
  const sortedScenes = [...project.scenes].sort((a, b) => a.sceneIndex - b.sceneIndex);
  sortedScenes.forEach((scene, i) => {
    nodes.push(NodeFactory.createNode({
      type: 'scene', entityId: scene.id,
      contextId, contextType, posCanvas: { x: i * 260, y: 800 }, scope: contextType,
    }));

    // Scene → Scene sequence edges
    if (i > 0) {
      edges.push(NodeFactory.createEdge({
        sourceId: sortedScenes[i - 1].id,
        targetId: scene.id,
        type: 'scene_sequence',
      }));
    }

    // Character → Scene edges
    scene.characterIds.forEach(charId => {
      edges.push(NodeFactory.createEdge({
        sourceId: charId, targetId: scene.id, type: 'character_in_scene',
      }));
    });

    // Location → Scene edge
    if (scene.locationId) {
      edges.push(NodeFactory.createEdge({
        sourceId: scene.locationId, targetId: scene.id, type: 'location_in_scene',
      }));
    }
  });

  // 5. Render node (after last scene)
  const lastScene = sortedScenes[sortedScenes.length - 1];
  if (lastScene) {
    nodes.push(NodeFactory.createNode({
      type: 'render', entityId: `render_${contextId}`,
      contextId, contextType, posCanvas: { x: sortedScenes.length * 260, y: 800 }, scope: contextType,
    }));
  }

  // 6. Apply auto-layout to finalize positions
  const positioned = computeAutoLayout(nodes, useEntityStore.getState());
  return { nodes: positioned, edges };
}
```

This function is **purely additive** — no existing DB data is modified. Write results to `canvas_node_layouts` via `upsertBatchCanvasLayouts()` on first load.

---

### 8.6 ISacGitService

```typescript
// src/services/sac/ISacGitService.ts

export interface SacCommit {
  sha: string;
  message: string;
  timestamp: string;
  author: string;
}

export interface SacLedger {
  version: string;                        // semver e.g. '1.0.0'
  worldMetadata: {
    title: string;
    logline: string;
    style: string;
    mood: string;
    colorPalette: string[];
    tags: string[];
  };
  creatorInfo: {
    ownerId: string;
    ownerName: string;
    teamId: string;
  };
  licenseDefinitions: SacLicenseDefinition[];
  characterLedgers: string[];             // referenceIds of character ledger files
  locationLedgers: string[];              // referenceIds of location ledger files
  propLedgers: string[];                  // referenceIds of prop ledger files
  generationRules: string[];
}

export interface SacLicenseDefinition {
  slug: string;                           // e.g. 'read-only', 'derivative', 'full-collab'
  allowUpstreamPR: boolean;
  allowedPREntityTypes: ('character' | 'location' | 'prop')[] | null; // null = all allowed
  allowSublicense: boolean;
  attributionRequired: boolean;
  royaltyNote?: string;                   // metadata only, not app-enforced
  entityRestrictions: string[];           // referenceIds of off-limits entities
}

export interface ISacGitService {
  createRepo(worldId: string): Promise<{ repoId: string; repoUrl: string }>;
  forkRepo(worldId: string, projectId: string): Promise<{ forkRepoId: string; forkRepoUrl: string }>;
  commitLedger(repoId: string, sacContent: SacLedger, message: string): Promise<SacCommit>;
  createPR(fromRepoId: string, toRepoId: string, changes: Partial<SacLedger>): Promise<{ prId: string; prUrl: string }>;
  listCommits(repoId: string): Promise<SacCommit[]>;
  getCommit(repoId: string, sha: string): Promise<SacLedger>;
  mergePR(prId: string): Promise<void>;
  archiveRepo(repoId: string): Promise<void>;
}
```

### SacGitServiceStub

Provide a complete stub implementation with `console.log` traces and mock return values. Wire it via a factory function `getSacGitService(): ISacGitService` so the real provider can be swapped without changing call sites.

---

## 9. Canvas Layout Architecture

### Overall layout structure

```
┌─────────────────────────────────────────────────────────────────────┐
│ TOP TOOLBAR (fixed, ~48px)                                           │
├─────────────────────────────────────────────────────────────────────┤
│ TOP ASSET PANEL (collapsible drawer, expands downward)               │
├──────────────┬──────────────────────────────────┬───────────────────┤
│ LEFT SIDEBAR │   REACT FLOW CANVAS               │ RIGHT SIDEBAR     │
│ (~280px)     │   (fills remaining space)         │ (~320px, hidden   │
│              │                                   │  when no node     │
│              │                                   │  selected)        │
└──────────────┴──────────────────────────────────┴───────────────────┘
```

### React Flow configuration

```tsx
<ReactFlow
  nodes={nodes}
  edges={edges}
  nodeTypes={nodeTypes}   // registered node components
  snapToGrid={snapToGrid}
  snapGrid={[20, 20]}
  onNodeDragStop={handleDragStop}   // commits position to store + triggers debounced persist
  onConnect={handleConnect}         // creates edges via NodeFactory.createEdge()
  onDrop={handleDrop}               // calls screenToWorld() then NodeFactory.createNode()
  onNodeClick={handleNodeClick}     // updates useCanvasUIStore.selectedNodeId
  onPaneClick={() => useCanvasUIStore.getState().selectNode(null)}
  fitView
>
  <MiniMap />
  <Background variant="dots" gap={20} />
</ReactFlow>
```

---

## 10. Top Asset Panel

### Layout behavior

Fixed strip at top of canvas area. Always shows section header tabs. Clicking a section header expands that section downward (accordion behavior). Multiple sections can be open simultaneously. Collapsed by default on load — expands when user interacts.

### Sections

| Section key | Content |
|---|---|
| `characters` | Character asset tiles |
| `locations` | Location asset tiles |
| `audio` | Audio track tiles |
| `style` | Style reference image tiles |
| `props` | Prop / set piece tiles |
| `lore` | Lore text/image tiles |

### Asset tile anatomy

Each tile shows:
- Thumbnail image (portrait for chars, image for locs, waveform icon for audio)
- Name + reference ID (e.g. `CHAR-1`, `LOC-2`)
- Generation status badge (`pending` / `generating` / `complete` / `error`)
- **Pipeline-selected indicator:** glowing border/ring when `pipelineSelected === true`
- Asset type icon

### Tile interactions

- **Drag onto canvas:** Creates a standalone node at drop position via `NodeFactory.createNode()` + `screenToWorld()`. Node is NOT automatically connected to any other nodes.
- **Click pipeline toggle (checkbox/radio on tile):** Sets `pipelineSelected` on the corresponding canvas node if it exists. If no canvas node exists yet, marks the asset as pre-selected so the first time a node is created for it, `pipelineSelected` defaults to `true`.
- **`+` button per section:** Creates a new blank entity in the DB → adds tile to panel AND spawns node on canvas at a vacant position.

### Panel ↔ Canvas sync

Both the top panel tile and any canvas node for the same entity read from `useEntityStore`. They are the same data — no sync needed. The tile shows `pipelineSelected` from `useNodeStore.nodes.find(n => n.id === entityId)?.data.pipelineSelected`.

### On-canvas = pipeline-discoverable

Any asset that has a canvas node is automatically discoverable by the pipeline. `pipelineSelected` flag controls whether it is included in the `StartPipelineCommand` payload. Assets in the top panel with no canvas node are NOT included in the pipeline context.

---

## 11. Left Sidebar

Fixed ~280px width. Always visible. Contains three collapsible sections.

### Section 1: Initial Prompt

- Displays the `metadata.initialPrompt` from the project/world
- Read-only after project creation
- Audio track player (if audio was provided) — shows waveform, playback controls

### Section 2: World / Project Metadata

- Linked world name + SAC version + license type (if project has a worldId)
- `metadata.enhancedPrompt` (read-only, generated by pipeline)
- Generation rules list — editable inline list, each rule is a string
  - Add/remove rules directly
  - Changes persist to project's `generationRules` in DB

### Section 3: Scene Sequence

**Sequence mode toggle** (above scene list):
- **Canvas mode:** Scene order derived from left→right x-position of scene nodes on canvas. `sceneIndex` is computed dynamically as `sortedByX.indexOf(scene)`. Sidebar list reorders automatically as user drags scene nodes on canvas.
- **Explicit mode:** User drag-reorders scenes in this sidebar list. `sceneIndex` is explicitly set by list order, independent of canvas position. Scene nodes on canvas show their assigned number.

Scene list items:
- Scene number badge
- Scene name / description truncated
- Status badge
- Click → pans canvas and selects that scene node

### Section 4: Export / Render Controls

- `Export` button → triggers `RENDER_VIDEO` job (only enabled when `pipelineStatus === 'complete'`)
- Download final video link (when render complete)

### Section 5: Interrupt / Intervention Panel

- Visible only when `usePipelineStore.interruptState !== null`
- Shows the intervention reason, affected node name, attempt count
- Action buttons: **Retry with correction** (text input for revised params), **Skip**, **Abort**
- Dispatches `ResolveInterventionCommand` to backend

---

## 12. Right Sidebar — Node Inspection Panel

**Hidden by default.** Opens when a node is selected (`useCanvasUIStore.selectedNodeId !== null`). Closes on `Escape` key when focused, or when user clicks canvas pane (deselects node).

Width: ~320px, slides in from right.

### Scene node inspection tabs

| Tab | Content |
|---|---|
| **Prompt** | Base prompt (editable textarea), Negative prompt, **Enhance Prompt** button |
| **Camera** | Shot type, camera angle, camera movement, transition type, composition fields — all from `CinematographyTypes` |
| **Gen** | Generation status, progress message, version history picker (AssetHistory), **Regenerate** button, **Regenerate Frames** button |

### Character node inspection

| Tab | Content |
|---|---|
| **Traits** | PhysicalTraits fields (hair, clothing, accessories, build, ethnicity, age, gender), CharacterState fields |
| **Gen** | Portrait version history, **Regenerate** button |

### Location node inspection

| Tab | Content |
|---|---|
| **Attributes** | LocationAttributes fields (type, mood, timeOfDay, weather, colorPalette, architecture, etc.), LocationState fields |
| **Gen** | Location image version history, **Regenerate** button |

### Image node inspection (polymorphic)

Shows `nodeTypeFlag` label at top. Fields depend on flag:
- `style_reference`: style strength slider, style tags list, reference images
- `import`: image preview, filename, prompt field
- `composite_output`: read-only preview, source composite node link
- `lore`: rich text content area, connected entities list

### Composite node inspection

See [Section 20](#20-composite-node) for full detail.

### When no node is selected

Right sidebar is hidden entirely. No placeholder content.

### RBAC-aware rendering

If `node.data.isLocked === true`:
- All fields render as read-only (`disabled`, `cursor-not-allowed`)
- Tooltip on each field: "This entity is from the base world ledger. Your license does not permit modifications."
- **If licenseType allows upstream PRs:** Show "Propose Change (PR)" button at panel bottom
- **If licenseType is read-only:** No action button shown

---

## 13. Top Toolbar

Minimal. Contains only controls listed below. No other elements.

```
[ Title (editable inline) ]   [ Commit Ledger ]   [ ↩ Undo ][ ↪ Redo ]   [ ⚙ Settings ]   [ ▶ Run ] or [ ■ Stop ]
                                                              [ 🔲 Snap to Grid ]
```

### Controls

| Control | Behavior |
|---|---|
| **Title** | Inline editable text. Updates `project.metadata.title` or `world.name` on blur. Debounced save. |
| **Commit Ledger** | Opens commit message dialog → calls `ISacGitService.commitLedger()`. Only enabled when `useWorldStore.pendingChanges === true` or on project canvas when SAC fork repo exists. |
| **Undo / Redo** | Calls `useNodeStore.temporal.undo()` / `.redo()`. Disabled when history stack is empty. |
| **Snap to Grid** | Toggles `useCanvasUIStore.snapToGrid`. When enabled, also triggers `applyAutoLayout()` once to snap all nodes to grid. |
| **Settings** | Opens settings panel: guidance level slider, generation rules, negative prompt defaults. |
| **Run** | Visible when `pipelineStatus` is `ready` or `complete`. Sends `StartPipelineCommand` with canvas-derived context payload. |
| **Stop** | Visible when `pipelineStatus` is `analyzing`, `generating`, or `evaluating`. Sends `StopPipelineCommand`. |
| **Resume** | Visible when `pipelineStatus` is `paused`. Sends `ResumePipelineCommand`. |

**Only one of Run / Stop / Resume is visible at a time.**

### StartPipelineCommand payload from canvas

When user clicks Run, construct payload from current canvas state:

```typescript
const buildPipelinePayload = (projectId: string): StartPipelineCommand['payload'] => {
  const { nodes } = useNodeStore.getState();
  const { scenes, characters, locations } = useEntityStore.getState();
  const { worldId, sacRepoId } = useWorldStore.getState();
  const project = getProject(projectId);

  // Include all nodes where pipelineSelected === true
  const selectedNodes = nodes.filter(n => n.data.pipelineSelected);

  return {
    initialPrompt:        project.metadata.initialPrompt,
    title:                project.metadata.title,
    audioGcsUri:          project.metadata.audioGcsUri,
    audioPublicUri:       project.metadata.audioPublicUri,
    worldId:              worldId ?? undefined,
    teamId:               project.teamId,
    userId:               getCurrentUserId(),
    guidanceLevel:        project.guidanceLevel,
    // Node-level prompt overrides from properties panel
    // (stored as per-scene enhanced prompts in scene entities)
    // Canvas-selected entity IDs provide agent context
    selectedCharacterIds: selectedNodes.filter(n => n.type === 'character').map(n => n.id),
    selectedLocationIds:  selectedNodes.filter(n => n.type === 'location').map(n => n.id),
    selectedSceneIds:     selectedNodes.filter(n => n.type === 'scene').map(n => n.id),
    styleReferenceUrls:   getStyleReferenceUrls(selectedNodes),
    loreContent:          getLoreContent(selectedNodes),
  };
};
```

---

## 14. Pipeline Integration & PubSub Event Mapping

### Complete event → canvas action mapping

| PubSub Event | Canvas Action |
|---|---|
| `WORKFLOW_STARTED` | Hydrate entity store; spawn metadata node; set pipeline status to `analyzing` |
| `SCENE_STARTED` | Update scene entity status to `generating`; set scene→metadata edge `animated: true` |
| `SCENE_UPDATE` | Update scene entity in `useEntityStore` (description, status, progressMessage) |
| `NEW_ASSETS_BATCH` | Update asset registry in entity; spawn node if entity has no node yet; update thumbnail display |
| `SCENE_SKIPPED` | Set scene node status to `complete` with skip reason in progressMessage |
| `LLM_INTERVENTION_NEEDED` | Set affected node to `error` state; auto-select it; set `interruptState`; other parallel jobs continue |
| `INTERVENTION_RESOLVED` | Clear `interruptState`; reset affected node to `generating` if retry |
| `WORKFLOW_COMPLETED` | Set all nodes to `complete`; set pipeline status to `complete`; unlock render node |
| `WORKFLOW_FAILED` | Set pipeline status to `error`; push error to event log |
| `FULL_STATE` | Full re-hydration of entity store from project snapshot |
| `LOG` | Push to `usePipelineStore.eventLog` |

---

## 15. Parallel Execution

### What runs in parallel

The LangGraph backend dispatches these jobs concurrently:
- **Character asset generation:** All characters generated simultaneously (one `GENERATE_CHARACTER_ASSETS` job per character, all dispatched at once)
- **Location asset generation:** All locations generated simultaneously
- **Scene frame generation:** Multiple scenes generate start/end frames concurrently

Scene video generation remains sequential by `sceneIndex`.

### Canvas visualization of parallelism

Multiple nodes animate simultaneously. Each node independently shows its own generation status. When 3 character nodes are generating at once, all 3 show their pulsing/animated border simultaneously. There is no special "parallel group" UI element — parallelism is visible from the simultaneous node animations.

### Node status visual states

Implement these CSS states on all generative node types (scene, character, location):

```typescript
const NODE_STATUS_STYLES: Record<AssetStatus, string> = {
  pending:    'border-gray-600',
  generating: 'border-blue-400 animate-pulse shadow-blue-400/50 shadow-lg',
  evaluating: 'border-yellow-400 animate-pulse',
  complete:   'border-green-500',
  error:      'border-red-500 shadow-red-500/50 shadow-md',
};
```

### Intervention isolation

When `LLM_INTERVENTION_NEEDED` fires for one node:
- **Only that node** switches to `error` state
- **All other in-flight parallel jobs continue running** — do NOT pause them
- `usePipelineStore.interruptState` is set (left sidebar shows intervention panel)
- User resolves the intervention **after** other jobs complete (non-blocking)
- Pipeline status remains `generating` (not `paused`) as long as other jobs are running

### Pipeline status during parallel execution

Left sidebar shows overall pipeline status only: `Analyzing` / `Generating` / `Complete` / `Error`. Per-node status is visible on the canvas nodes themselves. No "X of Y complete" counter is required.

---

## 16. World Builder Canvas

### Access

World canvas is accessed from a world's detail page. No creation modal. New world opens empty canvas with a single `metadata` node at `(0, 0)`. Loading an existing world hydrates from `canvas_node_layouts` and entity stores.

### What World Builder canvas contains

All node types except `scene` video nodes and `render` nodes. World Builder does not produce video. It produces:
- Character definitions + portrait images
- Location definitions + location images
- Style reference images
- Lore text/image nodes
- Audio nodes (world soundscapes, set piece music)
- Prop / item nodes
- The `.sac` base ledger (committed via Commit Ledger button)

### World asset scope on canvas

All entities created in World Builder are `scope: 'world'`. They are stored in the `characters`, `locations` tables with `worldId` set (not `projectId`).

### SAC commit flow from World Builder

1. User modifies world entities on canvas (creates/edits characters, locations, etc.)
2. `useWorldStore.pendingChanges` becomes `true` after any entity modification
3. User clicks **Commit Ledger** in toolbar
4. Commit message dialog opens
5. Backend assembles `SacLedger` from current world state:
   - World metadata from `worlds` table
   - `characterLedgers`: array of character referenceIds
   - `locationLedgers`: array of location referenceIds
   - `propLedgers`: array of prop referenceIds
   - `licenseDefinitions`: from world's license configuration
   - `creatorInfo`: owner team/user info
6. Calls `ISacGitService.commitLedger(world.sacRepoId, ledger, message)`
7. Stores returned `SacCommit` sha in `useWorldStore.sacCommitHistory`
8. `pendingChanges` → `false`

---

## 17. Project Builder Canvas

### Project creation flow

1. User opens "New Project" modal: enters **title**, **initial prompt**, optional **audio track**
2. Modal creates project in DB (no scenes/chars/locs yet)
3. Modal closes → navigate to `/project/:projectId`
4. Canvas opens empty (or with world assets if project has a `worldId`)
5. **Title** visible in top toolbar (editable)
6. **Initial prompt** visible in left sidebar (read-only after creation)
7. **Audio track** playable in left sidebar with waveform + controls

### World assets in Project Builder

When project has a `worldId`:
- World characters + locations are available in top panel under their sections
- They can be dragged onto canvas → creates nodes with `scope: 'world'`
- World-scoped nodes have `isLocked` determined by the user's `world_access_grants` role
- **Editing model:** All edits on Project Builder canvas are **project-local by default** for all roles. Edits are stored as project-scoped overrides, NOT written back to the world entity.
- **Promotion:** If user has `owner` or `editor` role, a "Save to World" button appears in the right sidebar for world-scoped nodes. Clicking it writes the edited attributes back to the world entity.
- World-scoped nodes show a `WORLD` badge on the node header

### Running the pipeline

User populates canvas (drags assets, creates nodes, adjusts properties). Click **Run** in toolbar. Pipeline receives:
- All `pipelineSelected === true` nodes as context
- Initial prompt from left sidebar
- Audio GCS URI if provided
- World ledger reference (worldId + SAC sha if world is linked)
- Node-level prompt overrides from properties panel

### SAC fork for projects

When a project is created from a licensed world:
1. Backend calls `ISacGitService.forkRepo(worldId, projectId)`
2. Returns `forkRepoId` + `forkRepoUrl` → stored on project entity
3. The base world ledger is mounted as a git submodule (immutable reference) inside the fork
4. Project additions (new chars/locs created in project scope) live in project fork only
5. If license permits upstream PRs: "Propose Change (PR)" button in right sidebar on world-scoped nodes → calls `ISacGitService.createPR()`

---

## 18. Scene-as-Code (SAC) Ledger System

### Repository structure

- **One git repo per World.** The world repo contains the base ledger.
- **Project ledgers are full git forks** of the world repo.
- The base world ledger is mounted as a **git submodule** inside each project fork (read-only, immutable reference at fork-time commit sha).

### .sac file format

A `.sac` file is a JSON file committed to the git repo. Contents:

```json
{
  "version": "1.0.0",
  "worldMetadata": {
    "title": "string",
    "logline": "string",
    "style": "string",
    "mood": "string",
    "colorPalette": ["string"],
    "tags": ["string"]
  },
  "creatorInfo": {
    "ownerId": "uuid",
    "ownerName": "string",
    "teamId": "uuid"
  },
  "licenseDefinitions": [
    {
      "slug": "read-only",
      "allowUpstreamPR": false,
      "allowedPREntityTypes": null,
      "allowSublicense": false,
      "attributionRequired": true,
      "entityRestrictions": []
    }
  ],
  "characterLedgers": ["char_1", "char_2"],
  "locationLedgers": ["loc_1"],
  "propLedgers": [],
  "generationRules": ["string"]
}
```

**Note:** The `.sac` file contains **references** (referenceIds) to character/location/prop ledgers — not the full attribute objects. Each entity has its own separate ledger file in the repo (e.g. `characters/char_1.json`). This keeps diffs granular per entity.

### License tier enforcement

Three license tiers defined by `SacLicenseDefinition.slug`:

| Tier | `allowUpstreamPR` | `allowedPREntityTypes` | Description |
|---|---|---|---|
| `read-only` | `false` | n/a | Fork allowed, no PRs back to base |
| `derivative` | `true` | `['character', 'location', 'prop']` | New entities only via PR, no edits to existing base entities |
| `full-collab` | `true` | `null` (all) | Full PR access, owner reviews and approves |

`world_access_grants.licenseType` stores the slug. The slug resolves to the full definition via the `.sac` base ledger. Backend enforces PR creation eligibility by checking `licenseType` before calling `ISacGitService.createPR()`.

### Commit trigger

**Only explicit user action.** The Commit Ledger button in the toolbar is the sole trigger. No auto-commits on save, no auto-commits on pipeline completion.

---

## 19. RBAC Enforcement

### Role capabilities matrix

| Role | Edit world entities | License others | Approve PRs | Create project fork | Create project-local entities |
|---|---|---|---|---|---|
| `owner` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `editor` | ✅ | ❌ | ❌ | ✅ | ✅ |
| `collaborator` | Add new only | ❌ | ❌ | ✅ | ✅ |
| `viewer` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `licensed_creator` | ❌ | ❌ | ❌ | ✅ (per license) | ✅ |

### Canvas enforcement

`isLocked` on a node is `true` when:
- `node.data.scope === 'world'`
- AND current user role is `viewer` or `licensed_creator` (or `collaborator` for existing entities)

### Locked node UX

1. **Node header:** No lock icon overlay. Node appears normally but with a `WORLD` scope badge.
2. **Properties panel:** All input fields render as `disabled` (read-only). Each field has a tooltip: *"This entity belongs to the base world ledger. Your license does not permit modifications."*
3. **Attempted edit toast:** If user somehow triggers an edit action (keyboard shortcut, etc.), show toast: *"Your license does not permit modifying this entity."*
4. **Connectivity:** Locked nodes CAN be connected to other nodes via edges. Only attribute editing is restricted.
5. **PR button:** If `useWorldStore.licenseType` resolves to `allowUpstreamPR === true`, show **"Propose Change (PR)"** button at the bottom of the right sidebar for locked nodes. Hidden entirely for `read-only` license.

### Backend enforcement

Every entity update API endpoint checks `world_access_grants` before applying changes. Frontend enforcement is UX-only — backend is the authoritative gate.

---

## 20. Composite Node

### Purpose

General-purpose image merge node. Accepts any combination of images, style references, prompts, and masks. Produces 1–4 output images. Fully chainable — output can feed into another Composite node, a Scene node, or a Style Reference node.

### Inputs (handles on left side of node)

| Handle type | Accepts | Edge type used |
|---|---|---|
| Image inputs | Character image, Location image, Start/End frame, any imported image | `composite_input` |
| Style reference | Image nodes with `nodeTypeFlag: 'style_reference'` | `composite_input` |
| Prompt | Text (entered in properties panel, not a separate node handle) | n/a |
| Scene frames | Scene node (pulls start/end frames) | `composite_input` |
| Mask | Image node (defines region-based compositing) | `composite_input` |

### Outputs (handles on right side of node)

- 1–4 image output handles (count set in properties panel)
- Each output creates an `ImageNode` with `nodeTypeFlag: 'composite_output'` when the job completes
- Output can connect to: Scene node (as start/end frame), another Composite node, Style Reference slot

### Properties panel for Composite node

| Control | Description |
|---|---|
| Connected inputs list | Thumbnails of all connected input nodes with per-input **weight slider** (0.0–1.0) and **blend mode** dropdown (normal, overlay, multiply, screen, soft-light) |
| Prompt field | Text instruction for the composite generation |
| Negative prompt field | What to avoid in the output |
| Number of outputs | Stepper: 1–4 |
| Output preview | Generated image(s) with version history picker |
| Generate button | Manually triggers `GENERATE_COMPOSITE` job for this node |

### Trigger

**Manual only.** Composite nodes are NEVER auto-triggered by the pipeline run. User clicks the **Generate** button on the node or in the properties panel.

### Node visual anatomy

```
┌─────────────────────────────┐
│ ◈ COMPOSITE            [⚙] │  ← node header
├─────────────────────────────┤
│  [img] [img] [img]          │  ← input thumbnails
│  ────────────────           │
│  [      OUTPUT      ]       │  ← output preview (placeholder until generated)
│                             │
│  [     GENERATE     ]       │  ← generate button
│  Outputs: 2  ●●○○           │  ← output count indicator
└─────────────────────────────┘
```

---

## 21. Auto-Layout & Sequence Modes

### Auto-layout heuristic (row-based)

```
Y=0:   Metadata node, Audio node
Y=200: Character nodes (sorted by first scene appearance, L→R)
Y=400: Location nodes (sorted by first scene reference, L→R)
Y=400: Image nodes (style refs, lore, imports — evenly spaced)
Y=600: Composite nodes (between inputs and target scene x-range)
Y=800: Scene nodes (sorted by sceneIndex, L→R, x = sceneIndex * 260)
Y=800: Render node (appended after last scene node)
```

Auto-layout is triggered by the **Snap to Grid** toggle in the toolbar. When toggled on, auto-layout runs once to snap existing nodes. After that, snap-to-grid constrains new node placements to the nearest 20px grid intersection.

### Sequence modes

**Canvas mode** (default):
- `sceneIndex` is computed dynamically from left→right x-position of scene nodes
- `sceneIndex = sortedSceneNodesByX.indexOf(thisNode)`
- Scene sidebar list reorders automatically as user drags scene nodes
- No explicit numbering needed

**Explicit mode:**
- User drag-reorders scenes in the left sidebar list
- `sceneIndex` is explicitly set by list position, stored in `useEntityStore.scenes[id].sceneIndex`
- Scene nodes on canvas show their assigned number badge
- Canvas position does NOT affect ordering in this mode

**Toggle:** Button above scene list in left sidebar. Persisted to `useCanvasUIStore.sequenceMode`.

### Layout mode (timeline vs freeform)

**Timeline mode:**
- Scene nodes constrained to `y = 800` row (fixed Y)
- X is free (determines order in canvas mode, or just visual placement in explicit mode)

**Freeform mode:**
- Nodes can be placed anywhere on canvas
- Auto-layout button still available but not automatically applied

Toggle in toolbar alongside snap-to-grid control.

---

## 22. Undo / Redo

Implemented via `zundo` temporal middleware on `useNodeStore`. Only `nodes` and `edges` are tracked in history — not `viewport`.

### History stack contents

| Action | Tracked? |
|---|---|
| Node position move (drag-end) | ✅ |
| User-created node addition | ✅ |
| Agent-spawned node addition | ✅ |
| Node deletion | ✅ |
| Edge creation | ✅ |
| Edge deletion | ✅ |
| Entity attribute edits | ✅ (mirrored) |
| Pipeline trigger | ❌ |
| Asset generation status updates | ❌ |
| Viewport changes (zoom/pan) | ❌ |

### Keyboard shortcuts

- `Cmd/Ctrl + Z` → `useNodeStore.temporal.undo()`
- `Cmd/Ctrl + Shift + Z` → `useNodeStore.temporal.redo()`
- Also wired to Undo/Redo buttons in toolbar

### zundo configuration

```typescript
temporal(storeCreator, {
  partialize: (state) => ({ nodes: state.nodes, edges: state.edges }),
  limit: 50,
  equality: (a, b) => JSON.stringify(a) === JSON.stringify(b), // skip no-op updates
})
```

---

## 23. Persistence Strategy

### Persistence layers

| Data | Storage | When written |
|---|---|---|
| Node positions | RAM → IndexedDB → Postgres | RAM: during drag. IndexedDB + Postgres: 1500ms after drag-end |
| Node graph topology (edges) | Postgres (`canvas_node_layouts`) | On edge create/delete |
| Entity attribute data | Postgres (existing tables) | On blur/change in inspection panel, debounced 800ms |
| Viewport (zoom/pan) | `localStorage` only | On viewport change |
| Pipeline status | RAM only | From PubSub, ephemeral |
| SAC ledger | Git repo | On explicit Commit Ledger action only |

### Concurrency control

Postgres writes use OCC via `idxVersion`. On conflict (version mismatch), throw error → client receives stale version signal → re-fetch latest layout for that entity. Do not silently ignore conflicts.

### IndexedDB schema

```typescript
// Dexie tables
layouts:   { contextId: string, nodes: CanvasNode[] }   // keyed by contextId
```

On load: check IndexedDB first. If found, use as initial state while Postgres fetch completes. Merge Postgres result (authoritative) over IndexedDB cache if versions differ.

---

## 24. Legacy Migration

### Trigger

On first canvas load for any project/world that has entity data but zero `canvas_node_layouts` rows.

### Algorithm

See `LegacyMigration.generateLayoutFromProject()` in Section 8.5. Key points:
- Purely additive — no existing data modified
- Uses `NodeFactory.createNode()` and `NodeFactory.createEdge()`
- Runs auto-layout to compute positions
- Writes results to `canvas_node_layouts` via `upsertBatchCanvasLayouts()`
- After migration, subsequent loads use persisted positions

### Data integrity guarantee

All existing `StoryboardAttributes` (characters, locations, scenes arrays with all their attributes) must be representable as a valid DAG. No data loss. Every entity gets a node. Every `characterId` in `scene.characterIds` gets a `character_in_scene` edge. Every `scene.locationId` gets a `location_in_scene` edge.

---

## 25. New Job Type: GENERATE_COMPOSITE

Add to `JOB_TYPES` in `shared/types/job.types.ts`:

```typescript
"GENERATE_COMPOSITE"
```

### Job payload type

```typescript
export type JobGenerateComposite = JobBaseFields & {
  type: "GENERATE_COMPOSITE";
  payload: {
    compositeNodeId: string;
    projectId: string;
    inputImages: {
      entityId: string;
      assetKey: AssetKey;
      version: number;
      weight: number;         // 0.0–1.0
      blendMode: string;      // 'normal' | 'overlay' | 'multiply' | 'screen' | 'soft-light'
      isMask: boolean;
    }[];
    prompt: string;
    negativePrompt?: string;
    numberOfOutputs: number;   // 1–4
  };
  result: {
    outputImages: {
      data: string;            // GCS URI
      version: number;
    }[];
  };
};
```

### GCS storage

Add `composite_image` to `GcsObjectType` in `shared/types/assets.types.ts`:

```typescript
z.literal('composite_image')
```

Add `CompositeImageParam` to `GcsObjectPathParams` in `storage.types.ts`:

```typescript
type CompositeImageParam = ObjectPathParam<"composite_image"> & {
  projectId: string;
  compositeNodeId: string;
  version: number;
};
```

### AssetKey

Add `composite_image` to `AssetKey` union in `assets.types.ts`.

### Backend worker

Create `generateCompositeWorker.ts` alongside existing worker files. The worker:
1. Receives `GENERATE_COMPOSITE` job from queue
2. Downloads input images from GCS
3. Calls image generation model with reference images + prompt
4. Uploads output images to GCS at `composite_image` path
5. Calls `SaveAssetsCallback` for each output image
6. Emits `NEW_ASSETS_BATCH` PubSub event with `compositeNodeId` as `entityId`

### Pipeline.types additions

Add to `PipelineCommand`:

```typescript
export type GenerateCompositeCommand = PubSubMessage<
  "GENERATE_COMPOSITE",
  {
    compositeNodeId: string;
    inputImages: JobGenerateComposite['payload']['inputImages'];
    prompt: string;
    negativePrompt?: string;
    numberOfOutputs: number;
  }
>;
```

---

## 26. New API Endpoints

### Canvas layout endpoints

```typescript
// src/routes/canvas.ts

// GET /api/canvas/:contextType/:contextId
// Returns all canvas_node_layouts rows for a context
// Used on initial canvas load

// PUT /api/canvas/:contextType/:contextId/batch
// Body: LayoutNodeInput[]
// Calls upsertBatchCanvasLayouts()
// Used by debounced persistence subscription

// DELETE /api/canvas/:contextType/:contextId/:entityId
// Deletes a single canvas_node_layout row
// Called when a node is deleted from canvas
```

### World access grant endpoints

```typescript
// GET /api/worlds/:worldId/access
// Returns world_access_grants for current user → { role, licenseType }

// POST /api/worlds/:worldId/access
// Body: { userId, role, licenseType }
// Creates/updates grant — Owner only

// DELETE /api/worlds/:worldId/access/:userId
// Revokes access — Owner only
```

### SAC endpoints

```typescript
// POST /api/worlds/:worldId/sac/repo
// Creates git repo for world via ISacGitService.createRepo()

// POST /api/worlds/:worldId/sac/commit
// Body: { message: string }
// Assembles SacLedger from DB, calls ISacGitService.commitLedger()

// GET /api/worlds/:worldId/sac/commits
// Returns commit history

// POST /api/projects/:projectId/sac/fork
// Forks world repo for project via ISacGitService.forkRepo()

// POST /api/projects/:projectId/sac/pr
// Body: { changes: Partial<SacLedger> }
// Creates upstream PR — checks licenseType permissions first
```

---

## 27. Complete Implementation Checklist

Work through this list in order. Each item must be fully complete before the next.

### Phase 1: Foundation

- [ ] Install dependencies: `@xyflow/react`, `zundo`, `dexie`
- [ ] Create all new directories per Section 3
- [ ] Add `GENERATE_COMPOSITE` to `JOB_TYPES`, `composite_image` to `GcsObjectType` and `AssetKey`
- [ ] Add `SacLedger`, `SacLicenseDefinition`, `SacCommit` types to `shared/types/sac_types.ts`
- [ ] Write Drizzle migration: `canvas_node_layouts`, `world_access_grants`, worlds/projects SAC columns
- [ ] Run migration

### Phase 2: Domain Services

- [ ] Implement `NodeTypes.ts` — all type definitions
- [ ] Implement `CoordinateSystem.ts` — `screenToWorld()`
- [ ] Implement `NodeFactory.ts` — `createNode()` and `createEdge()`
- [ ] Implement `AutoLayout.ts` — `computeAutoLayout()`
- [ ] Implement `LegacyMigration.ts` — `generateLayoutFromProject()`
- [ ] Implement `ISacGitService.ts` interface
- [ ] Implement `SacGitServiceStub.ts` stub
- [ ] Implement `canvasLayoutService.ts` — OCC-guarded `upsertBatchCanvasLayouts()`

### Phase 3: Stores

- [ ] Implement `indexedDBStorage.ts` — Dexie schema + `debouncedPersistLayout()`
- [ ] Implement `useNodeStore.ts` — with `zundo` + `subscribeWithSelector` + persistence subscription
- [ ] Implement `useEntityStore.ts`
- [ ] Implement `usePipelineStore.ts`
- [ ] Implement `useCanvasUIStore.ts`
- [ ] Implement `useWorldStore.ts`

### Phase 4: PubSub Adapter

- [ ] Implement `PubSubCanvasAdapter.ts` — all event handlers per Section 14
- [ ] Wire parallel execution: intervention isolation, multi-node pulse animation

### Phase 5: Node Components

- [ ] `MetadataNode.tsx`
- [ ] `CharacterNode.tsx` — with RBAC lock state, WORLD badge, pipeline-selected indicator
- [ ] `LocationNode.tsx` — same
- [ ] `SceneNode.tsx` — with status ring, progress message, frame thumbnails
- [ ] `ImageNode.tsx` — polymorphic on `nodeTypeFlag`
- [ ] `CompositeNode.tsx` — input handles, weight controls, generate button, output handles
- [ ] `AudioNode.tsx`
- [ ] `RenderNode.tsx` — locked until pipeline complete
- [ ] Register all in `nodeTypes` map for React Flow

### Phase 6: Inspection Panels

- [ ] `SceneInspector.tsx` — Prompt / Camera / Gen tabs
- [ ] `CharacterInspector.tsx` — Traits / Gen tabs
- [ ] `LocationInspector.tsx` — Attributes / Gen tabs
- [ ] `ImageInspector.tsx` — polymorphic on `nodeTypeFlag`
- [ ] `CompositeInspector.tsx` — full composite controls per Section 20
- [ ] RBAC read-only mode + tooltip + PR button across all inspectors

### Phase 7: Panels & Toolbar

- [ ] `TopAssetPanel.tsx` — collapsible sections, drag-to-canvas, pipeline toggle, `+` button
- [ ] `LeftSidebar.tsx` — prompt, audio, metadata, scene sequence (both modes), export, intervention
- [ ] `RightSidebar.tsx` — auto-show/hide on node selection, Escape to close
- [ ] `CanvasToolbar.tsx` — all controls per Section 13, Run/Stop/Resume toggle

### Phase 8: Canvas Routes

- [ ] `WorldBuilderCanvas.tsx` — full load sequence, empty state, SAC commit flow
- [ ] `ProjectBuilderCanvas.tsx` — full load sequence, pipeline trigger, world asset handling
- [ ] Add routes to `App.tsx`
- [ ] Mobile fallback — conditional render of `ProjectDashboard` for `viewport < 768px`

### Phase 9: Backend

- [ ] `canvas.ts` route — all 5 endpoints
- [ ] World access grant endpoints
- [ ] SAC endpoints
- [ ] `generateCompositeWorker.ts`
- [ ] `GenerateCompositeCommand` in `pipeline.types.ts`
- [ ] Wire `SacGitServiceStub` to SAC endpoints via factory

### Phase 10: Legacy Migration

- [ ] On canvas load: check for zero `canvas_node_layouts` rows
- [ ] If zero rows: run `LegacyMigration.generateLayoutFromProject()` → write to DB
- [ ] Verify all existing projects load without data loss

### Phase 11: Verification

- [ ] All node types render correctly with entity data from `useEntityStore`
- [ ] Drag from top panel → node spawns at correct world-space position (no teleporting)
- [ ] Pipeline run → nodes pulse concurrently during parallel asset gen
- [ ] Intervention isolation — one node errors, others continue
- [ ] Undo/redo covers all tracked actions
- [ ] IndexedDB → Postgres persistence flow (drag, wait 1.5s, verify DB write)
- [ ] OCC conflict throws and client re-fetches
- [ ] RBAC: locked nodes connectable, not editable, toast on attempt
- [ ] SAC commit writes correct ledger format to stub
- [ ] Mobile viewport renders classic dashboard
- [ ] Legacy migration: existing project loads with all nodes correctly positioned

---

*End of specification. Implement all sections completely. Do not omit any section. All architectural decisions are final as documented.*