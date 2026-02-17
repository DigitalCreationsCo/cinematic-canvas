import { Card, CardContent } from "#/components/ui/card.js";
import { TrendingUp, TrendingDown, Minus, LucideIcon } from "lucide-react";
import { cn } from "#/lib/utils.js";
import { Skeleton } from "#/components/ui/skeleton.js";
import { memo } from "react";

interface MetricCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  icon?: React.ReactNode;
  isLoading?: boolean;
  tooltip?: string;
  additionalInfo?: string;
  compact?: boolean;
}

const MetricCard = memo(function MetricCard({
  label,
  value,
  subValue,
  trend,
  trendValue,
  icon,
  isLoading,
  tooltip,
  additionalInfo,
  compact = false
}: MetricCardProps) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;

  if (isLoading) {
    return (
      <Card data-testid={ `metric-${label.toLowerCase().replace(/\s+/g, '-')}` }>
        <CardContent className={ cn("p-4", compact && "p-3") }>
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1 min-w-0 flex-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-16 mt-1" />
              { !compact && <Skeleton className="h-3 w-12 mt-0.5" /> }
            </div>
            <Skeleton className="w-5 h-5 shrink-0" />
          </div>
          { !compact && <Skeleton className="h-3 w-24 mt-3" /> }
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      data-testid={ `metric-${label.toLowerCase().replace(/\s+/g, '-')}` }
      title={ tooltip }
      className="transition- hover:"
    >
      <CardContent className={ cn("p-4", compact && "p-3") }>
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5 min-w-0 flex-1">
            <p className={ cn(
              "font-medium text-muted-foreground      truncate",
              compact ? "" : ""
            ) }>
              { label }
            </p>
            <p className={ cn(
              "font-bold tabular-nums leading-none",
              compact ? "" : ""
            ) }>
              { value }
            </p>
            { subValue && (
              <p className={ cn(
                "text-muted-foreground leading-none pt-0.5",
                compact ? "" : ""
              ) }>
                { subValue }
              </p>
            ) }
            { additionalInfo && !compact && (
              <p className=" text-muted-foreground/70 leading-tight pt-1">
                { additionalInfo }
              </p>
            ) }
          </div>
          { icon && (
            <div className={ cn(
              "text-muted-foreground shrink-0",
              compact ? "opacity-60" : "opacity-80"
            ) }>
              { icon }
            </div>
          ) }
        </div>
        { trend && trendValue && (
          <div className={ cn(
            "flex items-center gap-1 mt-2 font-medium",
            compact ? "" : "",
            trend === "up" && "text-emerald-600 dark:text-emerald-400",
            trend === "down" && "text-rose-600 dark:text-rose-400",
            trend === "neutral" && "text-muted-foreground"
          ) }>
            <TrendIcon className={ cn(compact ? "w-2.5 h-2.5" : "w-3 h-3") } />
            <span>{ trendValue }</span>
          </div>
        ) }
      </CardContent>
    </Card>
  );
});

export default MetricCard;