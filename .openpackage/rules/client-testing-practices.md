---
trigger: glob
globs:
  - "src/client/src/**/*.test.ts"
  - "src/client/src/**/*.spec.ts"
---

Test files are organized by domain and business requirements, not by files.
The test file heirachry is: application(server, client, pipeline, worker, shared) -> domain (e.g. projects, entities, assets, db, language models (lm), etc.) -> feature (e.g. scene-generation, asset-upload, etc.) -> test-type (e.g. unit, integration, e2e, etc.)

Always use vitest for testing.

Test mocks are centralized in 'src/shared/mocks/'. When mocking functions, objects, and classes, always check 'src/shared/mocks/' first to see if a mock already exists. If it does, import and use it. If not, create a new mock in 'src/shared/mocks/' and use it.

# Database Mocking Pattern

All tests that involve database operations or services that depend on the database **must** use `createMockDb` and `createBuilder` from `#shared/mocks/mock-db.js`. Service or repository class testing must mock the database dependency via global db mocks, as seen in `#shared/mocks/mock-db.js`.

## Setup Pattern

// Triggers vi.mock('#shared/db/index.js', …) — must be imported so the mock
// is hoisted before ProjectRepository resolves its own db import.
import "#shared/mocks/mock-db.js";

// Importing db AFTER the mock is registered gives us the same mocked object
// that service receives when it does `import { db } from '…/db'`.
import { db } from "#shared/db/index.js";
import { ProjectRepository } from "#shared/services/project-repository.js"; // or a different database-dependent service

## Overriding a Single Operation Mid-Test

When one test needs a different response from the default, override the specific DB method using `createBuilder`:

```ts
it('should return updated row', async () => {
    db.update = vi.fn(() => createBuilder([updatedRow]));

    const result = await service.updateSomething(id, payload);
    expect(result).toEqual(updatedRow);
});
```

For one-off `select` overrides without replacing the whole method, use `mockReturnValueOnce`:

```ts
db.select.mockReturnValueOnce(createBuilder([specificRow]));
```

---

## Use Stable Function Definitions

When mocking store hooks (like Zustand's getState()), do not define vi.fn() inside the getState return object if you need to assert against it later.

If you do getState: () => ({ addNode: vi.fn() }), every call to the store generates a brand-new mock function, making assertions like expect(addNode).toHaveBeenCalled() impossible.

Instead, define your mock functions outside the vi.mock closure so the test and the component share the exact same stable reference.

Example Setup
Here is the standard boilerplate for setting up a test file that interacts with the API and canvas stores:
```typescript
// 1. IMPORT GLOBAL API MOCKS FIRST
import "#client/mocks/mock-api.ts";
import { vi } from 'vitest';

// 2. DEFINE STABLE STORE METHODS OUTSIDE CLOSURES
const mockSetAssets = vi.fn();
const mockAddNode = vi.fn();
const addCharacter = vi.fn();
const addLocation = vi.fn();
const addScene = vi.fn();

// 3. APPLY STORE MOCKS
vi.mock('#client/store/useAssetStore.js', () => ({
  useAssetStore: {
    getState: () => ({
      setAssets: mockSetAssets, // The test can now "see" this specific function
    }),
  },
}));

vi.mock('#client/store/useNodeStore.js', () => ({
  useNodeStore: {
    getState: () => ({
      addNode: mockAddNode,
    }),
  },
}));

vi.mock('#client/store/useProjectStore.js', () => ({
  useProjectStore: {
    getState: vi.fn(() => ({
      addCharacter,
      addLocation,
      addScene,
    })),
  },
}));

vi.mock('#client/domain/canvas/NodeFactory.js', () => ({
  NodeFactory: {
    createNode: vi.fn((params) => ({
      id: params.entityId,
      type: params.type,
      position: params.posCanvas,
      data: {},
    })),
  },
}));

// 4. NORMAL IMPORTS FOLLOW
// import { render, screen } from '@testing-library/react';
// import { MyComponent } from './MyComponent';
```

---

## Transaction Pattern

`createMockDb` automatically wires `db.transaction` to call the callback with `db` itself as `tx`. This means nested `tx.select()` / `tx.update()` calls resolve with the same defaults as the outer DB, and you only need to override when a test requires divergent behavior inside a transaction:

```ts
// Custom transaction behavior for one test
db.transaction = vi.fn(async (cb) => {
    const tx = createMockDb({ selectResult: [existingRow] });
    // Simulate a conflicting row found inside the transaction
    tx.select.mockReturnValueOnce(createBuilder([conflictRow]));
    return cb(tx);
});
```

---

## Asserting What Was Written to the DB

When a test verifies that invalid or undefined values are stripped before reaching the database, inspect mock call arguments directly — do not rely solely on the return value:

```ts
it('should strip undefined values before updating', async () => {
    db.update = vi.fn(() => createBuilder([mergedRow]));

    await service.updateProject(id, { metadata: { title: 'New', bpm: undefined } });

    const [[setPayload]] = (db.update as ReturnType<typeof vi.fn>).mock.calls;
    expect(setPayload).not.toHaveProperty('metadata.bpm', undefined);
});
```

---

## Reference Implementation

- Mock utilities: `src/shared/mocks/mock-db.ts`
- Example service test: `src/shared/services/__tests__/tag-registry.test.ts`
- Example repository test: `src/shared/services/__tests__/project-repository.metadata.test.ts`
