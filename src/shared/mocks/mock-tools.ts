import { type TextModelController } from "#shared/lm/text-model-controller.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { createMockProjectRepository } from "#shared/mocks/mock-db.js";
import { createMockJob } from "#shared/mocks/mock-jobs.js";
import { createMockTextModel } from "#shared/mocks/mock-model.js";
import { createMockStorageManager } from "#shared/mocks/mock-storage-manager.js";
import { RetryStrategy } from "#shared/types/job.types.js";
import { generateId } from "#shared/utils/id.js";

export const createMockToolContext = (overrides?: Partial<ToolContext<TextModelController>>): Required<ToolContext<TextModelController>> => ({
    provider: createMockTextModel(),
    storageManager: createMockStorageManager(),
    console: console,
    projectRepository: createMockProjectRepository(),
    safetyRetries: 3,
    traceId: "trace-id",
    projectId: generateId(),
    options: {},
    saveAssets: () => Promise.resolve(),
    incrementAttempt: (error: string, strategy: RetryStrategy) => Promise.resolve(createMockJob()),
    sendEntityUpdate: () => Promise.resolve(),
    ...overrides
})