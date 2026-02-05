import { WorkflowMetrics, VersionMetric, Trend, RegressionState } from "../../shared/types/metrics.types.js";
import { Scene, AssetKey } from "../../shared/types/index.js";
import { getAllBestFromAssets } from "../../shared/utils/assets-utils.js";

/**
 * Calculates comprehensive metrics for a specific asset type across all scenes
 */
export function calculateAssetMetrics(
    scenes: Scene[],
    assetKey: AssetKey
): {
    totalAttempts: number;
    avgAttempts: number;
    avgScore: number;
    totalDuration: number;
    avgDuration: number;
    completionRate: number;
    successRate: number;
    rulesAdded: number;
} {
    let totalAttempts = 0;
    let totalScore = 0;
    let totalDuration = 0;
    let completedCount = 0;
    let successCount = 0;
    let rulesAdded = 0;

    for (const scene of scenes) {
        const assets = scene.assets?.[ assetKey ];
        if (!assets) continue;

        const headVersion = assets.head || 1;
        totalAttempts += headVersion;

        const bestVersion = assets.versions.find(v => v.version === assets.best);
        if (bestVersion) {
            completedCount++;

            // Extract quality score from evaluation
            const evaluation = bestVersion.metadata?.evaluation;
            if (evaluation?.scores) {
                const overallScore = evaluation.score ||
                    Object.values(evaluation.scores).reduce((sum, cat: any) =>
                        sum + (cat.score || 0), 0) as any / Object.keys(evaluation.scores).length;
                totalScore += overallScore;

                // Count as success if score > 0.7 (configurable threshold)
                if (overallScore >= 0.7) successCount++;
            }

            // Aggregate rules added
            if (evaluation?.ruleSuggestion) {
                rulesAdded++;
            }
        }

        // Calculate duration from version timestamps if available
        const versions = assets.versions.filter(v => v.createdAt);
        if (versions.length > 0) {
            const sortedVersions = versions.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
            const duration = sortedVersions[ sortedVersions.length - 1 ].createdAt.getTime() - sortedVersions[ 0 ].createdAt.getTime();
            totalDuration += duration;
        }
    }

    const sceneCount = scenes.length;

    return {
        totalAttempts,
        avgAttempts: sceneCount > 0 ? totalAttempts / sceneCount : 0,
        avgScore: completedCount > 0 ? totalScore / completedCount : 0,
        totalDuration,
        avgDuration: completedCount > 0 ? totalDuration / completedCount : 0,
        completionRate: sceneCount > 0 ? completedCount / sceneCount : 0,
        successRate: completedCount > 0 ? successCount / completedCount : 0,
        rulesAdded
    };
}

/**
 * Calculates global metrics across all asset types
 */
export function calculateGlobalMetrics(
    scenes: Scene[],
    assetKeys: AssetKey[]
): {
    totalScenes: number;
    completedScenes: number;
    totalAssets: number;
    completedAssets: number;
    avgQualityScore: number;
    totalDuration: number;
    totalRulesAdded: number;
    assetBreakdown: Record<AssetKey, ReturnType<typeof calculateAssetMetrics>>;
} {
    let totalAssets = 0;
    let completedAssets = 0;
    let totalQualityScore = 0;
    let qualityScoreCount = 0;
    let totalDuration = 0;
    let totalRulesAdded = 0;

    const assetBreakdown: Record<string, ReturnType<typeof calculateAssetMetrics>> = {};

    for (const assetKey of assetKeys) {
        const metrics = calculateAssetMetrics(scenes, assetKey);
        assetBreakdown[ assetKey ] = metrics;

        totalAssets += scenes.length;
        completedAssets += scenes.filter(s => s.assets?.[ assetKey ]?.best !== undefined).length;

        if (metrics.avgScore > 0) {
            totalQualityScore += metrics.avgScore * scenes.length;
            qualityScoreCount += scenes.length;
        }

        totalDuration += metrics.totalDuration;
        totalRulesAdded += metrics.rulesAdded;
    }

    const completedScenes = scenes.filter(s => s.status === "complete").length;

    return {
        totalScenes: scenes.length,
        completedScenes,
        totalAssets,
        completedAssets,
        avgQualityScore: qualityScoreCount > 0 ? totalQualityScore / qualityScoreCount : 0,
        totalDuration,
        totalRulesAdded,
        assetBreakdown
    };
}

/**
 * Incremental linear regression for learning trends
 */
export function updateRegression(
    regression: RegressionState,
    newMetric: VersionMetric
): RegressionState {
    const n = regression.count + 1;
    const x = n; // Time index
    const y_attempts = newMetric.attemptNumber;
    const y_quality = newMetric.finalScore;

    return {
        count: n,
        sumX: regression.sumX + x,
        sumY_a: regression.sumY_a + y_attempts,
        sumY_q: regression.sumY_q + y_quality,
        sumXY_a: regression.sumXY_a + (x * y_attempts),
        sumXY_q: regression.sumXY_q + (x * y_quality),
        sumX2: regression.sumX2 + (x * x),
    };
}

/**
 * Calculate trend slopes from regression state
 */
export function calculateTrendFromRegression(regression: RegressionState): Trend {
    const n = regression.count;

    if (n < 2) {
        return {
            averageAttempts: n === 1 ? regression.sumY_a : 0,
            attemptTrendSlope: 0,
            qualityTrendSlope: 0,
        };
    }

    const denominator = n * regression.sumX2 - regression.sumX * regression.sumX;

    const attemptSlope = denominator !== 0
        ? (n * regression.sumXY_a - regression.sumX * regression.sumY_a) / denominator
        : 0;

    const qualitySlope = denominator !== 0
        ? (n * regression.sumXY_q - regression.sumX * regression.sumY_q) / denominator
        : 0;

    return {
        averageAttempts: regression.sumY_a / n,
        attemptTrendSlope: isNaN(attemptSlope) ? 0 : attemptSlope,
        qualityTrendSlope: isNaN(qualitySlope) ? 0 : qualitySlope,
    };
}

/**
 * Updates workflow metrics with a new version metric
 */
export function addVersionMetric(
    currentMetrics: WorkflowMetrics,
    assetKey: AssetKey,
    versionMetric: VersionMetric
): WorkflowMetrics {
    const versionMetrics = { ...currentMetrics.versionMetrics };

    if (!versionMetrics[ assetKey ]) {
        versionMetrics[ assetKey ] = [];
    }

    versionMetrics[ assetKey ] = [ ...versionMetrics[ assetKey ]!, versionMetric ];

    const updatedRegression = updateRegression(currentMetrics.regression, versionMetric);
    const newTrend = calculateTrendFromRegression(updatedRegression);

    const trendHistory = [ ...currentMetrics.trendHistory, newTrend ];

    return {
        ...currentMetrics,
        versionMetrics,
        regression: updatedRegression,
        trendHistory,
        globalTrend: newTrend,
    };
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
    return `${(ms / 3600000).toFixed(1)}h`;
}

/**
 * Format percentage with consistent decimals
 */
export function formatPercentage(value: number, decimals: number = 1): string {
    return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Calculate predicted remaining attempts based on trend
 */
export function predictRemainingWork(
    trend: Trend,
    remainingScenes: number,
    remainingAssets: number
): {
    predictedAttempts: number;
    predictedQuality: number;
    estimatedDuration: number;
} {
    const avgAttempts = trend.averageAttempts;
    const attemptSlope = trend.attemptTrendSlope;
    const qualitySlope = trend.qualityTrendSlope;

    // Project attempts with learning curve
    let totalPredictedAttempts = 0;
    let totalPredictedQuality = 0;

    for (let i = 0; i < remainingScenes; i++) {
        const futureIndex = i + 1;
        const predictedAttempts = Math.max(1, avgAttempts + (attemptSlope * futureIndex));
        const predictedQuality = Math.min(1, Math.max(0, 0.5 + (qualitySlope * futureIndex)));

        totalPredictedAttempts += predictedAttempts;
        totalPredictedQuality += predictedQuality;
    }

    return {
        predictedAttempts: Math.ceil(totalPredictedAttempts),
        predictedQuality: remainingScenes > 0 ? totalPredictedQuality / remainingScenes : 0,
        estimatedDuration: 0, // Would need historical duration data
    };
}

/**
 * Get asset-specific metrics from version metrics
 */
export function getAssetVersionMetrics(
    versionMetrics: Record<string, VersionMetric[]>,
    assetKey: AssetKey
): {
    totalVersions: number;
    avgAttempts: number;
    avgScore: number;
    totalDuration: number;
    rulesAddedCount: number;
    recentTrend: "improving" | "declining" | "stable";
} {
    const metrics = versionMetrics[ assetKey ] || []; 

    if (metrics.length === 0) {
        return {
            totalVersions: 0,
            avgAttempts: 0,
            avgScore: 0,
            totalDuration: 0,
            rulesAddedCount: 0,
            recentTrend: "stable"
        };
    }

    const totalVersions = metrics.length;
    const avgAttempts = metrics.reduce((sum, m) => sum + m.attemptNumber, 0) / totalVersions;
    const avgScore = metrics.reduce((sum, m) => sum + m.finalScore, 0) / totalVersions;
    const totalDuration = metrics.reduce((sum, m) => sum + m.attemptDuration, 0);
    const rulesAddedCount = metrics.reduce((sum, m) => sum + m.ruleAdded.length, 0);

    // Calculate recent trend (last 5 vs previous 5)
    let recentTrend: "improving" | "declining" | "stable" = "stable";
    if (totalVersions >= 10) {
        const recent5 = metrics.slice(-5);
        const previous5 = metrics.slice(-10, -5);

        const recentAvg = recent5.reduce((sum, m) => sum + m.finalScore, 0) / 5;
        const previousAvg = previous5.reduce((sum, m) => sum + m.finalScore, 0) / 5;

        if (recentAvg > previousAvg * 1.05) recentTrend = "improving";
        else if (recentAvg < previousAvg * 0.95) recentTrend = "declining";
    }

    return {
        totalVersions,
        avgAttempts,
        avgScore,
        totalDuration,
        rulesAddedCount,
        recentTrend
    };
}