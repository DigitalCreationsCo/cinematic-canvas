import { TagRegistryService } from "#shared/services/tag-registry.js";
import { Mocked, vi } from "vitest";

export const createMockTagRegistry = (): Mocked<TagRegistryService> => ({
    verifyHandleAccessBulk: vi.fn(),
    getHydrationPayloadsBulk: vi.fn(),
    normalizeHandle: vi.fn(),
    registerHandle: vi.fn(),
    unregisterHandle: vi.fn(),
    getHandle: vi.fn(),
    getHandlesForProject: vi.fn(),
    getAccessibleHandles: vi.fn(),
    getEntityDisplayData: vi.fn(),
    getEntityAvatarUrl: vi.fn(),
} as unknown as Mocked<TagRegistryService>);

