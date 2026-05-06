import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SemanticExpertAgent } from '../semantic-expert-agent.js';
import { TextModelController } from '../lm/text-model-controller.js';
import { Storyboard } from '../types/workflow.types.js';

// Mock dependencies
vi.mock('../lm/text-model-controller.js');

describe('SemanticExpertAgent', () => {
  let agent: SemanticExpertAgent;
  let mockLM: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLM = {
      qualityCheckModel: 'gemini-2.5-flash',
      generateContent: vi.fn(),
    };

    agent = new SemanticExpertAgent(mockLM as any);
  });

  describe('constructor', () => {
    it('should initialize with TextModelController', () => {
      expect(agent).toBeDefined();
      expect(agent instanceof SemanticExpertAgent).toBe(true);
    });
  });

  describe('generateRules', () => {
    const mockStoryboard: Storyboard = {
      metadata: {
        title: 'Test Storyboard',
        duration: 120,
        totalScenes: 3,
        style: 'cinematic',
        mood: 'dramatic',
        colorPalette: ['#ff0000', '#00ff00'],
        tags: ['action', 'drama'],
      } as any,
      characters: [
        { id: 'char-1', name: 'John', state: {} } as any,
        { id: 'char-2', name: 'Jane', state: {} } as any,
      ],
      locations: [
        { id: 'loc-1', name: 'Office' } as any,
      ],
      scenes: [
        {
          id: 'scene-1',
          sceneIndex: 0,
          description: 'John enters the office',
          duration: 40,
        } as any,
        {
          id: 'scene-2',
          sceneIndex: 1,
          description: 'Jane meets John',
          duration: 40,
        } as any,
        {
          id: 'scene-3',
          sceneIndex: 2,
          description: 'They discuss the project',
          duration: 40,
        } as any,
      ],
    };

    it('should generate semantic rules successfully', async () => {
      const mockRulesResponse = {
        rules: [
          { category: 'character', rule: 'John should wear a suit' },
          { category: 'location', rule: 'Office should be well-lit' },
          { category: 'narrative', rule: 'Maintain dramatic tension' },
        ],
      };

      mockLM.generateContent.mockResolvedValue({
        text: JSON.stringify(mockRulesResponse),
      });

      const result = await agent.generateRules(mockStoryboard);

      expect(result).toBeDefined();
      expect(result.data).toBeDefined();
      expect(result.data.dynamicRules).toBeDefined();
      expect(result.data.dynamicRules).toHaveLength(3);
      expect(result.data.dynamicRules[0]).toBe('John should wear a suit');
      expect(result.data.dynamicRules[1]).toBe('Office should be well-lit');
      expect(result.data.dynamicRules[2]).toBe('Maintain dramatic tension');
      expect(result.metadata.model).toBe('gemini-2.5-flash');
      expect(result.metadata.attempts).toBe(1);
      expect(result.metadata.acceptedAttempt).toBe(1);
      expect(mockLM.generateContent).toHaveBeenCalled();
    });

    it('should return empty rules when LLM returns no text', async () => {
      mockLM.generateContent.mockResolvedValue({
        text: null,
      });

      const result = await agent.generateRules(mockStoryboard);

      expect(result.data.dynamicRules).toEqual([]);
      expect(result.metadata.attempts).toBe(1);
    });

    it('should return empty rules when LLM returns empty text', async () => {
      mockLM.generateContent.mockResolvedValue({
        text: '',
      });

      const result = await agent.generateRules(mockStoryboard);

      expect(result.data.dynamicRules).toEqual([]);
    });

    it('should handle LLM errors gracefully', async () => {
      mockLM.generateContent.mockRejectedValue(new Error('LLM error'));

      const result = await agent.generateRules(mockStoryboard);

      expect(result.data.dynamicRules).toEqual([]);
      expect(result.metadata.attempts).toBe(1);
    });

    it('should handle invalid JSON response', async () => {
      mockLM.generateContent.mockResolvedValue({
        text: 'invalid json',
      });

      const result = await agent.generateRules(mockStoryboard);

      // Should return empty rules due to JSON parse error
      expect(result.data.dynamicRules).toEqual([]);
    });

    it('should handle empty storyboard', async () => {
      const emptyStoryboard: Storyboard = {
        metadata: {
          title: 'Empty',
          duration: 0,
          totalScenes: 0,
        } as any,
        characters: [],
        locations: [],
        scenes: [],
      };

      const mockRulesResponse = {
        rules: [],
      };

      mockLM.generateContent.mockResolvedValue({
        text: JSON.stringify(mockRulesResponse),
      });

      const result = await agent.generateRules(emptyStoryboard);

      expect(result.data.dynamicRules).toEqual([]);
    });

    it('should pass correct parameters to generateContent', async () => {
      const mockRulesResponse = {
        rules: [{ category: 'test', rule: 'Test rule' }],
      };

      mockLM.generateContent.mockResolvedValue({
        text: JSON.stringify(mockRulesResponse),
      });

      await agent.generateRules(mockStoryboard);

      expect(mockLM.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-2.5-flash',
          messages: expect.any(Array),
          config: expect.objectContaining({
            responseJsonSchema: expect.anything(),
            temperature: 0.4,
          }),
        })
      );
    });

    it('should include storyboard context in the prompt', async () => {
      const mockRulesResponse = {
        rules: [],
      };

      mockLM.generateContent.mockResolvedValue({
        text: JSON.stringify(mockRulesResponse),
      });

      await agent.generateRules(mockStoryboard);

      const callArgs = mockLM.generateContent.mock.calls[0][0];
      const messageContent = callArgs.messages[0].content;
      
      // Check that the storyboard metadata is included
      expect(messageContent[0].text).toContain('Test Storyboard');
    });

    it('should handle storyboard with only metadata', async () => {
      const minimalStoryboard: Storyboard = {
        metadata: {
          title: 'Minimal',
          duration: 60,
        } as any,
        characters: undefined as any,
        locations: undefined as any,
        scenes: undefined as any,
      };

      const mockRulesResponse = {
        rules: [{ category: 'generic', rule: 'Generic rule' }],
      };

      mockLM.generateContent.mockResolvedValue({
        text: JSON.stringify(mockRulesResponse),
      });

      const result = await agent.generateRules(minimalStoryboard);

      expect(result.data.dynamicRules).toHaveLength(1);
      expect(result.data.dynamicRules[0]).toBe('Generic rule');
    });
  });
});
