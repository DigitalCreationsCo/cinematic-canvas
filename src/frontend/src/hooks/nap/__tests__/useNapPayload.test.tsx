/**
 * Tests for useNapPayload.
 *
 * Critical coverage:
 *   - No repository → null payload
 *   - Desktop with entities → builds correct payload shape
 *   - Desktop without repoPath → logs error, empty
 *   - Web → empty payload, not crashes
 *   - Manual refresh reloads entities
 */

// ── Mocks (must come before imports) ─────────────────────────────────

const mockUseRepositoryByFolder = jest.fn();
jest.mock("@/controllers/API/queries/nap", () => ({
  __esModule: true,
  useRepositoryByFolder: (...args: unknown[]) =>
    mockUseRepositoryByFolder(...args),
}));

const mockUsePlatformSafe = jest.fn();
jest.mock("@/platform/usePlatform", () => ({
  __esModule: true,
  usePlatformSafe: () => mockUsePlatformSafe(),
}));

// ── Imports ──────────────────────────────────────────────────────────

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Entity } from "@/platform/types";
import { useNapPayload } from "../useNapPayload";

// ── Test helpers ─────────────────────────────────────────────────────

const FOLDER_ID = "folder-1";

const MOCK_REPOSITORY = {
  id: "repo-1",
  name: "my-universe",
  nap_uri: null,
  repo_type: "universe" as const,
  remote_url: null,
  entity_count: 3,
  last_commit_hash: "abc",
  status: "ready",
  error_message: null,
  created_at: null,
  updated_at: null,
};

const MOCK_ENTITIES: Entity[] = [
  {
    uri: "nap://entity/1",
    name: "Hero",
    entity_type: "character",
    version: 1,
    properties: { hp: 100 },
    references: { location: "nap://location/1" },
    representations: { icon: "🧑" },
  },
  {
    uri: "nap://entity/2",
    name: "Village",
    entity_type: "location",
    version: 2,
    properties: { population: 500 },
    references: {},
    representations: { icon: "🏘️" },
  },
];

const mockListEntities = jest.fn();
const mockReadEntity = jest.fn();

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function setupDesktopRuntime() {
  mockUsePlatformSafe.mockReturnValue({
    platform: {
      runtime: "desktop",
      openRepository: jest.fn(),
      initRepository: jest.fn(),
      listEntities: mockListEntities,
      readEntity: mockReadEntity,
    },
    runtime: "desktop",
    isLoading: false,
  });
}

function setupWebRuntime() {
  mockUsePlatformSafe.mockReturnValue({
    platform: null,
    runtime: "web",
    isLoading: false,
  });
}

const REPO_PATH = "/Users/test/nap-repos/my-project";

// ── Tests ────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  // Also reset mock implementations so unconsumed mockResolvedValueOnce
  // from previous tests don't leak across test boundaries.
  mockListEntities.mockReset();
  mockReadEntity.mockReset();
});

describe("useNapPayload — no repository", () => {
  it("returns napPayload=null and hasRepository=false when no repo is linked", async () => {
    setupDesktopRuntime();
    mockUseRepositoryByFolder.mockReturnValue({
      data: null,
      isLoading: false,
    });

    const { result } = renderHook(() => useNapPayload(FOLDER_ID, REPO_PATH), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.napPayload).toBeNull();
    expect(result.current.hasRepository).toBe(false);
    expect(result.current.entities).toEqual([]);
  });
});

describe("useNapPayload — desktop", () => {
  beforeEach(() => {
    setupDesktopRuntime();
    mockUseRepositoryByFolder.mockReturnValue({
      data: MOCK_REPOSITORY,
      isLoading: false,
    });
  });

  it("builds napPayload from local entities", async () => {
    mockListEntities.mockResolvedValueOnce(
      MOCK_ENTITIES.map((e) => ({
        uri: e.uri,
        entity_type: e.entity_type,
        entity_id: e.uri.split("/").pop()!,
        commit_hash: null,
        updated_at: null,
      })),
    );
    mockReadEntity.mockResolvedValueOnce(MOCK_ENTITIES[0]);
    mockReadEntity.mockResolvedValueOnce(MOCK_ENTITIES[1]);

    const { result } = renderHook(() => useNapPayload(FOLDER_ID, REPO_PATH), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.hasRepository).toBe(true);
    expect(result.current.entities).toHaveLength(2);

    // Verify napPayload shape matches InjectedNapContext expectations.
    const payload = result.current.napPayload;
    expect(payload).not.toBeNull();
    expect(payload!.universe).toBe("my-universe");
    expect(payload!.entities).toHaveLength(2);
    expect(payload!.entities[0]).toEqual({
      uri: "nap://entity/1",
      name: "Hero",
      type: "character",
      version: 1,
      properties: { hp: 100 },
      references: { location: "nap://location/1" },
      representations: { icon: "🧑" },
    });
  });

  it("returns empty entities when no repoPath is provided (warns)", async () => {
    // Note: no mockListEntities setup since the hook returns early
    // when repoPath is missing — the mock would never be consumed.
    const { result } = renderHook(() => useNapPayload(FOLDER_ID), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.entities).toEqual([]);
    // napPayload should be built from repository name even when empty.
    expect(result.current.napPayload).not.toBeNull();
    expect(result.current.napPayload!.entities).toEqual([]);
    // Should NOT have called listEntities because repoPath was missing
    expect(mockListEntities).not.toHaveBeenCalled();
  });

  it("refresh() reloads entities", async () => {
    // First load — empty
    mockListEntities.mockResolvedValueOnce([]);

    const { result } = renderHook(() => useNapPayload(FOLDER_ID, REPO_PATH), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entities).toHaveLength(0);

    // Second load — one entity (simulating a publish)
    mockListEntities.mockResolvedValueOnce([
      {
        uri: "nap://entity/new",
        entity_type: "character",
        entity_id: "new",
        commit_hash: null,
        updated_at: null,
      },
    ]);
    mockReadEntity.mockResolvedValueOnce({
      uri: "nap://entity/new",
      name: "New Hero",
      entity_type: "character",
      version: 1,
      properties: {},
      references: {},
      representations: {},
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.entities).toHaveLength(1);
    expect(result.current.entities[0].name).toBe("New Hero");
  });
});

describe("useNapPayload — web", () => {
  beforeEach(() => {
    setupWebRuntime();
    mockUseRepositoryByFolder.mockReturnValue({
      data: MOCK_REPOSITORY,
      isLoading: false,
    });
  });

  it("returns empty entities and warns (no local FS access)", async () => {
    const { result } = renderHook(() => useNapPayload(FOLDER_ID), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.entities).toEqual([]);
    // napPayload should still be built (empty entities list, but universe set).
    expect(result.current.napPayload).not.toBeNull();
    expect(result.current.napPayload!.universe).toBe("my-universe");
    // Should NOT call platform methods on web.
    expect(mockListEntities).not.toHaveBeenCalled();
  });

  it("refresh() is a no-op on web", async () => {
    const { result } = renderHook(() => useNapPayload(FOLDER_ID), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.refresh();
    });

    // Entities should remain empty
    expect(result.current.entities).toEqual([]);
    expect(mockListEntities).not.toHaveBeenCalled();
  });
});
