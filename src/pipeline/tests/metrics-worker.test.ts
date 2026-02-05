import { describe, it, expect, vi, beforeEach } from 'vitest';
import { aggregateProjectPerformance } from '../../shared/services/metrics-worker.js';
import { db } from '../../shared/db/index.js';

vi.mock('../../shared/db', () => ({
    db: {
        query: {
            projects: { findFirst: vi.fn() },
            scenes: { findMany: vi.fn() }
        },
        update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue({})
            })
        })
    }
}));

describe('Metrics Worker', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should aggregate metrics from completed scenes', async () => {
        (db.query.projects.findFirst as any).mockResolvedValue({
            id: 'p1',
            metadata: { totalScenes: 5 }
        });

        const now = Date.now();
        (db.query.scenes.findMany as any).mockResolvedValue([
            { 
                id: 's1',
                status: 'complete', 
                startTime: 0, 
                endTime: 10, 
                assets: { 
                    scene_video: { 
                        head: 2, 
                        best: 2, 
                        versions: [ { version: 2, createdAt: new Date(now - 5000), metadata: { evaluation: { score: 0.8, scores: { narrativeFidelity: { weight: 0.8 } } } } } ] 
                    } 
                } 
            },
            { 
                id: 's2',
                status: 'complete', 
                startTime: 10, 
                endTime: 20, 
                assets: { 
                    scene_video: { 
                        head: 1, 
                        best: 1, 
                        versions: [ { version: 1, createdAt: new Date(now - 3000), metadata: { evaluation: { score: 0.9, scores: { narrativeFidelity: { weight: 0.9 } } } } } ] 
                    } 
                } 
            },
            { id: 's3', status: 'pending', startTime: 20, endTime: 30 }
        ]);

        await aggregateProjectPerformance('p1');

        expect(db.update).toHaveBeenCalled();
        const setCall = (db.update as any).mock.results[ 0 ].value.set.mock.calls[ 0 ][ 0 ];
        expect(setCall.metrics).toBeDefined();
        expect(setCall.metrics.sceneMetrics).toBeDefined();
        expect(Object.keys(setCall.metrics.sceneMetrics)).toHaveLength(2);
        expect(setCall.metrics.versionMetrics).toBeDefined();
        expect(setCall.updatedAt).toBeDefined();
    });

    it('should do nothing if project not found', async () => {
        (db.query.projects.findFirst as any).mockResolvedValue(null);
        await aggregateProjectPerformance('p1');
        expect(db.update).not.toHaveBeenCalled();
    });
});
