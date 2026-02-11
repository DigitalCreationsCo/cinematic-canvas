import { describe, it, expect } from "vitest";
import {
    calculateAssetMetrics,
    calculateGlobalMetrics,
    addVersionMetric,
    updateRegression,
    calculateTrendFromRegression,
    getAssetVersionMetrics
} from "../metrics-utils.js";
import { Scene, AssetKey } from "../../types/index.js";
import { VersionMetric, WorkflowMetrics } from "../../types/metrics.types.js";

describe("metrics-utils", () => {
    const mockScenes: Scene[] = [
        {
            id: "scene-1",
            projectId: "project-1",
            sceneIndex: 0,
            status: "complete",
            assets: {
                "scene_video": {
                    head: 2,
                    best: 1,
                    versions: [
                        { version: 1, createdAt: new Date(1000), metadata: { evaluation: { score: 0.8 } } } as any,
                        { version: 2, createdAt: new Date(2000) } as any
                    ]
                }
            }
        } as Scene
    ];

    describe("calculateAssetMetrics", () => {
        it("should calculate metrics for a single asset", () => {
            const metrics = calculateAssetMetrics(mockScenes, "scene_video");
            expect(metrics.totalAttempts).toBe(2);
            expect(metrics.avgScore).toBe(0.8);
            expect(metrics.successRate).toBe(1);
            expect(metrics.totalDuration).toBe(1000);
        });

        it("should return empty metrics if asset not found", () => {
            const metrics = calculateAssetMetrics(mockScenes, "character_description");
            expect(metrics.totalAttempts).toBe(0);
            expect(metrics.avgScore).toBe(0);
        });
    });

    describe("calculateGlobalMetrics", () => {
        it("should aggregate metrics across assets", () => {
            const metrics = calculateGlobalMetrics(mockScenes, [ "scene_video", "character_description" ]);
            expect(metrics.totalScenes).toBe(1);
            expect(metrics.completedScenes).toBe(1);
            expect(metrics.assetBreakdown.scene_video).toBeDefined();
            expect(metrics.avgQualityScore).toBe(0.8);
        });
    });

    describe("addVersionMetric", () => {
        const initialMetrics: WorkflowMetrics = {
            globalTrend: null,
            regression: { count: 0, sumX: 0, sumY_a: 0, sumY_q: 0, sumXY_a: 0, sumXY_q: 0, sumX2: 0 },
            trendHistory: [],
            sceneMetrics: {}
        } as any;

        const mockMetric: VersionMetric = {
            assetKey: "scene_video",
            entityId: "uuid",
            attemptNumber: 1,
            assetVersion: 1,
            finalScore: 0.9,
            jobId: "job-1",
            startTime: 0,
            endTime: 100,
            attemptDuration: 100,
            ruleAdded: [],
            corrections: []
        } as any;

        it("should add a version metric and update regression", () => {
            const updated = addVersionMetric(initialMetrics, "scene_video", mockMetric);
            expect(updated['scene_video']).toHaveLength(1);
            expect(updated['scene_video'][ 0 ].finalScore).toBe(0.9);
            expect(updated.regression.count).toBe(1);
            expect(updated.globalTrend).toBeDefined();
            expect(updated.trendHistory).toHaveLength(1);
        });
    });

    describe("getAssetVersionMetrics", () => {
        it("should extract summary metrics for an asset", () => {
            const metrics: WorkflowMetrics = {
                scene_video: [
                    { attemptNumber: 1, finalScore: 0.8, attemptDuration: 100, ruleAdded: [] },
                    { attemptNumber: 2, finalScore: 0.9, attemptDuration: 150, ruleAdded: [ "rule-1" ] }
                ]
            } as any;

            const summary = getAssetVersionMetrics(metrics, "scene_video");
            expect(summary.totalVersions).toBe(2);
            expect(summary.avgScore).toBeCloseTo(0.85);
            expect(summary.avgAttempts).toBe(1.5);
            expect(summary.rulesAddedCount).toBe(1);
            expect(summary.totalDuration).toBe(250);
        });

        it("should handle empty data", () => {
            const summary = getAssetVersionMetrics({} as any, "scene_video");
            expect(summary.totalVersions).toBe(0);
        });
    });
});
