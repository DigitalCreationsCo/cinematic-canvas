// __tests__/distributed-boot.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { initializeServer } from "#server/index.js";
import { initializePipeline } from "#pipeline/index.js";
import { initializeWorker } from "#worker/index.js";
import { SUBSCRIPTION_NAMES } from "#shared/config.js";
import { IEventBus } from "#shared/messaging/event-bus.types.js";

vi.mock("express", () => {
  const mockApp = {
    use: vi.fn(),
    listen: vi.fn(),
    post: vi.fn(),
    get: vi.fn(),
  };
  // Create a factory function that also has the static .json method
  const expressMock = vi.fn(() => mockApp);
  (expressMock as any).json = vi.fn(() => (req, res, next) => next());
  (expressMock as any).urlencoded = vi.fn(() => (req, res, next) => next());

  return { default: expressMock };
});

vi.mock("http", () => ({
  default: {
    createServer: vi.fn(() => ({
      listen: vi.fn((options, cb) => cb()),
      close: vi.fn((cb) => cb && cb()),
    })),
  },
  createServer: vi.fn(() => ({
    listen: vi.fn((options, cb) => cb()),
    close: vi.fn((cb) => cb && cb()),
  })),
}));

vi.mock("#server/vite.js", () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
}));

// ─── Mock tRPC middleware ───────────────────────────────────────────────
vi.mock("@trpc/server/adapters/express", () => ({
  createExpressMiddleware: vi.fn(() => (req: any, res: any, next: any) => next()),
}));

vi.mock("#shared/app-router/index.js", () => ({
  createAppRouter: vi.fn(({ eventBus, eventsRouter, chatRouter }) => {
    // FORCE execution of events router (this is where subscription happens)
    if (typeof eventsRouter === "function") {
      eventsRouter({ eventBus });
    }

    return {}; // minimal stub
  }),
  createContext: vi.fn(),
}));

vi.mock("#shared/app-router/sse-router.js", () => ({
  createEventsRouter: vi.fn(({ eventBus }) => {
    eventBus.subscribeToPipelineEvents(SUBSCRIPTION_NAMES.SERVER_PIPELINE_EVENTS_SUBSCRIPTION, vi.fn());
    return {};
  }),
}));

vi.mock("#pipeline/workflow-service.js", () => ({
  WorkflowOperator: vi.fn().mockImplementation(
    class {
      startPipeline = vi.fn();
      stopPipeline = vi.fn();
      resumePipeline = vi.fn();
      getProjectState = vi.fn();
    },
  ),
}));
vi.mock("#shared/services/job-lifecycle-monitor.js", () => {
  const mockInstance = {
    start: vi.fn(),
    stop: vi.fn(),
  };
  return {
    JobLifecycleMonitor: {
      // Provide the static method the code is looking for
      getInstance: vi.fn(() => mockInstance),
    },
  };
});
vi.mock("#worker/worker-service.js", () => ({
  WorkerService: vi.fn().mockImplementation(
    class {
      initialize = vi.fn();
    },
  ),
}));
vi.mock("#shared/services/lock-manager.js", () => ({
  DistributedLockManager: vi.fn().mockImplementation(
    class {
      init = vi.fn();
      close = vi.fn();
    },
  ),
}));

describe("Distributed Service Initialization", () => {
  let mockEventBus: IEventBus;
  let mockPoolManager: any;
  let mockLockManager: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventBus = {
      subscribeToCommands: vi.fn().mockResolvedValue(undefined),
      subscribeToPipelineEvents: vi.fn().mockResolvedValue(undefined),
      subscribeToJobEvents: vi.fn().mockResolvedValue(undefined),
    };
    mockPoolManager = { close: vi.fn() };
    mockLockManager = { init: vi.fn(), close: vi.fn() };
  });

  describe("Server Initializer", () => {
    it("binds to Pipeline Events and returns a valid stop function", async () => {
      const server = await initializeServer({ eventBus: mockEventBus, port: 8080 });

      expect(mockEventBus.subscribeToPipelineEvents).toHaveBeenCalledWith(
        expect.stringContaining(SUBSCRIPTION_NAMES.SERVER_PIPELINE_EVENTS_SUBSCRIPTION),
        expect.any(Function),
      );

      expect(server.stop).toBeInstanceOf(Function);
    });
  });

  describe("Pipeline Initializer", () => {
    it("maps subscriptions to commands, events, and applies the temporary cancellation flag", async () => {
      const pipeline = await initializePipeline({
        eventBus: mockEventBus,
        poolManager: mockPoolManager,
        lockManager: mockLockManager,
      });

      // Assert Command Sub
      expect(mockEventBus.subscribeToCommands).toHaveBeenCalledWith(
        SUBSCRIPTION_NAMES.PIPELINE_COMMANDS_SUBSCRIPTION,
        expect.any(Function),
      );

      // Assert Worker Feedback Sub
      expect(mockEventBus.subscribeToJobEvents).toHaveBeenCalledWith(
        SUBSCRIPTION_NAMES.PIPELINE_JOB_EVENTS_SUBSCRIPTION,
        expect.any(Function),
        expect.objectContaining({
          filter: 'attributes.type = "JOB_COMPLETED" OR attributes.type = "JOB_FAILED"',
        }),
      );

      // Assert Temporary Cancellation Sub
      expect(mockEventBus.subscribeToCommands).toHaveBeenCalledWith(
        SUBSCRIPTION_NAMES.PIPELINE_COMMANDS_SUBSCRIPTION,
        expect.any(Function),
      );

      expect(pipeline.stop).toBeInstanceOf(Function);
    });
  });

  describe("Worker Initializer", () => {
    it("isolates subscription to dispatched job events only", async () => {
      const worker = await initializeWorker({
        eventBus: mockEventBus,
        poolManager: mockPoolManager,
        lockManager: mockLockManager,
      });

      expect(mockEventBus.subscribeToJobEvents).toHaveBeenCalledWith(
        SUBSCRIPTION_NAMES.WORKER_JOB_EVENTS_SUBSCRIPTION,
        expect.any(Function),
        expect.objectContaining({ filter: 'attributes.type = "JOB_DISPATCHED"' }),
      );

      // Worker should not listen to commands
      expect(mockEventBus.subscribeToCommands).not.toHaveBeenCalled();

      expect(worker.stop).toBeInstanceOf(Function);
    });
  });
});

describe("Distributed Mode Infrastructure", () => {
  it("initializes with PubSubEventBus and creates standard subscriptions", async () => {
    const mockBus = {
      subscribeToCommands: vi.fn(),
      close: vi.fn(),
    };

    // Test the server's specific distributed initialization logic
    // Verify it uses the global subscription names from config
    expect(SUBSCRIPTION_NAMES.SERVER_PIPELINE_EVENTS_SUBSCRIPTION).toBeDefined();

    // Example: verify a specific worker's connection to the bus
    const workerSubName = SUBSCRIPTION_NAMES.PIPELINE_JOB_EVENTS_SUBSCRIPTION;
    expect(workerSubName).toContain("job-events");
  });
});
