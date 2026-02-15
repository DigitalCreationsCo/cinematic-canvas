import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Storage } from "@google-cloud/storage";
import { PubSub } from "@google-cloud/pubsub";
import * as db from "../../shared/db/index.js";
import { registerRoutes } from "../routes.js";
import * as http from "http";
import { initializeServer } from "../index.js";

// Use vi.hoisted to ensure these are defined before the module is loaded and before the mocks
const { mockBucket, mockStorageInstance, mockTopic, mockSubscription, mockPubSubInstance } = vi.hoisted(() => {
  console.log("HOISTED: Defining mocks");
  return {
    mockBucket: {
      exists: vi.fn().mockResolvedValue([true])
    },
    mockStorageInstance: {
      bucket: vi.fn()
    },
    mockTopic: {
      exists: vi.fn().mockResolvedValue([true]),
      create: vi.fn().mockResolvedValue({})
    },
    mockSubscription: {
      exists: vi.fn().mockResolvedValue([true])
    },
    mockPubSubInstance: {
      topic: vi.fn(),
      subscription: vi.fn()
    }
  };
});

// Setup the instance mocks
mockStorageInstance.bucket.mockReturnValue(mockBucket);
mockPubSubInstance.topic.mockReturnValue(mockTopic);
mockPubSubInstance.subscription.mockReturnValue(mockSubscription);

console.log("TEST FILE: Setting up vi.mock");

vi.mock("@google-cloud/storage", () => {
  console.log("MOCK: @google-cloud/storage factory called");
  return {
    Storage: vi.fn().mockImplementation(() => {
      console.log("MOCK: Storage constructor called");
      return mockStorageInstance;
    })
  };
});

vi.mock("@google-cloud/pubsub", () => {
  console.log("MOCK: @google-cloud/pubsub factory called");
  return {
    PubSub: vi.fn().mockImplementation(() => {
      console.log("MOCK: PubSub constructor called");
      return mockPubSubInstance;
    })
  };
});

vi.mock("../../shared/db/index.js");
vi.mock("../routes.js");
vi.mock("../shared/logger/index.js", () => ({
  initLogger: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}));
vi.mock("../vite.js", () => ({
  setupVite: vi.fn()
}));

describe('Server Initialization', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
    process.env.GOOGLE_CLOUD_BUCKET = 'test-bucket';
    process.env.NODE_ENV = 'test';
    
    // Default mocks
    (db.getPool as any).mockReturnValue({});
    (db.initializeDatabase as any).mockResolvedValue({});
    (registerRoutes as any).mockResolvedValue({});
  });

  it('should initialize successfully when all resources exist', async () => {
    const server = await initializeServer();
    expect(server).toBeDefined();
    expect(db.initializeDatabase).toHaveBeenCalled();
    expect(registerRoutes).toHaveBeenCalled();
    server.close();
  });

  it('should throw error if GOOGLE_CLOUD_PROJECT is missing', async () => {
    delete process.env.GOOGLE_CLOUD_PROJECT;
    await expect(initializeServer()).rejects.toThrow("FATAL: GOOGLE_CLOUD_PROJECT was not provided");
  });

  it('should throw error if bucket does not exist', async () => {
    mockBucket.exists.mockResolvedValueOnce([false]);
    await expect(initializeServer()).rejects.toThrow('FATAL: GCS Bucket "test-bucket" does not exist');
  });

  it('should create PubSub topics if they do not exist', async () => {
    mockTopic.exists.mockResolvedValueOnce([false]);
    const server = await initializeServer();
    expect(mockTopic.create).toHaveBeenCalled();
    server.close();
  });
});
