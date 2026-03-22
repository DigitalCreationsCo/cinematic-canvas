
// ─────────────────────────────────────────────────────────────────────────────
// Demo seed data
//
// Only applied when projectId === 'demo-project' (route has no real UUID).
// For all real project routes, the canvas is populated exclusively via the
// SSE pipeline events that usePipelineEvents processes into the store, which
// useCanvasPipelineSync then reflects onto the canvas.
//
// Each node carries the full CanvasNodeData shape so NodeFactory invariants
// are respected, plus additive presentation fields that SceneNode reads.
// ─────────────────────────────────────────────────────────────────────────────

export const DEMO_PROJECT_ID = 'demo-project';

export const DEMO_NODES = [
    {
        id: 'scene-1', type: 'scene', position: { x: 80, y: 120 },
        data: {
            entityId: 'scene-1', contextId: DEMO_PROJECT_ID,
            contextType: 'project' as const, scope: 'project' as const,
            isLocked: false, pipelineSelected: true, collapsed: false, idxVersion: 1,
            label: 'SCENE 01: The Approach', status: 'complete', progress: 100,
            description: 'Establishing shot of the city at night, rain pouring.',
            time: '0:00 - 0:06', characters: [], location: 'loc-1',
        },
    },
    {
        id: 'scene-2', type: 'scene', position: { x: 500, y: 120 },
        data: {
            entityId: 'scene-2', contextId: DEMO_PROJECT_ID,
            contextType: 'project' as const, scope: 'project' as const,
            isLocked: false, pipelineSelected: true, collapsed: false, idxVersion: 1,
            label: 'SCENE 02: Cafe Interior', status: 'generating', progress: 45,
            description: 'Close up on hacker terminal. Neon lights reflecting.',
            time: '0:06 - 0:12', characters: ['char-1'], location: 'loc-2',
        },
    },
    {
        id: 'composite-1', type: 'composite', position: { x: 500, y: 450 },
        data: {
            entityId: 'composite-1', contextId: DEMO_PROJECT_ID,
            contextType: 'project' as const, scope: 'project' as const,
            isLocked: false, pipelineSelected: true, collapsed: false, idxVersion: 1,
        },
    },
    {
        id: 'scene-3', type: 'scene', position: { x: 920, y: 120 },
        data: {
            entityId: 'scene-3', contextId: DEMO_PROJECT_ID,
            contextType: 'project' as const, scope: 'project' as const,
            isLocked: false, pipelineSelected: true, collapsed: false, idxVersion: 1,
            label: 'SCENE 03: The Breach', status: 'pending', progress: 0,
            description: 'Terminal turns red, alarms blare, rapid pan.',
            time: '0:12 - 0:18', characters: ['char-1'], location: 'loc-2',
        },
    },
    {
        id: 'scene-4', type: 'scene', position: { x: 1340, y: 120 },
        data: {
            entityId: 'scene-4', contextId: DEMO_PROJECT_ID,
            contextType: 'project' as const, scope: 'project' as const,
            isLocked: false, pipelineSelected: true, collapsed: false, idxVersion: 1,
            label: 'SCENE 04: Escape', status: 'error', progress: 10,
            description: 'Running down the alleyway, tracking shot.',
            time: '0:18 - 0:24', characters: ['char-1'], location: 'loc-3',
            errorMessage: 'Generation failed: GPU Timeout on upscale',
        },
    },
];

export const DEMO_EDGES = [
    { id: 'e1-2', source: 'scene-1', target: 'scene-2', animated: true, style: { stroke: 'var(--success)' } },
    { id: 'e1-c1', source: 'scene-1', target: 'composite-1', type: 'step', style: { stroke: 'var(--muted-foreground)', strokeDasharray: '4 4' } },
    { id: 'e2-3', source: 'scene-2', target: 'scene-3', animated: true, style: { stroke: 'var(--primary)' } },
    { id: 'e3-4', source: 'scene-3', target: 'scene-4' },
];