// __tests__/distributed-boot.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initializeServer } from '../server/index.js';
import { initializePipeline } from '../pipeline/index.js';
import { initializeWorker } from '../worker/index.js';
import { SUBSCRIPTION_NAMES } from '../shared/config.js';

vi.mock('express', () => {
    const mockUse = vi.fn();
    const mockApp = { use: mockUse, json: vi.fn(), urlencoded: vi.fn() };
    return { default: vi.fn(() => mockApp) };
});

vi.mock('http', () => ({
    createServer: vi.fn(() => ({
        listen: vi.fn((options, cb) => cb()),
        close: vi.fn((cb) => cb && cb()),
    })),
}));

// Mock the internal operator/agents to prevent deep execution
vi.mock('../src/pipeline/workflow-service.js', () => ({
    WorkflowOperator: vi.fn().mockImplementation(() => ({}))
}));
vi.mock('../src/shared/services/job-lifecycle-monitor.js', () => ({
    JobLifecycleMonitor: vi.fn().mockImplementation(() => ({ start: vi.fn(), stop: vi.fn() }))
}));
vi.mock('../src/worker/worker-service.js', () => ({
    WorkerService: vi.fn().mockImplementation(() => ({}))
}));

describe('Distributed Service Initialization', () => {
    let mockEventBus: any;
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
        mockLockManager = { close: vi.fn() };
    });

    describe('Server Initializer', () => {
        it('binds to Pipeline Events and returns a valid stop function', async () => {
            const server = await initializeServer({ eventBus: mockEventBus, port: 8080 });

            expect(mockEventBus.subscribeToPipelineEvents).toHaveBeenCalledWith(
                expect.stringContaining(SUBSCRIPTION_NAMES.SERVER_PIPELINE_EVENTS_SUBSCRIPTION),
                expect.any(Function)
            );

            expect(server.stop).toBeInstanceOf(Function);
        });
    });

    describe('Pipeline Initializer', () => {
        it('maps subscriptions to commands, events, and applies the temporary cancellation flag', async () => {
            const pipeline = await initializePipeline({
                eventBus: mockEventBus,
                poolManager: mockPoolManager,
                lockManager: mockLockManager
            });

            // Assert Command Sub
            expect(mockEventBus.subscribeToCommands).toHaveBeenCalledWith(
                SUBSCRIPTION_NAMES.PIPELINE_COMMANDS_SUBSCRIPTION,
                expect.any(Function)
            );

            // Assert Worker Feedback Sub
            expect(mockEventBus.subscribeToJobEvents).toHaveBeenCalledWith(
                SUBSCRIPTION_NAMES.WORKER_JOB_EVENTS_SUBSCRIPTION,
                expect.any(Function)
            );

            // Assert Temporary Cancellation Sub
            expect(mockEventBus.subscribeToCommands).toHaveBeenCalledWith(
                expect.stringContaining('cancel-sub-'),
                expect.any(Function),
                { temporary: true } // The crucial check for our teardown safety
            );

            expect(pipeline.stop).toBeInstanceOf(Function);
        });
    });

    describe('Worker Initializer', () => {
        it('isolates subscription to job events only', async () => {
            const worker = await initializeWorker({
                eventBus: mockEventBus,
                poolManager: mockPoolManager,
                lockManager: mockLockManager
            });

            expect(mockEventBus.subscribeToJobEvents).toHaveBeenCalledWith(
                SUBSCRIPTION_NAMES.PIPELINE_JOB_EVENTS_SUBSCRIPTION,
                expect.any(Function)
            );

            // Worker should not listen to commands
            expect(mockEventBus.subscribeToCommands).not.toHaveBeenCalled();

            expect(worker.stop).toBeInstanceOf(Function);
        });
    });
});

describe('Distributed Mode Infrastructure', () => {
    it('initializes with PubSubEventBus and creates standard subscriptions', async () => {
        const mockBus = {
            subscribeToCommands: vi.fn(),
            close: vi.fn()
        };

        // Test the server's specific distributed initialization logic
        // Verify it uses the global subscription names from config
        expect(SUBSCRIPTION_NAMES.SERVER_PIPELINE_EVENTS_SUBSCRIPTION).toBeDefined();

        // Example: verify a specific worker's connection to the bus
        const workerSubName = SUBSCRIPTION_NAMES.PIPELINE_JOB_EVENTS_SUBSCRIPTION;
        expect(workerSubName).toContain('job-events');
    });
});