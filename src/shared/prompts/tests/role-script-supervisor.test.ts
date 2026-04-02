import { buildScriptSupervisorContinuityChecklist } from '../role-script-supervisor.prompt.js';
import { describe, it, expect } from 'vitest';
import { createMockScene, createMockCharacter, createMockLocation } from '../../mocks/index.js';

describe('Role Script Supervisor Asset Access Patterns', () => {

  describe('buildScriptSupervisorContinuityChecklist', () => {
    it('should use getAllBestAssets for previous scene end frame', () => {
      const previousScene = createMockScene({ assets: { 'scene_end_frame': 'previous-end-frame.jpg' } });
      const currentScene = createMockScene();
      const characters = [createMockCharacter()];
      const locations = [createMockLocation()];

      const checklist = buildScriptSupervisorContinuityChecklist(
        currentScene,
        previousScene,
        characters,
        locations
      );

      expect(checklist).toContain('previous-end-frame.jpg');
      expect(checklist).not.toContain('old-end-frame.jpg');
    });

    it('should handle missing previous scene end frame gracefully', () => {
      const previousScene = createMockScene(); // No end frame
      const currentScene = createMockScene();
      const characters = [createMockCharacter()];
      const locations = [createMockLocation()];

      const checklist = buildScriptSupervisorContinuityChecklist(
        currentScene,
        previousScene,
        characters,
        locations
      );

      expect(checklist).toContain('N/A');
    });

    it('should handle no previous scene', () => {
      const currentScene = createMockScene();
      const characters = [createMockCharacter()];
      const locations = [createMockLocation()];

      const checklist = buildScriptSupervisorContinuityChecklist(
        currentScene,
        undefined,
        characters,
        locations
      );

      expect(checklist).toContain('FIRST SCENE - ESTABLISH BASELINES');
      expect(checklist).not.toContain('PREVIOUS SCENE');
    });

    it('should include all scene context information', () => {
      const previousScene = createMockScene('end-frame.jpg');
      const currentScene = createMockScene();
      const characters = [createMockCharacter()];
      const locations = [createMockLocation()];

      const checklist = buildScriptSupervisorContinuityChecklist(
        currentScene,
        previousScene,
        characters,
        locations
      );

      expect(checklist).toContain('Test scene description');
      expect(checklist).toContain('{"type":"natural","intensity":0.8}');
      expect(checklist).toContain('char-1');
      expect(checklist).toContain('loc-1');
    });

    it('should include location information', () => {
      const currentScene = createMockScene();
      const characters = [createMockCharacter()];
      const locations = [createMockLocation()];

      const checklist = buildScriptSupervisorContinuityChecklist(
        currentScene,
        undefined,
        characters,
        locations
      );

      expect(checklist).toContain('Test Location');
      expect(checklist).toContain('indoor');
      expect(checklist).toContain('sunny');
    });
  });
});
