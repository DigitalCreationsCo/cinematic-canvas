import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scanForInterrupt } from '#pipeline/helpers/interrupts.js';
import { generateId } from '#shared/utils/id.js';
import { createMockInterruptValue } from '#shared/mocks/mock-interrupt.js';
import { WorkflowState } from '#shared/types/workflow.types.ts';

describe('Interrupt Handling System', () => {

    describe('checkAndPublishInterruptFromSnapshot', () => {
        // const mockGetState = vi.fn(() => ({
        //     values: {},
        //     tasks: []
        // })) as any;
        // const mockCompiledGraph = {
        //     getState: mockGetState
        // };

        const mockPublishEvent = vi.fn();

        const projectId = generateId();
        const packet = {
            projectId,
            worldId: generateId(),
            teamId: generateId(),
            userId: generateId()
        };

        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('should detect interrupt in state.values.__interrupt__', async () => {

            const interruptValue = createMockInterruptValue();

            const workflowState = {
                __interrupt__: [{ value: interruptValue }],
                __interrupt_resolved__: false
            } as WorkflowState;

            await scanForInterrupt(
                packet,
                workflowState,
                mockPublishEvent
            );

            expect(mockPublishEvent).toHaveBeenCalledTimes(1);
            expect(mockPublishEvent).toHaveBeenCalledWith(expect.objectContaining({
                type: 'LLM_INTERVENTION_NEEDED',
                projectId,
                payload: expect.objectContaining({
                    error: 'Test error',
                    nodeName: 'testNode'
                })
            }));
        });

        it('should not publish if interrupt is already resolved', async () => {
            const interruptValue = createMockInterruptValue();

            const workflowState = {
                __interrupt__: [{ value: interruptValue }],
                __interrupt_resolved__: true
            } as WorkflowState;

            await scanForInterrupt(
                packet,
                workflowState,
                mockPublishEvent
            );

            expect(mockPublishEvent).not.toHaveBeenCalled();
        });

        it('should not publish event when no interrupt exists', async () => {

            const workflowState = {
                __interrupt__: [] as any,
                __interrupt_resolved__: false
            } as WorkflowState;

            await scanForInterrupt(
                packet,
                workflowState,
                mockPublishEvent
            );

            expect(mockPublishEvent).not.toHaveBeenCalled();
        });
    });

    // describe('mergeParamsIntoState', () => {
    //     it('should spread currentState and params into updates', () => {
    //         const currentState: any = {
    //             scenePromptOverrides: { 1: 'old prompt' },
    //             enhancedPrompt: 'old'
    //         };
    //         const params = { sceneId: '2', promptModification: 'new prompt' };
    //         const updates = mergeParamsIntoState(currentState, params);
    //         expect(updates.).toEqual({ 1: 'old prompt' });
    //         expect(updates.sceneId).toBe('2');
    //         expect(updates.promptModification).toBe('new prompt');
    //     });

    //     it('should override with params when provided', () => {
    //         const currentState: any = { enhancedPrompt: 'old' };
    //         const params = { enhancedPrompt: 'new' };
    //         const updates = mergeParamsIntoState(currentState, params);
    //         expect(updates.enhancedPrompt).toEqual('new');
    //     });
    // });
});
