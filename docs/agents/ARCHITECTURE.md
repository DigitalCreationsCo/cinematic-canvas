# Architecture Boundaries

Portals is three Python packages and one frontend, layered with one-way dependencies. Most "off-narrative" code is a boundary violation. Read this before adding a new file.

## Package dependency graph (one-way only)

```
frontend (TS)  ──HTTP──▶  portals (api routers, integrations, distribution)
                              │
                              ▼ may import
                          portals-base (services, graph, db, alembic)
                              │
                              ▼ may import
                          px (executor core, base primitives, components)
                              │
                              ▼ may import
                          langchain-core, pydantic, third-party SDKs
```

### Dependency rules

- **`px` MUST NOT import `portals.*` or `portals-base.*`.** If px code needs a service (auth, db, flow lookup), define an interface inside `px` and inject the implementation from `portals`. The repo currently has ~13 upward `from portals.*` imports inside `src/px/src/px/components/...` (auth, db, helpers) — these are **known violations**. Do not add more; prefer fixing them.
- **`portals-base` MAY import `px`.** It MUST NOT import vendor-specific component modules from `portals.components.<vendor>`.
- **`frontend` talks to `portals` only via HTTP/WebSocket.** No shared filesystem state.

## "Where does this code go?" decision tree

Walk top-down. Stop at the first match.

1. Is it framework-agnostic flow execution, base component classes, or `Component` primitives?
   → `src/px/src/px/` (`base/` for shared primitives, `components/` for built-ins shipped with px).
2. Is it a FastAPI route, auth, db model, alembic migration, or a lifecycle-managed singleton?
   → `src/backend/base/portals/` (`api/`, `services/X/`, `alembic/versions/`).
3. Is it a vendor integration (OpenAI, Pinecone, Notion, …) — a `Component` subclass that wraps a third-party SDK?
   → `src/px/src/px/components/<category>/` and update its `__init__.py` alphabetically. Never rename the class.
4. Is it UI, state, or icons?
   → `src/frontend/src/`. If it consumes a new API field, also update `src/frontend/src/types/`.
5. Is it CLI behavior for `px run` / `px serve`?
   → `src/px/src/px/cli/`.
6. Is it a SQLAlchemy/SQLModel model change?
   → `services/database/models/` AND `make alembic-revision message="..."` AND apply with `make alembic-upgrade`.
7. Is it a flow JSON schema change?
   → STOP. Existing saved flows must keep loading. Add a version mapping; do not mutate the existing shape. See [CONTRACTS.md](./CONTRACTS.md).
8. Is it shared by both `px` and `portals-base`?
   → `src/px/src/px/base/`, never `portals/base/`.

## Dependency direction — bad/good examples

- **Bad:** `from portals.services.deps import session_scope` inside `src/px/...`.
  **Good:** Define `px.interfaces.SessionProvider`, accept it as a constructor arg; `portals` wires the concrete `session_scope` at startup.
- **Bad:** `from portals.components.openai import ...` inside `portals-base` core (`api/`, `services/`, `graph/`).
  **Good:** Components are loaded dynamically via the component registry; core code references `Component` only.
- **Bad:** A new `MyHelperService` that's just functions.
  **Good:** Utility functions go in `portals/helpers/` or `px/utils/`. A service inherits from `services/base.Service` and is registered via `services/factory.py`.

## API change protocol

- **`api/v1/`** is the live, stable surface (~25 routers). Existing v1 endpoints MUST stay backwards-compatible: only additive fields, never rename or remove.
- **`api/v2/`** is the **active redesign surface** (`files`, `mcp`, `registration`, `workflow`) — both are mounted at runtime in `api/router.py`. v2 is **not** "future"; the old cursor rule was wrong.
- Add a new endpoint to v2 only if it (a) replaces a v1 endpoint with a breaking shape change, or (b) belongs to one of the four v2 domains. Otherwise extend v1 additively.
- A breaking change to a v1 endpoint is forbidden. Add a v2 sibling and leave v1 in place.

## Cross-cutting change protocol

A change that touches a request/response shape MUST update three places in the same PR:

1. The pydantic model in `portals/api/v{1,2}/schemas.py` (or the route's local schema).
2. The TypeScript type in `src/frontend/src/types/` consumed by the affected page/store. There is no OpenAPI generator — the types are hand-maintained, so the frontend silently breaks at runtime if you skip this.
3. If the field is persisted: a new alembic revision (`make alembic-revision message=...`) AND a flow-JSON version mapping if the shape lives inside saved flows.

If you cannot do all three in one PR, do not start.

## Service vs utility vs component

- **Service** (`services/<name>/`): lifecycle-managed singleton, inherits `services.base.Service`, registered through `services/factory.py`, accessed via `services/deps.py`. Use when the thing has state, startup/shutdown, or shared connections (db, cache, queue).
- **Utility** (`helpers/`, `utils/`, or `px/utils/`): pure or near-pure functions. Use when there is no shared state and no lifecycle.
- **Component** (`src/px/src/px/components/<category>/`): user-visible node in the graph, subclass of `Component`, with `display_name`, `inputs`, `outputs`. Use only when the user must wire it on the canvas. Do not add a Component to expose internal plumbing.

## `px/base/` vs `portals/base/`

Both exist. Both have `agents/`, `data/`, `models/`, `prompts/`. New shared primitives go in **`src/px/src/px/base/`**. The `portals/base/` tree is legacy; do not add to it.
