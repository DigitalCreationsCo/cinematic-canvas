import { createMockStorageManager } from "#shared/mocks/mock-storage-manager.js";

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QualityCheckAgent } from '#shared/agents/quality-check-agent.js';
import { QualityEvaluationResult } from '#shared/types/quality.types.js';
import { Scene, Character, Location } from '#shared/types/workflow.types.js';

// Mock dependencies
vi.mock('#shared/agents/lm/text-model-controller.js');

describe('QualityCheckAgent', () => {
  let agent: QualityCheckAgent;
  let mockLM: any;
  let mockStorage: any;

  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('ACCEPT_THRESHOLD', '0.95');

    vi.clearAllMocks();

    mockLM = {
      qualityCheckModel: 'gemini-2.5-flash',
      generateContent: vi.fn(),
    };

    mockStorage = createMockStorageManager();

    agent = new QualityCheckAgent(mockLM as any, mockStorage as any, undefined, {
      enabled: true,
      acceptThreshold: 0.95,
      minorIssueThreshold: 0.90,
      majorIssueThreshold: 0.70,
      failThreshold: 0.70,
      maxRetries: 3,
      safetyRetries: 2,
    });
  });

  describe('constructor', () => {
    it('should initialize with default config from env vars when not provided', () => {
      const originalEnv = { ...process.env };
      process.env.ENABLE_QUALITY_CONTROL = 'true';
      process.env.ACCEPT_THRESHOLD = '0.95';
      process.env.MINOR_ISSUE_THRESHOLD = '0.90';
      process.env.MAJOR_ISSUE_THRESHOLD = '0.70';
      process.env.FAIL_THRESHOLD = '0.60';
      process.env.MAX_RETRIES = '5';
      process.env.SAFETY_RETRIES = '3';

      const agentWithEnv = new QualityCheckAgent(mockLM as any, mockStorage as any);

      expect(agentWithEnv.qualityConfig.enabled).toBe(true);
      expect(agentWithEnv.qualityConfig.acceptThreshold).toBe(0.95);
      expect(agentWithEnv.qualityConfig.minorIssueThreshold).toBe(0.90);
      expect(agentWithEnv.qualityConfig.majorIssueThreshold).toBe(0.70);
      expect(agentWithEnv.qualityConfig.failThreshold).toBe(0.60);
      expect(agentWithEnv.qualityConfig.maxRetries).toBe(5);
      expect(agentWithEnv.qualityConfig.safetyRetries).toBe(3);

      // Restore env
      process.env = originalEnv;
    });

    it('should throw error for invalid numeric config values', () => {
      process.env.ACCEPT_THRESHOLD = 'not-a-number';

      expect(() => {
        new QualityCheckAgent(mockLM as any, mockStorage as any);
      }).toThrow('QualityConfig Error: acceptThreshold is not a number');
    });

    it('environmental variable values take precedence over defaults and constructor arguments', () => {
      vi.stubEnv('ENABLE_QUALITY_CONTROL', 'true');
      vi.stubEnv('ACCEPT_THRESHOLD', '0.96');
      vi.stubEnv('MINOR_ISSUE_THRESHOLD', '0.91');
      vi.stubEnv('MAJOR_ISSUE_THRESHOLD', '0.71');
      vi.stubEnv('FAIL_THRESHOLD', '0.61');
      vi.stubEnv('MAX_RETRIES', '6');
      vi.stubEnv('SAFETY_RETRIES', '');

      const customAgent = new QualityCheckAgent(mockLM as any, mockStorage as any, undefined, {
        enabled: false,
        maxRetries: 10,
        minorIssueThreshold: 0.7,
        majorIssueThreshold: 0.6,
        failThreshold: 0.5,
      });

      expect(customAgent.qualityConfig.enabled).toBe(true);
      expect(customAgent.qualityConfig.maxRetries).toBe(6);

      expect(customAgent.qualityConfig.acceptThreshold).toBe(0.96);

      vi.unstubAllEnvs();
    });
  });

  describe.skip('evaluateFrameQuality', () => {
    const mockScene: Scene = {
      id: 'scene-1',
      sceneIndex: 0,
      description: 'A character walks through a forest',
      duration: 8,
      characterIds: ['char-1'],
      locationId: 'loc-1',
    } as any;

    const mockCharacters: Character[] = [{
      id: 'char-1',
      name: 'John',
      physicalTraits: { hair: 'brown', clothing: 'jacket' },
    } as any];

    const mockLocations: Location[] = [{
      id: 'loc-1',
      name: 'Forest',
    } as any];

    it('should evaluate frame quality and return results', async () => {
      const mockEvaluationResponse = {
        narrativeFidelity: { rating: 'PASS', weight: 0.30, details: 'Good narrative alignment' },
        characterConsistency: { rating: 'PASS', weight: 0.25, details: 'Character looks consistent' },
        technicalQuality: { rating: 'PASS', weight: 0.20, details: 'Sharp image' },
        emotionalAuthenticity: { rating: 'PASS', weight: 0.15, details: 'Emotion conveyed well' },
        continuity: { rating: 'MINOR_ISSUES', weight: 0.10, details: 'Slight continuity issue' },
        promptCorrections: [],
        issues: [],
        scores: {},
      };

      mockLM.generateContent.mockResolvedValue({
        text: JSON.stringify(mockEvaluationResponse),
      });

      const result = await agent.evaluateFrameQuality(
        'gs://bucket/frame.png',
        mockScene,
        'start',
        mockCharacters,
        mockLocations,
      );

      expect(result).toBeDefined();
      expect(result.grade).toBe('ACCEPT_WITH_NOTES'); // Overall score ~0.925
      expect(result.score).toBeGreaterThan(0.90);
      expect(result.model).toBe('gemini-2.5-flash');
      expect(mockLM.generateContent).toHaveBeenCalled();
    });

    it('should handle JSON repair when initial parse fails', async () => {
      const invalidJson = '{ "narrativeFidelity": { "rating": "PASS" }'; // Missing closing brace
      const validJson = JSON.stringify({
        narrativeFidelity: { rating: 'PASS', weight: 0.30, details: 'Good' },
        characterConsistency: { rating: 'PASS', weight: 0.25, details: 'Good' },
        technicalQuality: { rating: 'PASS', weight: 0.20, details: 'Good' },
        emotionalAuthenticity: { rating: 'PASS', weight: 0.15, details: 'Good' },
        continuity: { rating: 'PASS', weight: 0.10, details: 'Good' },
        promptCorrections: [],
        issues: [],
        scores: {},
      });

      // First call returns invalid JSON, second call (repair) returns valid JSON
      mockLM.generateContent
        .mockResolvedValueOnce({ text: invalidJson })
        .mockResolvedValueOnce({ text: validJson });

      const result = await agent.evaluateFrameQuality(
        'gs://bucket/frame.png',
        mockScene,
        'start',
        mockCharacters,
        mockLocations,
      );

      expect(result).toBeDefined();
      expect(mockLM.generateContent).toHaveBeenCalledTimes(2);
    });

    it('should throw error when LLM returns no text', async () => {
      mockLM.generateContent.mockResolvedValue({ text: null });

      await expect(
        agent.evaluateFrameQuality('gs://bucket/frame.png', mockScene, 'start', mockCharacters, mockLocations)
      ).rejects.toThrow('No quality evaluation generated from LLM from Quality Check Agent');
    });

    it('should use provided active rules when specified', async () => {
      const mockEvaluationResponse = {
        narrativeFidelity: { rating: 'PASS', weight: 0.30, details: 'Good' },
        characterConsistency: { rating: 'PASS', weight: 0.25, details: 'Good' },
        technicalQuality: { rating: 'PASS', weight: 0.20, details: 'Good' },
        emotionalAuthenticity: { rating: 'PASS', weight: 0.15, details: 'Good' },
        continuity: { rating: 'PASS', weight: 0.10, details: 'Good' },
        promptCorrections: [],
        issues: [],
        scores: {},
      };

      mockLM.generateContent.mockResolvedValue({
        text: JSON.stringify(mockEvaluationResponse),
      });

      const activeRules = ['Rule 1', 'Rule 2'];
      await agent.evaluateFrameQuality(
        'gs://bucket/frame.png',
        mockScene,
        'start',
        mockCharacters,
        mockLocations,
        undefined,
        activeRules,
      );

      expect(mockLM.generateContent).toHaveBeenCalled();
    });
  });

  describe.skip('evaluateScene', () => {
    const mockScene: Scene = {
      id: 'scene-1',
      sceneIndex: 0,
      description: 'A dramatic scene with intense emotion',
      duration: 10,
    } as any;

    const mockCharacters: Character[] = [{
      id: 'char-1',
      name: 'John',
    } as any];

    const mockLocation: Location = {
      id: 'loc-1',
      name: 'Office',
    } as any;

    it('should evaluate scene video and return quality results', async () => {
      const mockEvaluationResponse = {
        narrativeFidelity: { rating: 'PASS', weight: 0.30, details: 'Narrative matches' },
        characterConsistency: { rating: 'PASS', weight: 0.25, details: 'Character consistent' },
        technicalQuality: { rating: 'PASS', weight: 0.20, details: 'Good quality' },
        emotionalAuthenticity: { rating: 'PASS', weight: 0.15, details: 'Emotion authentic' },
        continuity: { rating: 'PASS', weight: 0.10, details: 'Good continuity' },
        promptCorrections: [],
        issues: [],
        scores: {},
      };

      mockLM.generateContent.mockResolvedValue({
        text: JSON.stringify(mockEvaluationResponse),
      });

      const sendEntityUpdate = vi.fn();
      const result = await agent.evaluateScene(
        mockScene,
        'gs://bucket/scene.mp4',
        'A dramatic scene',
        mockCharacters,
        mockLocation,
        1,
        undefined,
        sendEntityUpdate,
      );

      expect(result).toBeDefined();
      expect(result.grade).toBe('ACCEPT');
      expect(result.score).toBe(1.0);
      expect(sendEntityUpdate).toHaveBeenCalled();
    });

    it('should call sendEntityUpdate with evaluating status', async () => {
      const mockEvaluationResponse = {
        narrativeFidelity: { rating: 'PASS', weight: 0.30, details: 'Good' },
        characterConsistency: { rating: 'PASS', weight: 0.25, details: 'Good' },
        technicalQuality: { rating: 'PASS', weight: 0.20, details: 'Good' },
        emotionalAuthenticity: { rating: 'PASS', weight: 0.15, details: 'Good' },
        continuity: { rating: 'PASS', weight: 0.10, details: 'Good' },
        promptCorrections: [],
        issues: [],
        scores: {},
      };

      mockLM.generateContent.mockResolvedValue({
        text: JSON.stringify(mockEvaluationResponse),
      });

      const sendEntityUpdate = vi.fn();
      await agent.evaluateScene(
        mockScene,
        'gs://bucket/scene.mp4',
        'A dramatic scene',
        mockCharacters,
        mockLocation,
        1,
        undefined,
        sendEntityUpdate,
      );

      expect(sendEntityUpdate).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            entity: expect.objectContaining({ status: 'evaluating' }),
          }),
        ]),
        false
      );
    });
  });

  describe('applyQualityCorrections', () => {
    const mockScene: Scene = {
      id: 'scene-1',
      sceneIndex: 0,
      description: 'A scene',
    } as any;

    it('should apply corrections when promptCorrections exist', async () => {
      const mockEvaluation: Partial<QualityEvaluationResult> = {
        promptCorrections: ['Add more lighting', 'Enhance shadows'],
      };

      mockLM.generateContent.mockResolvedValue({
        text: 'Corrected prompt with enhanced lighting and shadows',
      });

      const sendEntityUpdate = vi.fn();
      const result = await agent.applyQualityCorrections(
        'Original prompt',
        mockEvaluation as any,
        mockScene,
        [],
        2,
        sendEntityUpdate,
      );

      expect(result).toBe('Corrected prompt with enhanced lighting and shadows');
      expect(result.length).toBeGreaterThan('Original prompt'.length);
      expect(sendEntityUpdate).toHaveBeenCalled();
    });

    it('should return original prompt when no corrections exist', async () => {
      const mockEvaluation: Partial<QualityEvaluationResult> = {
        promptCorrections: [],
      };

      const result = await agent.applyQualityCorrections(
        'Original prompt',
        mockEvaluation as any,
        mockScene,
        [],
        1,
      );

      expect(result).toBe('Original prompt');
      expect(mockLM.generateContent).not.toHaveBeenCalled();
    });

    it('should return original prompt when corrections is undefined', async () => {
      const mockEvaluation: Partial<QualityEvaluationResult> = {};

      const result = await agent.applyQualityCorrections(
        'Original prompt',
        mockEvaluation as any,
        mockScene,
        [],
        1,
      );

      expect(result).toBe('Original prompt');
    });

    it('should fallback to original prompt on LLM error', async () => {
      const mockEvaluation: Partial<QualityEvaluationResult> = {
        promptCorrections: ['Fix this'],
      };

      mockLM.generateContent.mockRejectedValue(new Error('LLM error'));

      const result = await agent.applyQualityCorrections(
        'Original prompt',
        mockEvaluation as any,
        mockScene,
        [],
        1,
      );

      expect(result).toBe('Original prompt');
    });
  });

  describe('sanitizePrompt', () => {
    it('should sanitize prompt when error message is provided', async () => {
      mockLM.generateContent.mockResolvedValue({
        text: 'Sanitized prompt without harmful content',
      });

      const result = await agent.sanitizePrompt(
        'Original prompt with issues',
        'Safety filter triggered: harmful content detected',
      );

      expect(result).toBe('Sanitized prompt without harmful content');
      expect(mockLM.generateContent).toHaveBeenCalled();
    });

    it('should proactively sanitize prompt when no error message', async () => {
      mockLM.generateContent.mockResolvedValue({
        text: 'Proactively sanitized prompt',
      });

      const result = await agent.sanitizePrompt('Original prompt');

      expect(result).toBe('Proactively sanitized prompt');
    });

    it('should return original prompt when sanitization fails', async () => {
      mockLM.generateContent.mockRejectedValue(new Error('Sanitization failed'));

      const result = await agent.sanitizePrompt('Original prompt');

      expect(result).toBe('Original prompt');
    });
  });

  describe('calculateOverallScore', () => {
    it('should calculate weighted average correctly', () => {
      const scores = {
        narrativeFidelity: { rating: 'PASS', weight: 0.30 },
        characterConsistency: { rating: 'PASS', weight: 0.25 },
        technicalQuality: { rating: 'MINOR_ISSUES', weight: 0.20 },
        emotionalAuthenticity: { rating: 'PASS', weight: 0.15 },
        continuity: { rating: 'PASS', weight: 0.10 },
      };

      const score = (agent as any).calculateOverallScore(scores);
      expect(score).toBeCloseTo(0.94, 2);
    });

    it('should return 0 when total weight is 0', () => {
      const score = (agent as any).calculateOverallScore({});
      expect(score).toBe(0);
    });
  });

  describe('determineOverallRating', () => {
    it('should return ACCEPT when score >= acceptThreshold', () => {
      const rating = (agent as any).determineOverallRating(0.95);
      expect(rating).toBe('ACCEPT');
    });

    it('should return ACCEPT_WITH_NOTES when score >= minorIssueThreshold', () => {
      const rating = (agent as any).determineOverallRating(0.90);
      expect(rating).toBe('ACCEPT_WITH_NOTES');
    });

    it('should return REGENERATE_MINOR when score >= majorIssueThreshold', () => {

      vi.stubEnv('ACCEPT_THRESHOLD', '0.95');
      vi.stubEnv('MINOR_ISSUE_THRESHOLD', '0.80');
      vi.stubEnv('MAJOR_ISSUE_THRESHOLD', '0.70');

      const controlledAgent = new QualityCheckAgent(
        mockLM as any,
        mockStorage as any,
      );

      // Exact boundary match
      const ratingMatch = (controlledAgent as any).determineOverallRating(0.70);
      expect(ratingMatch).toBe('REGENERATE_MINOR');

      // Value within the range (0.70 to 0.79)
      const ratingInside = (controlledAgent as any).determineOverallRating(0.75);
      expect(ratingInside).toBe('REGENERATE_MINOR');
    });

    it('should return FAIL when score < majorIssueThreshold', () => {
      const rating = (agent as any).determineOverallRating(0.50);
      expect(rating).toBe('FAIL');
    });
  });

  describe('parseAndValidateJson', () => {
    it('should parse valid JSON successfully', async () => {
      const schema = {
        parse: vi.fn().mockReturnValue({ test: 'value' }),
      } as any;

      const result = await (agent as any).parseAndValidateJson('{"test": "value"}', schema);
      expect(result).toEqual({ test: 'value' });
    });

    // it('should repair malformed JSON using LLM', async () => {
    //   const schema = {
    //     parse: vi.fn()
    //       .mockImplementationOnce(() => { throw new Error('Parse error'); })
    //       .mockImplementationOnce(() => ({ test: 'value' })),
    //   } as any;

    //   mockLM.generateContent.mockResolvedValue({
    //     text: '{"test": "value"}',
    //   });

    //   const result = await (agent as any).parseAndValidateJson('{invalid json}', schema);
    //   expect(result).toEqual({ test: 'value' });
    //   expect(mockLM.generateContent).toHaveBeenCalled();
    // });

    it('should throw error when repair fails', async () => {
      const schema = {
        parse: vi.fn().mockImplementation(() => { throw new Error('Parse error'); }),
      } as any;

      mockLM.generateContent.mockResolvedValue({ text: null });

      await expect(
        (agent as any).parseAndValidateJson('{invalid}', schema)
      ).rejects.toThrow('Failed to parse and validate JSON after repair');
    });
  });

  describe('logEvaluationResults', () => {
    it('should log evaluation results without errors', () => {
      const mockEvaluation: QualityEvaluationResult = {
        grade: 'ACCEPT',
        score: 0.95,
        scores: {
          narrativeFidelity: { rating: 'PASS', weight: 0.30, details: 'Good' },
        },
        issues: [],
        promptCorrections: [],
      } as any;

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

      (agent as any).logEvaluationResults('scene-1', mockEvaluation, 0.95);

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log issues when they exist', () => {
      // 1. Setup a mock evaluation result that includes required score categories
      const mockEvaluation: QualityEvaluationResult = {
        grade: 'ACCEPT_WITH_NOTES',
        score: 0.90,
        scores: {
          narrativeFidelity: { rating: 'MINOR_ISSUES', weight: 0.30, details: 'Minor issue' },
          characterConsistency: { rating: 'PASS', weight: 0.25, details: 'Consistent' },
          technicalQuality: { rating: 'PASS', weight: 0.20, details: 'Clear' },
          emotionalAuthenticity: { rating: 'PASS', weight: 0.15, details: 'Authentic' },
          continuity: { rating: 'PASS', weight: 0.10, details: 'Smooth' }
        },
        issues: [
          { severity: 'minor', description: 'Small issue detected' },
        ],
        promptCorrections: [],
        model: 'test-model'
      } as any;

      // 2. Spy on console.log
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

      // 3. Execute the private method
      (agent as any).logEvaluationResults('scene-1', mockEvaluation, 0.90);

      // 4. Assertions
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Overall Rating scene-1: ACCEPT_WITH_NOTES (90.0%)'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('⚠ narrativeFidelity: MINOR_ISSUES'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Issues found: 1'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('1. [minor] Small issue detected'));

      // 5. Cleanup
      consoleSpy.mockRestore();
    });
  });
});
