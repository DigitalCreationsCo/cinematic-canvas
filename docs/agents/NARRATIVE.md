# Narrative System

The narrative system is the engine for authoring, storing, and versioning the story-world entities that power Portals cinematic pipelines. It comprises three layers:

1. **Narrative Components** — user-visible canvas nodes for editing characters, locations, props, scenes, and groups.
2. **Relational Storage** — SQLAlchemy models (`Character`, `Location`, `Prop`, `Scene`) scoped to a project folder.
3. **NAP Integration** — the Narrative Addressing Protocol for content-addressable versioned manifests with merge/publish/diff semantics.

```
┌─────────────────────────────────────────────────────┐
│                  Canvas (Frontend)                   │
│  [Character] [Location] [Prop] [Scene] [Group]      │
└──────────┬──────────────────────────────┬───────────┘
           │ HTTP (create/publish/merge)  │ flow exec
           ▼                              ▼
┌──────────────────────┐  ┌──────────────────────────┐
│   NAP API Routes     │  │  Narrative Components    │
│   (/api/v1/nap/)     │  │  (px runtime)            │
│   create │ publish   │  │  CharacterComponent      │
│   merge  │ diff      │  │  LocationComponent       │
│   media/upload       │  │  PropComponent           │
└──────────┬───────────┘  │  SceneComponent          │
           │              │  GroupComponent          │
           ▼              └──────────┬───────────────┘
┌──────────────────────┐            │
│   NapService         │            ▼
│   (threadpool)       │  ┌──────────────────────────┐
├──────────────────────┤  │  Relational DB           │
│   NapRepository      │  │  characters / locations  │
│   (protocol)         │  │  props / scenes          │
│   MockNapRepository  │  │  (with nap_uri +         │
│   ~ nap-sdk (future) │  │   nap_commit_hash cols)  │
└──────────────────────┘  └──────────────────────────┘
```

---

## Table of Contents

- [Base Classes](#base-classes)
  - [BaseStateAwareComponent](#basestateawarecomponent)
  - [BaseEntityReadPatchComponent](#baseentityreadpatchcomponent)
- [Narrative Components](#narrative-components)
  - [CharacterComponent](#charactercomponent)
  - [LocationComponent](#locationcomponent)
  - [PropComponent](#propcomponent)
  - [SceneComponent](#scenecomponent)
  - [GenerateCharacters](#generatecharacters)
  - [GenerateStoryboardComponent](#generatestoryboardcomponent)
  - [ExpandCreativePromptComponent](#expandcreativepromptcomponent)
  - [GetProjectComponent](#getprojectcomponent)
- [Group Component](#group-component)
  - [Piece Resolution Order](#piece-resolution-order)
  - [Image Generation & Persistence](#image-generation--persistence)
  - [Output Shape](#output-shape)
- [Publishing Workflow (NAP)](#publishing-workflow-nap)
  - [Architecture](#architecture)
  - [Entity Lifecycle](#entity-lifecycle)
  - [Frontend Store](#frontend-store)
  - [API Reference](#api-reference)
  - [Conflict Handling](#conflict-handling)
  - [Media Upload](#media-upload)
- [Migration & Dual-Write Strategy](#migration--dual-write-strategy)

---

## Base Classes

All narrative components live in **`src/px/src/px/components/narrative/`** and are registered in that directory's `__init__.py` via the lazy-import pattern (see [COMPONENTS.md](./COMPONENTS.md#placement-rules)).

They share two reusable bases.

### BaseStateAwareComponent

**File:** `src/px/src/px/components/narrative/base_state_aware.py`

An invisible engine that fetches live project state from the database. Components that need to read existing narrative entities during flow execution (storyboard generation, scene expansion) inherit this base.

```python
class BaseStateAwareComponent(CustomComponent):
```

| Method | Returns | Description |
|---|---|---|
| `get_fresh_project_state()` | `Folder` | Fetches the `Folder` record for the currently executing flow via `flow_id → Folder.flows`. Raises `ValueError` if no flow context is found. |
| `get_existing_characters(project_id)` | `list[dict]` | All `Character` rows for the project, serialised via `model_dump(mode="json")`. |
| `get_existing_locations(project_id)` | `list[dict]` | All `Location` rows for the project. |
| `get_existing_props(project_id)` | `list[dict]` | All `Prop` rows for the project. |
| `get_all_existing_entities(project_id)` | `dict[str, list[dict]]` | Convenience — returns `{characters, locations, props}` in one call. |
| `ingest_storyboard_to_database(project_id, payload)` | `None` | Delegates to `ProjectService.ingest_storyboard_payload()` for bulk storyboard materialisation. |

**Usage pattern:**

```python
class MyComponent(BaseStateAwareComponent, LCModelComponent):
    async def build(self, ...):
        project = self.get_fresh_project_state()
        existing = self.get_all_existing_entities(str(project.id))
        # ... enrich prompt with existing entities ...
```

**Known dependency violation:** This class lives in `px` but calls `portals.services.database.models.*` via deferred imports. These are listed in `ARCHITECTURE.md` as accepted violations during the transition.

### BaseEntityReadPatchComponent

**File:** `src/px/src/px/components/narrative/base_entity.py`

A base for single-entity read/patch operations. Subclasses declare `entity_model` (the SQLModel class) and `storyboard_key` (the JSON key in `folder.storyboard`), and get entity selection, dual-write (DB + storyboard JSON), and read-mode for free.

```python
class BaseEntityReadPatchComponent(CustomComponent):
    entity_model: type = None      # e.g., Character, Location, Prop, Scene
    storyboard_key: str = ""       # e.g., "characters", "locations", "props", "scenes"
```

| Method | Returns | Description |
|---|---|---|
| `get_entity_options()` | `list[str]` | Dynamically queries the DB for entity names belonging to the current project. Used to populate a `DropdownInput` of available entities. |
| `_execute_read_patch_logic(name, *, update_database, updated_data)` | `Data` | Core read/patch cycle: (1) resolves the project folder, (2) fetches the named entity, (3) applies patches to both the relational row AND the `folder.storyboard` JSON column, (4) returns the entity payload. |

**Dual-write behaviour when `update_database=True`:**

1. Patches the relational `Character`/`Location`/`Prop`/`Scene` row via `setattr`.
2. Locates the matching entry in `folder.storyboard[storyboard_key]` by `id` and replaces it with `model_dump(mode="json")`.
3. Calls `flag_modified(folder, "storyboard")` so SQLAlchemy detects the JSONB mutation.
4. Commits the transaction (both writes succeed or neither does).

**Usage pattern (CharacterComponent):**

```python
class CharacterComponent(BaseEntityReadPatchComponent):
    entity_model = Character
    storyboard_key = "characters"
    # ... inputs with _SELECTED_ENTITY, _UPDATE_DB, and entity-specific fields ...
```

---

## Narrative Components

All components are registered in `src/px/src/px/components/narrative/__init__.py` with the lazy dynamic-import pattern.

### CharacterComponent

**File:** `src/px/src/px/components/narrative/character.py`
**Inherits:** `BaseEntityReadPatchComponent` (→ `LCModelComponent`)
**`entity_model`:** `Character`
**`storyboard_key`:** `"characters"`
**Icon:** `"user"`

Reads or patches a single character's profile fields — name, physical traits, personality, backstory, voice, and arc — stored in the `characters` relational table.

| Input | Type | Description |
|---|---|---|
| `selected_entity` | `DropdownInput` | Entity name, populated dynamically from the DB |
| `update_database` | `BoolInput` | If true, persists changes to both DB and storyboard JSON |
| `character_name` | `StrInput` | Display name for the character |
| `physical_traits` | `MessageTextInput` | Physical appearance description |
| `personality` | `MessageTextInput` | Personality profile |
| `backstory` | `MessageTextInput` | Narrative backstory |
| `character_voice` | `MessageTextInput` | Dialogue style / voice |
| `character_arc` | `MessageTextInput` | Character development arc |
| `appearance_generated` | `MessageTextInput` | Auto-generated appearance description |
| `guidance_level` | `SliderInput` | LLM guidance level for the character profile |

Outbound edges carry a `Data` object with `model_dump(mode="json")` of the `Character` record.

### LocationComponent

**File:** `src/px/src/px/components/narrative/location.py`
**Inherits:** `BaseEntityReadPatchComponent`
**`entity_model`:** `Location`
**`storyboard_key`:** `"locations"`
**Icon:** `"map-pin"`

Reads or patches a location's attributes — type, mood, architecture, lighting, soundscape, and cultural influence.

| Input | Type | Description |
|---|---|---|
| `selected_entity` | `DropdownInput` | Entity name, populated dynamically |
| `update_database` | `BoolInput` | Persist toggle |
| `location_name` | `StrInput` | Display name |
| `location_type` | `DropdownInput` | e.g. interior, exterior, abstract |
| `mood` | `StrInput` | Emotional tone of the location |
| `architecture` | `StrInput` | Architectural style |
| `color_palette` | `StrInput` | Colour scheme / palette |
| `lighting` | `StrInput` | Lighting description |
| `soundscape` | `StrInput` | Ambient sound |
| `cultural_influence` | `StrInput` | Cultural / historical references |
| `time_period` | `StrInput` | Historical era |
| `guidance_level` | `SliderInput` | LLM guidance level |

### PropComponent

**File:** `src/px/src/px/components/narrative/prop.py`
**Inherits:** `BaseEntityReadPatchComponent`
**`entity_model`:** `Prop`
**`storyboard_key`:** `"props"`
**Icon:** `"package"`

Reads or patches a prop's attributes — type, description, and significance.

| Input | Type | Description |
|---|---|---|
| `selected_entity` | `DropdownInput` | Entity name |
| `update_database` | `BoolInput` | Persist toggle |
| `prop_name` | `StrInput` | Display name |
| `prop_type` | `DropdownInput` | e.g. tool, weapon, document, clothing |
| `guidance_level` | `SliderInput` | LLM guidance level |

### SceneComponent

**File:** `src/px/src/px/components/narrative/scene.py`
**Inherits:** `BaseEntityReadPatchComponent`
**`entity_model`:** `Scene`
**`storyboard_key`:** `"scenes"`
**Icon:** `"clapperboard"`

Reads or patches a scene's cinematic attributes — shot type, camera angle, lighting, composition, dialogue, and action.

| Input | Type | Description |
|---|---|---|
| `selected_entity` | `DropdownInput` | Entity name |
| `update_database` | `BoolInput` | Persist toggle |
| `scene_name` | `StrInput` | Scene name |
| `scene_type` | `DropdownInput` | e.g. intro, dialogue, action, transition |
| `mood` | `StrInput` | Emotional tone |
| `shot_type` | `DropdownInput` | e.g. wide, medium, close-up |
| `camera_angle` | `DropdownInput` | e.g. eye-level, low, high, dutch |
| `camera_movement` | `DropdownInput` | e.g. static, pan, tilt, dolly, handheld |
| `composition` | `StrInput` | Frame composition description |
| `lighting` | `StrInput` | Lighting setup |
| `color_grade` | `StrInput` | Colour grading |
| `sound` | `StrInput` | Diegetic / non-diegetic sound |
| `dialogue` | `MessageTextInput` | Scene dialogue text |
| `action` | `MessageTextInput` | Scene action / blocking |
| `character_refs` | `DictInput` | Character assignments for the scene |
| `narrative_purpose` | `StrInput` | Story purpose |
| `guidance_level` | `SliderInput` | LLM guidance level |

### GenerateCharacters

**File:** `src/px/src/px/components/narrative/generate_characters.py`
**Inherits:** `ToolCallingAgentComponent`
**Icon:** `"MessagesSquare"`

An agentic component that uses a tool-calling LLM to generate character definitions and optionally create associated character agents. Operates on a text prompt describing the desired characters and outputs a structured `DataFrame` with character profiles.

### GenerateStoryboardComponent

**File:** `src/px/src/px/components/narrative/generate_storyboard.py`
**Inherits:** `BaseStateAwareComponent` + `LCModelComponent`
**Icon:** `"clapperboard"`

Multi-pass storyboard generation that builds on existing DB entities:

- **Pass 1:** Generates context (characters, locations, props, metadata). Injects existing DB entities into the prompt so the LLM extends rather than duplicates authored content.
- **Pass 2+:** Generates scenes in batches. Supports audio-guided mode (each audio segment is a scene anchor) and prompt-only mode.
- Uses `StoryboardManager` (copy-modify-write merge) to persist to `folder.storyboard`, and delegates bulk entity creation to `ProjectService.ingest_storyboard_payload()` via `BaseStateAwareComponent.ingest_storyboard_to_database()`.
- Audio analysis: accepts an `audio_file` (FileInput) and uses a multimodal LLM to segment and analyse the audio automatically.

### ExpandCreativePromptComponent

**File:** `src/px/src/px/components/narrative/expand_creative.py`
**Inherits:** `LCModelComponent`
**Icon:** `"sparkles"`

Takes a simple idea and expands it into a detailed creative brief using a selected LLM. Not DB-aware; purely a prompt-expansion utility.

### GetProjectComponent

**File:** `src/px/src/px/components/narrative/get_project_component.py`
**Inherits:** `CustomComponent`
**Icon:** `"folder-search"`

Queries the database to retrieve the active project folder for the current flow. Returns the folder's `Data` payload for downstream use. A thin convenience wrapper around `graph.flow_id → Folder` resolution.

---

## Group Component

**File:** `src/px/src/px/components/narrative/group.py`
**Inherits:** `BaseStateAwareComponent` + `LCModelComponent`
**Icon:** `"box-select"`
**`name`:** `"Group"`

A *group* is a named collection of image and prop *pieces* used to organise reference material — outfits, styles, world-building references, mood boards, etc. Groups are **ephemeral** (reassembled from inputs on each execution); the generated image is what gets persisted.

### Piece Resolution Order

Each piece carries an inherited `description` (the prop's own description or a description supplied with the image). The final description used in the generation prompt resolves as:

```
inline custom_description on the piece
    → piece_overrides[<piece_name>]
        → inherited description (from the piece itself)
```

### Image Generation & Persistence

1. **Assemble:** The component normalises input pieces and resolves each piece's final description.
2. **Build prompt:** A text prompt is composed from the group name, description, and resolved pieces.
3. **Generate:** A multimodal message is built containing the text prompt plus each piece's image as a reference. The image model is invoked (with fallback to text-only if multimodal fails).
4. **Persist (optional):** If `persist_asset=True`, the generated image is saved as a project-scoped asset via `AssetVersionManager` (using the existing `asset_entries` / `asset_versions` / `media_objects` tables — no DB migration required). Persistence is best-effort; failure still returns the image in the payload with `persisted=False`.
5. **Return:** The assembled group payload includes the group name, description, generated image metadata, resolved pieces, and project ID.

### Output Shape

```python
Data(data={
    "name": str,                    # Group name
    "description": str,             # Group description
    "generated_image": {            # Generation result
        "data": str | None,         # Data-URI or storage path
        "url": str | None,          # URL or storage path
        "asset_key": str | None,    # "group:<slugified_name>"
        "persisted": bool,          # Whether asset was persisted
    },
    "pieces": [                     # Resolved pieces (always tracked)
        {
            "type": "image" | "prop",
            "name": str,
            "description": str,     # Final resolved description
            "inherited_description": str,
            "image": str | None,    # Reference image
        },
    ],
    "project_id": str | None,
})
```

---

## Publishing Workflow (NAP)

The Narrative Addressing Protocol (NAP) provides content-addressable versioned storage for narrative manifests, with rich merge semantics, diffs, and publish workflows. The system is split across three layers:

| Layer | Location | Responsibility |
|---|---|---|
| **Repository** | `src/backend/base/portals/services/nap/protocol.py` | `NapRepository` protocol — interface definition |
| **Mock** | `src/backend/base/portals/services/nap/mock_repository.py` | In-memory implementation for dev/testing |
| **Service** | `src/backend/base/portals/services/nap/__init__.py` | `NapService` — async wrapper + global singleton |
| **Routes** | `src/backend/base/portals/api/v1/nap.py` | 5 FastAPI endpoints |
| **Frontend** | `src/frontend/src/controllers/API/queries/nap/` | 5 TanStack Query hooks |
| **Store** | `src/frontend/src/stores/napStore.ts` | Zustand store for merge state |

### Architecture

```
┌─────────────────┐     POST /api/v1/nap/create     ┌─────────────────────┐
│   Frontend      │ ──────────────────────────────▶  │  NapService         │
│   (napStore +   │     POST /api/v1/nap/publish     │  (run_in_threadpool)│
│    query hooks) │ ──────────────────────────────▶  │                     │
│                 │     POST /api/v1/nap/merge       │  ┌───────────────┐  │
│                 │ ──────────────────────────────▶  │  │ NapRepository │  │
│                 │     POST /api/v1/nap/diff        │  │  (protocol)   │  │
│                 │ ──────────────────────────────▶  │  │               │  │
│                 │     POST /api/v1/nap/media/upload│  │ MockNapRepo   │  │
│                 │ ──────────────────────────────▶  │  │ (in-memory)   │  │
└─────────────────┘                                 └──┴───────────────┴──┘

nap_uri format:  nap://{project_id}/{entity_type}/{uuid}
                 e.g. nap://proj-abc/character/uuid-123
```

**Key design decisions:**

- **Sync repo, async service.** `NapRepository` methods are synchronous (and potentially CPU-bound — hashing, Git I/O, structured merge). `NapService` wraps every call in `run_in_threadpool()` to avoid blocking the async event loop.
- **Global singleton.** `NapService` is accessed via `get_nap_service()` (same pattern as `get_db_service()`), not through the `ServiceType` enum.
- **Content-addressed media.** `ingest_media()` stores raw bytes and returns `"sha256:<hex>"`.
- **`/api/assets` static mount.** FastAPI mounts `/api/assets` → `<nap_storage_dir>/.nap-assets/` **before** the SPA catch-all in `setup_static_files()`. Vite dev proxy adds `"/api/assets"` to `API_ROUTES`.

### Entity Lifecycle

```
                     ┌──────────────┐
                     │  Author on   │
                     │   Canvas     │
                     └──────┬───────┘
                            │ initial create
                            ▼
                     ┌──────────────┐
                     │  nap.create  │  POST /api/v1/nap/create
                     │  (commit 1)  │  → returns nap_uri + commit_hash
                     └──────┬───────┘
                            │ iterate in frontend:
                            │   - edit draftData
                            │   - diff against HEAD
                            ▼
                     ┌──────────────┐
                     │  nap.merge   │  POST /api/v1/nap/merge
                     │  (3-way)     │  → returns MergePreview
                     └──────┬───────┘
                            │
                    ┌───────┴───────┐
                    │               │
               no conflicts    conflicts
                    │               │
                    ▼               ▼
             ┌──────────────┐  ┌──────────────┐
             │ nap.publish  │  │  Resolve in  │
             │ (commit 2)   │  │   frontend   │
             └──────────────┘  └──────┬───────┘
                                      │ re-merge
                                      ▼
                               ┌──────────────┐
                               │ nap.publish   │
                               │ (commit 2)    │
                               └──────────────┘
```

### Frontend Store

**File:** `src/frontend/src/stores/napStore.ts`

The Zustand store manages the merge/publish lifecycle:

| State | Type | Description |
|---|---|---|
| `mergePreview` | `MergePreview \| null` | The last merge result (merged manifest + any conflicts) |
| `draftManifest` | `Record<string, any> \| null` | The proposed draft manifest |
| `conflicts` | `Conflict[]` | Unresolved conflicts from the last merge |
| Actions | | |
| `setMergePreview(preview)` | — | Store the merge result |
| `setDraftManifest(manifest)` | — | Update the draft manifest |
| `updateManifestAtPath(path, value)` | — | Dot-path update of a field (used during conflict resolution) |
| `reset()` | — | Clear all NAP state (called on flow change) |

**Undo/redo integration:** The `flowsManagerStore` now snapshots and restores `draftData` alongside `nodes`/`edges` so undo/redo does not lose the draft manifest.

**Dirty node indicator:** When a `GenericNode` has `data.nap_uri` set, a green dot indicator appears on the node to signal it's been published to NAP.

### API Reference

All endpoints are under `/api/v1/nap/`. They use `CurrentActiveUser` dependency for auth and `NapDep` for service injection.

#### POST `/api/v1/nap/create`

Create a new entity and persist its initial manifest.

```json
// Request
{
  "project_id": "proj-abc",
  "entity_type": "character",
  "manifest": { "name": "Ada", "physical_traits": "..." },
  "message": "Initial character creation"
}
// Response 201
{
  "nap_uri": "nap://proj-abc/character/uuid-123",
  "commit_hash": "a1b2c3d4..."
}
```

#### POST `/api/v1/nap/publish`

Publish (commit) a resolved manifest.

```json
// Request
{
  "uri": "nap://proj-abc/character/uuid-123",
  "manifest": { "name": "Ada", "physical_traits": "...", "personality": "..." },
  "message": "Updated personality"
}
// Response 200
{
  "commit_hash": "e5f6g7h8..."
}
// Response 409 — stale (HEAD moved since merge preview)
{
  "detail": "HEAD has moved since the merge preview was generated. Re-merge before publishing.",
  "current_head": "a1b2c3d4..."
}
```

#### POST `/api/v1/nap/merge`

Perform a 3-way merge.

```json
// Request
{
  "uri": "nap://proj-abc/character/uuid-123",
  "base_commit": "a1b2c3d4...",
  "current_commit": "e5f6g7h8...",
  "proposed_manifest": { "name": "Ada", "personality": "updated" }
}
// Response 200 — auto-merge succeeded
{
  "merged_manifest": { "name": "Ada", "personality": "updated" },
  "conflicts": []
}
// Response 200 — conflicts need resolution
{
  "merged_manifest": { "name": "Ada", "personality": "conflict_value" },
  "conflicts": [
    {
      "path": "personality",
      "base": "original",
      "current": "someone_else_edit",
      "proposed": "my_edit"
    }
  ]
}
```

**Merge semantics (NAP Merge Spec v2):**

| Rule | Meaning |
|---|---|
| `missing ≠ null` | Omitted keys = "no change"; explicit `null` = "delete this field" |
| Normalisation | SDL-required fields are filled, identity fields are stabilised before comparison |
| Path-union traversal | Only leaf values differing between base↔proposed or base↔current are compared |
| Immutable identity | `uri`, `id`, etc. are never overwritten |

#### POST `/api/v1/nap/diff`

Compute a semantic diff between two manifests. Accepts three operand forms:

```json
// commit → commit
{ "from": { "type": "commit", "commit": "abc123" }, "to": { "type": "commit", "commit": "def456" } }
// commit → inline manifest (publish preview)
{ "from": { "type": "commit", "commit": "abc123" }, "to": { "type": "manifest", "manifest": { ... } } }
// manifest → manifest (agent review)
{ "from": { "type": "manifest", "manifest": { ... } }, "to": { "type": "manifest", "manifest": { ... } } }
// Response 200
{
  "changes": [
    { "path": "personality", "kind": "modified", "before": "old", "after": "new" },
    { "path": "backstory", "kind": "added", "after": "..." },
    { "path": "obsolete_field", "kind": "removed", "before": "..." }
  ]
}
```

#### POST `/api/v1/nap/media/upload`

Store media bytes in the content-addressed asset store.

```json
// Request (multipart/form-data)
file: <binary>
format: "image/png"
// Response 200
{
  "content_hash": "sha256:abc123def456..."
}
```

### Conflict Handling

Conflicts are resolved **on the client side** (no server-side merge session persistence):

1. User edits a published entity → frontend holds `draftData`.
2. User clicks "Publish" → frontend calls `/merge` with `base_commit`, `current_commit` (HEAD), and `draftData`.
3. **No conflicts:** The returned `merged_manifest` is sent to `/publish` immediately.
4. **Conflicts exist:** The frontend surfaces each conflict (showing `base`, `current`, `proposed`). User resolves each via the store's `updateManifestAtPath(path, value)`. User clicks "Publish" again → re-merge (step 2) or directly publish the resolved manifest.
5. **Stale HEAD (409):** HEAD moved between merge preview and publish. The frontend re-fetches the latest `current_commit`, re-merges, and retries.

The `mergePreview` lives in Zustand state only; refreshing the page reconstructs it from `draftData` + latest commit.

### Media Upload

Media files (reference images, audio, etc.) are uploaded via multipart/form-data to `/api/v1/nap/media/upload`. The file is stored in the content-addressed store at `<nap_storage_dir>/.nap-assets/` and the returned `sha256:` hash is referenced within manifests.

The `/api/assets` route serves these files back to the frontend:

- **Production:** FastAPI static mount (`StaticFiles(directory=".../.nap-assets/")`) before the SPA catch-all.
- **Development:** Vite proxy forward to `http://localhost:8000/api/assets/...`.

---

## Migration & Dual-Write Strategy

The narrative system is in a transitional state where both the relational tables (SQL) and NAP (content-addressed commits) coexist.

### Current State (Migration Phase 1)

| Table | Has `nap_uri`? | Has `nap_commit_hash`? |
|---|---|---|
| `characters` | ✅ | ✅ |
| `locations` | ✅ | ✅ |
| `props` | ✅ | ✅ |
| `scenes` | ✅ | ✅ |

Columns are nullable `VARCHAR`; existing rows are `NULL`. When a narrative component creates an entity, it gets a `nap_uri` written to the relational row as a pointer. The NAP manifest is the authoritative narrative state; the SQL tables serve as **temporary bidirectional scaffolding** during the migration.

### Future State (Planned)

- SQL narrative tables are read-only snapshots or removed entirely.
- NAP is the sole source of truth for narrative entity state.
- The `BaseEntityReadPatchComponent` dual-write path is replaced with pure NAP read/patch.
- Frontend components resolve manifests directly from NAP URIs.

### Migration Files

- **Alembic revision:** `src/backend/base/portals/alembic/versions/951a5a3a713b_add_nap_columns_to_narrative_tables.py` — EXPAND phase; adds `nap_uri` + `nap_commit_hash` columns.
- **Settings:** `px/services/settings/base.py` — `nap_storage_dir: str` (default `~/.portals/nap`).
- **Static mount:** `main.py` — `app.mount("/api/assets", StaticFiles(...))` before `setup_static_files()`.
