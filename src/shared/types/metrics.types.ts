// shared/types/metrics.types.ts
import { z } from "zod";
import { AssetKey } from "./assets.types.js";
import { PromptCorrection, QualityEvaluationResult } from "./quality.types.js";



// ============================================================================
// WORKFLOW METRICS
// ============================================================================

export const Trend = z.object({
  averageAttempts: z.number().describe("Average number of attempts per asset"),
  attemptTrendSlope: z.number().describe("Slope of the attempt trend"),
  qualityTrendSlope: z.number().describe("Slope of the quality trend"),
});
export type Trend = z.infer<typeof Trend>;

export const RegressionState = z.object({
  count: z.number(),
  sumX: z.number(),
  sumY_a: z.number(),
  sumY_q: z.number(),
  sumXY_a: z.number(),
  sumXY_q: z.number(),
  sumX2: z.number(),
}).default({
    count: 0,
    sumX: 0,
    sumY_a: 0,
    sumY_q: 0,
    sumXY_a: 0,
    sumXY_q: 0,
    sumX2: 0,
  })
export type RegressionState = z.infer<typeof RegressionState>;

export const VersionMetric = z.object({
  assetKey: AssetKey,
  entityId: z.string().describe("Entity ID"),
  attemptNumber: z.number().describe("Job attempt (1, 2, 3...)"),
  // assetVersion: z.number().describe("Which version was created"),
  finalScore: z.number().describe("Final quality score"),
  jobId: z.string().describe("Link to specific job"),
  startTime: z.number().describe("Start time of the job attempt"),
  endTime: z.number().describe("End time of the job attempt"),
  attemptDuration: z.number().describe("Duration of the job attempt"),
  ruleAdded: z.array(z.string()).default([]).describe("Rules added to the job"),
  corrections: z.array(PromptCorrection).default([]).describe("Corrections made to the prompt"),
  regression: RegressionState.default({
    count: 0,
    sumX: 0,
    sumY_a: 0,
    sumY_q: 0,
    sumXY_a: 0,
    sumXY_q: 0,
    sumX2: 0,
  }).describe("Production metrics for regression analysis"),
});
export type VersionMetric = z.infer<typeof VersionMetric>;

export const WorkflowMetrics = z.object({
  globalTrend: Trend.nullish().default(null).describe("Production metrics for global trend analysis"),
  regression: RegressionState.describe("Production metrics for regression analysis"),
  trendHistory: z.array(Trend).default([]).describe("Production metrics for trend analysis"),
}).and(z.record(AssetKey, z.array(VersionMetric).default([])))
  .default((() => createDefaultMetrics()) as any)
  .describe("Production metrics");
export type WorkflowMetrics = z.infer<typeof WorkflowMetrics>;

/**
 * Default WorkflowMetrics factory for project creation.
 */
export const createDefaultMetrics = (): WorkflowMetrics => {
  return WorkflowMetrics.parse({});
};

export const createDefaultRegression = () => {
  return RegressionState.parse({});
}