import type { CompositionalAgent } from "#shared/agents/compositional-agent.js";
import { Mocked, vi } from "vitest";

const { _mockCompositionalAgent } = await vi.hoisted(async () => {
  const _create = () => ({
    expandCreativePrompt: vi.fn().mockResolvedValue({ data: { expandedPrompt: "expanded" }, metadata: {} }),
    generateStoryboardExclusivelyFromPrompt: vi
      .fn()
      .mockResolvedValue({ data: { storyboardAttributes: {} }, metadata: {} }),
    generateStoryboardFromAudioAnalysis: vi
      .fn()
      .mockResolvedValue({ data: { storyboardAttributes: {} }, metadata: {} }),
  });
  return { _mockCompositionalAgent: _create() };
});

vi.mock("#shared/agents/compositional-agent.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#shared/agents/compositional-agent.js")>();
  return {
    ...actual,
    CompositionalAgent: class {
      constructor() {
        return _mockCompositionalAgent;
      }
    },
  };
});

export function createMockCompositionalAgent(): Mocked<CompositionalAgent> {
  return _mockCompositionalAgent as unknown as Mocked<CompositionalAgent>;
}

export const mockCompositionalAgent = createMockCompositionalAgent();
