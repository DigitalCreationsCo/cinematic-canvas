import { Badge } from "#client/components/ui/badge.js";
import { cn } from "#client/lib/utils.js";
import type { StatusType } from "../../../shared/types/pipeline.types.js";


interface StatusBadgeProps {
  status: StatusType;
  size?: "sm" | "default";
  className?: string;
}

const statusConfig: Record<StatusType, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className: string; }> = {
  ready: { label: "Ready", variant: "secondary", className: "bg-muted text-muted-foreground" },
  pending: { label: "Pending", variant: "secondary", className: "bg-muted text-muted-foreground" },
  analyzing: { label: "Analyzing", variant: "default", className: "bg-chart-1 animate-pulse" },
  generating: { label: "Generating", variant: "default", className: "bg-chart-4 animate-pulse" },
  evaluating: { label: "Evaluating", variant: "default", className: "bg-chart-2 animate-pulse" },
  complete: { label: "Complete", variant: "default", className: "bg-chart-3" },
  error: { label: "Error", variant: "destructive", className: "" },
  PASS: { label: "Pass", variant: "default", className: "bg-chart-3" },
  MINOR_ISSUES: { label: "Minor Issues", variant: "default", className: "bg-chart-4" },
  MAJOR_ISSUES: { label: "Major Issues", variant: "default", className: "bg-chart-5" },
  FAIL: { label: "Fail", variant: "destructive", className: "" },
  ACCEPT: { label: "Accept", variant: "default", className: "bg-chart-3" },
  ACCEPT_WITH_NOTES: { label: "Accept w/ Notes", variant: "default", className: "bg-chart-3/80" },
  REGENERATE_MINOR: { label: "Regen Minor", variant: "default", className: "bg-chart-4" },
  REGENERATE_MAJOR: { label: "Regen Major", variant: "default", className: "bg-chart-5" },
  paused: {
    label: "Paused",
    variant: "default",
    className: ""
  }
};

export default function StatusBadge({ status, size = "default", className }: StatusBadgeProps) {
  const config = statusConfig[status] || { label: status, variant: "secondary" as const, className: "" };

  return (
    <Badge
      variant={config.variant}
      className={cn(
        "rounded-none font-mono     border-0",
        size === "sm" && "text-xs px-1.5 py-0 h-4",
        size === "default" && "px-2 h-5",
        config.className,
        className
      )}
      data-testid={`badge-status-${status}`}
    >
      {config.label}
    </Badge>
  );
}
