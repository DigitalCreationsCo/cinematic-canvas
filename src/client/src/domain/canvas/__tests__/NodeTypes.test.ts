// src/__tests__/NodeTypes.test.ts
import { describe, it, expect } from 'vitest';
import {
    HANDLE_IDS,
    CONNECTION_RULES,
    EDGE_STYLES,
    PENDING_EDGE_STYLE,
    NODE_STATUS_STYLES,
    type CanvasNodeType,
    type EdgeType,
    type ImageNodeFlag,
} from '../NodeTypes';

// ============================================================================
// HANDLE_IDS
// ============================================================================

describe('HANDLE_IDS', () => {
    describe('scene handles', () => {
        it('exposes frameInput handle id', () => {
            expect(HANDLE_IDS.scene.frameInput).toBe('scene_frame_input');
        });

        it('exposes entityInput handle id', () => {
            expect(HANDLE_IDS.scene.entityInput).toBe('scene_entity_input');
        });

        it('exposes frameOutput handle id', () => {
            expect(HANDLE_IDS.scene.frameOutput).toBe('scene_frame_output');
        });

        it('has exactly 3 scene handle keys', () => {
            expect(Object.keys(HANDLE_IDS.scene)).toHaveLength(3);
        });
    });

    describe('character handles', () => {
        it('exposes source handle id', () => {
            expect(HANDLE_IDS.character.source).toBe('char_source');
        });
    });

    describe('location handles', () => {
        it('exposes source handle id', () => {
            expect(HANDLE_IDS.location.source).toBe('loc_source');
        });
    });

    describe('audio handles', () => {
        it('exposes source handle id', () => {
            expect(HANDLE_IDS.audio.source).toBe('audio_source');
        });
    });

    describe('image handles', () => {
        it('exposes source handle id', () => {
            expect(HANDLE_IDS.image.source).toBe('img_source');
        });

        it('exposes target handle id', () => {
            expect(HANDLE_IDS.image.target).toBe('img_target');
        });
    });

    describe('composite handles', () => {
        it('exposes in1', () => expect(HANDLE_IDS.composite.in1).toBe('composite_in_1'));
        it('exposes in2', () => expect(HANDLE_IDS.composite.in2).toBe('composite_in_2'));
        it('exposes in3', () => expect(HANDLE_IDS.composite.in3).toBe('composite_in_3'));
        it('exposes out', () => expect(HANDLE_IDS.composite.source).toBe('composite_source'));
    });
});

// ============================================================================
// CONNECTION_RULES
// ============================================================================

describe('CONNECTION_RULES', () => {
    it('is a non-empty array', () => {
        expect(Array.isArray(CONNECTION_RULES)).toBe(true);
        expect(CONNECTION_RULES.length).toBeGreaterThan(0);
    });

    it('every rule has sourceNodeType, targetNodeType and edgeType', () => {
        CONNECTION_RULES.forEach((rule) => {
            expect(rule).toHaveProperty('sourceNodeType');
            expect(rule).toHaveProperty('targetNodeType');
            expect(rule).toHaveProperty('edgeType');
        });
    });

    it('contains a character_in_scene rule', () => {
        const rule = CONNECTION_RULES.find((r) => r.edgeType === 'character_in_scene');
        expect(rule).toBeDefined();
        expect(rule!.sourceNodeType).toBe('character');
        expect(rule!.targetNodeType).toBe('scene');
        expect(rule!.sourceHandle).toBe(HANDLE_IDS.character.source);
        expect(rule!.targetHandle).toBe(HANDLE_IDS.scene.entityInput);
    });

    it('contains a location_in_scene rule', () => {
        const rule = CONNECTION_RULES.find((r) => r.edgeType === 'location_in_scene');
        expect(rule).toBeDefined();
        expect(rule!.sourceNodeType).toBe('location');
        expect(rule!.targetNodeType).toBe('scene');
        expect(rule!.sourceHandle).toBe(HANDLE_IDS.location.source);
        expect(rule!.targetHandle).toBe(HANDLE_IDS.scene.entityInput);
    });

    it('contains an audio_sync rule', () => {
        const rule = CONNECTION_RULES.find((r) => r.edgeType === 'audio_sync');
        expect(rule).toBeDefined();
        expect(rule!.sourceNodeType).toBe('audio');
        expect(rule!.targetNodeType).toBe('scene');
    });

    it('contains a style_applied rule (image → scene)', () => {
        const rule = CONNECTION_RULES.find((r) => r.edgeType === 'style_applied');
        expect(rule).toBeDefined();
        expect(rule!.sourceNodeType).toBe('image');
        expect(rule!.targetNodeType).toBe('scene');
    });

    it('contains a composite_input rule (image → composite)', () => {
        const rule = CONNECTION_RULES.find((r) => r.edgeType === 'composite_input');
        expect(rule).toBeDefined();
        expect(rule!.sourceNodeType).toBe('image');
        expect(rule!.targetNodeType).toBe('composite');
    });

    it('contains a composite_output rule (composite → scene)', () => {
        const rule = CONNECTION_RULES.find((r) => r.edgeType === 'composite_output');
        expect(rule).toBeDefined();
        expect(rule!.sourceNodeType).toBe('composite');
        expect(rule!.targetNodeType).toBe('scene');
    });

    it('contains a frame_input rule for scene continuity with oneToOne: true', () => {
        const rule = CONNECTION_RULES.find((r) => r.edgeType === 'frame_input' && r.sourceNodeType === 'scene');
        expect(rule).toBeDefined();
        expect(rule!.sourceNodeType).toBe('scene');
        expect(rule!.targetNodeType).toBe('scene');
        expect(rule!.sourceHandle).toBe(HANDLE_IDS.scene.frameOutput);
        expect(rule!.targetHandle).toBe(HANDLE_IDS.scene.frameInput);
        expect(rule!.oneToOne).toBe(true);
    });
});

// ============================================================================
// EDGE_STYLES
// ============================================================================

describe('EDGE_STYLES', () => {
    const edgeTypes: EdgeType[] = [
        'scene_sequence',
        'character_in_scene',
        'location_in_scene',
        'style_applied',
        'audio_sync',
        'composite_input',
        'composite_output',
        'lore_context',
    ];

    it.each(edgeTypes)('has a style entry for %s', (type) => {
        expect(EDGE_STYLES[type]).toBeDefined();
        expect(typeof EDGE_STYLES[type].stroke).toBe('string');
        expect(typeof EDGE_STYLES[type].strokeWidth).toBe('number');
    });

    it('scene_sequence has no strokeDasharray (solid line)', () => {
        expect(EDGE_STYLES.scene_sequence.strokeDasharray).toBeUndefined();
    });

    it('character_in_scene has amber stroke color', () => {
        expect(EDGE_STYLES.character_in_scene.stroke).toBe('#f59e0b');
    });

    it('lore_context has gray stroke color', () => {
        expect(EDGE_STYLES.lore_context.stroke).toBe('#94a3b8');
    });
});

// ============================================================================
// PENDING_EDGE_STYLE
// ============================================================================

describe('PENDING_EDGE_STYLE', () => {
    it('uses amber stroke colour', () => {
        expect(PENDING_EDGE_STYLE.stroke).toBe('#fbbf24');
    });

    it('has a dashed pattern', () => {
        expect(PENDING_EDGE_STYLE.strokeDasharray).toBeTruthy();
    });

    it('has a strokeWidth', () => {
        expect(typeof PENDING_EDGE_STYLE.strokeWidth).toBe('number');
        expect(PENDING_EDGE_STYLE.strokeWidth).toBeGreaterThan(0);
    });

    it('has opacity < 1', () => {
        expect(PENDING_EDGE_STYLE.opacity).toBeDefined();
        expect(PENDING_EDGE_STYLE.opacity as number).toBeLessThan(1);
    });
});

// ============================================================================
// NODE_STATUS_STYLES
// ============================================================================

describe('NODE_STATUS_STYLES', () => {
    const statuses = ['pending', 'generating', 'evaluating', 'complete', 'error'] as const;

    it.each(statuses)('has a class string for status "%s"', (status) => {
        expect(typeof NODE_STATUS_STYLES[status]).toBe('string');
        expect(NODE_STATUS_STYLES[status].length).toBeGreaterThan(0);
    });

    it('generating style includes animate-pulse', () => {
        expect(NODE_STATUS_STYLES.generating).toContain('animate-pulse');
    });

    it('error style includes red border', () => {
        expect(NODE_STATUS_STYLES.error).toContain('red');
    });

    it('complete style includes green', () => {
        expect(NODE_STATUS_STYLES.complete).toContain('green');
    });
});

// ============================================================================
// CANVAS_NODE_DATA — COMPOSITE FIELDS
// ============================================================================

describe('CanvasNodeData composite fields', () => {
    it('supports compositePrompt field', () => {
        const nodeData = {
            entityId: 'composite-1',
            contextId: 'project-1',
            contextType: 'project' as const,
            scope: 'project' as const,
            isLocked: false,
            pipelineSelected: false,
            collapsed: false,
            idxVersion: 1,
            compositePrompt: 'Blend these images with warm tones',
        };
        expect(nodeData.compositePrompt).toBe('Blend these images with warm tones');
    });

    it('supports compositeWeights array field', () => {
        const nodeData = {
            entityId: 'composite-1',
            contextId: 'project-1',
            contextType: 'project' as const,
            scope: 'project' as const,
            isLocked: false,
            pipelineSelected: false,
            collapsed: false,
            idxVersion: 1,
            compositeWeights: [30, 50, 20],
        };
        expect(nodeData.compositeWeights).toHaveLength(3);
        expect(nodeData.compositeWeights).toEqual([30, 50, 20]);
    });

    it('supports compositeBlendModes array field', () => {
        const nodeData = {
            entityId: 'composite-1',
            contextId: 'project-1',
            contextType: 'project' as const,
            scope: 'project' as const,
            isLocked: false,
            pipelineSelected: false,
            collapsed: false,
            idxVersion: 1,
            compositeBlendModes: ['normal', 'overlay', 'multiply'] as const,
        };
        expect(nodeData.compositeBlendModes).toHaveLength(3);
        expect(nodeData.compositeBlendModes).toContain('overlay');
    });

    it('composite fields are optional and can be undefined', () => {
        const nodeData = {
            entityId: 'composite-1',
            contextId: 'project-1',
            contextType: 'project' as const,
            scope: 'project' as const,
            isLocked: false,
            pipelineSelected: false,
            collapsed: false,
            idxVersion: 1,
        };
        expect(nodeData.compositePrompt).toBeUndefined();
        expect(nodeData.compositeWeights).toBeUndefined();
        expect(nodeData.compositeBlendModes).toBeUndefined();
    });

    it('compositeWeights defaults to equal distribution when not specified', () => {
        const defaultWeights = [50, 50, 50];
        const nodeData = {
            entityId: 'composite-1',
            contextId: 'project-1',
            contextType: 'project' as const,
            scope: 'project' as const,
            isLocked: false,
            pipelineSelected: false,
            collapsed: false,
            idxVersion: 1,
            compositeWeights: defaultWeights,
        };
        expect(nodeData.compositeWeights?.reduce((a, b) => a + b, 0)).toBe(150);
    });
});
