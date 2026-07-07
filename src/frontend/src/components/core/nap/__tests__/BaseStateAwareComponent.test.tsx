/**
 * Tests for BaseStateAwareComponent.
 *
 * Critical coverage:
 *   - Desktop: renders children with entities when repoPath is provided
 *   - Desktop: throws PlatformError when repoPath is missing
 *   - Web: renders children with empty entities
 *   - No repository: renders children with hasRepository=false
 *   - buildNapPayload() produces correctly shaped dict
 */

// ── Mocks (must come before imports) ─────────────────────────────────

const mockUsePlatformSafe = jest.fn();
jest.mock("@/platform/usePlatform", () => ({
  __esModule: true,
  usePlatformSafe: () => mockUsePlatformSafe(),
}));

const mockOpenRepository = jest.fn();
const mockInitRepository = jest.fn();
const mockListEntities = jest.fn();
const mockReadEntity = jest.fn();

/**
 * Stable mock for useEnsureLocalRepository.
 *
 * ⚠️  CRITICAL: ensureCloned must be a STABLE reference across renders.
 *     If each call to useEnsureLocalRepository created a new jest.fn(),
 *     the component's useEffect dep array would see a new ensureCloned
 *     on every render → infinite re-render loop → test hangs forever.
 *
 *     The factory closure below creates the mock once at module load
 *     time and returns it on every call to useEnsureLocalRepository.
 */
jest.mock("@/hooks/nap/useEnsureLocalRepository", () => {
  const mockEnsureCloned = jest.fn().mockResolvedValue({
    repoInfo: {
      path: "/test/repo",
      universe: "test-universe",
      current_branch: "main",
      head: "abc",
    },
    wasCloned: false,
  });

  return {
    __esModule: true,
    useEnsureLocalRepository: jest.fn(() => ({
      ensureCloned: mockEnsureCloned,
      isCloning: false,
      error: null,
      isLoading: false,
    })),
  };
});

const mockSetErrorData = jest.fn();
jest.mock("@/stores/alertStore", () => ({
  __esModule: true,
  default: (selector: (state: unknown) => unknown) => {
    const state = { setErrorData: mockSetErrorData };
    return typeof selector === "function" ? selector(state) : state;
  },
  getState: () => ({ setErrorData: mockSetErrorData }),
}));

const mockUseRepositoryByFolder = jest.fn();
jest.mock("@/controllers/API/queries/nap", () => ({
  __esModule: true,
  useRepositoryByFolder: (...args: unknown[]) =>
    mockUseRepositoryByFolder(...args),
}));

// ── Imports ──────────────────────────────────────────────────────────

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { BaseStateAwareComponent } from "../BaseStateAwareComponent";

// ── Helpers ──────────────────────────────────────────────────────────

const FOLDER_ID = "folder-1";
const REPO_PATH = "/Users/test/nap-repos/my-project";

const MOCK_REPOSITORY = {
  id: "repo-1",
  name: "my-universe",
  nap_uri: null,
  repo_type: "universe" as const,
  remote_url: null,
  entity_count: 2,
  last_commit_hash: "abc",
  status: "ready",
  error_message: null,
  created_at: null,
  updated_at: null,
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function setupDesktop() {
  mockUsePlatformSafe.mockReturnValue({
    platform: {
      runtime: "desktop",
      openRepository: mockOpenRepository,
      initRepository: mockInitRepository,
      listEntities: mockListEntities,
      readEntity: mockReadEntity,
    },
    runtime: "desktop",
    isLoading: false,
  });
}

function setupWeb() {
  mockUsePlatformSafe.mockReturnValue({
    platform: null,
    runtime: "web",
    isLoading: false,
  });
}

function setupRepository() {
  mockUseRepositoryByFolder.mockReturnValue({
    data: MOCK_REPOSITORY,
    isLoading: false,
  });
}

function setupNoRepository() {
  mockUseRepositoryByFolder.mockReturnValue({
    data: null,
    isLoading: false,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────

describe("BaseStateAwareComponent — desktop", () => {
  beforeEach(() => {
    setupDesktop();
    setupRepository();
    mockListEntities.mockResolvedValue([]);
  });

  it("renders children with entities from local repo", async () => {
    // Return two entity summaries
    mockListEntities.mockResolvedValueOnce([
      {
        uri: "nap://entity/1",
        entity_type: "character",
        entity_id: "1",
        commit_hash: null,
        updated_at: null,
      },
      {
        uri: "nap://entity/2",
        entity_type: "location",
        entity_id: "2",
        commit_hash: null,
        updated_at: null,
      },
    ]);
    mockReadEntity
      .mockResolvedValueOnce({
        uri: "nap://entity/1",
        name: "Hero",
        entity_type: "character",
        version: 1,
        properties: { hp: 100 },
        references: {},
        representations: {},
      })
      .mockResolvedValueOnce({
        uri: "nap://entity/2",
        name: "Village",
        entity_type: "location",
        version: 2,
        properties: { population: 500 },
        references: {},
        representations: {},
      });

    render(
      <BaseStateAwareComponent folderId={FOLDER_ID} repoPath={REPO_PATH}>
        {({ entities, hasRepository, isLoading }) => (
          <div>
            <span data-testid="has-repo">{String(hasRepository)}</span>
            <span data-testid="loading">{String(isLoading)}</span>
            <span data-testid="count">{entities.length}</span>
            {entities.map((e) => (
              <span key={e.uri} data-testid={`entity-${e.uri}`}>
                {e.name}
              </span>
            ))}
          </div>
        )}
      </BaseStateAwareComponent>,
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(screen.getByTestId("count").textContent).toBe("2");
    });

    expect(screen.getByTestId("has-repo").textContent).toBe("true");
    expect(screen.getByText("Hero")).toBeInTheDocument();
    expect(screen.getByText("Village")).toBeInTheDocument();
  });

  it("filters entities by type when entityTypes is provided", async () => {
    mockListEntities.mockResolvedValueOnce([
      {
        uri: "nap://entity/1",
        entity_type: "character",
        entity_id: "1",
        commit_hash: null,
        updated_at: null,
      },
      {
        uri: "nap://entity/2",
        entity_type: "location",
        entity_id: "2",
        commit_hash: null,
        updated_at: null,
      },
    ]);
    mockReadEntity.mockResolvedValueOnce({
      uri: "nap://entity/1",
      name: "Hero",
      entity_type: "character",
      version: 1,
      properties: {},
      references: {},
      representations: {},
    });

    render(
      <BaseStateAwareComponent
        folderId={FOLDER_ID}
        repoPath={REPO_PATH}
        entityTypes={["character"]}
      >
        {({ entities }) => (
          <div>
            <span data-testid="count">{entities.length}</span>
            {entities.map((e) => (
              <span key={e.uri} data-testid={`entity-${e.uri}`}>
                {e.name}
              </span>
            ))}
          </div>
        )}
      </BaseStateAwareComponent>,
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(screen.getByTestId("count").textContent).toBe("1");
    });

    // Only the character entity should be loaded
    expect(screen.getByText("Hero")).toBeInTheDocument();
    // The location entity was NOT passed to readEntity
    expect(mockReadEntity).toHaveBeenCalledTimes(1);
  });

  it("buildNapPayload() returns the correct shape", async () => {
    mockListEntities.mockResolvedValueOnce([
      {
        uri: "nap://entity/1",
        entity_type: "character",
        entity_id: "1",
        commit_hash: null,
        updated_at: null,
      },
    ]);
    mockReadEntity.mockResolvedValueOnce({
      uri: "nap://entity/1",
      name: "Hero",
      entity_type: "character",
      version: 1,
      properties: { hp: 100 },
      references: {},
      representations: { icon: "🧑" },
    });

    // Capture buildNapPayload AFTER entities are loaded.
    // The render prop fires on mount before the async effect completes.
    // We wait for the secondary render (after entities load) to capture.
    let capturedBuildPayload: (() => unknown) | null = null;
    render(
      <BaseStateAwareComponent folderId={FOLDER_ID} repoPath={REPO_PATH}>
        {({ buildNapPayload, isLoading, entities }) => {
          // Only capture after loading finishes and entities are available
          if (!isLoading && entities.length > 0) {
            capturedBuildPayload = buildNapPayload;
          }
          return <div data-testid="ready">Ready</div>;
        }}
      </BaseStateAwareComponent>,
      { wrapper: createWrapper() },
    );

    // Wait for entities to be loaded (captured after async effect)
    await waitFor(() => {
      expect(capturedBuildPayload).not.toBeNull();
    });

    const payload = capturedBuildPayload!();
    expect(payload).toEqual({
      universe: "my-universe",
      entities: [
        {
          uri: "nap://entity/1",
          name: "Hero",
          type: "character",
          version: 1,
          properties: { hp: 100 },
          references: {},
          representations: { icon: "🧑" },
        },
      ],
    });
  });
});

describe("BaseStateAwareComponent — desktop without repoPath", () => {
  beforeEach(() => {
    setupDesktop();
    setupRepository();
  });

  it("throws PlatformError when repoPath is missing on desktop", async () => {
    // Suppress expected console.error
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});

    // The component should throw during render (in the effect).
    // We wrap in a container to catch the error.
    const errorSpy = jest.fn();
    render(
      <BaseStateAwareComponent folderId={FOLDER_ID}>
        {() => <div>Should not render</div>}
      </BaseStateAwareComponent>,
      { wrapper: createWrapper() },
    );

    // Wait for the error to be surfaced via setErrorData.
    await waitFor(() => {
      expect(mockSetErrorData).toHaveBeenCalled();
    });

    const call = mockSetErrorData.mock.calls[0][0];
    expect(call.title).toBe("Failed to Load Narrative Entities");
    expect(call.list[0]).toMatch(/repository path is required/);

    spy.mockRestore();
  });
});

describe("BaseStateAwareComponent — web", () => {
  beforeEach(() => {
    setupWeb();
    setupRepository();
  });

  it("renders children with empty entities", async () => {
    render(
      <BaseStateAwareComponent folderId={FOLDER_ID}>
        {({ entities, hasRepository, isLoading }) => (
          <div>
            <span data-testid="has-repo">{String(hasRepository)}</span>
            <span data-testid="count">{entities.length}</span>
            <span data-testid="loading">{String(isLoading)}</span>
          </div>
        )}
      </BaseStateAwareComponent>,
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    expect(screen.getByTestId("has-repo").textContent).toBe("true");
    expect(screen.getByTestId("count").textContent).toBe("0");
    // Should NOT call platform methods on web
    expect(mockListEntities).not.toHaveBeenCalled();
    expect(mockReadEntity).not.toHaveBeenCalled();
  });
});

describe("BaseStateAwareComponent — no repository linked", () => {
  beforeEach(() => {
    setupDesktop();
    setupNoRepository();
  });

  it("renders children with hasRepository=false", async () => {
    render(
      <BaseStateAwareComponent folderId={FOLDER_ID} repoPath={REPO_PATH}>
        {({ entities, hasRepository }) => (
          <div>
            <span data-testid="has-repo">{String(hasRepository)}</span>
            <span data-testid="count">{entities.length}</span>
          </div>
        )}
      </BaseStateAwareComponent>,
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(screen.getByTestId("has-repo").textContent).toBe("false");
    });

    expect(screen.getByTestId("count").textContent).toBe("0");
  });
});
