import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card.js";
import { ScrollArea } from "#/components/ui/scroll-area.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs.js";
import {
    RefreshCw,
    CheckCircle,
    Clock,
    Zap,
    TrendingUp,
    AlertCircle,
    Film,
    Image as ImageIcon,
    FileText,
    Target,
    Activity,
    BarChart3
} from "lucide-react";
import MetricCard from "#/components/MetricCard.js";
import { Skeleton } from "#/components/ui/skeleton.js";
import { WorkflowMetrics, VersionMetric } from "../../../shared/types/metrics.types.js";
import { AssetKey } from "../../../shared/types/assets.types.js";
import { Scene } from "../../../shared/types/index.js";
import {
    calculateGlobalMetrics,
    getAssetVersionMetrics,
    formatDuration,
    formatPercentage,
    predictRemainingWork
} from "../../../shared/utils/metrics-utils.js";
import { cn } from "#/lib/utils.js";

interface MetricsPanelProps {
    scenes: Scene[];
    metrics: WorkflowMetrics | undefined;
    selectedSceneId?: string;
    isLoading?: boolean;
}

const ASSET_KEYS: AssetKey[] = [
    "scene_video",
    "scene_start_frame",
    "scene_end_frame",
    "scene_prompt",
    "character_image",
    "location_image"
];

const ASSET_LABELS: Partial<Record<AssetKey, string>> = {
    scene_video: "Scene Videos",
    scene_start_frame: "Scene Start Frame",
    scene_end_frame: "Scene End Frame",
    scene_prompt: "Scene Prompts",
    character_image: "Character Images",
    location_image: "Location Images"
};

const ASSET_ICONS: Partial<Record<AssetKey, React.ReactNode>> = {
    scene_video: <Film className="w-4 h-4" />,
    scene_start_frame: <ImageIcon className="w-4 h-4" />,
    scene_end_frame: <ImageIcon className="w-4 h-4" />,
    scene_prompt: <FileText className="w-4 h-4" />,
    character_image: <ImageIcon className="w-4 h-4" />,
    location_image: <ImageIcon className="w-4 h-4" />
};

export default function MetricsPanel({
    scenes,
    metrics,
    selectedSceneId,
    isLoading = false
}: MetricsPanelProps) {

    const globalMetrics = useMemo(() =>
        calculateGlobalMetrics(scenes, ASSET_KEYS),
        [ scenes ]
    );

    const selectedSceneMetrics = useMemo(() => {
        if (!selectedSceneId || !metrics?.sceneMetrics?.[ selectedSceneId ]) {
            return null;
        }
        return metrics.sceneMetrics[ selectedSceneId ];
    }, [ metrics, selectedSceneId ]);

    const assetMetricsData = useMemo(() => {
        if (!metrics?.versionMetrics) return {};

        return Object.fromEntries(
            ASSET_KEYS.map(key => [
                key,
                getAssetVersionMetrics(metrics.versionMetrics, key)
            ])
        );
    }, [ metrics ]);

    const prediction = useMemo(() => {
        if (!metrics?.globalTrend) return null;

        const remainingScenes = scenes.length - globalMetrics.completedScenes;
        return predictRemainingWork(
            metrics.globalTrend,
            remainingScenes,
            globalMetrics.totalAssets - globalMetrics.completedAssets
        );
    }, [ metrics, scenes, globalMetrics ]);

    const recentActivity = useMemo(() => {
        if (!metrics?.versionMetrics) return [];

        const allMetrics: (VersionMetric & { assetKey: AssetKey; })[] = [];

        for (const [ key, versions ] of Object.entries(metrics.versionMetrics)) {
            versions?.forEach(v => {
                allMetrics.push({ ...v, assetKey: key as AssetKey });
            });
        }

        return allMetrics
            .sort((a, b) => b.endTime - a.endTime)
            .slice(0, 20);
    }, [ metrics ]);

    if (isLoading) {
        return (
            <div className="h-full p-4">
                <ScrollArea className="h-full">
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            { Array.from({ length: 8 }).map((_, i) => (
                                <MetricCard key={ i } label="" value="" isLoading={ true } />
                            )) }
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

    return (
        <div className="h-full flex flex-col">
            <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden">
                <div className="px-4 pt-3 shrink-0 border-b">
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

                {/* Overview Tab */ }
                <TabsContent value="overview" className="flex-1 overflow-hidden mt-0 p-4">
                    <ScrollArea className="h-full">
                        <div className="space-y-4 pb-4">
                            {/* Global Metrics */ }
                            <div>
                                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                                    Global Performance
                                </h3>
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                    <MetricCard
                                        label="Completion"
                                        value={ formatPercentage(
                                            globalMetrics.totalScenes > 0
                                                ? globalMetrics.completedScenes / globalMetrics.totalScenes
                                                : 0
                                        ) }
                                        subValue={ `${globalMetrics.completedScenes}/${globalMetrics.totalScenes} scenes` }
                                        icon={ <CheckCircle className="w-5 h-5" /> }
                                        trend={
                                            globalMetrics.completedScenes === globalMetrics.totalScenes ? "neutral" :
                                                globalMetrics.completedScenes > globalMetrics.totalScenes * 0.5 ? "up" : "down"
                                        }
                                    />

                                    <MetricCard
                                        label="Avg Quality"
                                        value={ formatPercentage(globalMetrics.avgQualityScore) }
                                        subValue="across all assets"
                                        icon={ <Target className="w-5 h-5" /> }
                                        trend={
                                            metrics?.globalTrend?.qualityTrendSlope && metrics.globalTrend.qualityTrendSlope > 0
                                                ? "up"
                                                : metrics?.globalTrend?.qualityTrendSlope && metrics.globalTrend.qualityTrendSlope < 0
                                                    ? "down"
                                                    : "neutral"
                                        }
                                        trendValue={
                                            metrics?.globalTrend?.qualityTrendSlope
                                                ? `${(metrics.globalTrend.qualityTrendSlope * 100).toFixed(1)}% per asset`
                                                : undefined
                                        }
                                    />

                                    <MetricCard
                                        label="Avg Attempts"
                                        value={ metrics?.globalTrend?.averageAttempts?.toFixed(1) || "0.0" }
                                        subValue="per asset"
                                        icon={ <RefreshCw className="w-5 h-5" /> }
                                        trend={
                                            metrics?.globalTrend?.attemptTrendSlope && metrics.globalTrend.attemptTrendSlope < 0
                                                ? "up" // Fewer attempts is good = upward trend
                                                : metrics?.globalTrend?.attemptTrendSlope && metrics.globalTrend.attemptTrendSlope > 0
                                                    ? "down"
                                                    : "neutral"
                                        }
                                        trendValue={
                                            metrics?.globalTrend?.attemptTrendSlope
                                                ? `${Math.abs(metrics.globalTrend.attemptTrendSlope * 100).toFixed(0)}% ${metrics.globalTrend.attemptTrendSlope < 0 ? 'improvement' : 'increase'
                                                }`
                                                : undefined
                                        }
                                    />

                                    <MetricCard
                                        label="Rules Added"
                                        value={ globalMetrics.totalRulesAdded }
                                        subValue="total improvements"
                                        icon={ <Zap className="w-5 h-5" /> }
                                    />
                                </div>
                            </div>

                            {/* Predictions */ }
                            { prediction && globalMetrics.completedScenes < globalMetrics.totalScenes && (
                                <Card className="bg-muted/30">
                                    <CardHeader className="p-4 pb-2">
                                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                            <TrendingUp className="w-4 h-4" />
                                            Remaining Work Prediction
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-4 pt-2">
                                        <div className="grid grid-cols-3 gap-4 text-sm">
                                            <div>
                                                <p className="text-xs text-muted-foreground mb-1">Est. Attempts</p>
                                                <p className="text-lg font-bold">{ prediction.predictedAttempts }</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-muted-foreground mb-1">Predicted Quality</p>
                                                <p className="text-lg font-bold">{ formatPercentage(prediction.predictedQuality) }</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-muted-foreground mb-1">Remaining</p>
                                                <p className="text-lg font-bold">
                                                    { globalMetrics.totalScenes - globalMetrics.completedScenes } scenes
                                                </p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ) }

                            {/* Recent Activity */ }
                            <Card>
                                <CardHeader className="p-4 pb-2">
                                    <CardTitle className="text-sm font-semibold">Recent Generation Activity</CardTitle>
                                </CardHeader>
                                <CardContent className="p-4 pt-2">
                                    <div className="space-y-2">
                                        { recentActivity.length === 0 ? (
                                            <p className="text-xs text-muted-foreground text-center py-4">
                                                No generation activity yet
                                            </p>
                                        ) : (
                                            recentActivity.map((activity, idx) => (
                                                <div
                                                    key={ `${activity.jobId}-${idx}` }
                                                    className="flex items-center justify-between p-2 rounded-md bg-muted/50 text-xs hover:bg-muted/80 transition-colors"
                                                >
                                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                                        { ASSET_ICONS[ activity.assetKey ] }
                                                        <span className="font-medium truncate">
                                                            { ASSET_LABELS[ activity.assetKey ] }
                                                        </span>
                                                        <span className="text-muted-foreground">
                                                            v{ activity.assetVersion }
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-3 shrink-0">
                                                        <span className="text-muted-foreground">
                                                            #{ activity.attemptNumber }
                                                        </span>
                                                        <span className={ cn(
                                                            "font-medium",
                                                            activity.finalScore >= 0.8 && "text-emerald-600 dark:text-emerald-400",
                                                            activity.finalScore >= 0.6 && activity.finalScore < 0.8 && "text-amber-600 dark:text-amber-400",
                                                            activity.finalScore < 0.6 && "text-rose-600 dark:text-rose-400"
                                                        ) }>
                                                            { formatPercentage(activity.finalScore, 0) }
                                                        </span>
                                                        <span className="text-muted-foreground font-mono text-[10px]">
                                                            { formatDuration(activity.attemptDuration) }
                                                        </span>
                                                        { activity.ruleAdded.length > 0 && (
                                                            <Zap className="w-3 h-3 text-amber-500" />
                                                        ) }
                                                    </div>
                                                </div>
                                            ))
                                        ) }
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Scene-Specific Metrics */ }
                            { selectedSceneMetrics && (
                                <Card>
                                    <CardHeader className="p-4 pb-2">
                                        <CardTitle className="text-sm font-semibold">Selected Scene History</CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-4 pt-2">
                                        <div className="space-y-2">
                                            { selectedSceneMetrics.map((m) => (
                                                <div
                                                    key={ m.sceneId }
                                                    className="flex items-center justify-between p-2 rounded-md bg-muted/50 text-xs"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <span className="font-mono text-muted-foreground">#{ m.sceneId }</span>
                                                        <span className="text-muted-foreground">
                                                            { m.attempts } attempt{ m.attempts !== 1 ? "s" : "" }
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <span className="font-medium">{ m.finalScore }%</span>
                                                        <span className="text-muted-foreground font-mono">
                                                            { formatDuration(m.duration) }
                                                        </span>
                                                        { m.ruleAdded.length > 0 && (
                                                            <div className="flex items-center gap-1">
                                                                <Zap className="w-3 h-3 text-amber-500" />
                                                                <span className="text-[10px]">{ m.ruleAdded.length }</span>
                                                            </div>
                                                        ) }
                                                    </div>
                                                </div>
                                            )) }
                                        </div>
                                    </CardContent>
                                </Card>
                            ) }
                        </div>
                    </ScrollArea>
                </TabsContent>

                {/* Assets Tab */ }
                <TabsContent value="assets" className="flex-1 overflow-hidden mt-0 p-4">
                    <ScrollArea className="h-full">
                        <div className="space-y-4 pb-4">
                            { ASSET_KEYS.map(assetKey => {
                                const assetData = assetMetricsData[ assetKey ];
                                if (!assetData) return null;

                                return (
                                    <Card key={ assetKey }>
                                        <CardHeader className="p-4 pb-2">
                                            <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                                { ASSET_ICONS[ assetKey ] }
                                                { ASSET_LABELS[ assetKey ] }
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="p-4 pt-2">
                                            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 mb-3">
                                                <MetricCard
                                                    label="Versions"
                                                    value={ assetData.totalVersions }
                                                    compact
                                                />
                                                <MetricCard
                                                    label="Avg Attempts"
                                                    value={ assetData.avgAttempts.toFixed(1) }
                                                    compact
                                                />
                                                <MetricCard
                                                    label="Avg Score"
                                                    value={ formatPercentage(assetData.avgScore, 0) }
                                                    compact
                                                    trend={
                                                        assetData.recentTrend === "improving" ? "up" :
                                                            assetData.recentTrend === "declining" ? "down" : "neutral"
                                                    }
                                                />
                                                <MetricCard
                                                    label="Total Time"
                                                    value={ formatDuration(assetData.totalDuration) }
                                                    compact
                                                />
                                                <MetricCard
                                                    label="Rules"
                                                    value={ assetData.rulesAddedCount }
                                                    compact
                                                    icon={ <Zap className="w-4 h-4" /> }
                                                />
                                            </div>

                                            {/* Asset-specific version history */ }
                                            { metrics?.versionMetrics[ assetKey ] && (
                                                <div className="space-y-1">
                                                    <p className="text-xs font-medium text-muted-foreground mb-2">
                                                        Recent Versions
                                                    </p>
                                                    { metrics.versionMetrics[ assetKey ]!.slice(-5).reverse().map((v, idx) => (
                                                        <div
                                                            key={ `${v.jobId}-${idx}` }
                                                            className="flex items-center justify-between p-1.5 rounded bg-muted/30 text-xs"
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-mono text-muted-foreground">
                                                                    v{ v.assetVersion }
                                                                </span>
                                                                <span className="text-muted-foreground">
                                                                    (#{ v.attemptNumber })
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className={ cn(
                                                                    "font-medium",
                                                                    v.finalScore >= 0.8 && "text-emerald-600",
                                                                    v.finalScore >= 0.6 && v.finalScore < 0.8 && "text-amber-600",
                                                                    v.finalScore < 0.6 && "text-rose-600"
                                                                ) }>
                                                                    { formatPercentage(v.finalScore, 0) }
                                                                </span>
                                                                <span className="font-mono text-[10px] text-muted-foreground">
                                                                    { formatDuration(v.attemptDuration) }
                                                                </span>
                                                            </div>
                                                        </div>
                                                    )) }
                                                </div>
                                            ) }
                                        </CardContent>
                                    </Card>
                                );
                            }) }
                        </div>
                    </ScrollArea>
                </TabsContent>

                {/* Trends Tab */ }
                <TabsContent value="trends" className="flex-1 overflow-hidden mt-0 p-4">
                    <ScrollArea className="h-full">
                        <div className="space-y-4 pb-4">
                            <Card>
                                <CardHeader className="p-4 pb-2">
                                    <CardTitle className="text-sm font-semibold">Learning Trends</CardTitle>
                                </CardHeader>
                                <CardContent className="p-4 pt-2">
                                    { metrics?.trendHistory && metrics.trendHistory.length > 0 ? (
                                        <div className="space-y-3">
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <p className="text-xs text-muted-foreground mb-1">Attempt Trend</p>
                                                    <p className={ cn(
                                                        "text-lg font-bold",
                                                        metrics.globalTrend?.attemptTrendSlope && metrics.globalTrend.attemptTrendSlope < 0
                                                            ? "text-emerald-600"
                                                            : "text-muted-foreground"
                                                    ) }>
                                                        { metrics.globalTrend?.attemptTrendSlope
                                                            ? `${(metrics.globalTrend.attemptTrendSlope * 100).toFixed(2)}%`
                                                            : "—" }
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-muted-foreground mb-1">Quality Trend</p>
                                                    <p className={ cn(
                                                        "text-lg font-bold",
                                                        metrics.globalTrend?.qualityTrendSlope && metrics.globalTrend.qualityTrendSlope > 0
                                                            ? "text-emerald-600"
                                                            : "text-muted-foreground"
                                                    ) }>
                                                        { metrics.globalTrend?.qualityTrendSlope
                                                            ? `${(metrics.globalTrend.qualityTrendSlope * 100).toFixed(2)}%`
                                                            : "—" }
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Trend history visualization */ }
                                            <div className="space-y-1">
                                                <p className="text-xs font-medium text-muted-foreground">Trend History</p>
                                                { metrics.trendHistory.slice(-10).map((trend, idx) => (
                                                    <div
                                                        key={ idx }
                                                        className="flex items-center justify-between p-2 rounded bg-muted/30 text-xs"
                                                    >
                                                        <span className="text-muted-foreground">Point { metrics.trendHistory.length - 10 + idx + 1 }</span>
                                                        <div className="flex items-center gap-3">
                                                            <span>Attempts: { trend.averageAttempts.toFixed(1) }</span>
                                                            <span className={ cn(
                                                                trend.qualityTrendSlope > 0 ? "text-emerald-600" : "text-muted-foreground"
                                                            ) }>
                                                                Quality: { formatPercentage(trend.qualityTrendSlope) }
                                                            </span>
                                                        </div>
                                                    </div>
                                                )) }
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-muted-foreground text-center py-8">
                                            Not enough data to calculate trends yet
                                        </p>
                                    ) }
                                </CardContent>
                            </Card>
                        </div>
                    </ScrollArea>
                </TabsContent>
            </Tabs>
        </div>
    );
}