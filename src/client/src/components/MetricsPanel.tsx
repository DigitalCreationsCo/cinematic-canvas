import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "#client/components/ui/card.js";
import { ScrollArea } from "#client/components/ui/scroll-area.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#client/components/ui/tabs.js";
import {
    RefreshCw,
    CheckCircle,
    Zap,
    TrendingUp,
    TrendingDown,
    ThumbsUp,
    ThumbsDown,
    Film,
    Image as ImageIcon,
    FileText,
    Target,
    Activity,
    BarChart3,
    AlertCircle,
} from "lucide-react";
import MetricCard from "#client/components/MetricCard.js";
import { Skeleton } from "#client/components/ui/skeleton.js";
import { AssetKey, AssetRegistry } from "../../../shared/types/assets.types.js";
import {
    deriveGlobalMetrics,
    flattenVersionActivity,
    getSceneAssetHistory,
    deriveRollingTrend,
    predictRemainingWork,
    formatDuration,
    formatPercentage,
    hasNewerVersionsThanBest,
} from "../../../shared/utils/metrics.utils.js";
import { cn } from "#client/lib/utils.js";

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Scene-level asset keys tracked by this panel.
 * Character and location assets live in their own entity registries and are
 * not present in sceneRegistries — pass them separately if needed in future.
 */
const SCENE_ASSET_KEYS: AssetKey[] = [
    "scene_video",
    "scene_start_frame",
    "scene_end_frame",
];

const ASSET_LABELS: Partial<Record<AssetKey, string>> = {
    scene_video: "Scene Videos",
    scene_start_frame: "Start Frames",
    scene_end_frame: "End Frames",
};

const ASSET_ICONS: Partial<Record<AssetKey, React.ReactNode>> = {
    scene_video: <Film className="w-4 h-4" />,
    scene_start_frame: <ImageIcon className="w-4 h-4" />,
    scene_end_frame: <ImageIcon className="w-4 h-4" />,
};

// ============================================================================
// PROPS
// ============================================================================

interface MetricsPanelProps {
    /** Map of sceneId → AssetRegistry fetched from the dual-table schema. */
    sceneRegistries: Record<string, AssetRegistry>;
    /** Total scenes in the project (sceneRegistries may be a subset if paginated). */
    totalSceneCount: number;
    /** Highlights version history for this scene in the Overview tab. */
    selectedSceneId?: string;
    isLoading?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function MetricsPanel({
    sceneRegistries,
    totalSceneCount,
    selectedSceneId,
    isLoading = false,
}: MetricsPanelProps) {

    const globalMetrics = useMemo(
        () => deriveGlobalMetrics(sceneRegistries, SCENE_ASSET_KEYS),
        [sceneRegistries],
    );

    const recentActivity = useMemo(
        () => flattenVersionActivity(sceneRegistries, SCENE_ASSET_KEYS, 20),
        [sceneRegistries],
    );

    const selectedSceneHistory = useMemo(() => {
        if (!selectedSceneId) return null;
        const registry = sceneRegistries[selectedSceneId];
        if (!registry) return null;
        return getSceneAssetHistory(registry, "scene_video");
    }, [sceneRegistries, selectedSceneId]);

    const prediction = useMemo(() => {
        const remaining = totalSceneCount - globalMetrics.completedScenes;
        if (remaining <= 0 || globalMetrics.trend.averageAttempts === 0) return null;
        return predictRemainingWork(globalMetrics.trend, remaining);
    }, [globalMetrics, totalSceneCount]);

    const rollingTrend = useMemo(
        () => deriveRollingTrend(sceneRegistries, SCENE_ASSET_KEYS),
        [sceneRegistries],
    );

    // ─── Loading skeleton ────────────────────────────────────────────────────

    if (isLoading) {
        return (
            <div className="h-full p-4">
                <ScrollArea className="h-full">
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            {Array.from({ length: 8 }).map((_, i) => (
                                <MetricCard key={i} label="" value="" isLoading={true} />
                            ))}
                        </div>
                        <Card>
                            <CardHeader className="p-4 pb-2">
                                <Skeleton className="h-5 w-40" />
                            </CardHeader>
                            <CardContent className="p-4 pt-2">
                                <Skeleton className="h-32 w-full" />
                            </CardContent>
                        </Card>
                    </div>
                </ScrollArea>
            </div>
        );
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    const scoreColor = (score: number) => cn(
        "font-medium",
        score >= 0.8 && "text-emerald-600 dark:text-emerald-400",
        score >= 0.6 && score < 0.8 && "text-amber-600 dark:text-amber-400",
        score < 0.6 && "text-rose-600 dark:text-rose-400",
    );

    // ─── Render ──────────────────────────────────────────────────────────────

    return (
        <div className="h-full flex flex-col">
            <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden">
                <div className="px-4 pt-3 shrink-0">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="overview">
                            <BarChart3 className="w-4 h-4 mr-1.5" />
                            Overview
                        </TabsTrigger>
                        <TabsTrigger value="assets">
                            <Activity className="w-4 h-4 mr-1.5" />
                            Assets
                        </TabsTrigger>
                        <TabsTrigger value="trends">
                            <TrendingUp className="w-4 h-4 mr-1.5" />
                            Trends
                        </TabsTrigger>
                    </TabsList>
                </div>

                {/* ── Overview Tab ─────────────────────────────────────────── */}
                <TabsContent value="overview" className="flex-1 overflow-hidden mt-0 p-4">
                    <ScrollArea className="h-full">
                        <div className="space-y-4 pb-4">

                            {/* Global performance cards */}
                            <div>
                                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                                    Global Performance
                                </h3>
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                    <MetricCard
                                        label="Completion"
                                        value={formatPercentage(
                                            totalSceneCount > 0
                                                ? globalMetrics.completedScenes / totalSceneCount
                                                : 0
                                        )}
                                        subValue={`${globalMetrics.completedScenes}/${totalSceneCount} scenes`}
                                        icon={<CheckCircle className="w-5 h-5" />}
                                        trend={
                                            globalMetrics.completedScenes === totalSceneCount ? "neutral" :
                                                globalMetrics.completedScenes > totalSceneCount * 0.5 ? "up" : "down"
                                        }
                                    />

                                    <MetricCard
                                        label="Avg Quality"
                                        value={formatPercentage(globalMetrics.avgQualityScore)}
                                        subValue="across all assets"
                                        icon={<Target className="w-5 h-5" />}
                                        trend={
                                            globalMetrics.trend.qualityTrendSlope > 0 ? "up" :
                                                globalMetrics.trend.qualityTrendSlope < 0 ? "down" : "neutral"
                                        }
                                        trendValue={
                                            globalMetrics.trend.qualityTrendSlope !== 0
                                                ? `${(globalMetrics.trend.qualityTrendSlope * 100).toFixed(1)}% per asset`
                                                : undefined
                                        }
                                    />

                                    <MetricCard
                                        label="Avg Attempts"
                                        value={globalMetrics.trend.averageAttempts.toFixed(1)}
                                        subValue="per asset"
                                        icon={<RefreshCw className="w-5 h-5" />}
                                        trend={
                                            globalMetrics.trend.attemptTrendSlope < 0 ? "up" :  // fewer attempts = good
                                                globalMetrics.trend.attemptTrendSlope > 0 ? "down" : "neutral"
                                        }
                                        trendValue={
                                            globalMetrics.trend.attemptTrendSlope !== 0
                                                ? `${Math.abs(globalMetrics.trend.attemptTrendSlope * 100).toFixed(0)}% ${globalMetrics.trend.attemptTrendSlope < 0 ? "improvement" : "increase"}`
                                                : undefined
                                        }
                                    />

                                    <MetricCard
                                        label="Rules Added"
                                        value={globalMetrics.totalRulesAdded}
                                        subValue="total improvements"
                                        icon={<Zap className="w-5 h-5" />}
                                    />
                                    <MetricCard
                                        label="Liked"
                                        value={globalMetrics.totalLiked}
                                        subValue="user approvals"
                                        icon={<ThumbsUp className="w-5 h-5" />}
                                    />
                                    <MetricCard
                                        label="Disliked"
                                        value={globalMetrics.totalDisliked}
                                        subValue="user rejections"
                                        icon={<ThumbsDown className="w-5 h-5" />}
                                    />
                                </div>
                            </div>

                            {/* Remaining work prediction */}
                            {prediction && globalMetrics.completedScenes < totalSceneCount && (
                                <Card className="bg-muted/30">
                                    <CardHeader className="p-4 pb-2">
                                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                            <TrendingUp className="w-4 h-4" />
                                            Remaining Work Prediction
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-4 pt-2">
                                        <div className="grid grid-cols-3 gap-4">
                                            <div>
                                                <p className="text-xs text-muted-foreground mb-1">Est. Attempts</p>
                                                <p className="text-sm font-bold">{prediction.predictedAttempts}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-muted-foreground mb-1">Predicted Quality</p>
                                                <p className="text-sm font-bold">{formatPercentage(prediction.predictedQuality)}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-muted-foreground mb-1">Remaining</p>
                                                <p className="text-sm font-bold">
                                                    {totalSceneCount - globalMetrics.completedScenes} scenes
                                                </p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Recent generation activity */}
                            <Card>
                                <CardHeader className="p-4 pb-2">
                                    <CardTitle className="text-sm font-semibold">Recent Generation Activity</CardTitle>
                                </CardHeader>
                                <CardContent className="p-4 pt-2">
                                    <div className="space-y-1.5">
                                        {recentActivity.length === 0 ? (
                                            <p className="text-xs text-muted-foreground text-center py-4">
                                                No generation activity yet
                                            </p>
                                        ) : (
                                            recentActivity.map((activity, idx) => (
                                                <div
                                                    key={`${activity.jobId}-${idx}`}
                                                    className="flex items-center justify-between p-2 rounded-none bg-muted/50 hover:bg-muted/80 transition-colors"
                                                >
                                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                                        {ASSET_ICONS[activity.assetKey]}
                                                        <span className="text-xs font-medium truncate">
                                                            {ASSET_LABELS[activity.assetKey]}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground font-mono shrink-0">
                                                            v{activity.version}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-3 shrink-0">
                                                        <span className={cn("text-xs", scoreColor(activity.score))}>
                                                            {formatPercentage(activity.score, 0)}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground font-mono">
                                                            {formatDuration(activity.duration)}
                                                        </span>
                                                        {activity.hasRuleSuggestion && (
                                                            <Zap className="w-3 h-3 text-amber-500 shrink-0" />
                                                        )}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Selected scene — scene_video version history */}
                            {selectedSceneHistory && selectedSceneHistory.length > 0 && (
                                <Card>
                                    <CardHeader className="p-4 pb-2">
                                        <CardTitle className="text-sm font-semibold">Selected Scene — Video History</CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-4 pt-2">
                                        {/* Newer-version-available banner */}
                                        {selectedSceneId && (() => {
                                            const history = sceneRegistries[selectedSceneId]?.scene_video;
                                            return history && hasNewerVersionsThanBest(history) ? (
                                                <div className="flex items-center gap-2 p-2 mb-2 rounded-none bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-400">
                                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                                    Newer versions available — best is locked by a like
                                                </div>
                                            ) : null;
                                        })()}
                                        <div className="space-y-1.5">
                                            {selectedSceneHistory.map(entry => (
                                                <div
                                                    key={entry.version}
                                                    className={cn(
                                                        "flex items-center justify-between p-2 rounded-none transition-colors",
                                                        entry.isBest
                                                            ? "bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800"
                                                            : "bg-muted/50"
                                                    )}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-mono text-muted-foreground">
                                                            v{entry.version}
                                                        </span>
                                                        {entry.isBest && (
                                                            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                                                best
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2.5">
                                                        <span className={cn("text-xs", scoreColor(entry.score))}>
                                                            {formatPercentage(entry.score, 0)}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground font-mono">
                                                            {formatDuration(entry.duration)}
                                                        </span>
                                                        {entry.hasRuleSuggestion && (
                                                            <Zap className="w-3 h-3 text-amber-500 shrink-0" />
                                                        )}
                                                        {entry.userFeedback?.rating === "liked" && (
                                                            <ThumbsUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                                        )}
                                                        {entry.userFeedback?.rating === "disliked" && (
                                                            <ThumbsDown className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    </ScrollArea>
                </TabsContent>

                {/* ── Assets Tab ───────────────────────────────────────────── */}
                <TabsContent value="assets" className="flex-1 overflow-hidden mt-0 p-4">
                    <ScrollArea className="h-full">
                        <div className="space-y-4 pb-4">
                            {SCENE_ASSET_KEYS.map(assetKey => {
                                const assetData = globalMetrics.assetBreakdown[assetKey];
                                if (!assetData) return null;

                                // Last 5 versions for this asset key across all scenes
                                const recentVersions = flattenVersionActivity(sceneRegistries, [assetKey], 5);

                                return (
                                    <Card key={assetKey}>
                                        <CardHeader className="p-4 pb-2">
                                            <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                                {ASSET_ICONS[assetKey]}
                                                {ASSET_LABELS[assetKey]}
                                                <span className={cn(
                                                    "ml-auto text-xs font-normal",
                                                    assetData.recentTrend === "improving" && "text-emerald-600 dark:text-emerald-400",
                                                    assetData.recentTrend === "declining" && "text-rose-600 dark:text-rose-400",
                                                    assetData.recentTrend === "stable" && "text-muted-foreground",
                                                )}>
                                                    {assetData.recentTrend === "improving" && <TrendingUp className="w-3 h-3 inline mr-1" />}
                                                    {assetData.recentTrend === "declining" && <TrendingDown className="w-3 h-3 inline mr-1" />}
                                                    {assetData.recentTrend}
                                                </span>
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="p-4 pt-2">
                                            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 mb-3">
                                                <MetricCard
                                                    label="Completed"
                                                    value={`${assetData.completedCount}/${Object.keys(sceneRegistries).length}`}
                                                    compact
                                                />
                                                <MetricCard
                                                    label="Avg Attempts"
                                                    value={assetData.avgAttempts.toFixed(1)}
                                                    compact
                                                />
                                                <MetricCard
                                                    label="Avg Score"
                                                    value={formatPercentage(assetData.avgScore, 0)}
                                                    compact
                                                    trend={
                                                        assetData.recentTrend === "improving" ? "up" :
                                                            assetData.recentTrend === "declining" ? "down" : "neutral"
                                                    }
                                                />
                                                <MetricCard
                                                    label="Avg Time"
                                                    value={formatDuration(assetData.avgDuration)}
                                                    compact
                                                />
                                                <MetricCard
                                                    label="Rules"
                                                    value={assetData.rulesAddedCount}
                                                    compact
                                                    icon={<Zap className="w-4 h-4" />}
                                                />
                                            </div>

                                            {/* Recent versions for this asset key */}
                                            {recentVersions.length > 0 && (
                                                <div className="space-y-1">
                                                    <p className="text-xs font-medium text-muted-foreground mb-2">
                                                        Recent Generations
                                                    </p>
                                                    {recentVersions.map((entry, idx) => (
                                                        <div
                                                            key={`${entry.jobId}-${idx}`}
                                                            className="flex items-center justify-between p-1.5 rounded-none bg-muted/30"
                                                        >
                                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                                                <span className="text-xs font-mono text-muted-foreground shrink-0">
                                                                    v{entry.version}
                                                                </span>
                                                                <span className="text-xs text-muted-foreground truncate">
                                                                    {entry.sceneId.slice(0, 8)}…
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-2 shrink-0">
                                                                <span className={cn("text-xs", scoreColor(entry.score))}>
                                                                    {formatPercentage(entry.score, 0)}
                                                                </span>
                                                                <span className="text-xs font-mono text-muted-foreground">
                                                                    {formatDuration(entry.duration)}
                                                                </span>
                                                                {entry.hasRuleSuggestion && (
                                                                    <Zap className="w-3 h-3 text-amber-500" />
                                                                )}
                                                                {entry.userFeedback?.rating === "liked" && (
                                                                    <ThumbsUp className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                                                )}
                                                                {entry.userFeedback?.rating === "disliked" && (
                                                                    <ThumbsDown className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    </ScrollArea>
                </TabsContent>

                {/* ── Trends Tab ───────────────────────────────────────────── */}
                <TabsContent value="trends" className="flex-1 overflow-hidden mt-0 p-4">
                    <ScrollArea className="h-full">
                        <div className="space-y-4 pb-4">

                            {/* Current trend summary */}
                            <Card>
                                <CardHeader className="p-4 pb-2">
                                    <CardTitle className="text-sm font-semibold">Current Trend</CardTitle>
                                </CardHeader>
                                <CardContent className="p-4 pt-2">
                                    <div className="grid grid-cols-3 gap-4">
                                        <div>
                                            <p className="text-xs text-muted-foreground mb-1">Avg Attempts</p>
                                            <p className="text-sm font-bold">
                                                {globalMetrics.trend.averageAttempts.toFixed(1)}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground mb-1">Attempt Trend</p>
                                            <p className={cn(
                                                "text-sm font-bold",
                                                globalMetrics.trend.attemptTrendSlope < 0
                                                    ? "text-emerald-600 dark:text-emerald-400"
                                                    : globalMetrics.trend.attemptTrendSlope > 0
                                                        ? "text-rose-600 dark:text-rose-400"
                                                        : "text-muted-foreground",
                                            )}>
                                                {globalMetrics.trend.attemptTrendSlope !== 0
                                                    ? `${globalMetrics.trend.attemptTrendSlope > 0 ? "+" : ""}${(globalMetrics.trend.attemptTrendSlope * 100).toFixed(2)}%`
                                                    : "—"}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground mb-1">Quality Trend</p>
                                            <p className={cn(
                                                "text-sm font-bold",
                                                globalMetrics.trend.qualityTrendSlope > 0
                                                    ? "text-emerald-600 dark:text-emerald-400"
                                                    : globalMetrics.trend.qualityTrendSlope < 0
                                                        ? "text-rose-600 dark:text-rose-400"
                                                        : "text-muted-foreground",
                                            )}>
                                                {globalMetrics.trend.qualityTrendSlope !== 0
                                                    ? `${globalMetrics.trend.qualityTrendSlope > 0 ? "+" : ""}${(globalMetrics.trend.qualityTrendSlope * 100).toFixed(2)}%`
                                                    : "—"}
                                            </p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Rolling trend history */}
                            <Card>
                                <CardHeader className="p-4 pb-2">
                                    <CardTitle className="text-sm font-semibold">Learning Curve</CardTitle>
                                </CardHeader>
                                <CardContent className="p-4 pt-2">
                                    {rollingTrend.length === 0 ? (
                                        <p className="text-xs text-muted-foreground text-center py-8">
                                            Not enough data to calculate trends yet
                                        </p>
                                    ) : (
                                        <div className="space-y-1">
                                            {rollingTrend.slice(-10).map((snapshot, idx) => (
                                                <div
                                                    key={snapshot.index}
                                                    className="flex items-center justify-between p-2 rounded-none bg-muted/30"
                                                >
                                                    <span className="text-xs text-muted-foreground">
                                                        Point {rollingTrend.length > 10 ? rollingTrend.length - 10 + idx + 1 : idx + 1}
                                                    </span>
                                                    <div className="flex items-center gap-4">
                                                        <span className="text-xs">
                                                            Avg attempts: {snapshot.averageAttempts.toFixed(1)}
                                                        </span>
                                                        <span className={cn(
                                                            "text-xs",
                                                            snapshot.qualityTrendSlope > 0
                                                                ? "text-emerald-600 dark:text-emerald-400"
                                                                : "text-muted-foreground",
                                                        )}>
                                                            Quality Δ {snapshot.qualityTrendSlope > 0 ? "+" : ""}{formatPercentage(snapshot.qualityTrendSlope)}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Per-asset-key trend summary */}
                            <Card>
                                <CardHeader className="p-4 pb-2">
                                    <CardTitle className="text-sm font-semibold">Per-Asset Trends</CardTitle>
                                </CardHeader>
                                <CardContent className="p-4 pt-2">
                                    <div className="space-y-2">
                                        {SCENE_ASSET_KEYS.map(key => {
                                            const data = globalMetrics.assetBreakdown[key];
                                            if (!data) return null;
                                            return (
                                                <div key={key} className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        {ASSET_ICONS[key]}
                                                        <span className="text-xs">{ASSET_LABELS[key]}</span>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-xs text-muted-foreground">
                                                            {formatPercentage(data.completionRate, 0)} done
                                                        </span>
                                                        <span className={cn(
                                                            "text-xs font-medium w-16 text-right",
                                                            data.recentTrend === "improving" && "text-emerald-600 dark:text-emerald-400",
                                                            data.recentTrend === "declining" && "text-rose-600 dark:text-rose-400",
                                                            data.recentTrend === "stable" && "text-muted-foreground",
                                                        )}>
                                                            {data.recentTrend}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </ScrollArea>
                </TabsContent>
            </Tabs>
        </div>
    );
}