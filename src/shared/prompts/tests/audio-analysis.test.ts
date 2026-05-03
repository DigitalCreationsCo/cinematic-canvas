import { buildAudioProcessingInstruction } from "../audio-analysis.prompt.js";
import { describe, it, expect } from 'vitest';

describe('buildAudioProcessingInstruction', () => {
  it('should include duration in instructions', () => {
    const result = buildAudioProcessingInstruction(30, [4, 6, 8], '{"schema": true}');

    expect(result).toContain('30s');
    expect(result).toContain('30');
  });

  it('should include valid durations', () => {
    const result = buildAudioProcessingInstruction(60, [4, 6, 8], '{"schema": true}');

    expect(result).toContain('4, 6, 8s increments');
  });

  it('should include schema in output instruction', () => {
    const schema = '{"segments": [], "totalDuration": 0}';
    const result = buildAudioProcessingInstruction(30, [4, 6, 8], schema);

    expect(result).toContain(schema);
    expect(result).toContain('JSON');
  });

  it('should mention Sonic Storyboard Architect role', () => {
    const result = buildAudioProcessingInstruction(30, [4, 6, 8], '{}');

    expect(result).toContain('Sonic Storyboard Architect');
  });

  it('should mention zero-gap continuity rule', () => {
    const result = buildAudioProcessingInstruction(30, [4, 6, 8], '{}');

    expect(result).toContain('Zero-Gap Continuity');
    expect(result).toContain('[i].end == [i+1].start');
  });

  it('should mention waveform cognition steps', () => {
    const result = buildAudioProcessingInstruction(30, [4, 6, 8], '{}');

    expect(result).toContain('WAVEFORM COGNITION');
    expect(result).toContain('BPM');
    expect(result).toContain('Frequency Density');
    expect(result).toContain('Transient Detection');
  });

  it('should handle different duration values', () => {
    const result = buildAudioProcessingInstruction(120, [4, 6, 8], '{}');

    expect(result).toContain('120s');
    expect(result).toContain('120');
  });

  it('should emphasize precision requirement', () => {
    const result = buildAudioProcessingInstruction(30, [4, 6, 8], '{}');

    expect(result).toContain('Precision is non-negotiable');
    expect(result).toContain('totalDuration');
  });
});
