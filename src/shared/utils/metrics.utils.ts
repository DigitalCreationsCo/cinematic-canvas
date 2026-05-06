import { AssetHistory, AssetKey, AssetRegistry, AssetVersion, UserFeedback } from "../types/assets.types.js";

// ============================================================================
// CONSTANTS
// ============================================================================

const SUCCESS_SCORE_THRESHOLD = 0.7;

// ============================================================================
// EXPORTED TYPES
// ============================================================================

/** A single generation event surfaced in the activity feed. */
export interface ActivityEntry {
    assetKey: AssetKey;
    sceneId: string;
    version: number;
    score: number;             // 0–1 eval score
    duration: number;          // ms: createdAt − startedAt
    completedAt: Date;
    model: string;
    hasRuleSuggestion: boolean;
    jobId: string;
    userFeedback: UserFeedback | null;
}

/** Aggregate metrics for one AssetKey across all scenes. */
export interface AssetKeyMetrics {
    totalAttempts: number;     // sum of history.head across all scenes
    avgAttempts: number;       // totalAttempts / sceneCount
    completedCount: number;    // scenes where best > 0
    completionRate: number;    // completedCount / sceneCount
    avgScore: number;          // avg eval score of best versions
    successRate: number;       // proportion of best versions with score ≥ threshold
    avgDuration: number;       // ms average of best version durations
    totalDuration: number;     // ms sum
    rulesAddedCount: number;   // best versions that triggered a rule suggestion
    recentTrend: "improving" | "declining" | "stable";
    // Feedback
    likedCount: number;        // versions across all scenes with rating='liked'
    dislikedCount: number;     // versions across all scenes with rating='disliked'
    userSentimentRate: number; // likedCount / (likedCount + dislikedCount), 0 if no feedback
}

/** Global metrics derived across all scene registries and asset keys. */
export interface GlobalMetrics {
    totalScenes: number;
    completedScenes: number;   // scenes where scene_video has best > 0
    totalAssets: number;       // totalScenes × assetKeys.length
    completedAssets: number;   // sum of completedCount across all keys
    avgQualityScore: number;
    totalDuration: number;     // ms
    totalRulesAdded: number;
    // Feedback
    totalLiked: number;
    totalDisliked: number;
    assetBreakdown: Partial<Record<AssetKey, AssetKeyMetrics>>;
    trend: Trend;
}

/** Linear regression output — describes how the workflow is learning over time. */
export interface Trend {
    averageAttempts: number;
    attemptTrendSlope: number;  // < 0 = improving (fewer attempts needed)
    qualityTrendSlope: number;  // > 0 = improving (higher scores over time)
}

/** A single version entry for the selected-scene history panel. */
export interface SceneVersionEntry {
    version: number;
    score: number;
    duration: number;           // ms
    completedAt: Date;
    isBest: boolean;
    model: string;
    hasRuleSuggestion: boolean;
    userFeedback: UserFeedback | null;
}

/** A snapshot of the trend at a point in time, for the rolling trend chart. */
export interface TrendSnapshot {
    index: number;              // chronological position
    completedAt: Date;
    averageAttempts: number;
    qualityTrendSlope: number;
    attemptTrendSlope: number;
}

// ============================================================================
// INTERNAL — REGRESSION
// ============================================================================

interface RegressionState {
    count: number;
    sumX: number;
    sumY_a: number;
    sumY_q: number;
    sumXY_a: number;
    sumXY_q: number;
    sumX2: number;
}

function defaultRegression(): RegressionState {
    return { count: 0, sumX: 0, sumY_a: 0, sumY_q: 0, sumXY_a: 0, sumXY_q: 0, sumX2: 0 };
}

function updateRegression(reg: RegressionState, attempts: number, quality: number): RegressionState {
    const n = reg.count + 1;
    return {
        count: n,
        sumX: reg.sumX + n,
        sumY_a: reg.sumY_a + attempts,
        sumY_q: reg.sumY_q + quality,
        sumXY_a: reg.sumXY_a + n * attempts,
        sumXY_q: reg.sumXY_q + n * quality,
        sumX2: reg.sumX2 + n * n,
    };
}

function regressionToTrend(reg: RegressionState): Trend {
    const n = reg.count;
    if (n < 2) {
        return { averageAttempts: n === 1 ? reg.sumY_a : 0, attemptTrendSlope: 0, qualityTrendSlope: 0 };
    }
    const denom = n * reg.sumX2 - reg.sumX * reg.sumX;
    const slope = (num: number) => (denom !== 0 ? num / denom : 0);
    const attemptSlope = slope(n * reg.sumXY_a - reg.sumX * reg.sumY_a);
    const qualitySlope = slope(n * reg.sumXY_q - reg.sumX * reg.sumY_q);
    return {
        averageAttempts: reg.sumY_a / n,
        attemptTrendSlope: isNaN(attemptSlope) ? 0 : attemptSlope,
        qualityTrendSlope: isNaN(qualitySlope) ? 0 : qualitySlope,
    };
}

// ============================================================================
// INTERNAL — ASSET HELPERS
// ============================================================================

function getEvalScore(version: AssetVersion): number {
    const evaluation = version.metadata?.evaluation;
    if (!evaluation) return 0;
    if (typeof evaluation.score === "number") return evaluation.score;
    if (evaluation.scores) {
        const vals = Object.values(evaluation.scores) as any[];
        return vals.length > 0
            ? vals.reduce((sum: number, cat: any) => sum + (cat.score ?? 0), 0) / vals.length
            : 0;
    }
    return 0;
}

function getGenerationDuration(version: AssetVersion): number {
    return Math.max(0, version.createdAt.getTime() - version.startedAt.getTime());
}

function getBestVersion(history: AssetHistory): AssetVersion | undefined {
    if (!history.best || !history.versions.length) return undefined;
    return history.versions.find(v => v.version === history.best);
}

// ============================================================================
// PUBLIC — FORMATTING UTILITIES
// ============================================================================

export function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`;
    return `${(ms / 3_600_000).toFixed(1)}h`;
}

export function formatPercentage(value: number, decimals = 1): string {
    return `${(value * 100).toFixed(decimals)}%`;
}

// ============================================================================
// PUBLIC — CORE METRIC DERIVATION
// ============================================================================

/**
 * Derive aggregate metrics for a single asset key from an array of
 * AssetHistory objects (one per scene / entity).
 */
export function deriveAssetKeyMetrics(histories: AssetHistory[]): AssetKeyMetrics {
    let totalAttempts = 0;
    let completedCount = 0;
    let totalScore = 0;
    let successCount = 0;
    let totalDuration = 0;
    let rulesAddedCount = 0;
    let likedCount = 0;
    let dislikedCount = 0;

    const bestVersions: AssetVersion[] = [];

    for (const history of histories) {
        totalAttempts += history.head;
        const best = getBestVersion(history);
        if (!best) continue;

        completedCount++;
        const score = getEvalScore(best);
        totalScore += score;
        if (score >= SUCCESS_SCORE_THRESHOLD) successCount++;
        totalDuration += getGenerationDuration(best);
        if (best.metadata?.evaluation?.ruleSuggestion) rulesAddedCount++;

        // Count feedback across ALL versions (not just best)
        for (const v of history.versions) {
            if (v.userFeedback?.rating === "liked") likedCount++;
            if (v.userFeedback?.rating === "disliked") dislikedCount++;
        }

        bestVersions.push(best);
    }

    const sceneCount = histories.length;

    // Recent trend: last 5 best versions vs previous 5, sorted by createdAt
    let recentTrend: "improving" | "declining" | "stable" = "stable";
    if (bestVersions.length >= 10) {
        const sorted = [...bestVersions].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        const recentAvg = sorted.slice(-5).reduce((s, v) => s + getEvalScore(v), 0) / 5;
        const prevAvg = sorted.slice(-10, -5).reduce((s, v) => s + getEvalScore(v), 0) / 5;
        if (recentAvg > prevAvg * 1.05) recentTrend = "improving";
        else if (recentAvg < prevAvg * 0.95) recentTrend = "declining";
    }

    return {
        totalAttempts,
        avgAttempts: sceneCount > 0 ? totalAttempts / sceneCount : 0,
        completedCount,
        completionRate: sceneCount > 0 ? completedCount / sceneCount : 0,
        avgScore: completedCount > 0 ? totalScore / completedCount : 0,
        successRate: completedCount > 0 ? successCount / completedCount : 0,
        avgDuration: completedCount > 0 ? totalDuration / completedCount : 0,
        totalDuration,
        rulesAddedCount,
        recentTrend,
        likedCount,
        dislikedCount,
        userSentimentRate: (likedCount + dislikedCount) > 0
            ? likedCount / (likedCount + dislikedCount)
            : 0,
    };
}

/**
 * Derive global metrics across all scene registries and the given asset keys.
 * A scene is "complete" when its scene_video history has best > 0.
 */
export function deriveGlobalMetrics(
    sceneRegistries: Record<string, AssetRegistry>,
    assetKeys: AssetKey[],
): GlobalMetrics {
    const sceneIds = Object.keys(sceneRegistries);
    const totalScenes = sceneIds.length;

    const completedScenes = sceneIds.filter(id =>
        (sceneRegistries[id]?.scene_video?.best ?? 0) > 0
    ).length;

    let totalAssets = 0;
    let completedAssets = 0;
    let totalQuality = 0;
    let qualityCount = 0;
    let totalDuration = 0;
    let totalRulesAdded = 0;

    const assetBreakdown: Partial<Record<AssetKey, AssetKeyMetrics>> = {};

    // Collect all best versions in chronological order for regression
    const allBestVersionsChronological: Array<{ attempts: number; quality: number; }> = [];

    for (const assetKey of assetKeys) {
        const histories = sceneIds
            .map(id => sceneRegistries[id]?.[assetKey])
            .filter((h): h is AssetHistory => !!h);

        const metrics = deriveAssetKeyMetrics(histories);
        assetBreakdown[assetKey] = metrics;

        totalAssets += totalScenes;
        completedAssets += metrics.completedCount;
        totalDuration += metrics.totalDuration;
        totalRulesAdded += metrics.rulesAddedCount;

        if (metrics.avgScore > 0) {
            totalQuality += metrics.avgScore * metrics.completedCount;
            qualityCount += metrics.completedCount;
        }

        // Collect best versions for trend regression, sorted chronologically
        const bestVersions = histories
            .map(h => getBestVersion(h))
            .filter((v): v is AssetVersion => !!v)
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

        for (const version of bestVersions) {
            const history = histories.find(h => getBestVersion(h)?.version === version.version);
            if (history) {
                allBestVersionsChronological.push({
                    attempts: history.head,
                    quality: getEvalScore(version),
                });
            }
        }
    }

    let reg = defaultRegression();
    for (const { attempts, quality } of allBestVersionsChronological) {
        reg = updateRegression(reg, attempts, quality);
    }

    return {
        totalScenes,
        completedScenes,
        totalAssets,
        completedAssets,
        avgQualityScore: qualityCount > 0 ? totalQuality / qualityCount : 0,
        totalDuration,
        totalRulesAdded,
        totalLiked: Object.values(assetBreakdown).reduce((s, m) => s + (m?.likedCount ?? 0), 0),
        totalDisliked: Object.values(assetBreakdown).reduce((s, m) => s + (m?.dislikedCount ?? 0), 0),
        assetBreakdown,
        trend: regressionToTrend(reg),
    };
}

/**
 * Flatten all asset versions from all scene registries into a sorted activity
 * feed (newest first), limited to `limit` entries.
 */
export function flattenVersionActivity(
    sceneRegistries: Record<string, AssetRegistry>,
    assetKeys: AssetKey[],
    limit = 20,
): ActivityEntry[] {
    const entries: ActivityEntry[] = [];

    for (const [sceneId, registry] of Object.entries(sceneRegistries)) {
        if (!registry) continue;
        for (const assetKey of assetKeys) {
            const history = registry[assetKey];
            if (!history?.versions.length) continue;

            for (const version of history.versions) {
                entries.push({
                    assetKey,
                    sceneId,
                    version: version.version,
                    score: getEvalScore(version),
                    duration: getGenerationDuration(version),
                    completedAt: version.createdAt,
                    model: version.metadata?.model ?? "",
                    hasRuleSuggestion: !!version.metadata?.evaluation?.ruleSuggestion,
                    jobId: version.metadata?.jobId ?? "",
                    userFeedback: version.userFeedback ?? null,
                });
            }
        }
    }

    return entries
        .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())
        .slice(0, limit);
}

/**
 * Get the version history for a specific asset key within a single scene's
 * registry, sorted newest-first.
 */
export function getSceneAssetHistory(
    registry: AssetRegistry,
    assetKey: AssetKey,
): SceneVersionEntry[] {
    const history = registry[assetKey];
    if (!history?.versions.length) return [];

    return [...history.versions]
        .sort((a, b) => b.version - a.version)
        .map(v => ({
            version: v.version,
            score: getEvalScore(v),
            duration: getGenerationDuration(v),
            completedAt: v.createdAt,
            isBest: v.version === history.best,
            model: v.metadata?.model ?? "",
            hasRuleSuggestion: !!v.metadata?.evaluation?.ruleSuggestion,
            userFeedback: v.userFeedback ?? null,
        }));
}

/**
 * Compute rolling trend snapshots by replaying all best versions in
 * chronological order. Each snapshot represents the trend state at that point
 * in time — used to visualise how the workflow is learning over time.
 */
export function deriveRollingTrend(
    sceneRegistries: Record<string, AssetRegistry>,
    assetKeys: AssetKey[],
): TrendSnapshot[] {
    // Gather (completedAt, attempts, quality) for every best version
    const dataPoints: Array<{ completedAt: Date; attempts: number; quality: number; }> = [];

    for (const [, registry] of Object.entries(sceneRegistries)) {
        if (!registry) continue;
        for (const assetKey of assetKeys) {
            const history = registry[assetKey];
            if (!history) continue;
            const best = getBestVersion(history);
            if (!best) continue;
            dataPoints.push({
                completedAt: best.createdAt,
                attempts: history.head,
                quality: getEvalScore(best),
            });
        }
    }

    if (dataPoints.length === 0) return [];

    dataPoints.sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());

    const snapshots: TrendSnapshot[] = [];
    let reg = defaultRegression();

    for (let i = 0; i < dataPoints.length; i++) {
        const { completedAt, attempts, quality } = dataPoints[i];
        reg = updateRegression(reg, attempts, quality);
        // Only emit a snapshot once we have at least 2 data points for meaningful slopes
        if (reg.count >= 2) {
            const trend = regressionToTrend(reg);
            snapshots.push({
                index: i + 1,
                completedAt,
                averageAttempts: trend.averageAttempts,
                qualityTrendSlope: trend.qualityTrendSlope,
                attemptTrendSlope: trend.attemptTrendSlope,
            });
        }
    }

    return snapshots;
}

/**
 * Predict remaining work based on the current trend and remaining scene count.
 */
export function predictRemainingWork(
    trend: Trend,
    remainingScenes: number,
): { predictedAttempts: number; predictedQuality: number; } {
    let totalAttempts = 0;
    let totalQuality = 0;

    for (let i = 0; i < remainingScenes; i++) {
        totalAttempts += Math.max(1, trend.averageAttempts + trend.attemptTrendSlope * (i + 1));
        totalQuality += Math.min(1, Math.max(0, 0.5 + trend.qualityTrendSlope * (i + 1)));
    }

    return {
        predictedAttempts: Math.ceil(totalAttempts),
        predictedQuality: remainingScenes > 0 ? totalQuality / remainingScenes : 0,
    };
}

/**
 * Returns true when a scene's asset has newer versions beyond the current best,
 * which happens when bestLockedByFeedback prevented the latest generation from
 * being promoted. Used to show the "newer version available" indicator in the UI.
 */
export function hasNewerVersionsThanBest(history: AssetHistory): boolean {
    return history.head > history.best && history.best > 0;
}