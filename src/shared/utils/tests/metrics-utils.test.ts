import { describe, it, expect } from "vitest";
import {
    deriveAssetKeyMetrics,
    deriveGlobalMetrics,
    flattenVersionActivity,
    getSceneAssetHistory,
    deriveRollingTrend,
    predictRemainingWork,
    hasNewerVersionsThanBest,
    formatDuration,
    formatPercentage,
} from "../metrics-utils.js";
import { AssetHistory, AssetRegistry, AssetVersion } from "../../types/assets.types.js";

// ============================================================================
// TEST FIXTURES
// ============================================================================

function makeVersion(
    version: number,
    score: number,
    opts: {
        startedAt?: Date;
        createdAt?: Date;
        ruleSuggestion?: boolean;
        liked?: boolean;
        disliked?: boolean;
        userId?: string;
        model?: string;
        jobId?: string;
    } = {}
): AssetVersion {
    const startedAt = opts.startedAt ?? new Date(version * 10_000);
    const createdAt = opts.createdAt ?? new Date(startedAt.getTime() + 5_000);
    return {
        version,
        data: `https://storage/asset-v${version}`,
        type: "video",
        metadata: {
            model: opts.model ?? "test-model",
            jobId: opts.jobId ?? `job-${version}`,
            evaluation: score > 0
                ? { score, ruleSuggestion: opts.ruleSuggestion ? "use consistent lighting" : undefined } as any
                : null,
        },
        userFeedback: opts.liked
            ? { rating: "liked", userId: opts.userId ?? "user-1", recordedAt: new Date() }
            : opts.disliked
                ? { rating: "disliked", userId: opts.userId ?? "user-1", recordedAt: new Date() }
                : null,
        startedAt,
        createdAt,
    };
}

function makeHistory(head: number, best: number, versions: AssetVersion[]): AssetHistory {
    return { head, best, versions };
}

const singleSceneRegistry: AssetRegistry = {
    scene_video: makeHistory(2, 1, [
        makeVersion(1, 0.8),
        makeVersion(2, 0.65),
    ]),
    video_prompt: makeHistory(1, 1, [
        makeVersion(1, 0.9),
    ]),
};

const lockedBestRegistry: AssetRegistry = {
    scene_video: makeHistory(2, 1, [
        makeVersion(1, 0.75, { liked: true }),
        makeVersion(2, 0.85),
    ]),
};

const threeSceneRegistries: Record<string, AssetRegistry> = {
    "scene-a": {
        scene_video: makeHistory(3, 2, [
            makeVersion(1, 0.5, { createdAt: new Date(1000) }),
            makeVersion(2, 0.82, { ruleSuggestion: true, createdAt: new Date(2000) }),
            makeVersion(3, 0.6, { createdAt: new Date(3000) }),
        ]),
    },
    "scene-b": {
        scene_video: makeHistory(1, 1, [
            makeVersion(1, 0.9, { liked: true, createdAt: new Date(4000) }),
        ]),
    },
    "scene-c": {
        scene_video: makeHistory(1, 0, [
            makeVersion(1, 0.4, { createdAt: new Date(5000) }),
        ]),
    },
};

// ============================================================================
// deriveAssetKeyMetrics
// ============================================================================

describe("deriveAssetKeyMetrics", () => {
    it("returns zero metrics for empty histories array", () => {
        const result = deriveAssetKeyMetrics([]);
        expect(result.totalAttempts).toBe(0);
        expect(result.completedCount).toBe(0);
        expect(result.avgScore).toBe(0);
        expect(result.likedCount).toBe(0);
        expect(result.dislikedCount).toBe(0);
        expect(result.userSentimentRate).toBe(0);
    });

    it("totals attempts from head, not version array length", () => {
        const history = makeHistory(5, 1, [makeVersion(1, 0.8)]);
        const result = deriveAssetKeyMetrics([history]);
        expect(result.totalAttempts).toBe(5);
        expect(result.avgAttempts).toBe(5);
    });

    it("scores only the best version per scene, not all versions", () => {
        const history = makeHistory(2, 1, [
            makeVersion(1, 0.8),
            makeVersion(2, 0.3), // worse — should be ignored for avg
        ]);
        const result = deriveAssetKeyMetrics([history]);
        expect(result.avgScore).toBe(0.8);
    });

    it("calculates completionRate correctly across mixed scenes", () => {
        const histories = [
            makeHistory(1, 1, [makeVersion(1, 0.9)]),
            makeHistory(1, 0, [makeVersion(1, 0.4)]),
        ];
        const result = deriveAssetKeyMetrics(histories);
        expect(result.completionRate).toBe(0.5);
        expect(result.completedCount).toBe(1);
    });

    it("calculates duration from createdAt minus startedAt", () => {
        const startedAt = new Date(0);
        const createdAt = new Date(30_000);
        const history = makeHistory(1, 1, [makeVersion(1, 0.8, { startedAt, createdAt })]);
        const result = deriveAssetKeyMetrics([history]);
        expect(result.avgDuration).toBe(30_000);
        expect(result.totalDuration).toBe(30_000);
    });

    it("counts ruleSuggestions on best versions only", () => {
        const histories = [
            makeHistory(2, 1, [
                makeVersion(1, 0.8, { ruleSuggestion: true }), // best — counts
                makeVersion(2, 0.5, { ruleSuggestion: true }), // not best — ignored
            ]),
        ];
        const result = deriveAssetKeyMetrics(histories);
        expect(result.rulesAddedCount).toBe(1);
    });

    it("counts feedback across ALL versions, not just best", () => {
        const history = makeHistory(2, 1, [
            makeVersion(1, 0.8, { liked: true }),
            makeVersion(2, 0.3, { disliked: true }),
        ]);
        const result = deriveAssetKeyMetrics([history]);
        expect(result.likedCount).toBe(1);
        expect(result.dislikedCount).toBe(1);
        expect(result.userSentimentRate).toBe(0.5);
    });

    it("userSentimentRate is 1.0 when all feedback is positive", () => {
        const histories = [
            makeHistory(1, 1, [makeVersion(1, 0.9, { liked: true })]),
            makeHistory(1, 1, [makeVersion(1, 0.8, { liked: true })]),
        ];
        expect(deriveAssetKeyMetrics(histories).userSentimentRate).toBe(1.0);
    });

    it("userSentimentRate is 0 when no feedback exists", () => {
        expect(deriveAssetKeyMetrics([makeHistory(1, 1, [makeVersion(1, 0.8)])]).userSentimentRate).toBe(0);
    });

    it("marks successRate for scores at or above 0.7 threshold", () => {
        const histories = [
            makeHistory(1, 1, [makeVersion(1, 0.7)]),  // exactly at threshold — success
            makeHistory(1, 1, [makeVersion(1, 0.69)]), // just below — not success
        ];
        const result = deriveAssetKeyMetrics(histories);
        expect(result.successRate).toBe(0.5);
    });

    it("recentTrend is improving when second half of best scores outperforms first half", () => {
        const histories = Array.from({ length: 10 }, (_, i) => {
            const score = i < 5 ? 0.5 : 0.8;
            return makeHistory(1, 1, [
                makeVersion(1, score, {
                    startedAt: new Date(i * 1000),
                    createdAt: new Date(i * 1000 + 500),
                })
            ]);
        });
        expect(deriveAssetKeyMetrics(histories).recentTrend).toBe("improving");
    });

    it("recentTrend is stable with fewer than 10 completed histories", () => {
        expect(deriveAssetKeyMetrics([makeHistory(1, 1, [makeVersion(1, 0.8)])]).recentTrend).toBe("stable");
    });
});

// ============================================================================
// deriveGlobalMetrics
// ============================================================================

describe("deriveGlobalMetrics", () => {
    it("counts totalScenes from registry key count", () => {
        const result = deriveGlobalMetrics(threeSceneRegistries, ["scene_video"]);
        expect(result.totalScenes).toBe(3);
    });

    it("completedScenes = scenes where scene_video.best > 0", () => {
        const result = deriveGlobalMetrics(threeSceneRegistries, ["scene_video"]);
        expect(result.completedScenes).toBe(2);
    });

    it("totalAssets = totalScenes × assetKeys.length", () => {
        const result = deriveGlobalMetrics(threeSceneRegistries, ["scene_video", "video_prompt"]);
        expect(result.totalAssets).toBe(6);
    });

    it("aggregates totalRulesAdded from best versions", () => {
        const result = deriveGlobalMetrics(threeSceneRegistries, ["scene_video"]);
        expect(result.totalRulesAdded).toBe(1);
    });

    it("aggregates totalLiked and totalDisliked across all keys", () => {
        const result = deriveGlobalMetrics(threeSceneRegistries, ["scene_video"]);
        expect(result.totalLiked).toBe(1);
        expect(result.totalDisliked).toBe(0);
    });

    it("avgQualityScore is 0 when no scenes are completed", () => {
        const empty: Record<string, AssetRegistry> = {
            "s1": { scene_video: makeHistory(1, 0, [makeVersion(1, 0.5)]) },
        };
        expect(deriveGlobalMetrics(empty, ["scene_video"]).avgQualityScore).toBe(0);
    });

    it("provides assetBreakdown with metrics per key", () => {
        const result = deriveGlobalMetrics(threeSceneRegistries, ["scene_video"]);
        expect(result.assetBreakdown.scene_video).toBeDefined();
        expect(result.assetBreakdown.scene_video!.completedCount).toBe(2);
    });

    it("returns empty assetBreakdown for keys not present in any registry", () => {
        const result = deriveGlobalMetrics(threeSceneRegistries, ["image_file"]);
        // image_file isn't in any registry — completedCount should be 0
        expect(result.assetBreakdown.image_file!.completedCount).toBe(0);
    });
});

// ============================================================================
// flattenVersionActivity
// ============================================================================

describe("flattenVersionActivity", () => {
    it("returns versions sorted newest completedAt first", () => {
        const registries: Record<string, AssetRegistry> = {
            "s1": {
                scene_video: makeHistory(2, 1, [
                    makeVersion(1, 0.8, { createdAt: new Date(1000) }),
                    makeVersion(2, 0.9, { createdAt: new Date(3000) }),
                ]),
            },
        };
        const result = flattenVersionActivity(registries, ["scene_video"]);
        expect(result[0].completedAt.getTime()).toBe(3000);
        expect(result[1].completedAt.getTime()).toBe(1000);
    });

    it("respects the limit parameter", () => {
        const versions = Array.from({ length: 10 }, (_, i) => makeVersion(i + 1, 0.8));
        const registries: Record<string, AssetRegistry> = {
            "s1": { scene_video: makeHistory(10, 1, versions) },
        };
        expect(flattenVersionActivity(registries, ["scene_video"], 3)).toHaveLength(3);
    });

    it("includes userFeedback on each entry", () => {
        const registries: Record<string, AssetRegistry> = {
            "s1": {
                scene_video: makeHistory(1, 1, [
                    makeVersion(1, 0.8, { liked: true, userId: "user-42" }),
                ]),
            },
        };
        const result = flattenVersionActivity(registries, ["scene_video"]);
        expect(result[0].userFeedback?.rating).toBe("liked");
        expect(result[0].userFeedback?.userId).toBe("user-42");
    });

    it("flattens across multiple scenes and keys", () => {
        const result = flattenVersionActivity(threeSceneRegistries, ["scene_video"]);
        expect(result).toHaveLength(5);
    });

    it("calculates duration as createdAt minus startedAt", () => {
        const registries: Record<string, AssetRegistry> = {
            "s1": {
                scene_video: makeHistory(1, 1, [
                    makeVersion(1, 0.8, { startedAt: new Date(0), createdAt: new Date(12_000) }),
                ]),
            },
        };
        expect(flattenVersionActivity(registries, ["scene_video"])[0].duration).toBe(12_000);
    });
});

// ============================================================================
// getSceneAssetHistory
// ============================================================================

describe("getSceneAssetHistory", () => {
    it("returns versions sorted newest-first by version number", () => {
        const result = getSceneAssetHistory(singleSceneRegistry, "scene_video");
        expect(result[0].version).toBe(2);
        expect(result[1].version).toBe(1);
    });

    it("marks exactly one version as isBest", () => {
        const result = getSceneAssetHistory(singleSceneRegistry, "scene_video");
        const bests = result.filter(v => v.isBest);
        expect(bests).toHaveLength(1);
        expect(bests[0].version).toBe(1);
    });

    it("returns empty array for missing asset key", () => {
        expect(getSceneAssetHistory(singleSceneRegistry, "image_file")).toHaveLength(0);
    });

    it("includes userFeedback on each entry", () => {
        const result = getSceneAssetHistory(lockedBestRegistry, "scene_video");
        expect(result.find(v => v.version === 1)?.userFeedback?.rating).toBe("liked");
        expect(result.find(v => v.version === 2)?.userFeedback).toBeNull();
    });

    it("includes hasRuleSuggestion flag", () => {
        const registry: AssetRegistry = {
            scene_video: makeHistory(1, 1, [makeVersion(1, 0.9, { ruleSuggestion: true })]),
        };
        expect(getSceneAssetHistory(registry, "scene_video")[0].hasRuleSuggestion).toBe(true);
    });
});

// ============================================================================
// hasNewerVersionsThanBest
// ============================================================================

describe("hasNewerVersionsThanBest", () => {
    it("returns true when head > best and best > 0", () => {
        expect(hasNewerVersionsThanBest(lockedBestRegistry.scene_video!)).toBe(true);
    });

    it("returns false when head === best", () => {
        expect(hasNewerVersionsThanBest(makeHistory(2, 2, []))).toBe(false);
    });

    it("returns false when best is 0 (no version ever selected)", () => {
        expect(hasNewerVersionsThanBest(makeHistory(1, 0, []))).toBe(false);
    });
});

// ============================================================================
// deriveRollingTrend
// ============================================================================

describe("deriveRollingTrend ", () => {
    it("returns empty array when no assets are completed", () => {
        const registries: Record<string, AssetRegistry> = {
            "s1": { scene_video: makeHistory(1, 0, [makeVersion(1, 0.5)]) },
        };
        expect(deriveRollingTrend(registries, ["scene_video"])).toHaveLength(0);
    });

    it("requires at least 2 completed assets before emitting a snapshot", () => {
        const registries: Record<string, AssetRegistry> = {
            "s1": { scene_video: makeHistory(1, 1, [makeVersion(1, 0.8)]) },
        };
        expect(deriveRollingTrend(registries, ["scene_video"])).toHaveLength(0);
    });

    it("emits a snapshot at each step after the 2nd data point", () => {
        const registries: Record<string, AssetRegistry> = Object.fromEntries(
            [1, 2, 3, 4].map((i) => [
                `scene-${i}`,
                { scene_video: makeHistory(1, 1, [makeVersion(1, 0.7, { createdAt: new Date(i * 1000) })]) }
            ])
        );
        expect(deriveRollingTrend(registries, ["scene_video"])).toHaveLength(3);
    });

    it("snapshots are in ascending index order", () => {
        const result = deriveRollingTrend(threeSceneRegistries, ["scene_video"]);
        for (let i = 1; i < result.length; i++) {
            expect(result[i].index).toBeGreaterThan(result[i - 1].index);
        }
    });

    it("qualityTrendSlope is positive when quality consistently improves", () => {
        const registries: Record<string, AssetRegistry> = Object.fromEntries(
            [0.3, 0.5, 0.7, 0.85, 0.95].map((score, i) => [
                `scene-${i}`,
                { scene_video: makeHistory(1, 1, [makeVersion(1, score, { createdAt: new Date(i * 1000) })]) }
            ])
        );
        const result = deriveRollingTrend(registries, ["scene_video"]);
        expect(result[result.length - 1].qualityTrendSlope).toBeGreaterThan(0);
    });

    it("attemptTrendSlope is negative when attempt count decreases over time", () => {
        const registries: Record<string, AssetRegistry> = Object.fromEntries(
            [5, 4, 3, 2, 1].map((attempts, i) => [
                `scene-${i}`,
                {
                    scene_video: makeHistory(attempts, 1, [
                        makeVersion(1, 0.8, { createdAt: new Date(i * 1000) })
                    ])
                }
            ])
        );
        const result = deriveRollingTrend(registries, ["scene_video"]);
        expect(result[result.length - 1].attemptTrendSlope).toBeLessThan(0);
    });
});

// ============================================================================
// predictRemainingWork
// ============================================================================

describe("predictRemainingWork", () => {
    it("returns zeros when remainingScenes is 0", () => {
        const trend = { averageAttempts: 2, attemptTrendSlope: -0.1, qualityTrendSlope: 0.05 };
        const result = predictRemainingWork(trend, 0);
        expect(result.predictedAttempts).toBe(0);
        expect(result.predictedQuality).toBe(0);
    });

    it("predictedAttempts is at least remainingScenes (min 1 per scene)", () => {
        const trend = { averageAttempts: 0.01, attemptTrendSlope: -100, qualityTrendSlope: 0 };
        const result = predictRemainingWork(trend, 5);
        expect(result.predictedAttempts).toBeGreaterThanOrEqual(5);
    });

    it("predictedQuality is clamped to [0, 1]", () => {
        const trend = { averageAttempts: 1, attemptTrendSlope: 0, qualityTrendSlope: 999 };
        const result = predictRemainingWork(trend, 3);
        expect(result.predictedQuality).toBeLessThanOrEqual(1);
        expect(result.predictedQuality).toBeGreaterThanOrEqual(0);
    });
});

// ============================================================================
// formatDuration
// ============================================================================

describe("formatDuration", () => {
    it("formats sub-second as ms", () => expect(formatDuration(500)).toBe("500ms"));
    it("formats seconds", () => expect(formatDuration(5_500)).toBe("5.5s"));
    it("formats minutes", () => expect(formatDuration(90_000)).toBe("1.5m"));
    it("formats hours", () => expect(formatDuration(7_200_000)).toBe("2.0h"));
    it("1000ms is exactly 1.0s", () => expect(formatDuration(1000)).toBe("1.0s"));
});

// ============================================================================
// formatPercentage
// ============================================================================

describe("formatPercentage", () => {
    it("0 → 0.0%", () => expect(formatPercentage(0)).toBe("0.0%"));
    it("1 → 100.0%", () => expect(formatPercentage(1)).toBe("100.0%"));
    it("0.755 → 75.5%", () => expect(formatPercentage(0.755)).toBe("75.5%"));
    it("respects decimals=0", () => expect(formatPercentage(0.8, 0)).toBe("80%"));
});