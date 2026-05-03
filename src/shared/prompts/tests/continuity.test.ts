import { continuitySystemPrompt } from "../continuity.prompt.js";
import { describe, it, expect } from 'vitest';

describe('continuitySystemPrompt', () => {
  it('should include role description', () => {
    const prompt = continuitySystemPrompt();

    expect(prompt).toContain('30-year production supervisor');
    expect(prompt).toContain('high-budget cinematic productions');
  });

  it('should list what it may receive', () => {
    const prompt = continuitySystemPrompt();

    expect(prompt).toContain('Narrative intent + scope');
    expect(prompt).toContain('Character reference details');
    expect(prompt).toContain('Location reference details');
    expect(prompt).toContain('Base scene description');
    expect(prompt).toContain('Previous scene context');
  });

  it('should include character consistency rules', () => {
    const prompt = continuitySystemPrompt();

    expect(prompt).toContain('Character consistency is absolute');
    expect(prompt).toContain('Hair: Exact style, color, length');
    expect(prompt).toContain('Clothing: Same garments, same colors');
    expect(prompt).toContain('Accessories: Same items in same positions');
    expect(prompt).toContain('Physical state: Injuries persist');
  });

  it('should include spatial continuity rules', () => {
    const prompt = continuitySystemPrompt();

    expect(prompt).toContain('Spatial Continuity');
    expect(prompt).toContain('Distance relationships');
    expect(prompt).toContain('Environmental props');
    expect(prompt).toContain('Lighting direction');
  });

  it('should include temporal continuity rules', () => {
    const prompt = continuitySystemPrompt();

    expect(prompt).toContain('Temporal continuity');
    expect(prompt).toContain('Costume state: Torn clothes stay torn');
    expect(prompt).toContain('Weather conditions evolve logically');
    expect(prompt).toContain('Character state: Fatigue compounds');
  });

  it('should include lighting consistency rules', () => {
    const prompt = continuitySystemPrompt();

    expect(prompt).toContain('Lighting consistency');
    expect(prompt).toContain('Color temperature');
    expect(prompt).toContain('Light direction');
    expect(prompt).toContain('Light quality');
    expect(prompt).toContain('Practical sources');
  });

  it('should include atmospheric consistency rules', () => {
    const prompt = continuitySystemPrompt();

    expect(prompt).toContain('Atmospheric consistency');
    expect(prompt).toContain('Color grading');
    expect(prompt).toContain('Fog/haze/atmosphere');
    expect(prompt).toContain('Depth cues');
  });

  it('should end with directive to be specific', () => {
    const prompt = continuitySystemPrompt();

    expect(prompt).toContain('Be specific');
    expect(prompt).toContain('Be precise');
    expect(prompt).toContain('Think like a cinematographer');
  });
});
