---
trigger: glob
globs:
   - "src/pipeline/**/*.test.ts"
   - "src/pipeline/**/*.spec.ts"
   - "src/worker/**/*.test.ts"
   - "src/worker/**/*.spec.ts"
   - "src/shared/**/*.test.ts"
   - "src/shared/**/*.spec.ts"
   - "src/server/**/*.test.ts"
   - "src/server/**/*.spec.ts"
   - "src/tests/**/*.test.ts"
   - "**/__tests__/**/*.test.ts"
---

# Testing Practices

Always use vitest for testing.

---

## File Organization

Tests are **co-located** with their source files using a `__tests__/` subdirectory.

```
src/
├── pipeline/
│   └── scene-generation/
│       ├── scene-generator.ts
│       └── __tests__/
│           ├── scene-generator.unit.test.ts
│           ├── scene-generator.integration.test.ts
│           └── scene-generator.e2e.test.ts
├── server/
│   └── projects/
│       ├── project-service.ts
│       └── __tests__/
│           └── project-service.unit.test.ts
└── shared/
    ├── services/
    │   ├── tag-registry.ts
    │   └── __tests__/
    │       └── tag-registry.unit.test.ts
    └── mocks/           ← centralized mocks only (see below)
        └── mock-db.ts
```

**Filename convention**: `<source-filename>.<test-type>.test.ts`

Test types: `unit` | `integration` | `e2e`

Example: `scene-generator.ts` → `__tests__/scene-generator.unit.test.ts`

---

## Agent Rules: Finding and Writing Tests

These rules apply to any coding agent creating, modifying, or reviewing test files.

### 1. Always discover before creating

Before creating any test file, an agent MUST check whether one already exists:

1. Look for a `__tests__/` directory adjacent to the source file being tested.
2. Check for any file in that directory whose name starts with the source filename stem (e.g. `scene-generator`).
3. If a matching test file exists → **edit it**, do not create a new one.
4. Only create a new file if no matching test file exists anywhere under `__tests__/` for that source module.

**Never create a second test file for the same source file and test type.**

### 2. Update tests when source changes

When modifying a source file, an agent MUST:

1. Check if a corresponding `__tests__/` file exists for the modified module.
2. If it does, review it and update any tests that cover the changed behavior.
3. Add new tests for any new public functions, methods, or behaviors introduced.
4. Remove or update tests for any removed or renamed exports.

Source changes and test updates should be part of the same commit/change set.

### 3. Use existing patterns before inventing new ones

Before writing any mock, helper, or test pattern:

1. Check `src/shared/mocks/` for existing mocks — import and reuse them.
2. Check existing `__tests__/` files in the same domain for established patterns.
3. Reference implementations:
   - Mock utilities: `src/shared/mocks/mock-db.ts`
   - Service test example: `src/shared/services/__tests__/tag-registry.unit.test.ts`
   - Repository test example: `src/shared/services/__tests__/project-repository.metadata.unit.test.ts`

If a new mock is needed that does not exist, create it in `src/shared/mocks/` so it can be reused by others.

---

## Mocks

Mock files are centralized in `src/shared/mocks/`. When mocking functions, objects, and classes, always check `src/shared/mocks/` first. If a mock exists, import and use it. If not, create it there.

### Database Mocking Pattern

All tests involving database operations **must** use `createMockDb` and `createBuilder` from `#shared/mocks/mock-db.js`.

```ts
// Triggers vi.mock('#shared/db/index.js', …) — must be imported so the mock
// is hoisted before the service resolves its own db import.
import "#shared/mocks/mock-db.js";

import { db } from "#shared/db/index.js";
import { ProjectRepository } from "#shared/services/project-repository.js";
```

#### Overriding a single operation mid-test

```ts
it('should return updated row', async () => {
    db.update = vi.fn(() => createBuilder([updatedRow]));

    const result = await service.updateSomething(id, payload);
    expect(result).toEqual(updatedRow);
});
```

For one-off `select` overrides without replacing the whole method:

```ts
db.select.mockReturnValueOnce(createBuilder([specificRow]));
```

#### Transaction pattern

`createMockDb` automatically wires `db.transaction` to call the callback with `db` itself as `tx`. Override only when a test requires divergent behavior inside a transaction:

```ts
db.transaction = vi.fn(async (cb) => {
    const tx = createMockDb({ selectResult: [existingRow] });
    tx.select.mockReturnValueOnce(createBuilder([conflictRow]));
    return cb(tx);
});
```

#### Asserting what was written to the DB

```ts
it('should strip undefined values before updating', async () => {
    db.update = vi.fn(() => createBuilder([mergedRow]));

    await service.updateProject(id, { metadata: { title: 'New', bpm: undefined } });

    const [[setPayload]] = (db.update as ReturnType<typeof vi.fn>).mock.calls;
    expect(setPayload).not.toHaveProperty('metadata.bpm', undefined);
});
```

---

## Timer Mocking and Async Operation Testing

When testing code that uses timers (`setTimeout`, `Date.now()`, polling loops, retry logic, or `sleep` utilities):

1. **Use Vitest fake timers**: Use `vi.useFakeTimers()` in `beforeEach`. This automatically mocks `sleep` methods that rely on `setTimeout`. Avoid manual spies on `Date.now` or individual methods when using fake timers — they cause synchronization conflicts.

2. **Restore timers after each test**: Call `vi.useRealTimers()` in `afterEach` to prevent cross-test contamination.

3. **Control time advancement**:
   - Use `vi.advanceTimersByTime(ms)` for precise control, especially for timeout and polling tests.
   - Prefer `vi.advanceTimersByTime()` over `vi.runAllTimers()` when you need deterministic iteration counts.

4. **Prevent infinite loops and OOM**:
   - Ensure test mocks trigger exit conditions (status change, timeout threshold) after a controlled number of iterations.
   - Assert mock call counts (e.g. `expect(mockFn).toHaveBeenCalledTimes(n)`) to verify loops did not run unbounded.

5. **Example: testing a polling timeout**:

```typescript
it('should throw error on timeout', async () => {
  const pendingOp = { name: 'operations/123', done: false };
  mockVideoModel.generateVideos.mockResolvedValue(pendingOp);
  mockVideoModel.getVideosOperation.mockResolvedValue(pendingOp);

  const executionPromise = sceneGenerator.executeVideoGeneration(args);
  vi.advanceTimersByTime(15 * 60 * 1000 + 1);

  await expect(executionPromise).rejects.toThrow('Video generation timed out');
  expect(mockVideoModel.getVideosOperation).toHaveBeenCalledTimes(1);
});
```

---

## Error Handling in Tests

- Do not use empty `catch` blocks — let failures surface explicitly.
- For rejected promises, use `await expect(promise).rejects.toThrow()` instead of try-catch.
- Never suppress unhandled rejection errors in test suites.
