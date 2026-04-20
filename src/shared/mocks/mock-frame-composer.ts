import { vi, type Mock } from 'vitest';
import type { FrameCompositionAgent } from '../agents/frame-composition-agent.js';

export interface MockFrameComposer extends Partial<FrameCompositionAgent> {
    generateFrameGenerationPrompts: Mock;
    generateFrames: Mock;
    generateImage: Mock;
}

export const createMockFrameComposer = (overrides?: Partial<MockFrameComposer>): MockFrameComposer => ({
    generateFrameGenerationPrompts: vi.fn().mockResolvedValue([]),
    generateFrames: vi.fn().mockResolvedValue(new Map()),
    generateImage: vi.fn().mockResolvedValue({
        data: { scene: {}, image: 'gs://bucket/generated_frame.png' },
        metadata: { attempts: 1, acceptedAttempt: 1, model: 'test-model' }
    }),
    ...overrides,
});