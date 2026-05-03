import { buildDirectorVisionPrompt } from "../role-director.prompt.js";
import { describe, it, expect } from 'vitest';

describe('buildDirectorVisionPrompt', () => {
  const mockCharacters = [
    {
      name: 'Hero',
      referenceId: 'char_hero',
      aliases: ['Protagonist'],
      physicalTraits: {
        age: '25',
        gender: 'male',
        build: 'athletic',
        hair: 'short dark hair',
        clothing: ['red jacket', 'jeans'],
        accessories: ['watch'],
        distinctiveFeatures: [],
        ethnicity: 'Asian',
        appearanceNotes: [],
      },
      state: { emotionalState: 'determined' }
    }
  ];

  const mockLocations = [
    {
      name: 'Beach',
      referenceId: 'loc_beach',
      type: 'exterior',
      timeOfDay: 'Sunset',
      weather: 'Clear',
      mood: 'Tranquil',
      colorPalette: ['orange', 'blue'],
      architecture: ['wooden pier'],
      naturalElements: ['ocean waves'],
      manMadeObjects: ['deck chairs'],
    }
  ];

  it('should include title', () => {
    const result = buildDirectorVisionPrompt('Test Title', 'Test prompt');

    expect(result).toContain('Test Title');
    expect(result).toContain('"Test Title"');
  });

  it('should include user prompt', () => {
    const result = buildDirectorVisionPrompt('Title', 'Creative concept here');

    expect(result).toContain('Creative concept here');
    expect(result).toContain('Creative Concept:');
  });

  it('should include director role', () => {
    const result = buildDirectorVisionPrompt('Title', 'Prompt');

    expect(result).toContain('DIRECTOR');
    expect(result).toContain('creative vision');
  });

  it('should include output sections', () => {
    const result = buildDirectorVisionPrompt('Title', 'Prompt');

    expect(result).toContain('1. CONCEPT & VISION');
    expect(result).toContain('2. CHARACTERS');
    expect(result).toContain('3. LOCATIONS');
    expect(result).toContain('4. SCENE BEAT STRUCTURE');
  });

  it('should include cinematographer guidelines', () => {
    const result = buildDirectorVisionPrompt('Title', 'Prompt');

    expect(result).toContain('CINEMATOGRAPHER SPECIFICATIONS');
    expect(result).toContain('TRANSITION TYPE');
    expect(result).toContain('SHOT TYPE');
  });

  it('should include gaffer guidelines', () => {
    const result = buildDirectorVisionPrompt('Title', 'Prompt');

    expect(result).toContain('GAFFER');
    expect(result).toContain('Lighting');
  });

  it('should include constraints', () => {
    const result = buildDirectorVisionPrompt('Title', 'Prompt');

    expect(result).toContain('CONSTRAINTS');
    expect(result).toContain('NO philosophical language');
    expect(result).toContain('NO dialogue');
    expect(result).toContain('NO celebrity likeness');
  });

  it('should include audio context when provided', () => {
    const segments = [
      { mood: 'calm', intensity: 'low' },
      { mood: 'intense', intensity: 'high' }
    ] as any;
    const result = buildDirectorVisionPrompt('Title', 'Prompt', undefined, segments, 60);

    expect(result).toContain('Musical Structure: 2 segments');
    expect(result).toContain('calm');
    expect(result).toContain('intense');
    expect(result).toContain('60s');
  });

  it('should include pre-existing characters when provided', () => {
    const result = buildDirectorVisionPrompt('Title', 'Prompt', undefined, undefined, undefined, mockCharacters);

    expect(result).toContain('PRE-EXISTING ENTITIES');
    expect(result).toContain('Hero');
    expect(result).toContain('char_hero');
    expect(result).toContain('athletic');
    expect(result).toContain('short dark hair');
  });

  it('should include pre-existing locations when provided', () => {
    const result = buildDirectorVisionPrompt('Title', 'Prompt', undefined, undefined, undefined, undefined, mockLocations);

    expect(result).toContain('PRE-EXISTING ENTITIES');
    expect(result).toContain('Beach');
    expect(result).toContain('loc_beach');
    expect(result).toContain('exterior');
    expect(result).toContain('Sunset');
  });

  it('should include schema when provided', () => {
    const schema = '{"scenes": []}';
    const result = buildDirectorVisionPrompt('Title', 'Prompt', schema);

    expect(result).toContain('OUTPUT FORMAT');
    expect(result).toContain(schema);
  });

  it('should handle empty title gracefully', () => {
    const result = buildDirectorVisionPrompt('', 'Prompt');

    // Empty string becomes "" which is truthy in the || expression
    expect(result).toContain('""');
  });

  it('should handle undefined title', () => {
    const result = buildDirectorVisionPrompt(undefined as any, 'Prompt');

    // When title is undefined, the template literal outputs "undefined" which is truthy
    expect(result).toContain('"undefined"');
  });

  it('should mention valid durations', () => {
    const result = buildDirectorVisionPrompt('Title', 'Prompt');

    expect(result).toContain('6, 8 seconds ONLY');
    expect(result).toContain('Scene durations');
  });
});
