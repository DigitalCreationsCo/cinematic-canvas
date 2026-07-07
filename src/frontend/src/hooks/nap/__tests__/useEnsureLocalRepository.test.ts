/**
 * Tests for useEnsureLocalRepository.
 *
 * Critical coverage:
 *   - Desktop: existing repo → openRepository succeeds
 *   - Desktop: missing repo → openRepository fails → initRepository succeeds
 *   - Desktop: both fail → PlatformError thrown
 *   - Web: returns stub, warns
 *   - Cancellation: unmount during async ops doesn't set state
 */

// ── Mocks (must come before imports) ─────────────────────────────────

const mockOpenRepository = jest.fn();
const mockInitRepository = jest.fn();
const mockUsePlatformSafe = jest.fn();

jest.mock("@/platform/usePlatform", () => ({
  __esModule: true,
  usePlatformSafe: () => mockUsePlatformSafe(),
}));

import { act, renderHook, waitFor } from "@testing-library/react";
import { PlatformError, PlatformErrorCode } from "@/platform/errors";
import { useEnsureLocalRepository } from "../useEnsureLocalRepository";

// ── Helpers ──────────────────────────────────────────────────────────

const REPO_PATH = "/Users/test/nap-repos/my-project";
const UNIVERSE = "my-universe";

const MOCK_REPO_INFO = {
  path: REPO_PATH,
  universe: UNIVERSE,
  current_branch: "main" as const,
  head: "abc123" as const,
};

function makePlatform(runtime: "desktop" | "web" | "test") {
  return {
    runtime,
    openRepository: mockOpenRepository,
    initRepository: mockInitRepository,
    listEntities: jest.fn(),
    readEntity: jest.fn(),
    // … other platform fields as needed
  };
}

function setupRuntime(runtime: "desktop" | "web" | "test") {
  mockUsePlatformSafe.mockReturnValue({
    platform: runtime === "desktop" ? makePlatform(runtime) : null,
    runtime,
    isLoading: false,
  });
}

// ── Tests ────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  // Reset mock implementations so pending mockResolvedValueOnce from
  // previous tests don't leak across test boundaries.
  mockOpenRepository.mockReset();
  mockInitRepository.mockReset();
});

describe("useEnsureLocalRepository — desktop", () => {
  beforeEach(() => {
    setupRuntime("desktop");
  });

  it("returns wasCloned=false when repo already exists locally", async () => {
    mockOpenRepository.mockResolvedValueOnce(MOCK_REPO_INFO);

    const { result } = renderHook(() => useEnsureLocalRepository());

    let output: Awaited<ReturnType<typeof result.current.ensureCloned>>;
    await act(async () => {
      output = await result.current.ensureCloned(REPO_PATH, UNIVERSE);
    });

    expect(output!.repoInfo).toEqual(MOCK_REPO_INFO);
    expect(output!.wasCloned).toBe(false);
    expect(mockOpenRepository).toHaveBeenCalledTimes(1);
    expect(mockOpenRepository).toHaveBeenCalledWith(REPO_PATH, UNIVERSE);
    // initRepository should NOT have been called
    expect(mockInitRepository).not.toHaveBeenCalled();
  });

  it("clones repo when openRepository throws NotFound", async () => {
    const notFound = new PlatformError(
      PlatformErrorCode.NotFound,
      "Repository not found",
      {},
    );
    mockOpenRepository.mockRejectedValueOnce(notFound);
    mockInitRepository.mockResolvedValueOnce(MOCK_REPO_INFO);

    const { result } = renderHook(() => useEnsureLocalRepository());

    let output: Awaited<ReturnType<typeof result.current.ensureCloned>>;
    await act(async () => {
      output = await result.current.ensureCloned(REPO_PATH, UNIVERSE);
    });

    expect(output!.repoInfo).toEqual(MOCK_REPO_INFO);
    expect(output!.wasCloned).toBe(true);
    expect(mockOpenRepository).toHaveBeenCalledTimes(1);
    expect(mockInitRepository).toHaveBeenCalledTimes(1);
    expect(mockInitRepository).toHaveBeenCalledWith(REPO_PATH, UNIVERSE);
  });

  it("throws PlatformError when both open and init fail", async () => {
    const notFound = new PlatformError(
      PlatformErrorCode.NotFound,
      "Not found",
      {},
    );
    const initError = new PlatformError(
      PlatformErrorCode.Repo,
      "Permission denied",
      {},
    );
    mockOpenRepository.mockRejectedValueOnce(notFound);
    mockInitRepository.mockRejectedValueOnce(initError);

    const { result } = renderHook(() => useEnsureLocalRepository());

    await expect(
      act(async () => {
        await expect(
          result.current.ensureCloned(REPO_PATH, UNIVERSE),
        ).rejects.toThrow(PlatformError);
      }),
    ).resolves.toBeUndefined();

    expect(mockInitRepository).toHaveBeenCalledTimes(1);
    // error state should be set after the act flush
    await waitFor(() => {
      expect(result.current.error).toBeInstanceOf(PlatformError);
    });
    expect(result.current.error!.message).toMatch(/Permission denied/);
  });

  it("throws PlatformError when openRepository fails with a real error (not NotFound)", async () => {
    const ioError = new PlatformError(
      PlatformErrorCode.Io,
      "Disk read error",
      {},
    );
    mockOpenRepository.mockRejectedValueOnce(ioError);

    const { result } = renderHook(() => useEnsureLocalRepository());

    await expect(
      act(async () => {
        await result.current.ensureCloned(REPO_PATH, UNIVERSE);
      }),
    ).rejects.toThrow(PlatformError);

    // initRepository should NOT be called because the error wasn't NotFound
    expect(mockInitRepository).not.toHaveBeenCalled();
  });

  it("sets isCloning=true during the operation, false after", async () => {
    let resolveOpen!: (info: typeof MOCK_REPO_INFO) => void;
    mockOpenRepository.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOpen = resolve;
      }),
    );

    const { result } = renderHook(() => useEnsureLocalRepository());

    // Start the operation (don't await)
    let promise: Promise<unknown>;
    act(() => {
      promise = result.current.ensureCloned(REPO_PATH, UNIVERSE);
    });

    // While in-flight, isCloning should be true
    await waitFor(() => expect(result.current.isLoading).toBe(true));

    // Resolve the pending promise
    await act(async () => {
      resolveOpen!(MOCK_REPO_INFO);
      await promise;
    });

    // After resolution, cloning should be done
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });
});

describe("useEnsureLocalRepository — web", () => {
  beforeEach(() => {
    setupRuntime("web");
  });

  it("returns a stub RepoInfo on web", async () => {
    const { result } = renderHook(() => useEnsureLocalRepository());

    let output: Awaited<ReturnType<typeof result.current.ensureCloned>>;
    await act(async () => {
      output = await result.current.ensureCloned(REPO_PATH, UNIVERSE);
    });

    expect(output!.repoInfo.path).toBe(REPO_PATH);
    expect(output!.repoInfo.universe).toBe(UNIVERSE);
    expect(output!.repoInfo.current_branch).toBe("main");
    expect(output!.wasCloned).toBe(false);
    // Should NOT call platform methods
    expect(mockOpenRepository).not.toHaveBeenCalled();
    expect(mockInitRepository).not.toHaveBeenCalled();
  });
});

describe("useEnsureLocalRepository — cancellation", () => {
  it("does not set state after unmount", async () => {
    setupRuntime("desktop");

    // Keep the promise pending indefinitely.
    mockOpenRepository.mockReturnValueOnce(new Promise(() => {}));

    const { result, unmount } = renderHook(() => useEnsureLocalRepository());

    // Start the operation and immediately unmount.
    act(() => {
      result.current.ensureCloned(REPO_PATH, UNIVERSE);
    });

    // Unmount should not throw (no state updates on unmounted component).
    expect(() => unmount()).not.toThrow();
  });
});
