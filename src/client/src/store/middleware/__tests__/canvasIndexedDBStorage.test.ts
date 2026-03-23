/// <reference types="vitest/globals" />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    debouncedPersistLayout,
    clearDebounce,
    flushPendingPersist,
    resetStorage,
} from '../canvasIndexedDBStorage.js';

// Mock the hybridNodeStorage module
vi.mock('../../../services/hybridNodeStorage.js', () => {
    const mockUpsert = vi.fn().mockResolvedValue({ success: true, newVersions: {} });
    const mockStorage = {
        upsert: mockUpsert,
        isCloudSyncEnabled: () => false,
    };
    return {
        getHybridNodeStorage: () => mockStorage,
        HybridNodeStorage: vi.fn(() => mockStorage),
        OCCConflictError: class extends Error {
            entityId: string;
            clientVersion: number;
            serverVersion: number;
            constructor(entityId: string, clientVersion: number, serverVersion: number) {
                super(`OCC conflict`);
                this.name = 'OCCConflictError';
                this.entityId = entityId;
                this.clientVersion = clientVersion;
                this.serverVersion = serverVersion;
            }
        },
    };
});

vi.mock('../../../lib/supabase.js', () => ({
    supabase: {},
}));

// Mock useNodeStore to prevent import errors
vi.mock('../../useNodeStore.js', () => ({
    useNodeStore: {
        getState: () => ({
            nodes: [],
            updateNodeData: vi.fn(),
        }),
    },
}));

const createMockNodes = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
        id: `node-${i}`,
        type: 'scene',
        position: { x: i * 100, y: i * 100 },
        width: 200,
        height: 150,
        data: {
            entityId: `node-${i}`,
            contextId: 'project-1',
            contextType: 'project' as const,
            scope: 'project',
            isLocked: false,
            pipelineSelected: false,
            collapsed: false,
            idxVersion: 1,
            nodeTypeFlag: undefined,
        },
    }));

describe('canvasIndexedDBStorage', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        clearDebounce();
        resetStorage();
    });

    afterEach(() => {
        vi.useRealTimers();
        clearDebounce();
        resetStorage();
    });

    describe('flushPendingPersist', () => {
        it('should be a no-op when no pending persist exists', () => {
            // Should not throw and should return silently
            flushPendingPersist();
        });

        it('should flush pending persist immediately', async () => {
            const nodes = createMockNodes(2);
            const onResult = vi.fn();

            // Start a debounced persist — it won't fire for 1300ms
            debouncedPersistLayout(nodes as any, 'project-1', 'project', onResult);

            // Flush immediately — should NOT wait for debounce
            flushPendingPersist();

            // Allow microtasks (async executePersist) to complete
            await vi.runAllTimersAsync();
            // Extra tick for fire-and-forget promise resolution
            await new Promise(r => setTimeout(r, 0));
            await vi.runAllTimersAsync();

            // onResult should have been called (persist was executed)
            expect(onResult).toHaveBeenCalledWith(
                expect.objectContaining({ success: true })
            );
        });

        it('should clear the debounce timer when flushing', () => {
            const nodes = createMockNodes(1);

            debouncedPersistLayout(nodes as any, 'project-1', 'project');

            // Flush clears the timer
            flushPendingPersist();

            // A subsequent flush should be a no-op (no pending persist)
            flushPendingPersist();
        });

        it('should use the latest pending payload when flushed', async () => {
            const nodesFirst = createMockNodes(1);
            const nodesSecond = createMockNodes(3);
            const onResultFirst = vi.fn();
            const onResultSecond = vi.fn();

            // Schedule two debounced persists — second should overwrite first
            debouncedPersistLayout(nodesFirst as any, 'project-1', 'project', onResultFirst);
            debouncedPersistLayout(nodesSecond as any, 'project-1', 'project', onResultSecond);

            // Flush — should use the latest (nodesSecond)
            flushPendingPersist();

            await vi.runAllTimersAsync();
            await new Promise(r => setTimeout(r, 0));
            await vi.runAllTimersAsync();

            // Only the second onResult should fire (first was overwritten)
            expect(onResultFirst).not.toHaveBeenCalled();
            expect(onResultSecond).toHaveBeenCalledWith(
                expect.objectContaining({ success: true })
            );
        });
    });

    describe('clearDebounce', () => {
        it('should cancel pending debounce and clear pending args', () => {
            const nodes = createMockNodes(1);
            const onResult = vi.fn();

            debouncedPersistLayout(nodes as any, 'project-1', 'project', onResult);
            clearDebounce();

            // Advance timers — persist should NOT fire
            vi.advanceTimersByTime(2000);

            expect(onResult).not.toHaveBeenCalled();

            // Flush should also be a no-op after clear
            flushPendingPersist();
        });
    });

    describe('debouncedPersistLayout', () => {
        it('should debounce persist calls', async () => {
            const nodes = createMockNodes(1);
            const onResult = vi.fn();

            debouncedPersistLayout(nodes as any, 'project-1', 'project', onResult);

            // Before debounce fires
            expect(onResult).not.toHaveBeenCalled();

            // Advance to trigger debounce
            await vi.advanceTimersByTimeAsync(1400);
            // Allow the async executePersist to resolve
            await new Promise(r => setTimeout(r, 0));
            await vi.runAllTimersAsync();

            expect(onResult).toHaveBeenCalledTimes(1);
        });
    });
});
