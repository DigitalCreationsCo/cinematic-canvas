// src/store/__tests__/useCanvasUIStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useCanvasUIStore } from '../useCanvasUIStore.js';

beforeEach(() => {
    useCanvasUIStore.setState({
        autoLayout: true,
        snapToGrid: true,
    });
});

describe('useCanvasUIStore - autoLayout', () => {
    describe('autoLayout state', () => {
        it('starts with autoLayout true (default for new projects)', () => {
            expect(useCanvasUIStore.getState().autoLayout).toBe(true);
        });

        it('setAutoLayout sets autoLayout to false', () => {
            useCanvasUIStore.getState().setAutoLayout(false);
            expect(useCanvasUIStore.getState().autoLayout).toBe(false);
        });

        it('setAutoLayout sets autoLayout to true', () => {
            useCanvasUIStore.setState({ autoLayout: false });
            useCanvasUIStore.getState().setAutoLayout(true);
            expect(useCanvasUIStore.getState().autoLayout).toBe(true);
        });

        it('toggleAutoLayout toggles from true to false', () => {
            useCanvasUIStore.setState({ autoLayout: true });
            useCanvasUIStore.getState().toggleAutoLayout();
            expect(useCanvasUIStore.getState().autoLayout).toBe(false);
        });

        it('toggleAutoLayout toggles from false to true', () => {
            useCanvasUIStore.setState({ autoLayout: false });
            useCanvasUIStore.getState().toggleAutoLayout();
            expect(useCanvasUIStore.getState().autoLayout).toBe(true);
        });
    });

    describe('snapToGrid state', () => {
        it('starts with snapToGrid true', () => {
            expect(useCanvasUIStore.getState().snapToGrid).toBe(true);
        });

        it('setSnapToGrid sets snapToGrid to true', () => {
            useCanvasUIStore.getState().setSnapToGrid(true);
            expect(useCanvasUIStore.getState().snapToGrid).toBe(true);
        });

        it('setSnapToGrid sets snapToGrid to false', () => {
            useCanvasUIStore.setState({ snapToGrid: true });
            useCanvasUIStore.getState().setSnapToGrid(false);
            expect(useCanvasUIStore.getState().snapToGrid).toBe(false);
        });
    });

    describe('relationship between autoLayout and snapToGrid', () => {
        it('autoLayout can be toggled independently', () => {
            useCanvasUIStore.setState({ autoLayout: true, snapToGrid: true });
            useCanvasUIStore.getState().setAutoLayout(false);
            expect(useCanvasUIStore.getState().autoLayout).toBe(false);
            expect(useCanvasUIStore.getState().snapToGrid).toBe(true);
        });

        it('snapToGrid can be toggled when autoLayout is on', () => {
            useCanvasUIStore.setState({ autoLayout: true, snapToGrid: true });
            useCanvasUIStore.getState().setSnapToGrid(false);
            expect(useCanvasUIStore.getState().autoLayout).toBe(true);
            expect(useCanvasUIStore.getState().snapToGrid).toBe(false);
        });
    });
});
