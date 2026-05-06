import { vi, type Mock } from 'vitest';
import type { SceneFrameGenerationResult } from '#shared/lm/tools/scenes/generate-scene-frames.js';
import type { FramePromptRequest, FramePromptResult } from '#shared/lm/tools/scenes/generate-frame-generation-prompts.js';

export interface MockFrameComposer {
    generateFrames: Mock<(params: any, context: any) => Promise<Map<string, SceneFrameGenerationResult>>>;
    generateFrameGenerationPrompts: Mock<(requests: FramePromptRequest[], context: any) => Promise<FramePromptResult[]>>;
}

export const createMockFrameComposer = (overrides?: Partial<MockFrameComposer>): MockFrameComposer => ({
    generateFrames: vi.fn().mockResolvedValue(new Map()),
    generateFrameGenerationPrompts: vi.fn().mockResolvedValue([]),
    ...overrides,
});
