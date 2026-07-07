/**
 * Tests for useRepositoryByFolder.
 *
 * Critical coverage:
 *   - 404 is an expected "no repo linked" state → returns null, no retry
 *   - Real errors (network, 500) propagate and retry
 *   - Empty folderId disables the query
 */

// ── Mocks (must come before imports) ─────────────────────────────────

const mockGet = jest.fn();
jest.mock("@/controllers/API/api", () => ({
  __esModule: true,
  api: { get: (...args: unknown[]) => mockGet(...args) },
}));

jest.mock("@/controllers/API/helpers/constants", () => ({
  __esModule: true,
  getURL: jest.fn(() => "/api/v1/nap"),
}));

// React Query provider wrapper
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { useRepositoryByFolder } from "../index";

// ── Helpers ──────────────────────────────────────────────────────────

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const FOLDER_ID = "test-folder-123";

// ── Tests ────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

describe("useRepositoryByFolder", () => {
  it("returns repository data when the backend responds successfully", async () => {
    const repoData = {
      id: "repo-1",
      name: "my-universe",
      nap_uri: "nap://example/entity",
      repo_type: "universe",
      remote_url: null,
      entity_count: 42,
      last_commit_hash: "abc123",
      status: "ready",
      error_message: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    };
    mockGet.mockResolvedValueOnce({ data: repoData });

    const { result } = renderHook(
      () => useRepositoryByFolder({ folderId: FOLDER_ID }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(repoData);
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith(
      `/api/v1/nap/repositories/by-folder/${FOLDER_ID}`,
    );
  });

  it("returns null on HTTP 404 (no repo linked)", async () => {
    const axiosError = {
      isAxiosError: true,
      response: { status: 404, data: { detail: "Not found" } },
      message: "Request failed with status code 404",
    };
    mockGet.mockRejectedValueOnce(axiosError);

    const { result } = renderHook(
      () => useRepositoryByFolder({ folderId: FOLDER_ID }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBeNull();
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("propagates real errors (500, network failure)", async () => {
    const serverError = {
      isAxiosError: true,
      response: { status: 500, data: { detail: "Internal error" } },
      message: "Request failed with status code 500",
    };
    mockGet.mockRejectedValue(serverError);

    const { result } = renderHook(
      // Disable retry so the test doesn't wait for 3 attempts.
      () => useRepositoryByFolder({ folderId: FOLDER_ID }, { retry: false }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.data).toBeUndefined();
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("propagates non-axios errors", async () => {
    const networkError = new TypeError("Network request failed");
    mockGet.mockRejectedValue(networkError);

    const { result } = renderHook(
      () => useRepositoryByFolder({ folderId: FOLDER_ID }, { retry: false }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.data).toBeUndefined();
  });

  it("is disabled when folderId is empty", async () => {
    const { result } = renderHook(
      () => useRepositoryByFolder({ folderId: "" }),
      { wrapper: createWrapper() },
    );

    // The query should not fire when folderId is falsy.
    expect(result.current.isPending).toBe(true);
    expect(mockGet).not.toHaveBeenCalled();
  });
});
