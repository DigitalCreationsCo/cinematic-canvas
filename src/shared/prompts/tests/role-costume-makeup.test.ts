import { buildCharacterFullSpec, } from "../character-spec.prompt";
import { createMockCharacter } from "../../mocks";
import { describe, it, expect } from 'vitest';

describe('Role Costume & Makeup Asset Access Patterns', () => {


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
