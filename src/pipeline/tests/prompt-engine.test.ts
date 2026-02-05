import { describe, it, expect } from 'vitest';
import { buildCinematicPrompt } from '../prompt-engine.js';

describe('Prompt Engine', () => {
    it('should build a prompt with all components', () => {
        const scene = { description: 'A hero stands.', mood: 'Epic' };
        const cinematography = { shotType: 'Wide Shot', cameraMovement: 'Static', cameraAngle: 'Eye Level', composition: 'Rule of Thirds' };
        const lighting = {
            quality: { hardness: 'Soft', colorTemperature: 'Warm', intensity: 'Medium' },
            motivatedSources: { primaryLight: 'Sun', fillLight: '', practicalLights: '', accentLight: '', lightBeams: '' }
        };
        const characters = [{ name: 'Hero', physicalTraits: { hair: 'Blonde', clothing: 'Armor', distinctiveFeatures: [] } }];
        const location = { name: 'Mountain', lightingConditions: { quality: { hardness: 'Soft' } } };

        const prompt = buildCinematicPrompt(
            scene as any,
            cinematography as any,
            lighting as any,
            characters as any,
            location as any
        );

        expect(prompt).toContain('Scene Description: A hero stands.');
        expect(prompt).toContain('Mood: Epic');
        expect(prompt).toContain('Location: Mountain');
        expect(prompt).toContain('Hero: Blonde, wearing Armor');
        expect(prompt).toContain('Camera: Wide Shot');
        expect(prompt).toContain('Lighting Sources: Sun');
    });

    it('should handle missing optional fields', () => {
        const scene = { description: 'A hero stands.' }; // No mood
        const cinematography = { shotType: 'Wide Shot' };
        const lighting = {
            quality: { hardness: 'Soft', colorTemperature: 'Neutral', intensity: 'Medium' },
            motivatedSources: { primaryLight: '', fillLight: '', practicalLights: '', accentLight: '', lightBeams: '' }
        };
        const characters: any[] = [];
        const location = { name: 'Mountain', lightingConditions: { quality: { hardness: 'Soft' } } };

        const prompt = buildCinematicPrompt(
            scene as any,
            cinematography as any,
            lighting as any,
            characters,
            location as any
        );

        expect(prompt).toContain('Scene Description: A hero stands.');
        expect(prompt).not.toContain('Mood:');
        expect(prompt).not.toContain('Characters:');
    });
});
