import { buildCharacterFullSpec, } from "../character-spec.prompt.js";
import { createMockCharacter } from "../../mocks/entities/mock-character.js";
import { describe, it, expect } from 'vitest';

describe('Role Costume & Makeup Asset Access Patterns', () => {


  describe('buildCharacterFullSpec', () => {
    it('should use getAllBestAssets for character description', () => {
      const character = createMockCharacter({ assets: { description: 'A detailed character description' } });
      const prompt = buildCharacterFullSpec(character);

      expect(prompt).toContain('A detailed character description');
      expect(prompt).not.toContain('old description');
    });

    it('should use getAllBestAssets for character image', () => {
      const character = createMockCharacter({ assets: { character_image: 'character-image.jpg' } });
      const prompt = buildCharacterFullSpec(character);

      expect(prompt).toContain('character-image.jpg');
      expect(prompt).not.toContain('old-image.jpg');
    });


    it('should include all character traits in prompt', () => {
      const character = createMockCharacter({
        physicalTraits: {
          hair: "short dark hair",
          clothing: ['casual t-shirt', 'jeans'],
          accessories: ['watch'],
          distinctiveFeatures: [],
          build: "average",
          ethnicity: "",
          age: "25",
          gender: "male",
          appearanceNotes: []
        },
        assets: {
          character_image: 'image.jpg',
          description: 'The leader of the biker gang.',
        }
      });
      const prompt = buildCharacterFullSpec(character);

      expect(prompt).toContain('The leader of the biker gang');
      expect(prompt).toContain('casual t-shirt');
      expect(prompt).toContain('watch');
      expect(prompt).toContain('25');
    });

    it('should handle missing character image gracefully', () => {
      const character = createMockCharacter({ assets: {} });
      const narrative = buildCharacterFullSpec(character);

      expect(narrative).not.toContain('Image: ');
    });
  });
});
