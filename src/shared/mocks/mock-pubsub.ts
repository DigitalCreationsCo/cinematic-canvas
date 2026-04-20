import { vi, type Mock } from 'vitest';

export interface MockSubscription {
    on: Mock;
    delete: Mock;
    name: string;
    get: Mock;
    pull: Mock;
}

export interface MockTopic {
    create: Mock;
    createSubscription: Mock;
    name: string;
    publish: Mock;
    get: Mock;
}

export interface MockPubSub {
    topic: Mock;
    subscription: Mock;
    close: Mock;
}

export const createMockPubSub = (): { mockPubSub: MockPubSub; mockSubscription: MockSubscription; mockTopic: MockTopic } => {
    const mockSubscription: MockSubscription = {
        on: vi.fn(),
        delete: vi.fn().mockResolvedValue(true),
        name: 'test-sub',
        get: vi.fn().mockResolvedValue([{}]),
        pull: vi.fn().mockResolvedValue([{ ackId: '1', message: { data: Buffer.from('{}'), attributes: {} } }]),
    };

    const mockTopic: MockTopic = {
        create: vi.fn().mockResolvedValue(true),
        createSubscription: vi.fn().mockResolvedValue([mockSubscription]),
        name: 'test-topic',
        publish: vi.fn().mockResolvedValue(['message-id']),
        get: vi.fn().mockResolvedValue([{}]),
    };

    const mockPubSub: MockPubSub = {
        topic: vi.fn(() => mockTopic),
        subscription: vi.fn(() => mockSubscription),
        close: vi.fn().mockResolvedValue(true),
    };

    return { mockPubSub, mockSubscription, mockTopic };
};

export const setupPubSubMock = () => {
    const { mockPubSub, mockSubscription, mockTopic } = createMockPubSub();

    vi.mock('@google-cloud/pubsub', () => ({
        PubSub: vi.fn(() => mockPubSub),
    }));

    return { mockPubSub, mockSubscription, mockTopic };
};