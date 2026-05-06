import { vi, type Mock } from "vitest";

const { createMockTable, db } = vi.hoisted(() => {
  const createMockTable = () => ({
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
  });

  const db = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(),
    query: {
      characters: createMockTable(),
      locations: createMockTable(),
      scenes: createMockTable(),
      props: createMockTable(),
    },
    transaction: vi.fn((fn: any) => fn(db)),
  };

  return {
    createMockTable,
    db,
  };
});

vi.mock("#shared/db/index.js", () => {
  return {
    db,
    schema: {},
  };
});

// ─── Builder ──────────────────────────────────────────────────────────────────
//
// Every chain method returns the same builder so you can call them in any order.
// The builder is **thenable**, meaning `await tx.select().from().where()` resolves
// to `resolveWith` without needing an explicit `.returning()` call.
// Methods that Drizzle terminates with `.returning()` also work – it resolves
// to the same value.

export interface MockBuilder extends Promise<any> {
  // Chainable methods
  select: Mock;
  from: Mock;
  where: Mock;
  limit: Mock;
  offset: Mock;
  leftJoin: Mock;
  rightJoin: Mock;
  innerJoin: Mock;
  on: Mock;
  orderBy: Mock;
  groupBy: Mock;
  as: Mock;
  set: Mock;
  values: Mock;
  for: Mock;
  delete: Mock;
  // Terminal
  returning: Mock;
  // Implementation detail to allow 'await builder'
  then: (onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) => Promise<any>;
}

const CHAIN_METHODS = [
  "select",
  "from",
  "where",
  "limit",
  "offset",
  "leftJoin",
  "rightJoin",
  "innerJoin",
  "on",
  "orderBy",
  "groupBy",
  "as",
  "set",
  "values",
  "for",
  "delete",
] as const;

/**
 * Create a single chainable query builder that resolves to `resolveWith`.
 * Override individual mocks on the returned object in your tests as needed.
 */
export const createBuilder = (resolveWith: any = []): MockBuilder => {
  const builder: any = {};

  // Every chain method returns the builder itself
  for (const method of CHAIN_METHODS) {
    builder[method] = vi.fn().mockImplementation(() => builder);
  }

  // .returning() resolves to the final value
  builder.returning = vi.fn().mockImplementation(() => Promise.resolve(resolveWith));

  // Make the builder "Thenable" so 'await db.select()...' works without .returning()
  builder.then = (onfulfilled?: any, onrejected?: any) => {
    return Promise.resolve(resolveWith).then(onfulfilled, onrejected);
  };

  return builder as MockBuilder;
};

// ─── Mock DB ─────────────────────────────────────────────────────────────────
// Each top-level operation (`select`, `insert`, `update`, `delete`) gets its
// own default resolve value. You can override them per-test.
//
// `db.transaction(cb)` passes itself as `tx`, so services that call
// `tx.transaction(inner => ...)` work without extra setup.

export interface MockDbDefaults {
  selectResult?: any[];
  insertResult?: any[];
  updateResult?: any[];
  deleteResult?: any[];
}

export const createMockDb = (defaults: MockDbDefaults = {}) => {
  const mockDb = {
    execute: vi.fn(),
    select: vi.fn(() => createBuilder(defaults.selectResult ?? [])),
    insert: vi.fn(() => createBuilder(defaults.insertResult ?? [])),
    update: vi.fn(() => createBuilder(defaults.updateResult ?? [{}])),
    delete: vi.fn(() => createBuilder(defaults.deleteResult ?? [{ deleted: true }])),
    transaction: vi.fn(async (cb: any) => cb(mockDb)),
  };
  return mockDb;
};
