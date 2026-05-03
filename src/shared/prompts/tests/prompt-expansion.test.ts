import { buildPromptExpansionSystemInstruction, buildPromptExpansionUserInstruction } from "../prompt-expansion.prompt.js";
import { describe, it, expect } from 'vitest';

describe('buildPromptExpansionSystemInstruction', () => {
  it('should include role description', () => {
    const result = buildPromptExpansionSystemInstruction();

    expect(result).toContain('cinematic prompt enhancer');
    expect(result).toContain('concise, vivid narrative prompt');
  });

  it('should include structure instructions', () => {
    const result = buildPromptExpansionSystemInstruction();

    expect(result).toContain('Setup');
    expect(result).toContain('Rising Action');
    expect(result).toContain('Climax');
    expect(result).toContain('Mood & Style');
    expect(result).toContain('Must-Include Scene');
    expect(result).toContain('Resolution');
  });

  it('should include rules', () => {
    const result = buildPromptExpansionSystemInstruction();

    expect(result).toContain('Be concise');
    expect(result).toContain('under 150 words');
    expect(result).toContain('Name no characters');
    expect(result).toContain('must-include scene');
  });
});

describe('buildPromptExpansionUserInstruction', () => {
  it('should include title', () => {
    const result = buildPromptExpansionUserInstruction('Test Title', 'Test prompt');

    expect(result).toContain('Test Title');
    expect(result).toContain('Title:');
  });

  it('should include user prompt', () => {
    const result = buildPromptExpansionUserInstruction('Test Title', 'Test prompt input');

    expect(result).toContain('Test prompt input');
    expect(result).toContain('Input:');
  });

  it('should use default title when not provided', () => {
    const result = buildPromptExpansionUserInstruction('', 'Test prompt');

    expect(result).toContain('Generate a compelling');
    expect(result).toContain('theme, tone, and intent');
  });

  it('should handle both empty values', () => {
    const result = buildPromptExpansionUserInstruction('', '');

    expect(result).toContain('Title:');
    expect(result).toContain('Input:');
  });
});
