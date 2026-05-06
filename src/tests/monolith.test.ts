import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";
import { InMemoryEventBus } from "../shared/messaging/event-bus.js";
import { initializeServer } from "#server/index.js";
import { initializePipeline } from "#pipeline/index.js";
import { initializeWorker } from "#worker/index.js";

vi.mock("../src/shared/logger/index.js", () => ({ initLogger: vi.fn() }));
vi.mock("../src/shared/db/index.js", () => ({
  getPool: vi.fn(() => ({ end: vi.fn() })),
  initializeDatabase: vi.fn(),
}));
vi.mock("../src/shared/services/pool-manager.js", () => ({
  PoolManager: vi.fn().mockImplementation(() => ({ close: vi.fn() })),
}));
vi.mock("../src/shared/services/lock-manager.js", () => ({
  DistributedLockManager: vi.fn().mockImplementation(() => ({ close: vi.fn() })),
}));
vi.mock("../src/shared/messaging/event-bus.js", () => ({
  InMemoryEventBus: vi.fn().mockImplementation(() => ({ close: vi.fn() })),
}));

const mockStopServer = vi.hoisted(() => vi.fn());
const mockStopPipeline = vi.hoisted(() => vi.fn());
const mockStopWorker = vi.hoisted(() => vi.fn());

vi.mock("#server/index.js", () => ({
  initializeServer: vi.fn().mockResolvedValue({ stop: mockStopServer }),
}));
vi.mock("#pipeline/index.js", () => ({
  initializePipeline: vi.fn().mockResolvedValue({ stop: mockStopPipeline }),
}));
vi.mock("#worker/index.js", () => ({
  initializeWorker: vi.fn().mockResolvedValue({ stop: mockStopWorker }),
}));

describe("Monolithic Boot Sequence", () => {
  let processExitMock: any;
  let processOnMock: any;
  let eventEmitter: EventEmitter;

  beforeEach(() => {
    vi.clearAllMocks();
    eventEmitter = new EventEmitter();

    processExitMock = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
    processOnMock = vi.spyOn(process, "on").mockImplementation((event, handler) => {
      eventEmitter.on(event, handler as any);
      return process;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("initializes all services with shared dependencies", async () => {
    await import("../monolith.js");
    await new Promise((resolve) => process.nextTick(resolve));

    // 4. Verify calls directly on the imported (now mocked) functions
    expect(initializePipeline).toHaveBeenCalledOnce();
    expect(initializeWorker).toHaveBeenCalledOnce();
    expect(initializeServer).toHaveBeenCalledOnce();

    // 5. Verify Dependency Injection
    const pipelineArgs = vi.mocked(initializePipeline).mock.calls[0][0];
    const workerArgs = vi.mocked(initializeWorker).mock.calls[0][0];
    const serverArgs = vi.mocked(initializeServer).mock.calls[0][0];

    expect(pipelineArgs.eventBus).toBeDefined();
    expect(workerArgs.eventBus).toBe(pipelineArgs.eventBus);
    expect(serverArgs.eventBus).toBe(pipelineArgs.eventBus);
  });

  it("executes graceful teardown on SIGTERM", async () => {
    await import("../monolith.js");

    expect(initializePipeline).toHaveBeenCalledOnce();
    expect(initializeWorker).toHaveBeenCalledOnce();
    expect(initializeServer).toHaveBeenCalledOnce();

    eventEmitter.emit("SIGTERM");

    // await new Promise((resolve) => setImmediate(resolve));
    // expect(vi.spyOn(process, "on")).toHaveBeenCalledWith("SIGTERM", expect.any(Function));

    // expect(vi.spyOn(process, "on")).toHaveBeenCalledWith("SIGTERM", expect.any(Function));

    // await new Promise((resolve) => setImmediate(resolve));

    expect(mockStopServer).toHaveBeenCalledOnce();
    expect(mockStopPipeline).toHaveBeenCalledOnce();
    expect(mockStopWorker).toHaveBeenCalledOnce();

    await vi.waitFor(
      () => {
        expect(processExitMock).toHaveBeenCalledWith(0);
      },
      { timeout: 20000, interval: 50 },
    );
  });

  it("shares a single InMemoryEventBus across all domains", async () => {
    // 1. Re-import the mocked functions to ensure we are looking at the right references
    const { initializeServer } = await import("#server/index.js");
    const { initializePipeline } = await import("#pipeline/index.js");

    await import("../monolith.js");
    await new Promise((resolve) => process.nextTick(resolve));

    const serverBus = vi.mocked(initializeServer).mock.calls[0][0].eventBus;
    const pipelineBus = vi.mocked(initializePipeline).mock.calls[0][0].eventBus;

    // 2. Instead of toBeInstanceOf (which is brittle with mocks),
    // verify it's the expected object structure or identity
    expect(serverBus).toBeDefined();

    // 3. The core logic: identity equality proves it's the same singleton instance
    expect(serverBus).toBe(pipelineBus);

    // 4. If you really need to check the type, check the mock name or a specific method
    expect(serverBus.subscribeToPipelineEvents).toBeDefined();
  });
});
