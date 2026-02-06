import { db } from "../../shared/db/index.js";
import { projects, scenes } from "../../shared/db/schema.js";
import { eq } from "drizzle-orm";
import { WorkflowMetrics, VersionMetric, createDefaultMetrics } from "../../shared/types/metrics.types.js";
import { AssetKey } from "../../shared/types/assets.types.js";
import { getAllBestFromAssets } from "../../shared/utils/assets-utils.js";
import {
  updateRegression,
  calculateTrendFromRegression,
  addVersionMetric
} from "../../shared/utils/metrics-utils.js";
import { Project } from "../types/entities.types.js";

/**
 * Aggregates comprehensive performance metrics for a project
 */
export async function aggregateProjectPerformance(projectId: string): Promise<void> {
  const project = await db.query.projects.findFirst({
    where: { id: projectId }
  });

  if (!project) {
    console.error(`Project ${projectId} not found`);
    return;
  }

  const projectScenes = await db.query.scenes.findMany({
    where: { projectId },
    orderBy: (scenes, { asc }) => [ asc(scenes.sceneIndex) ]
  });

  // Start with existing metrics or create new
  let metrics: WorkflowMetrics = project.metrics || createDefaultMetrics();

  // Process each scene to extract version metrics
  for (const scene of projectScenes) {
    if (!scene.assets) continue;

    // Process each asset type
    for (const assetKey of Object.keys(scene.assets) as AssetKey[]) {
      const assetData = scene.assets[ assetKey ];
      if (!assetData?.versions || assetData.versions.length === 0) continue;

      // Get evaluation data from the best version
      const bestVersion = assetData.versions.find(v => v.version === assetData.best);
      if (!bestVersion?.metadata?.evaluation) continue;

      const evaluation = bestVersion.metadata.evaluation;

      // Calculate overall score from evaluation
      const overallScore = evaluation.score ||
        (evaluation.scores
          ? Object.values(evaluation.scores).reduce((sum, cat: any) =>
            sum + (cat.score || 0), 0) / Object.keys(evaluation.scores).length
          : 0);

      // Create version metric for tracking
      const versionMetric: VersionMetric = {
        entityId: scene.id,
        assetKey,
        attemptNumber: assetData.head || 1,
        assetVersion: assetData.best || 1,
        finalScore: overallScore,
        jobId: bestVersion.metadata.jobId || `${scene.id}-${assetKey}`,
        startTime: assetData.versions[ 0 ]?.createdAt.getTime() || Date.now(),
        endTime: Date.now(),
        attemptDuration: (Date.now()) - (assetData.versions[ 0 ]?.createdAt.getTime() || Date.now()),
        ruleAdded: evaluation.ruleSuggestion ? [ evaluation.ruleSuggestion ] : [],
        corrections: evaluation.promptCorrections || [],
        regression: {} as any,
        trendHistory: []
      };

      // Add to version metrics if not already present
      const existingVersions = (metrics[ assetKey ] as VersionMetric[] | undefined) || [];
      const alreadyTracked = existingVersions.some(
        v => v.jobId === versionMetric.jobId && v.assetVersion === versionMetric.assetVersion
      );

      if (!alreadyTracked) {
        metrics = addVersionMetric(metrics, assetKey, versionMetric);
      }
    }
  }

  // // Aggregate scene-level metrics
  // const sceneMetrics: Record<string, typeof metrics[ 'scene_video' ]> = {};

  // for (const scene of projectScenes) {
  //   const sceneAssets = getAllBestFromAssets(scene.assets);
  //   const videoAsset = sceneAssets[ 'scene_video' ];

  //   if (videoAsset?.metadata?.evaluation) {
  //     const evaluation = videoAsset.metadata.evaluation;
  //     const overallScore = evaluation.score || 0;

  //     sceneMetrics[ scene.id ] = [ {
  //       sceneId: scene.id,
  //       attempts: scene.assets?.scene_video?.head || 1,
  //       bestAttempt: scene.assets?.scene_video?.best || 1,
  //       finalScore: overallScore * 100, // Convert to percentage
  //       duration: 0,
  //       // duration: (videoAsset.createdAt?.getTime() || Date.now()) - (scene.assets?.scene_video?.versions[ 0 ]?.createdAt.getTime() || Date.now()),
  //       ruleAdded: evaluation.ruleSuggestion ? [ evaluation.ruleSuggestion ] : [],
  //     } ];
  //   }
  // }

  // Update metrics
  const updatedMetrics: WorkflowMetrics = {
    ...metrics,
    // sceneMetrics,
  };

  // Save to database
  await db.update(projects)
    .set({
      metrics: updatedMetrics,
      updatedAt: new Date()
    })
    .where(eq(projects.id, projectId));
}

/**
 * Records a new version metric for an asset generation attempt
 */
export async function recordVersionMetric(
  projectId: string,
  assetKeys: AssetKey[],
  versionMetrics: VersionMetric[]
): Promise<WorkflowMetrics> {
  const project = await db.query.projects.findFirst({
    where: { id: projectId }
  });

  if (!project) {
    console.error(`Could not record metrics. Project ${projectId} not found`);
    throw new Error(`Could not record metrics. Project ${projectId} not found`);
  }

  const currentMetrics = (project.metrics as WorkflowMetrics) || createDefaultMetrics();
  let updatedMetrics = currentMetrics;

  for (let i = 0; i < versionMetrics.length; i++) {
    const metric = versionMetrics[ i ];
    const key = Array.isArray(assetKeys) ? (assetKeys[ i ] ?? assetKeys[ 0 ]) : assetKeys;
    updatedMetrics = addVersionMetric(updatedMetrics, key, metric);
  }

  const [ result ] = await db.update(projects)
    .set({
      metrics: updatedMetrics,
      updatedAt: new Date()
    })
    .where(eq(projects.id, projectId))
    .returning();

  return WorkflowMetrics.parse(result.metrics);
}

/**
 * Get aggregated metrics summary for dashboard display
 */
export async function getMetricsSummary(projectId: string): Promise<{
  totalScenes: number;
  completedScenes: number;
  totalAssets: number;
  completedAssets: number;
  avgQualityScore: number;
  avgAttempts: number;
  totalDuration: number;
  recentTrend: 'improving' | 'declining' | 'stable';
}> {
  const project = await db.query.projects.findFirst({
    where: { id: projectId }
  });

  if (!project) {
    return {
      totalScenes: 0,
      completedScenes: 0,
      totalAssets: 0,
      completedAssets: 0,
      avgQualityScore: 0,
      avgAttempts: 0,
      totalDuration: 0,
      recentTrend: 'stable'
    };
  }

  const projectScenes = await db.query.scenes.findMany({
    where: { projectId }
  });

  const metrics = project.metrics || createDefaultMetrics();

  let totalAssets = 0;
  let completedAssets = 0;
  let totalQualityScore = 0;
  let qualityScoreCount = 0;
  let totalDuration = 0;

  const assetKeys = Object.keys(metrics).filter(key => AssetKey.safeParse(key).success) as AssetKey[];
  for (const assetKey of assetKeys) {
    const versions = metrics[ assetKey ] as VersionMetric[] | undefined;
    if (versions) {
      totalAssets += projectScenes.length;
      completedAssets += versions.length || 0;

      versions.forEach(v => {
        totalQualityScore += v.finalScore;
        qualityScoreCount++;
        totalDuration += v.attemptDuration;
      });
    }
  }

  const completedScenes = projectScenes.filter(s => s.status === 'complete').length;
  const avgQualityScore = qualityScoreCount > 0 ? totalQualityScore / qualityScoreCount : 0;
  const avgAttempts = metrics.globalTrend?.averageAttempts || 0;

  // Determine recent trend
  let recentTrend: 'improving' | 'declining' | 'stable' = 'stable';
  if (metrics.trendHistory && metrics.trendHistory.length >= 10) {
    const recent = metrics.trendHistory.slice(-5);
    const previous = metrics.trendHistory.slice(-10, -5);

    const recentAvg = recent.reduce((sum, t) => sum + t.qualityTrendSlope, 0) / recent.length;
    const previousAvg = previous.reduce((sum, t) => sum + t.qualityTrendSlope, 0) / previous.length;

    if (recentAvg > previousAvg * 1.1) recentTrend = 'improving';
    else if (recentAvg < previousAvg * 0.9) recentTrend = 'declining';
  }

  return {
    totalScenes: projectScenes.length,
    completedScenes,
    totalAssets,
    completedAssets,
    avgQualityScore,
    avgAttempts,
    totalDuration,
    recentTrend
  };
}

/**
 * Clean up old metrics data to prevent database bloat
 */
export async function pruneOldMetrics(
  projectId: string,
  keepRecentCount: number = 1000
): Promise<void> {
  const project = await db.query.projects.findFirst({
    where: { id: projectId }
  });

  if (!project?.metrics) return;

  const metrics = { ...project.metrics };

  const assetKeys = Object.keys(metrics).filter(key => AssetKey.safeParse(key).success) as AssetKey[];
  for (const assetKey of assetKeys) {
    const versions = metrics[ assetKey ] as VersionMetric[] | undefined;
    if (versions && versions.length > keepRecentCount) {
      // Keep most recent versions and recalculate regression
      const recentVersions = versions.slice(-keepRecentCount);
      // Store directly on key
      (metrics as any)[ assetKey ] = recentVersions;

      // Recalculate regression from scratch
      let newRegression = {
        count: 0,
        sumX: 0,
        sumY_a: 0,
        sumY_q: 0,
        sumXY_a: 0,
        sumXY_q: 0,
        sumX2: 0,
      };

      for (const version of recentVersions) {
        newRegression = updateRegression(newRegression, version);
      }

      metrics.regression = newRegression;
    }
  }

  // Prune trend history
  if (metrics.trendHistory && metrics.trendHistory.length > keepRecentCount) {
    metrics.trendHistory = metrics.trendHistory.slice(-keepRecentCount);
  }

  await db.update(projects)
    .set({
      metrics,
      updatedAt: new Date()
    })
    .where(eq(projects.id, projectId));
}