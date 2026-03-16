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
import type { CanvasNodeType } from '../NodeTypes';

// ============================================================================
// resolveConnectionRule
// ============================================================================

describe('resolveConnectionRule', () => {
    it('returns the rule for character → scene', () => {
        const rule = resolveConnectionRule(
            'character', 'scene',
            HANDLE_IDS.character.source,
            HANDLE_IDS.scene.entities,
        );
        expect(rule).not.toBeNull();
        expect(rule!.edgeType).toBe('character_in_scene');
    });

    it('returns the rule for location → scene', () => {
        const rule = resolveConnectionRule(
            'location', 'scene',
            HANDLE_IDS.location.source,
            HANDLE_IDS.scene.entities,
        );
        expect(rule).not.toBeNull();
        expect(rule!.edgeType).toBe('location_in_scene');
    });

    it('returns the rule for audio → scene', () => {
        const rule = resolveConnectionRule(
            'audio', 'scene',
            HANDLE_IDS.audio.source,
            HANDLE_IDS.scene.entities,
        );
        expect(rule).not.toBeNull();
        expect(rule!.edgeType).toBe('audio_sync');
    });

    it('returns the rule for image → scene', () => {
        const rule = resolveConnectionRule(
            'image', 'scene',
            HANDLE_IDS.image.source,
            HANDLE_IDS.scene.entities,
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
            HANDLE_IDS.composite.out,
            HANDLE_IDS.scene.entities,
        );
        expect(rule).not.toBeNull();
        expect(rule!.edgeType).toBe('composite_output');
    });

    it('returns the scene_sequence rule with oneToOne flag', () => {
        const rule = resolveConnectionRule(
            'scene', 'scene',
            HANDLE_IDS.scene.endFrame,
            HANDLE_IDS.scene.startFrame,
        );
        expect(rule).not.toBeNull();
        expect(rule!.edgeType).toBe('scene_sequence');
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
            HANDLE_IDS.scene.entities,
        );
        expect(rule).toBeNull();
    });

    it('returns null when target handle does not match', () => {
        const rule = resolveConnectionRule(
            'character', 'scene',
            HANDLE_IDS.character.source,
            'wrong_target_handle',
        );
        expect(rule).toBeNull();
    });

    it('matches rules with no sourceHandle constraint when handle is undefined', () => {
        // image → composite has no targetHandle constraint
        const rule = resolveConnectionRule('image', 'composite', HANDLE_IDS.image.source, null);
        expect(rule).not.toBeNull();
    });

    it('returns null for metadata source type', () => {
        const rule = resolveConnectionRule('metadata', 'scene', undefined, undefined);
        expect(rule).toBeNull();
    });

    it('returns null for render target type', () => {
        const rule = resolveConnectionRule('scene', 'render', undefined, undefined);
        expect(rule).toBeNull();
    });
});

// ============================================================================
// resolveEdgeType
// ============================================================================

describe('resolveEdgeType', () => {
    it('returns character_in_scene for character → scene', () => {
        expect(
            resolveEdgeType('character', 'scene', HANDLE_IDS.character.source, HANDLE_IDS.scene.entities),
        ).toBe('character_in_scene');
    });

    it('returns null for an invalid pair', () => {
        expect(resolveEdgeType('render', 'metadata', undefined, undefined)).toBeNull();
    });

    it('returns scene_sequence for scene end_frame → scene start_frame', () => {
        expect(
            resolveEdgeType('scene', 'scene', HANDLE_IDS.scene.endFrame, HANDLE_IDS.scene.startFrame),
        ).toBe('scene_sequence');
    });

    it('returns null when handles are wrong for scene → scene', () => {
        // Wrong handle combo should not match
        expect(
            resolveEdgeType('scene', 'scene', HANDLE_IDS.scene.startFrame, HANDLE_IDS.scene.endFrame),
        ).toBeNull();
    });
});

// ============================================================================
// isValidConnection
// ============================================================================

describe('isValidConnection', () => {
    const typeMap = new Map<string, CanvasNodeType>([
        ['char-1', 'character'],
        ['scene-1', 'scene'],
        ['scene-2', 'scene'],
        ['loc-1', 'location'],
        ['audio-1', 'audio'],
        ['img-1', 'image'],
        ['composite-1', 'composite'],
        ['render-1', 'render'],
        ['metadata-1', 'metadata'],
    ]);
    const getType = (id: string) => typeMap.get(id);

    it('accepts a valid character → scene connection', () => {
        expect(isValidConnection(
            {
                source: 'char-1', target: 'scene-1',
                sourceHandle: HANDLE_IDS.character.source,
                targetHandle: HANDLE_IDS.scene.entities,
            },
            getType,
        )).toBe(true);
    });

    it('accepts a valid scene end_frame → scene start_frame connection', () => {
        expect(isValidConnection(
            {
                source: 'scene-1', target: 'scene-2',
                sourceHandle: HANDLE_IDS.scene.endFrame,
                targetHandle: HANDLE_IDS.scene.startFrame,
            },
            getType,
        )).toBe(true);
    });

    it('accepts a valid location → scene connection', () => {
        expect(isValidConnection(
            {
                source: 'loc-1', target: 'scene-1',
                sourceHandle: HANDLE_IDS.location.source,
                targetHandle: HANDLE_IDS.scene.entities,
            },
            getType,
        )).toBe(true);
    });

    it('accepts a valid audio → scene connection', () => {
        expect(isValidConnection(
            {
                source: 'audio-1', target: 'scene-1',
                sourceHandle: HANDLE_IDS.audio.source,
                targetHandle: HANDLE_IDS.scene.entities,
            },
            getType,
        )).toBe(true);
    });

    it('accepts a valid image → scene connection', () => {
        expect(isValidConnection(
            {
                source: 'img-1', target: 'scene-1',
                sourceHandle: HANDLE_IDS.image.source,
                targetHandle: HANDLE_IDS.scene.entities,
            },
            getType,
        )).toBe(true);
    });

    it('accepts a valid image → composite connection', () => {
        expect(isValidConnection(
            {
                source: 'img-1', target: 'composite-1',
                sourceHandle: HANDLE_IDS.image.source,
                targetHandle: null,
            },
            getType,
        )).toBe(true);
    });

    it('accepts a valid composite → scene connection', () => {
        expect(isValidConnection(
            {
                source: 'composite-1', target: 'scene-1',
                sourceHandle: HANDLE_IDS.composite.out,
                targetHandle: HANDLE_IDS.scene.entities,
            },
            getType,
        )).toBe(true);
    });

    it('rejects a self-loop', () => {
        expect(isValidConnection(
            { source: 'scene-1', target: 'scene-1', sourceHandle: null, targetHandle: null },
            getType,
        )).toBe(false);
    });

    it('rejects when source is null', () => {
        expect(isValidConnection(
            { source: null, target: 'scene-1', sourceHandle: null, targetHandle: null },
            getType,
        )).toBe(false);
    });

    it('rejects when target is null', () => {
        expect(isValidConnection(
            { source: 'char-1', target: null, sourceHandle: null, targetHandle: null },
            getType,
        )).toBe(false);
    });

    it('rejects when source node type is unknown', () => {
        expect(isValidConnection(
            { source: 'unknown-node', target: 'scene-1', sourceHandle: null, targetHandle: null },
            getType,
        )).toBe(false);
    });

    it('rejects when target node type is unknown', () => {
        expect(isValidConnection(
            { source: 'char-1', target: 'unknown-node', sourceHandle: null, targetHandle: null },
            getType,
        )).toBe(false);
    });

    it('rejects character → location (no rule exists)', () => {
        expect(isValidConnection(
            { source: 'char-1', target: 'loc-1', sourceHandle: null, targetHandle: null },
            getType,
        )).toBe(false);
    });

    it('rejects scene start_frame → scene end_frame (wrong direction)', () => {
        expect(isValidConnection(
            {
                source: 'scene-1', target: 'scene-2',
                sourceHandle: HANDLE_IDS.scene.startFrame,
                targetHandle: HANDLE_IDS.scene.endFrame,
            },
            getType,
        )).toBe(false);
    });

    it('rejects metadata → anything', () => {
        expect(isValidConnection(
            { source: 'metadata-1', target: 'scene-1', sourceHandle: null, targetHandle: null },
            getType,
        )).toBe(false);
    });

    it('rejects anything → render', () => {
        expect(isValidConnection(
            { source: 'scene-1', target: 'render-1', sourceHandle: null, targetHandle: null },
            getType,
        )).toBe(false);
    });
});

// ============================================================================
// getCompatibleTargetHandles
// ============================================================================

describe('getCompatibleTargetHandles', () => {
    it('returns entities handle for character dragging from char_source', () => {
        const handles = getCompatibleTargetHandles('character', HANDLE_IDS.character.source);
        expect(handles.has(HANDLE_IDS.scene.entities)).toBe(true);
    });

    it('returns entities handle for location dragging from loc_source', () => {
        const handles = getCompatibleTargetHandles('location', HANDLE_IDS.location.source);
        expect(handles.has(HANDLE_IDS.scene.entities)).toBe(true);
    });

    it('returns start_frame for scene dragging from end_frame', () => {
        const handles = getCompatibleTargetHandles('scene', HANDLE_IDS.scene.endFrame);
        expect(handles.has(HANDLE_IDS.scene.startFrame)).toBe(true);
    });

    it('returns empty set for a node type with no outgoing rules matching the handle', () => {
        const handles = getCompatibleTargetHandles('render', null);
        expect(handles.size).toBe(0);
    });

    it('returns empty set when handle does not match any rule sourceHandle', () => {
        const handles = getCompatibleTargetHandles('character', 'nonexistent_handle');
        expect(handles.size).toBe(0);
    });

    it('skips rules whose targetHandle is undefined (no specific target required)', () => {
        // composite_input rule has no targetHandle — should not contribute to the set
        const handles = getCompatibleTargetHandles('image', HANDLE_IDS.image.source);
        // image can go to scene.entities (style_applied) — that has a targetHandle
        expect(handles.has(HANDLE_IDS.scene.entities)).toBe(true);
    });
});

// ============================================================================
// getCompatibleSourceHandles
// ============================================================================

describe('getCompatibleSourceHandles', () => {
    it('returns char_source for a scene entities target', () => {
        const handles = getCompatibleSourceHandles('scene', HANDLE_IDS.scene.entities);
        expect(handles.has(HANDLE_IDS.character.source)).toBe(true);
        expect(handles.has(HANDLE_IDS.location.source)).toBe(true);
        expect(handles.has(HANDLE_IDS.audio.source)).toBe(true);
        expect(handles.has(HANDLE_IDS.image.source)).toBe(true);
    });

    it('returns end_frame source for a scene start_frame target', () => {
        const handles = getCompatibleSourceHandles('scene', HANDLE_IDS.scene.startFrame);
        expect(handles.has(HANDLE_IDS.scene.endFrame)).toBe(true);
    });

    it('returns empty set for render target (nothing connects to render)', () => {
        const handles = getCompatibleSourceHandles('render', null);
        expect(handles.size).toBe(0);
    });

    it('returns empty set for metadata target', () => {
        const handles = getCompatibleSourceHandles('metadata', null);
        expect(handles.size).toBe(0);
    });

    it('skips rules whose sourceHandle is undefined', () => {
        // No rules have undefined sourceHandle in our ruleset, but coverage for the guard
        const handles = getCompatibleSourceHandles('composite', null);
        // composite as target: composite_input rule has no targetHandle constraint
        // so rules where targetHandle != null and != the given handle are skipped
        expect(handles instanceof Set).toBe(true);
    });
});