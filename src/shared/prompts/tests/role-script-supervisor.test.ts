import { buildScriptSupervisorContinuityChecklist } from '../role-script-supervisor.prompt.js';
import { SceneWithAssets, Character, Location } from '../../types/index.js';

describe('Role Script Supervisor Asset Access Patterns', () => {
  const createMockScene = (endFrame?: string): SceneWithAssets => ({
    id: 'scene-1',
    description: 'Test scene description',
    lighting: { type: 'natural', intensity: 0.8 },
    characterIds: [ 'char-1' ],
    locationId: 'loc-1',
    assets: endFrame ? {
      'scene_end_frame': {
        best: 1,
        versions: {
          0: { data: 'old-end-frame.jpg', createdAt: new Date('2023-01-01') },
          1: { data: endFrame, createdAt: new Date('2023-01-02') }
        }
      }
    } : {}
  } as any);

  const createMockCharacter = (): Character => ({
    id: 'char-1',
    name: 'Test Character',
    description: 'Character description'
  } as any);

  const createMockLocation = (): Location => ({
    id: 'loc-1',
    name: 'Test Location',
    type: 'indoor',
    weather: 'sunny'
  } as any);

  describe('buildScriptSupervisorContinuityChecklist', () => {
    it('should use getAllBestAssets for previous scene end frame', () => {
      const previousScene = createMockScene('previous-end-frame.jpg');
      const currentScene = createMockScene();
      const characters = [ createMockCharacter() ];
      const locations = [ createMockLocation() ];

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
      const characters = [ createMockCharacter() ];
      const locations = [ createMockLocation() ];

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
      const characters = [ createMockCharacter() ];
      const locations = [ createMockLocation() ];

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
      const characters = [ createMockCharacter() ];
      const locations = [ createMockLocation() ];

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
      const characters = [ createMockCharacter() ];
      const locations = [ createMockLocation() ];

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
