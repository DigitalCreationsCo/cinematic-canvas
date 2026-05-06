import { InterruptValue } from "#shared/types/workflow.types.js";

export const createMockInterruptValue = (interruptValue?: Partial<InterruptValue>): InterruptValue => ({
    type: 'lm_intervention',
    error: 'Test error',
    functionName: 'testFunction',
    nodeName: 'testNode',
    params: {
        key: 'value',
        projectId: '1',
        lastAttemptTimestamp: new Date()
    },
    attempts: 1,
    maxRetries: 3,
    projectId: '1',
    lastAttemptTimestamp: new Date().toISOString(),
    ...interruptValue
});