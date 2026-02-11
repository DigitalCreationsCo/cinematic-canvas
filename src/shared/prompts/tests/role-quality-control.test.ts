import { buildQualityControlPrompt } from '../../prompts/role-quality-control.js';
import { Scene, Character } from '../../types/index.js';
import { composeDepartmentSpecs } from '../prompt-composer.js';

describe('Role Quality Control Asset Access Patterns', () => {
  const createMockScene = (endFrame?: string): Scene => ({
    id: 'scene-1',
    description: 'Test scene description',
    lighting: { type: 'natural', intensity: 0.8 },
    characterIds: ['char-1'],
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

  describe('buildQualityControlPrompt', () => {
    it('should use getAllBestAssets for previous scene end frame', () => {
      const previousScene = createMockScene('previous-end-frame.jpg');
      const currentScene = createMockScene();
      const characters = [createMockCharacter()];
      
      const departmentSpecs = composeDepartmentSpecs(
        currentScene,
        characters,
        {} as any,
        previousScene
      );
        
      const prompt = buildQualityControlPrompt(
        currentScene,
        'test-video-url',
        "video",
        departmentSpecs,
        {} as any,
        ['geneation-rules']
      );
      
      expect(prompt).toContain('previous-end-frame.jpg');
      expect(prompt).not.toContain('old-end-frame.jpg');
    });

    it('should handle missing previous scene end frame gracefully', () => {
      const previousScene = createMockScene(); // No end frame
      const currentScene = createMockScene();
      const characters = [createMockCharacter()];
      
      const departmentSpecs = composeDepartmentSpecs(
        currentScene,
        characters,
        {} as any,
        previousScene
      );
      
      const prompt = buildQualityControlPrompt(
        currentScene,
        'test-video-url',
        "video",
        departmentSpecs,
        {} as any,
        ['geneation-rules']
      );
      
      expect(prompt).toContain('N/A');
    });

    it('should handle no previous scene', () => {
      const currentScene = createMockScene();
      const characters = [createMockCharacter()];
      
      const departmentSpecs = composeDepartmentSpecs(
        currentScene,
        characters,
        {} as any,
        undefined
      );
      
      const prompt = buildQualityControlPrompt(
        currentScene,
        'test-video-url',
        "video",
        departmentSpecs,
        {} as any,
        ['geneation-rules']
      );
      
      expect(prompt).toContain('This is the first scene - no previous context.');
      expect(prompt).not.toContain('PREVIOUS SCENE CONTEXT');
    });

    it('should include all scene context information', () => {
      const previousScene = createMockScene('end-frame.jpg');
      const currentScene = createMockScene();
      const characters = [createMockCharacter()];
      
      const departmentSpecs = composeDepartmentSpecs(
        currentScene,
        characters,
        {} as any,
        previousScene
      );
      
      const prompt = buildQualityControlPrompt(
        currentScene,
        'test-video-url',
        "video",
        departmentSpecs,
        {} as any,
        ['geneation-rules']
      );
      
      expect(prompt).toContain('Test scene description');
      expect(prompt).toContain('enhanced-prompt');
      expect(prompt).toContain('Test Character: Character description');
      expect(prompt).toContain('{"type":"natural","intensity":0.8}');
      expect(prompt).toContain('char-1');
    });
  });
});
