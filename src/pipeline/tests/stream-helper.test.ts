import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleStream } from "../helpers/stream-helper.js";
import { generateId } from "#shared/utils/id.js";

describe("handleStream", () => {
  const projectId = generateId();
  const packet = {
    projectId,
    worldId: generateId(),
    teamId: generateId(),
    userId: generateId(),
  };
  const commandName = "test-command";
  const config = { configurable: { thread_id: "test-thread" } };
  const publishEvent = vi.fn().mockResolvedValue(undefined);

  const mockCompiledGraph = {
    getState: vi.fn(),
  } as any;

  // Helper to create an empty async generator for the stream
  const createEmptyStream = async function* () {
    yield* [];
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits WORKFLOW_COMPLETED when graph is fully exhausted (no pending nodes)", async () => {
    // Source implementation checks stateSnapshot.next.length === 0
    mockCompiledGraph.getState.mockResolvedValue({
      next: [],
      tasks: [],
    });

    await handleStream(packet, commandName, createEmptyStream() as any, publishEvent, mockCompiledGraph, config);

    expect(publishEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "WORKFLOW_COMPLETED",
        projectId,
      }),
    );
  });

  it("emits WORKFLOW_COMPLETED for terminal interrupts (e.g., lm_intervention)", async () => {
    // Source defines terminalInterrupts including 'lm_intervention'
    mockCompiledGraph.getState.mockResolvedValue({
      next: ["some_node"],
      tasks: [
        {
          interrupts: [{ value: { type: "lm_intervention" } }],
        },
      ],
    });

    await handleStream(packet, commandName, createEmptyStream() as any, publishEvent, mockCompiledGraph, config);

    expect(publishEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "WORKFLOW_COMPLETED",
      }),
    );
  });

  it("suppresses WORKFLOW_COMPLETED for non-terminal interrupts (e.g., waiting_for_job)", async () => {
    // Source identifies 'waiting_for_job' as non-terminal
    mockCompiledGraph.getState.mockResolvedValue({
      next: ["worker_node"],
      tasks: [
        {
          interrupts: [{ value: { type: "waiting_for_job" } }],
        },
      ],
    });

    await handleStream(packet, commandName, createEmptyStream() as any, publishEvent, mockCompiledGraph, config);

    expect(publishEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: "WORKFLOW_COMPLETED",
      }),
    );
  });

  it("handles stream AbortError gracefully without throwing", async () => {
    const abortStream = (async function* () {
      const error = new Error("Aborted");
      error.name = "AbortError";
      throw error;
    })();

    // Ensure finally block still runs and completes
    mockCompiledGraph.getState.mockResolvedValue({ next: ["node"], tasks: [] });

    await expect(
      handleStream(packet, commandName, abortStream as any, publishEvent, mockCompiledGraph, config),
    ).resolves.not.toThrow();
  });

  it("suppresses stream exceptions if the finally block evaluates to a completion state", async () => {
    const errorStream = (async function* () {
      throw new Error("Critical Failure");
    })();

    // Source logic: finally block runs getState. If next.length === 0, it returns.
    mockCompiledGraph.getState.mockResolvedValue({
      next: [],
      tasks: [],
    });

    const result = await handleStream(packet, commandName, errorStream as any, publishEvent, mockCompiledGraph, config);

    // The promise now resolves instead of rejecting because of the return in finally
    expect(result).toBeUndefined();

    // Verify completion was still published despite the error
    expect(publishEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "WORKFLOW_COMPLETED",
      }),
    );
  });
});
