---
trigger: glob
globs:
  - "src/pipeline/**/*.test.ts"
  - "src/worker/**/*.test.ts"
  - "src/shared/**/*.test.ts"
  - "src/server/**/*.test.ts"
  - "src/tests/**/*.test.ts"
  - "**/*.spec.ts"
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

Note: transaction calls be mocked by mocking the db object - mocking the inner transactions is not necessary.

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
