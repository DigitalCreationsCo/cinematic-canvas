import { buildCharacterImagePrompt } from "../character-reference-image.prompt.js";
import { createMockCharacter } from "../../mocks/entities/mock-character.js";
import { describe, it, expect } from 'vitest';

describe('buildCharacterImagePrompt', () => {
  it('should include character full spec', () => {
    const character = createMockCharacter({
      name: 'Hero Character',
      referenceId: 'char_hero',
      physicalTraits: {
        gender: 'male',
        age: '25',
        hair: 'short dark hair',
        clothing: ['red jacket'],
        accessories: ['watch'],
        distinctiveFeatures: [],
        build: 'athletic',
        ethnicity: 'Asian',
        appearanceNotes: [],
      }
    });
    const prompt = buildCharacterImagePrompt(character);

    expect(prompt).toContain('25-year-old Asian man');
    expect(prompt).toContain('short dark hair');
    expect(prompt).toContain('red jacket');
    expect(prompt).toContain('watch');
    expect(prompt).toContain('char_hero');
  });

  it('should include portrait instructions', () => {
    const character = createMockCharacter();
    const prompt = buildCharacterImagePrompt(character);

    expect(prompt).toContain('High quality, production-ready portrait');
    expect(prompt).toContain('Head to toe visible');
    expect(prompt).toContain('neutral pose facing the camera');
    expect(prompt).toContain('plain light gray radial gradient');
  });

  it('should include safety guidelines', () => {
    const character = createMockCharacter();
    const prompt = buildCharacterImagePrompt(character);

    expect(prompt).toContain('Avoid violating AI usage guidelines');
    expect(prompt).toContain('Do not depict any celebrity or real person');
    expect(prompt).toContain('Describe children as young adults');
  });

  it('should include character image from assets when available', () => {
    const character = createMockCharacter({
      assets: { character_image: 'char-image.jpg' }
    });
    const prompt = buildCharacterImagePrompt(character);

    expect(prompt).toContain('char-image.jpg');
  });

  it('should include generation rules when provided', () => {
    const character = createMockCharacter();
    const prompt = buildCharacterImagePrompt(character, ['Rule 1', 'Rule 2']);

    expect(prompt).toContain('Rule 1');
    expect(prompt).toContain('Rule 2');
  });

  it('should handle female characters correctly', () => {
    const character = createMockCharacter({
      physicalTraits: {
        gender: 'female',
        age: '30',
        hair: 'long blonde hair',
        clothing: ['blue dress'],
        accessories: [],
        distinctiveFeatures: [],
        build: 'slender',
        ethnicity: 'Asian',
        appearanceNotes: [],
      }
    });
    const prompt = buildCharacterImagePrompt(character);

    expect(prompt).toContain('30-year-old Asian woman');
    expect(prompt).toContain('long blonde hair');
    expect(prompt).toContain('blue dress');
  });

  it('should handle non-binary characters correctly', () => {
    const character = createMockCharacter({
      physicalTraits: {
        gender: 'non-binary',
        age: '28',
        hair: 'short hair',
        clothing: ['casual wear'],
        accessories: [],
        distinctiveFeatures: [],
        build: 'average',
        ethnicity: '',
        appearanceNotes: [],
      }
    });
    const prompt = buildCharacterImagePrompt(character);

    expect(prompt).toContain('28-year-old  non-binary-gender person');
  });
});
