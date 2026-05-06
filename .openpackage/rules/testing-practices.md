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

---

## Timer Mocking and Async Operation Testing

When testing code that uses timers (`setTimeout`, `Date.now()`, polling loops, retry logic, or delays via `sleep` utilities):

1. **Use Vitest Fake Timers**: Always use `vi.useFakeTimers()` in `beforeEach` to mock all timer-related APIs (`setTimeout`, `Date`, `performance`) consistently. This will automatically mock any `sleep` methods that rely on `setTimeout` (like the `protected sleep(ms)` method in `SceneGeneratorAgent`). Avoid manual spies on `Date.now` or individual methods (e.g., `vi.spyOn(obj, 'sleep')`) when using fake timers, as they can cause synchronization conflicts.

2. **Cleanup Fake Timers**: Always restore real timers in `afterEach` with `vi.useRealTimers()` to prevent cross-test contamination.

3. **Controlling Time Advancement**:
   - Use `vi.advanceTimersByTime(ms)` to advance fake time by a specific duration, which is critical for testing timeout logic or polling intervals. This ensures loops exit after the expected number of iterations.
   - Prefer `vi.advanceTimersByTime()` over `vi.runAllTimers()` when you need precise control over time progression, especially for timeout tests.

4. **Avoiding Infinite Loops and OOM Errors**:
   - For polling/retry logic (e.g., `while` loops waiting for async operations), ensure test mocks trigger exit conditions (e.g., operation status changes, timeout thresholds) after a controlled number of iterations.
   - Add assertions for mock call counts (e.g., `expect(mockFn).toHaveBeenCalledTimes(n)`) to verify loops do not run unbounded, which can cause OOM errors from excessive mock call history growth.

5. **Example: Testing Polling Timeout Logic**:
   ```typescript
   it('should throw error on timeout', async () => {
     const pendingOp = { name: 'operations/123', done: false };
     mockVideoModel.generateVideos.mockResolvedValue(pendingOp);
     // Always return pending operation to trigger timeout
     mockVideoModel.getVideosOperation.mockResolvedValue(pendingOp);

     const executionPromise = sceneGenerator.executeVideoGeneration(args);
     // Advance past both 10s poll delay and 15-minute timeout threshold
     vi.advanceTimersByTime(15 * 60 * 1000 + 1);

     await expect(executionPromise).rejects.toThrow('Video generation timed out');
     // Verify loop only ran once instead of infinitely
     expect(mockVideoModel.getVideosOperation).toHaveBeenCalledTimes(1);
   });
   ```

---

## Test Error Handling

- Avoid empty `catch` blocks in tests that swallow errors. Let test failures surface explicitly to catch issues immediately.
- If you need to test rejected promises, use `await expect(promise).rejects.toThrow()` instead of try-catch blocks with empty handlers.
- Never suppress unhandled rejection errors in test suites.
