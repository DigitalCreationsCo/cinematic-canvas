import { AssetKey } from "../types/assets.types.js";
import { RegressionState, Trend, VersionMetric, WorkflowMetrics } from "../types/metrics.types.js";
import { Character, CharacterAttributes, Location, LocationAttributes } from "../types/index.js";
import { getAllBestAssets } from "./assets-utils.js";

/**
 * Calculates learning trends using incremental linear regression.
 * Updates the metrics state with the new attempt data.
 * 
 * @param currentMetrics - The current state of workflow metrics.
 * @param newAttempt - The new attempt metric to add.
 * @returns The updated workflow metrics with new regression state and trends.
 */
export function calculateLearningTrends(
    currentMetrics: WorkflowMetrics,
    assetKey: AssetKey,
    newAttempt: VersionMetric
): WorkflowMetrics {
    // Clone to avoid mutation of the input if it's from state
    const metrics = { ...currentMetrics };

    // Initialize defaults if missing (though types say they should be there)
    const regression = metrics.regression || { count: 0, sumX: 0, sumY_a: 0, sumY_q: 0, sumXY_a: 0, sumXY_q: 0, sumX2: 0 };
    const trendHistory = metrics.trendHistory ? [ ...metrics.trendHistory ] : [];

    metrics[ assetKey ] = metrics[ assetKey ] || [];
    metrics[ assetKey ].push(newAttempt);

    // Update regression stats
    const n = regression.count + 1;
    const x = n; // Time step is just the index 1..N
    const y_q = newAttempt.finalScore;

    const newRegression: RegressionState = {
        count: n,
        sumX: regression.sumX + x,
        sumY_a: 0, // We are not tracking attempts vs attempts anymore, but quality over time
        sumY_q: regression.sumY_q + y_q,
        sumXY_a: 0,
        sumXY_q: regression.sumXY_q + x * y_q,
        sumX2: regression.sumX2 + x * x,
    };

    let qualityTrendSlope = 0;

    if (n >= 2) {
        const slope_q = (n * newRegression.sumXY_q - newRegression.sumX * newRegression.sumY_q) / (n * newRegression.sumX2 - newRegression.sumX * newRegression.sumX);
        qualityTrendSlope = isNaN(slope_q) ? 0 : slope_q;
    }

    const newTrend: Trend = {
        averageAttempts: 0, // Not relevant for single attempt stream
        attemptTrendSlope: 0,
        qualityTrendSlope,
    };

    trendHistory.push(newTrend);

    return {
        ...metrics,
        trendHistory,
        regression: newRegression,
        globalTrend: newTrend,
    };
}