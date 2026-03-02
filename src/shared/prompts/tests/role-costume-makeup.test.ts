import { buildCharacterFullSpec, buildCharacterFullSpec } from '../../src/shared/prompts/role-costume-makeup.js';
import { Character } from '../../src/shared/types/index.js';

describe('Role Costume & Makeup Asset Access Patterns', () => {
  const createMockCharacter = (description: string, image?: string): Character => ({
    id: 'char-1',
    name: 'Test Character',
    referenceId: 'ref-123',
    physicalTraits: {
      hair: 'brown',
      clothing: 'casual shirt',
      accessories: ['watch'],
      distinctiveFeatures: [],
      build: 'average'
    },
    age: 25,
    assets: {
      'character_description': {
        best: 1,
        versions: {
          0: { data: 'old description', createdAt: new Date('2023-01-01') },
          1: { data: description, createdAt: new Date('2023-01-02') }
        }
      },
      ...(image && {
        'character_image': {
          best: 1,
          versions: {
            0: { data: 'old-image.jpg', createdAt: new Date('2023-01-01') },
            1: { data: image, createdAt: new Date('2023-01-02') }
          }
        }
      })
    }
  } as any);

  describe('buildCharacterFullSpec', () => {
    it('should use getAllBestAssets for character description', () => {
      const character = createMockCharacter('A detailed character description');
      
      const prompt = buildCharacterFullSpec(character);
      
      expect(prompt).toContain('A detailed character description');
      expect(prompt).not.toContain('old description');
    });

    it('should use getAllBestAssets for character image', () => {
      const character = createMockCharacter('Description', 'character-image.jpg');
      
      const prompt = buildCharacterFullSpec(character);
      
      expect(prompt).toContain('character-image.jpg');
      expect(prompt).not.toContain('old-image.jpg');
    });

    it('should handle missing character image gracefully', () => {
      const character = createMockCharacter('Description'); // No image
      
      const prompt = buildCharacterFullSpec(character);
      
      expect(prompt).toContain('Not yet generated');
    });

    it('should include all character traits in prompt', () => {
      const character = createMockCharacter('Description', 'image.jpg');
      
      const prompt = buildCharacterFullSpec(character);
      
      expect(prompt).toContain('Test Character');
      expect(prompt).toContain('brown');
      expect(prompt).toContain('casual shirt');
      expect(prompt).toContain('watch');
      expect(prompt).toContain('25');
    });
  });

  describe('buildCharacterFullSpec', () => {
    it('should use getAllBestAssets for character description', () => {
      const character = createMockCharacter('Narrative description');
      
      const narrative = buildCharacterFullSpec(character);
      
      expect(narrative).toContain('Narrative description');
      expect(narrative).not.toContain('old description');
    });

    it('should use getAllBestAssets for character image', () => {
      const character = createMockCharacter('Description', 'narrative-image.jpg');
      
      const narrative = buildCharacterFullSpec(character);
      
      expect(narrative).toContain('narrative-image.jpg');
      expect(narrative).not.toContain('old-image.jpg');
    });

    it('should handle missing character image gracefully', () => {
      const character = createMockCharacter('Description'); // No image
      
      const narrative = buildCharacterFullSpec(character);
      
      expect(narrative).toContain('Not yet generated');
    });
  });
});
