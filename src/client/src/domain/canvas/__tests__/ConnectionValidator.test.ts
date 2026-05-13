// src/__tests__/ConnectionValidator.test.ts
import { describe, it, expect } from 'vitest';
import {
    resolveConnectionRule,
    resolveEdgeType,
    isValidConnection,
    getCompatibleTargetHandles,
    getCompatibleSourceHandles,
} from '../ConnectionValidator';
import { HANDLE_IDS } from '../NodeTypes';

type CanvasNodeType = 'scene' | 'character' | 'location' | 'audio' | 'image' | 'composite' | 'metadata' | 'render';

const mockNodeTypes: Record<string, CanvasNodeType> = {
    char1: 'character',
    scene1: 'scene',
    scene2: 'scene',
    loc1: 'location',
    audio1: 'audio',
    img1: 'image',
    comp1: 'composite',
};

const getNodeType = (id: string) => mockNodeTypes[id];

describe('resolveConnectionRule', () => {
    it('returns the rule for character → scene', () => {
        const rule = resolveConnectionRule(
            'character', 'scene',
            HANDLE_IDS.character.source,
            HANDLE_IDS.scene.entityInput,
        );
        expect(rule).not.toBeNull();
        expect(rule!.edgeType).toBe('character_in_scene');
    });

    it('returns the rule for location → scene', () => {
        const rule = resolveConnectionRule(
            'location', 'scene',
            HANDLE_IDS.location.source,
            HANDLE_IDS.scene.entityInput,
        );
        expect(rule).not.toBeNull();
        expect(rule!.edgeType).toBe('location_in_scene');
    });

    it('returns the rule for audio → scene', () => {
        const rule = resolveConnectionRule(
            'audio', 'scene',
            HANDLE_IDS.audio.source,
            HANDLE_IDS.scene.entityInput,
        );
        expect(rule).not.toBeNull();
        expect(rule!.edgeType).toBe('audio_sync');
    });

    it('returns the rule for image → scene', () => {
        const rule = resolveConnectionRule(
            'image', 'scene',
            HANDLE_IDS.image.source,
            HANDLE_IDS.scene.entityInput,
        );
        expect(rule).not.toBeNull();
        expect(rule!.edgeType).toBe('style_applied');
    });

    it('returns the rule for image → composite', () => {
        const rule = resolveConnectionRule(
            'image', 'composite',
            HANDLE_IDS.image.source,
            undefined,
        );
        expect(rule).not.toBeNull();
        expect(rule!.edgeType).toBe('composite_input');
    });

    it('returns the rule for composite → scene', () => {
        const rule = resolveConnectionRule(
            'composite', 'scene',
            HANDLE_IDS.composite.source,
            HANDLE_IDS.scene.frameInput,
        );
        expect(rule).not.toBeNull();
        expect(rule!.edgeType).toBe('composite_output');
    });

    it('returns the frame_input rule with oneToOne flag for scene → scene', () => {
        const rule = resolveConnectionRule(
            'scene', 'scene',
            HANDLE_IDS.scene.frameOutput,
            HANDLE_IDS.scene.frameInput,
        );
        expect(rule).not.toBeNull();
        expect(rule!.edgeType).toBe('frame_input');
        expect(rule!.oneToOne).toBe(true);
    });

    it('returns null for an unknown source→target pair', () => {
        const rule = resolveConnectionRule('character', 'location', undefined, undefined);
        expect(rule).toBeNull();
    });

    it('returns null when source handle does not match', () => {
        const rule = resolveConnectionRule(
            'character', 'scene',
            'wrong_handle',
            HANDLE_IDS.scene.entityInput,
        );
        expect(rule).toBeNull();
    });

    it('returns null when target handle does not match', () => {
        const rule = resolveConnectionRule(
            'character', 'scene',
            HANDLE_IDS.character.source,
            'wrong_handle',
        );
        expect(rule).toBeNull();
    });
});

describe('resolveEdgeType', () => {
    it('returns character_in_scene for character → scene', () => {
        const edgeType = resolveEdgeType(
            'character', 'scene',
            HANDLE_IDS.character.source,
            HANDLE_IDS.scene.entityInput,
        );
        expect(edgeType).toBe('character_in_scene');
    });

    it('returns location_in_scene for location → scene', () => {
        const edgeType = resolveEdgeType(
            'location', 'scene',
            HANDLE_IDS.location.source,
            HANDLE_IDS.scene.entityInput,
        );
        expect(edgeType).toBe('location_in_scene');
    });

    it('returns audio_sync for audio → scene', () => {
        const edgeType = resolveEdgeType(
            'audio', 'scene',
            HANDLE_IDS.audio.source,
            HANDLE_IDS.scene.entityInput,
        );
        expect(edgeType).toBe('audio_sync');
    });

    it('returns style_applied for image → scene via entity input', () => {
        const edgeType = resolveEdgeType(
            'image', 'scene',
            HANDLE_IDS.image.source,
            HANDLE_IDS.scene.entityInput,
        );
        expect(edgeType).toBe('style_applied');
    });

    it('returns frame_input for image → scene via frame input', () => {
        const edgeType = resolveEdgeType(
            'image', 'scene',
            HANDLE_IDS.image.source,
            HANDLE_IDS.scene.frameInput,
        );
        expect(edgeType).toBe('frame_input');
    });

    it('returns frame_input for scene end_frame → scene start_frame', () => {
        const edgeType = resolveEdgeType(
            'scene', 'scene',
            HANDLE_IDS.scene.frameOutput,
            HANDLE_IDS.scene.frameInput,
        );
        expect(edgeType).toBe('frame_input');
    });

    it('returns composite_input for image → composite', () => {
        const edgeType = resolveEdgeType(
            'image', 'composite',
            HANDLE_IDS.image.source,
            undefined,
        );
        expect(edgeType).toBe('composite_input');
    });

    it('returns composite_output for composite → scene', () => {
        const edgeType = resolveEdgeType(
            'composite', 'scene',
            HANDLE_IDS.composite.source,
            HANDLE_IDS.scene.frameInput,
        );
        expect(edgeType).toBe('composite_output');
    });

    it('returns null for unknown connection', () => {
        const edgeType = resolveEdgeType('character', 'location', undefined, undefined);
        expect(edgeType).toBeNull();
    });
});

describe('isValidConnection', () => {
    it('accepts a valid character → scene connection', () => {
        const connection = {
            source: 'char1',
            target: 'scene1',
            sourceHandle: HANDLE_IDS.character.source,
            targetHandle: HANDLE_IDS.scene.entityInput,
        };
        expect(isValidConnection(connection as any, getNodeType)).toBe(true);
    });

    it('accepts a valid scene end_frame → scene start_frame connection', () => {
        const connection = {
            source: 'scene1',
            target: 'scene2',
            sourceHandle: HANDLE_IDS.scene.frameOutput,
            targetHandle: HANDLE_IDS.scene.frameInput,
        };
        expect(isValidConnection(connection as any, getNodeType)).toBe(true);
    });

    it('accepts a valid location → scene connection', () => {
        const connection = {
            source: 'loc1',
            target: 'scene1',
            sourceHandle: HANDLE_IDS.location.source,
            targetHandle: HANDLE_IDS.scene.entityInput,
        };
        expect(isValidConnection(connection as any, getNodeType)).toBe(true);
    });

    it('accepts a valid audio → scene connection', () => {
        const connection = {
            source: 'audio1',
            target: 'scene1',
            sourceHandle: HANDLE_IDS.audio.source,
            targetHandle: HANDLE_IDS.scene.entityInput,
        };
        expect(isValidConnection(connection as any, getNodeType)).toBe(true);
    });

    it('accepts a valid image → scene connection', () => {
        const connection = {
            source: 'img1',
            target: 'scene1',
            sourceHandle: HANDLE_IDS.image.source,
            targetHandle: HANDLE_IDS.scene.entityInput,
        };
        expect(isValidConnection(connection, getNodeType)).toBe(true);
    });

    it('accepts a valid composite → scene connection', () => {
        const connection = {
            source: 'comp1',
            target: 'scene1',
            sourceHandle: HANDLE_IDS.composite.source,
            targetHandle: HANDLE_IDS.scene.frameInput,
        };
        expect(isValidConnection(connection as any, getNodeType)).toBe(true);
    });

    it('rejects connection with wrong source handle', () => {
        const connection = {
            source: 'char1',
            target: 'scene1',
            sourceHandle: 'wrong_handle',
            targetHandle: HANDLE_IDS.scene.entityInput,
        };
        expect(isValidConnection(connection as any, getNodeType)).toBe(false);
    });

    it('rejects connection with wrong target handle', () => {
        const connection = {
            source: 'char1',
            target: 'scene1',
            sourceHandle: HANDLE_IDS.character.source,
            targetHandle: 'wrong_handle',
        };
        expect(isValidConnection(connection as any, getNodeType)).toBe(false);
    });

    it('rejects unknown node type connection', () => {
        const connection = {
            source: 'unknown1',
            target: 'scene1',
            sourceHandle: undefined,
            targetHandle: HANDLE_IDS.scene.entityInput,
        };
        expect(isValidConnection(connection as any, getNodeType)).toBe(false);
    });
});

describe('getCompatibleTargetHandles', () => {
    it('returns entityInput handle for character dragging from source_character', () => {
        const handles = getCompatibleTargetHandles('character', HANDLE_IDS.character.source);
        expect(handles).toContain(HANDLE_IDS.scene.entityInput);
    });

    it('returns entityInput handle for location dragging from source_location', () => {
        const handles = getCompatibleTargetHandles('location', HANDLE_IDS.location.source);
        expect(handles).toContain(HANDLE_IDS.scene.entityInput);
    });

    it('returns frameInput handle for scene dragging from frameOutput', () => {
        const handles = getCompatibleTargetHandles('scene', HANDLE_IDS.scene.frameOutput);
        expect(handles).toContain(HANDLE_IDS.scene.frameInput);
    });

    it('returns multiple handles when applicable', () => {
        const handles = getCompatibleTargetHandles('image', HANDLE_IDS.image.source);
        expect(handles).toContain(HANDLE_IDS.scene.entityInput);
        expect(handles).toContain(HANDLE_IDS.scene.frameInput);
    });

    it('returns empty array for unknown source', () => {
        const handles = getCompatibleTargetHandles('unknown' as CanvasNodeType, undefined);
        expect(handles).toEqual(new Set());
    });
});

describe('getCompatibleSourceHandles', () => {
    it('returns source_character for a scene entityInput target', () => {
        const handles = getCompatibleSourceHandles('scene', HANDLE_IDS.scene.entityInput);
        expect(handles).toContain(HANDLE_IDS.character.source);
    });

    it('returns frameOutput for a scene frameInput target', () => {
        const handles = getCompatibleSourceHandles('scene', HANDLE_IDS.scene.frameInput);
        expect(handles).toContain(HANDLE_IDS.scene.frameOutput);
    });

    it('returns image source for composite target', () => {
        const handles = getCompatibleSourceHandles('composite', undefined);
        expect(handles).toContain(HANDLE_IDS.image.source);
    });

    it('returns empty array for unknown target', () => {
        const handles = getCompatibleSourceHandles('unknown' as CanvasNodeType, undefined);
        expect(handles).toEqual(new Set());
    });
});
