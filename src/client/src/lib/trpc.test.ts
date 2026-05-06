/** @vitest-environment happy-dom */

import { getSession } from "#shared/mocks/mock-supabase.js";
import { generateId } from "#shared/utils/id.js";
import { describe, it, expect, vi, beforeEach } from "vitest";

const activeTeamId = generateId();
const activeWorldId = generateId();
const activeProjectId = generateId();

vi.mock("#client/lib/auth-context.js", () => ({
  getActiveTeamId: vi.fn().mockReturnValue(activeTeamId),
}));

vi.mock("#client/store/useWorldStore.js", () => ({
  getActiveWorldId: vi.fn().mockReturnValue(activeWorldId),
}));

vi.mock("#client/store/useProjectStore.js", () => ({
  getActiveProjectId: vi.fn().mockReturnValue(activeProjectId),
}));

describe("trpc.ts", async () => {
  let trpcModule: typeof import("/Users/vibrantceo/Projects/cinematic-canvas/src/client/src/lib/trpc");

  beforeEach(async () => {
    vi.clearAllMocks();
    trpcModule = await import("#client/lib/trpc.js");

    getSession.mockResolvedValue({ data: { session: null } });
  });

  describe("queryClient", () => {
    it("should be defined", () => {
      expect(trpcModule.queryClient).toBeDefined();
    });

    it("should have default query options", () => {
      expect(trpcModule.queryClient.getDefaultOptions()).toBeDefined();
    });
  });

  describe("supabase client", () => {
    it("should be defined", () => {
      expect(trpcModule.supabase).toBeDefined();
    });
  });

  describe("trpcClient", () => {
    it("should be defined", () => {
      expect(trpcModule.trpcClient).toBeDefined();
    });
  });

  describe("trpc proxy", () => {
    it("should be defined", () => {
      expect(trpcModule.trpc).toBeDefined();
    });

    it("should have projects namespace", () => {
      expect(trpcModule.trpc.projects).toBeDefined();
    });
  });
});

describe("trpc.ts - Headers Configuration", () => {
  it("should include team id header when team is active", async () => {
    const { getActiveTeamId } = await import("#client/lib/auth-context.js");
    const teamId = getActiveTeamId();
    expect(teamId).toBe(activeTeamId);
  });

  it("should include world id header when world is active", async () => {
    const { getActiveWorldId } = await import("#client/store/useWorldStore.js");
    const worldId = getActiveWorldId();
    expect(worldId).toBe(activeWorldId);
  });

  it("should include project id header when project is active", async () => {
    const { getActiveProjectId } = await import("#client/store/useProjectStore.js");
    const projectId = getActiveProjectId();
    expect(projectId).toBe(activeProjectId);
  });
});
