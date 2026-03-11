import { describe, it, expect, vi } from 'vitest';
import { buildQualityControlPrompt, buildQualityControlVideoPrompt } from '../../prompts/role-quality-control.js';
import type { SceneWithAssets, Character } from '../../types/index.js';
import { composeSceneWithAssetsSpecs } from '../prompt-composer.js';
import { getAllBestAssets } from '../../utils/assets-utils.js';

// ---------------------------------------------------------------------------
// Helpers — produce properly-shaped mock data matching actual Zod schemas
// ---------------------------------------------------------------------------

const mockMetadata = { evaluation: null, model: 'test-model', jobId: 'job-1' } as any;

const createMockLocation = () => ({
  id: 'loc-1',
  name: 'Test Location',
  type: 'interior',
  timeOfDay: 'day',
  weather: 'Clear',
  naturalElements: [ 'trees' ],
  manMadeObjects: [ 'bench' ],
  assets: {},
} as any);

const createMockScene = (endFrame?: string): SceneWithAssets => ({
  id: 'scene-1',
  description: 'Test scene description',
  mood: 'tense',
  intensity: 'high',
  tempo: 'fast',
  shotType: 'medium',
  cameraMovement: 'pan',
  composition: 'rule-of-thirds',
  lighting: { type: 'natural', intensity: 0.8 },
  characterIds: [ 'char-1' ],
  continuityNotes: [ 'Match hair style' ],
  assets: endFrame ? {
    'scene_end_frame': {
      best: 1,
      head: 1,
      versions: [
        { version: 0, data: 'old-end-frame.jpg', type: 'image' as const, metadata: mockMetadata, createdAt: new Date('2023-01-01') },
        { version: 1, data: endFrame, type: 'image' as const, metadata: mockMetadata, createdAt: new Date('2023-01-02') },
      ],
    },
  } : {},
} as any);

const createMockCharacter = (): Character => ({
  id: 'char-1',
  name: 'Test Character',
  description: 'Character description',
  physicalTraits: {
    hair: 'brown',
    clothing: 'casual',
    accessories: [ 'watch' ],
  },
  assets: {},
} as any);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Role Quality Control Asset Access Patterns', () => {
  describe('buildQualityControlVideoPrompt (previous scene context)', () => {
    it('should include previous scene end frame via getAllBestAssets', () => {
      const previousScene = createMockScene('previous-end-frame.jpg');
      const currentScene = createMockScene();
      const characters = [ createMockCharacter() ];
      const location = createMockLocation();

      const sceneSpecs = composeSceneSpecs(
        currentScene,
        characters,
        location,
        previousScene,
      );

      const prompt = buildQualityControlVideoPrompt(
        currentScene,
        'test-video-url',
        'enhanced-prompt',
        sceneSpecs,
        {} as any,
        characters,
        previousScene,
        [ 'generation-rules' ],
      );

      expect(prompt).toContain('previous-end-frame.jpg');
      // The old version (version 0) should NOT appear — only the best version
      expect(prompt).not.toContain('old-end-frame.jpg');
    });

    it('should handle missing previous scene end frame gracefully', () => {
      const previousScene = createMockScene(); // No end frame
      const currentScene = createMockScene();
      const characters = [ createMockCharacter() ];
      const location = createMockLocation();

      const sceneSpecs = composeSceneSpecs(
        currentScene,
        characters,
        location,
        previousScene,
      );

      const prompt = buildQualityControlVideoPrompt(
        currentScene,
        'test-video-url',
        'enhanced-prompt',
        sceneSpecs,
        {} as any,
        characters,
        previousScene,
        [ 'generation-rules' ],
      );

      expect(prompt).toContain('N/A');
    });

    it('should handle no previous scene', () => {
      const currentScene = createMockScene();
      const characters = [ createMockCharacter() ];
      const location = createMockLocation();

      const sceneSpecs = composeSceneSpecs(
        currentScene,
        characters,
        location,
        undefined,
      );

      const prompt = buildQualityControlVideoPrompt(
        currentScene,
        'test-video-url',
        'enhanced-prompt',
        sceneSpecs,
        {} as any,
        characters,
        undefined,
        [ 'generation-rules' ],
      );

      expect(prompt).toContain('This is the first scene - no previous context.');
      expect(prompt).not.toContain('PREVIOUS SCENE CONTEXT');
    });

    it('should include all scene context information', () => {
      const previousScene = createMockScene('end-frame.jpg');
      const currentScene = createMockScene();
      const characters = [ createMockCharacter() ];
      const location = createMockLocation();

      const sceneSpecs = composeSceneSpecs(
        currentScene,
        characters,
        location,
        previousScene,
      );

      const prompt = buildQualityControlVideoPrompt(
        currentScene,
        'test-video-url',
        'enhanced-prompt',
        sceneSpecs,
        {} as any,
        characters,
        previousScene,
        [ 'generation-rules' ],
      );

      expect(prompt).toContain('Test scene description');
      expect(prompt).toContain('enhanced-prompt');
      expect(prompt).toContain('Test Character: Character description');
      expect(prompt).toContain('"type":"natural"');
      expect(prompt).toContain('char-1');
    });
  });

  describe('buildQualityControlPrompt (basic/no-context)', () => {
    it('should contain evaluation rubric for video asset type', () => {
      const scene = createMockScene();
      const characters = [ createMockCharacter() ];
      const location = createMockLocation();

      const sceneSpecs = composeSceneSpecs(
        scene,
        characters,
        location,
      );

      const prompt = buildQualityControlPrompt(
        scene,
        'asset-url',
        'video',
        sceneSpecs,
        {} as any,
        [],
      );

      expect(prompt).toContain('EVALUATION RUBRIC');
      expect(prompt).toContain('NARRATIVE FIDELITY');
      expect(prompt).toContain('COMPOSITION QUALITY');
    });
  });
});
