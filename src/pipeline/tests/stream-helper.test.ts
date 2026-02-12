import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleStream } from '../helpers/stream-helper.js';
import { WorkflowState } from '../../shared/types/index.js';

describe('handleStream', () => {
    const projectId = 'test-project';
    const commandName = 'test-command';
    const config = { signal: new AbortController().signal };
    const publishEvent = vi.fn().mockResolvedValue(undefined);

    const mockCompiledGraph = {
        stream: vi.fn(),
        getState: vi.fn(),
    } as any;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('emits WORKFLOW_COMPLETED on successful completion', async () => {
        const mockStream = (async function* () {
            yield [ 'values', { id: projectId } ];
        })();
        mockCompiledGraph.stream.mockResolvedValue(mockStream);

        await handleStream(projectId, mockCompiledGraph, null, config, commandName, publishEvent);

        expect(publishEvent).toHaveBeenCalledWith(expect.objectContaining({
            type: 'WORKFLOW_COMPLETED',
            projectId
        }));
    });

    it('skips WORKFLOW_COMPLETED on waiting interrupt', async () => {
        const mockStream = (async function* () {
            yield [ 'values', { 
                id: projectId,
                __interrupt__: [ { value: { error: JSON.stringify({ type: 'waiting_for_job' }) } } ]
            } ];
        })();
        mockCompiledGraph.stream.mockResolvedValue(mockStream);

        await handleStream(projectId, mockCompiledGraph, null, config, commandName, publishEvent);

        expect(publishEvent).not.toHaveBeenCalledWith(expect.objectContaining({
            type: 'WORKFLOW_COMPLETED'
        }));
    });

    it('emits WORKFLOW_COMPLETED after non-waiting interrupt (intervention)', async () => {
        const mockStream = (async function* () {
             // checkAndPublishInterruptFromStream will throw on this
            yield [ 'values', { 
                id: projectId,
                __interrupt__: [ { value: { error: JSON.stringify({ type: 'lm_intervention', error: 'User help needed' }) } } ]
            } ];
        })();
        mockCompiledGraph.stream.mockResolvedValue(mockStream);
        
        // Mock getState for the catch block
        mockCompiledGraph.getState.mockResolvedValue({
            values: {
                id: projectId,
                __interrupt__: [ { value: { error: JSON.stringify({ type: 'lm_intervention', error: 'User help needed' }) } } ]
            },
            next: ['intervention_node']
        });

        await handleStream(projectId, mockCompiledGraph, null, config, commandName, publishEvent);

        expect(publishEvent).toHaveBeenCalledWith(expect.objectContaining({
            type: 'LLM_INTERVENTION_NEEDED'
        }));
        
        expect(publishEvent).toHaveBeenCalledWith(expect.objectContaining({
            type: 'WORKFLOW_COMPLETED'
        }));
    });

    it('prevents duplicate WORKFLOW_COMPLETED events when both success and catch block try to emit', async () => {
        // Simulate a scenario where stream completes but then an error occurs
        // This could happen if the stream ends normally but getState throws
        const mockStream = (async function* () {
            yield [ 'values', { id: projectId } ];
        })();
        mockCompiledGraph.stream.mockResolvedValue(mockStream);
        
        // Mock getState to simulate an interrupt scenario that would trigger catch block
        mockCompiledGraph.getState.mockResolvedValue({
            values: {
                id: projectId,
                __interrupt__: [ { value: { error: JSON.stringify({ type: 'lm_intervention' }) } } ]
            },
            next: ['intervention_node']
        });

        await handleStream(projectId, mockCompiledGraph, null, config, commandName, publishEvent);

        // Count how many times WORKFLOW_COMPLETED was called
        const workflowCompletedCalls = publishEvent.mock.calls.filter(
            (call: any) => call[0].type === 'WORKFLOW_COMPLETED'
        );
        
        // Should only be called once, not twice
        expect(workflowCompletedCalls).toHaveLength(1);
    });
});
