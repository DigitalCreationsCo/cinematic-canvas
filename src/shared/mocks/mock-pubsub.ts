import { vi, type Mock } from "vitest";

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

vi.mock("@google-cloud/pubsub", () => {
  return {
    PubSub: class {
      constructor() {
        return mockPubSub;
      }
    },
  };
});

export const mockSubscription = {
  on: vi.fn(),
  delete: vi.fn().mockResolvedValue(true),
  name: "test-sub",
  get: vi.fn().mockResolvedValue([{}]),
  pull: vi.fn().mockResolvedValue([{ ackId: "1", message: { data: Buffer.from("{}"), attributes: {} } }]),
  exists: vi.fn().mockResolvedValue([false]),
  close: vi.fn().mockResolvedValue(true),
};

export const mockTopic = {
  create: vi.fn().mockResolvedValue(true),
  createSubscription: vi.fn().mockResolvedValue([mockSubscription]),
  name: "test-topic",
  publish: vi.fn().mockResolvedValue(["message-id"]),
  get: vi.fn().mockResolvedValue([{}]),
  exists: vi.fn().mockResolvedValue([false]),
};

export const mockPubSub = {
  topic: vi.fn(() => mockTopic),
  subscription: vi.fn(() => mockSubscription),
  close: vi.fn().mockResolvedValue(true),
  publishMessage: vi.fn().mockResolvedValue("mock-msg-id"),
};
