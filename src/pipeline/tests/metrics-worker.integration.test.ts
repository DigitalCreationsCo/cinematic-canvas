import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    aggregateProjectPerformance,
    recordVersionMetric,
    getMetricsSummary,
    pruneOldMetrics
} from '../../shared/services/metrics-worker.js';
import { db } from '../../shared/db/index.js';
import { projects } from '../../shared/db/schema.js';
import { eq } from 'drizzle-orm';

vi.mock('../../shared/db', () => ({
    db: {
        query: {
            projects: { findFirst: vi.fn() },
            scenes: { findMany: vi.fn() }
        },
        update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    returning: vi.fn().mockResolvedValue([ {} ])
                })
            })
        })
    }
}));

describe('Metrics Worker Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('aggregateProjectPerformance', () => {
        it('should aggregate metrics from completed scenes', async () => {
            (db.query.projects.findFirst as any).mockResolvedValue({
                id: 'p1',
                metrics: {},
                metadata: { totalScenes: 2 }
            });

            (db.query.scenes.findMany as any).mockResolvedValue([
                {
                    id: 's1', status: 'complete',
                    assets: { scene_video: { head: 1, best: 1, versions: [ { version: 1, createdAt: new Date(), metadata: { evaluation: { score: 1.0 } } } ] } }
                }
            ]);

            await aggregateProjectPerformance('p1');
            expect(db.update).toHaveBeenCalled();
        });

        it('should fail if project not found', async () => {
            (db.query.projects.findFirst as any).mockResolvedValue(null);
            await aggregateProjectPerformance('p1');
            expect(db.update).not.toHaveBeenCalled();
        });
    });

    describe('recordVersionMetric', () => {
        it('should record multiple metrics with polymorphic keys', async () => {
            const project = {
                id: 'p1',
                name: 'Test Project',
                status: 'pending',
                metadata: { totalScenes: 5 },
                metrics: {},
                updatedAt: new Date()
            };
            (db.query.projects.findFirst as any).mockResolvedValue(project);

            const metrics = [
                { assetKey: 'scene_video', finalScore: 0.8, attemptNumber: 1, entityId: '00000000-0000-0000-0000-000000000001', assetVersion: 1, jobId: 'j1', startTime: 0, endTime: 10, attemptDuration: 10, ruleAdded: [], corrections: [] } as any,
                { assetKey: 'character_description', finalScore: 0.9, attemptNumber: 1, entityId: '00000000-0000-0000-0000-000000000002', assetVersion: 1, jobId: 'j2', startTime: 0, endTime: 10, attemptDuration: 10, ruleAdded: [], corrections: [] } as any
            ];

            await recordVersionMetric('p1', [ 'scene_video', 'character_description' ], metrics);

            const setCall = (db.update as any).mock.results[ 0 ].value.set.mock.calls[ 0 ][ 0 ];
            expect(setCall.metrics.scene_video).toHaveLength(1);
            expect(setCall.metrics.character_description).toHaveLength(1);
        });

        it('should use first key as fallback for polymorphic broadcast', async () => {
            (db.query.projects.findFirst as any).mockResolvedValue({
                id: 'p1',
                name: 'Test Project',
                status: 'active',
                metadata: { totalScenes: 5 },
                metrics: {},
                updatedAt: new Date()
            });

            const metrics = [
                { assetKey: 'ignored', finalScore: 0.5, attemptNumber: 1, entityId: '00000000-0000-7000-0000-000000000001', assetVersion: 1, jobId: 'j1', startTime: 0, endTime: 10, attemptDuration: 10, ruleAdded: [], corrections: [] } as any,
                { assetKey: 'ignored', finalScore: 0.6, attemptNumber: 2, entityId: '00000000-0000-7000-0000-000000000001', assetVersion: 1, jobId: 'j1', startTime: 0, endTime: 20, attemptDuration: 10, ruleAdded: [], corrections: [] } as any
            ];

            await recordVersionMetric('p1', 'scene_video', metrics);

            const setCall = (db.update as any).mock.results[ 0 ].value.set.mock.calls[ 0 ][ 0 ];
            expect(setCall.metrics.scene_video).toHaveLength(2);
        });
    });

    describe('getMetricsSummary', () => {
        it('should return aggregated summary', async () => {
            (db.query.projects.findFirst as any).mockResolvedValue({ id: 'p1', metrics: { scene_video: [] } });
            (db.query.scenes.findMany as any).mockResolvedValue([]);

            const summary = await getMetricsSummary('p1');
            expect(summary.totalScenes).toBe(0);
        });
    });

    describe('pruneOldMetrics', () => {
        it('should prune old metrics and recalculate regression', async () => {
            const project = {
                id: 'p1',
                metrics: {
                    scene_video: Array(15).fill({ attemptNumber: 1, finalScore: 0.8 })
                }
            };
            (db.query.projects.findFirst as any).mockResolvedValue(project);

            await pruneOldMetrics('p1', 10);

            const setCall = (db.update as any).mock.results[ 0 ].value.set.mock.calls[ 0 ][ 0 ];
            expect(setCall.metrics.scene_video).toHaveLength(10);
            expect(setCall.metrics.regression.count).toBe(10);
        });
    });
});
