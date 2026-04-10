// __tests__/monolith.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { InMemoryEventBus } from '../shared/messaging/event-bus.js';


// 1. Hoist mocks before imports
vi.mock('../src/shared/logger/index.js', () => ({ initLogger: vi.fn() }));
vi.mock('../src/shared/db/index.js', () => ({
    getPool: vi.fn(() => ({ end: vi.fn() })),
    initializeDatabase: vi.fn(),
}));
vi.mock('../src/shared/services/pool-manager.js', () => ({
    PoolManager: vi.fn().mockImplementation(() => ({ close: vi.fn() }))
}));
vi.mock('../src/shared/services/lock-manager.js', () => ({
    DistributedLockManager: vi.fn().mockImplementation(() => ({ close: vi.fn() }))
}));
vi.mock('../src/shared/messaging/event-bus.js', () => ({
    InMemoryEventBus: vi.fn().mockImplementation(() => ({ close: vi.fn() }))
}));

// Mock the initializers to return dummy stop functions
const mockStopServer = vi.fn();
const mockStopPipeline = vi.fn();
const mockStopWorker = vi.fn();

vi.mock('../src/server/index.js', () => ({
    initializeServer: vi.fn().mockResolvedValue({ stop: mockStopServer })
}));
vi.mock('../src/pipeline/index.js', () => ({
    initializePipeline: vi.fn().mockResolvedValue({ stop: mockStopPipeline })
}));
vi.mock('../src/worker/index.js', () => ({
    initializeWorker: vi.fn().mockResolvedValue({ stop: mockStopWorker })
}));

import { initializeServer } from '../server/index.js';
import { initializePipeline } from '../pipeline/index.js';
import { initializeWorker } from '../worker/index.js';

describe('Monolithic Boot Sequence', () => {
    let processExitMock: any;
    let processOnMock: any;
    let eventEmitter: EventEmitter;

    beforeEach(() => {
        vi.clearAllMocks();
        eventEmitter = new EventEmitter();

        processExitMock = vi.spyOn(process, 'exit').mockImplementation((() => { }) as any);
        processOnMock = vi.spyOn(process, 'on').mockImplementation((event, handler) => {
            eventEmitter.on(event, handler as any);
            return process;
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('initializes all services with shared dependencies', async () => {
        // Dynamic import to execute the monolith script
        await import('../monolith.js');

        // Yield to microtask queue to allow async bootstrap to finish
        await new Promise(process.nextTick);

        expect(initializePipeline).toHaveBeenCalledOnce();
        expect(initializeWorker).toHaveBeenCalledOnce();
        expect(initializeServer).toHaveBeenCalledOnce();

        // Verify DI: Ensure the SAME eventBus is passed to all three
        const pipelineArgs = vi.mocked(initializePipeline).mock.calls[0][0];
        const workerArgs = vi.mocked(initializeWorker).mock.calls[0][0];
        const serverArgs = vi.mocked(initializeServer).mock.calls[0][0];

        expect(pipelineArgs.eventBus).toBeDefined();
        expect(workerArgs.eventBus).toBe(pipelineArgs.eventBus);
        expect(serverArgs.eventBus).toBe(pipelineArgs.eventBus);

        // Verify DI: Shared Pool and Locks
        expect(workerArgs.poolManager).toBe(pipelineArgs.poolManager);
        expect(workerArgs.lockManager).toBe(pipelineArgs.lockManager);
    });

    it('executes graceful teardown on SIGTERM', async () => {
        await import('../monolith.js');
        await new Promise(process.nextTick);

        // Trigger the signal
        eventEmitter.emit('SIGTERM');
        await new Promise(process.nextTick); // Wait for async teardown

        expect(mockStopServer).toHaveBeenCalledOnce();
        expect(mockStopPipeline).toHaveBeenCalledOnce();
        expect(mockStopWorker).toHaveBeenCalledOnce();
        expect(processExitMock).toHaveBeenCalledWith(0);
    });
});

vi.mock('../src/server/index.js', () => ({
    initializeServer: vi.fn().mockResolvedValue({ stop: vi.fn() })
}));
vi.mock('../src/pipeline/index.js', () => ({
    initializePipeline: vi.fn().mockResolvedValue({ stop: vi.fn() })
}));

describe('Monolith Mode Bootup & Event Logic', () => {
    it('shares a single InMemoryEventBus across all domains', async () => {
        const { initializeServer } = await import('../server/index.js');
        const { initializePipeline } = await import('../pipeline/index.js');

        // In monolith.ts, these are called with the same bus instance
        // We verify the singleton nature here
        await import('../monolith.js');

        const serverBus = vi.mocked(initializeServer).mock.calls[0][0].eventBus;
        const pipelineBus = vi.mocked(initializePipeline).mock.calls[0][0].eventBus;

        expect(serverBus).toBeInstanceOf(InMemoryEventBus);
        expect(serverBus).toBe(pipelineBus);
    });

    it('InMemoryEventBus correctly routes events to named subscriptions', async () => {
        const bus = new InMemoryEventBus();
        const handler = vi.fn().mockResolvedValue(undefined);
        const subName = 'test-subscription-123';

        await bus.subscribeToPipelineEvents(subName, handler);

        await bus.publishPipelineEvent({ type: 'SCENE_GENERATED', projectId: 'p1' } as any);

        // Yield to allow setImmediate to fire
        await new Promise(res => setImmediate(res));

        expect(handler).toHaveBeenCalledOnce();

        // Verify surgical unsubscribe using the name
        await bus.unsubscribe(subName);
        await bus.publishPipelineEvent({ type: 'SCENE_GENERATED', projectId: 'p1' } as any);
        await new Promise(res => setImmediate(res));

        expect(handler).toHaveBeenCalledOnce(); // Should not have increased
    });
});