import { describe, it, expect, vi } from 'vitest';
import { buildQualityControlPrompt, buildQualityControlVideoPrompt } from '../quality-control.prompt.js';
import { createMockScene, createMockCharacter, createMockLocation } from '../../mocks/index.js';
import { composeSceneSpecs } from '../prompt-utils.js';
import { hydrateEntity } from '../../utils/editable.utils.js';



describe('Role Quality Control Asset Access Patterns', () => {

  describe('buildQualityControlVideoPrompt (previous scene context)', () => {

    it('should include previous scene end frame via getAllBestAssets', () => {
      const previousScene = createMockScene();
      const currentScene = createMockScene();
      const characters = [createMockCharacter()];
      const location = createMockLocation();

      const sceneSpecs = composeSceneSpecs(
        hydrateEntity(currentScene, currentScene.assets),
        characters.map(c => hydrateEntity(c, c.assets)),
        hydrateEntity(location, location.assets),
        hydrateEntity(previousScene, previousScene.assets),
      );

      const prompt = buildQualityControlVideoPrompt(
        hydrateEntity(currentScene, currentScene.assets),
        'test-video-url',
        'enhanced-prompt',
        sceneSpecs,
        {} as any,
        characters.map(c => hydrateEntity(c, c.assets)),
        hydrateEntity(previousScene, previousScene.assets),
        ['generation-rules'],
      );

      expect(prompt).toContain('previous-end-frame.jpg');
      // The old version (version 0) should NOT appear — only the best version
      expect(prompt).not.toContain('old-end-frame.jpg');
    });

    it('should handle missing previous scene end frame gracefully', () => {
      const previousScene = createMockScene();
      const currentScene = createMockScene();
      const characters = [createMockCharacter()];
      const location = createMockLocation();

      const sceneSpecs = composeSceneSpecs(
        hydrateEntity(currentScene, currentScene.assets),
        characters.map(c => hydrateEntity(c, c.assets)),
        hydrateEntity(location, location.assets),
        hydrateEntity(previousScene, previousScene.assets),
      );

      const prompt = buildQualityControlVideoPrompt(
        hydrateEntity(currentScene, currentScene.assets),
        'test-video-url',
        'enhanced-prompt',
        sceneSpecs,
        {} as any,
        characters.map(c => hydrateEntity(c, c.assets)),
        hydrateEntity(previousScene, previousScene.assets),
        ['generation-rules'],
      );

      expect(prompt).toContain('N/A');
    });

    it('should handle no previous scene', () => {
      const currentScene = createMockScene();
      const characters = [createMockCharacter()];
      const location = createMockLocation();

      const sceneSpecs = composeSceneSpecs(
        hydrateEntity(currentScene, currentScene.assets),
        characters.map(c => hydrateEntity(c, c.assets)),
        hydrateEntity(location, location.assets),
        undefined,
      );

      const prompt = buildQualityControlVideoPrompt(
        hydrateEntity(currentScene, currentScene.assets),
        'test-video-url',
        'enhanced-prompt',
        sceneSpecs,
        {} as any,
        characters.map(c => hydrateEntity(c, c.assets)),
        undefined,
        ['generation-rules'],
      );

      expect(prompt).toContain('This is the first scene - no previous context.');
      expect(prompt).not.toContain('PREVIOUS SCENE CONTEXT');
    });

    it('should include all scene context information', () => {
      const previousScene = createMockScene();
      const currentScene = createMockScene();
      const characters = [createMockCharacter()];
      const location = createMockLocation();

      const sceneSpecs = composeSceneSpecs(
        hydrateEntity(currentScene, currentScene.assets),
        characters.map(c => hydrateEntity(c, c.assets)),
        hydrateEntity(location, location.assets),
        hydrateEntity(previousScene, previousScene.assets),
      );

      const prompt = buildQualityControlVideoPrompt(
        hydrateEntity(currentScene, currentScene.assets),
        'test-video-url',
        'enhanced-prompt',
        sceneSpecs,
        {} as any,
        characters.map(c => hydrateEntity(c, c.assets)),
        hydrateEntity(previousScene, previousScene.assets),
        ['generation-rules'],
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
      const characters = [createMockCharacter()];
      const location = createMockLocation();

      const sceneSpecs = composeSceneSpecs(
        hydrateEntity(scene, scene.assets),
        characters.map(c => hydrateEntity(c, c.assets)),
        hydrateEntity(location, location.assets),
      );

      const prompt = buildQualityControlPrompt(
        hydrateEntity(scene, scene.assets),
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
