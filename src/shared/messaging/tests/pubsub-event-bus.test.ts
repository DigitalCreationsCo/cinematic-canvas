// __tests__/pubsub-event-bus.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PubSubEventBus } from '../pubsub-event-bus.ts';
import { InMemoryEventBus } from '../event-bus.ts';
import { setupPubSubMock } from '../../mocks/mock-pubsub.js';

setupPubSubMock();

describe('PubSubEventBus', () => {
    it('tracks and deletes temporary subscriptions on close()', async () => {
        const bus = new PubSubEventBus('test-project');

        await bus.subscribeToCommands('temp-sub', vi.fn(), { temporary: true });
        await bus.subscribeToCommands('perm-sub', vi.fn()); // no temporary flag

        await bus.close();

        // Verify the underlying PubSub SDK was called to delete the tracked subscription
        const mockPubSubInstance = vi.mocked((bus as any).pubsub);
        const mockSubscription = mockPubSubInstance.subscription();

        // It should only delete the temporary one
        expect(mockSubscription.delete).toHaveBeenCalledTimes(1);
        expect(mockPubSubInstance.close).toHaveBeenCalledTimes(1);
    });
});

describe('InMemoryEventBus (Monolith Engine)', () => {
    let bus: InMemoryEventBus;

    beforeEach(() => {
        bus = new InMemoryEventBus();
    });

    it('supports multiple unique subscriptions to the same topic', async () => {
        const handlerA = vi.fn().mockResolvedValue(undefined);
        const handlerB = vi.fn().mockResolvedValue(undefined);

        await bus.subscribeToCommands('sub-a', handlerA);
        await bus.subscribeToCommands('sub-b', handlerB);

        await bus.publishCommand({ type: 'START_PIPELINE' } as any);
        await new Promise(res => setImmediate(res));

        expect(handlerA).toHaveBeenCalled();
        expect(handlerB).toHaveBeenCalled();
    });

    it('prevents duplicate handlers for the same subscription name', async () => {
        const handler = vi.fn().mockResolvedValue(undefined);

        await bus.subscribeToCommands('fixed-name', handler);
        await bus.subscribeToCommands('fixed-name', handler);

        await bus.publishCommand({ type: 'TEST' } as any);
        await new Promise(res => setImmediate(res));

        // Should only trigger once even if subscribe was called twice
        expect(handler).toHaveBeenCalledOnce();
    });

    it('handles async errors without crashing the bus', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        const failingHandler = vi.fn().mockRejectedValue(new Error('Boom'));

        await bus.subscribeToCommands('error-sub', failingHandler);
        await bus.publishCommand({ type: 'TEST' } as any);

        await new Promise(res => setImmediate(res));

        expect(failingHandler).toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('Handler error'),
            expect.any(Error)
        );
    });
});