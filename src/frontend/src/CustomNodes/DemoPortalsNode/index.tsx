/**
 * DemoPortalsNode
 *
 * A standalone custom React Flow node component that mimics the Portals
 * GenericNode visual style — header card, template fields, and handles.
 *
 * This component has ZERO dependencies on Portals stores, backend APIs,
 * or external state. It works purely from the node data supplied by the
 * demoFlow.json file.
 *
 * Supported node types (determined by data.type):
 *   - "genericNode"  → Renders a full Portals-style node with template fields
 *   - "noteNode"     → Renders a sticky-note style node (just description)
 */

import { Handle, type NodeProps, Position } from "@xyflow/react";
import { memo, useMemo } from "react";

// ─── Colour helpers ─────────────────────────────────────────────────────────
// These mirror the nodeColors mapping in styleUtils.ts
const NODE_COLORS: Record<string, string> = {
  ChatInput: "#10B981",
  ChatOutput: "#AA2411",
  Prompt: "#4367BF",
  LanguageModelComponent: "#ab11ab",
  SplitText: "#7AAE42",
  File: "#198BF6",
  Memory: "#F5B85A",
  KnowledgeBase: "#AA8742",
  parser: "#9AAE42",
  KnowledgeIngestion: "#42BAA7",
};

const TYPE_TO_LUCIDE_ICON: Record<string, string> = {
  ChatInput: "MessagesSquare",
  ChatOutput: "MessagesSquare",
  Prompt: "Braces",
  LanguageModelComponent: "BrainCircuit",
  SplitText: "Scissors",
  File: "File",
  Memory: "Cpu",
  KnowledgeBase: "Layers",
  parser: "FileText",
  KnowledgeIngestion: "Database",
};

// Simple lucide-icon SVG snippets for demo — no dynamic icon import needed
const LUCIDE_ICONS: Record<string, React.ReactNode> = {
  MessagesSquare: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  Braces: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1" />
      <path d="M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1" />
    </svg>
  ),
  BrainCircuit: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
      <path d="M12 5a3 3 0 1 0 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
      <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
      <path d="M11.5 17v.01" />
      <path d="M12 9v.01" />
    </svg>
  ),
  File: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </svg>
  ),
  Scissors: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M20 4 8.12 15.88" />
      <path d="M14.47 14.48 20 20" />
      <path d="M8.12 8.12 12 12" />
    </svg>
  ),
  Cpu: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M9 2v4" />
      <path d="M15 2v4" />
      <path d="M9 18v4" />
      <path d="M15 18v4" />
      <path d="M2 9h4" />
      <path d="M18 9h4" />
      <path d="M2 15h4" />
      <path d="M18 15h4" />
    </svg>
  ),
  Layers: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2 2 7l10 5 10-5-10-5Z" />
      <path d="m2 17 10 5 10-5" />
      <path d="m2 12 10 5 10-5" />
    </svg>
  ),
  FileText: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  ),
  Database: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
      <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
    </svg>
  ),
  StickyNote: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z" />
      <path d="M15 3v6h6" />
    </svg>
  ),
};

function getNodeColor(type: string): string {
  return NODE_COLORS[type] ?? "#9CA3AF";
}

function getLucideIcon(type: string): React.ReactNode {
  const iconName = TYPE_TO_LUCIDE_ICON[type] ?? "File";
  return LUCIDE_ICONS[iconName] ?? null;
}

// ─── Template field renderer ────────────────────────────────────────────────

interface TemplateField {
  type: string;
  display_name?: string;
  value?: unknown;
  required?: boolean;
  multiline?: boolean;
  password?: boolean;
  placeholder?: string;
  info?: string;
  advanced?: boolean;
  show?: boolean;
  options?: string[];
  input_types?: string[];
}

function renderFieldValue(field: TemplateField): string {
  if (field.value === undefined || field.value === null) return "";
  if (typeof field.value === "boolean") return field.value ? "Yes" : "No";
  return String(field.value);
}

function FieldInput({ field }: { field: TemplateField }) {
  const isBool = field.type === "bool";
  const isPassword = field.password === true;
  const isSlider = field.type === "slider";
  const displayValue = renderFieldValue(field);

  if (isBool) {
    return (
      <div className="flex items-center gap-2 pointer-events-none">
        <div
          className={`w-8 h-4 rounded-full transition-colors ${
            field.value === true ? "bg-primary" : "bg-muted"
          }`}
        >
          <div
            className={`w-3 h-3 rounded-full bg-white shadow-sm transition-transform mt-0.5 ${
              field.value === true ? "ml-4" : "ml-0.5"
            }`}
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {field.value === true ? "Enabled" : "Disabled"}
        </span>
      </div>
    );
  }

  if (field.options && field.options.length > 0) {
    return (
      <div className="pointer-events-none">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-border bg-muted/50 text-xs text-foreground/70">
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-muted-foreground"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
          <span className="truncate">
            {displayValue || field.placeholder || "Select..."}
          </span>
        </div>
      </div>
    );
  }

  if (isSlider) {
    const rangeSpec = (field as any).range_spec || {};
    const min = rangeSpec.min ?? 0;
    const max = rangeSpec.max ?? 1;
    const val = (field.value as number) ?? 0;
    const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
    return (
      <div className="pointer-events-none">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary/60"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground tabular-nums min-w-[3ch] text-right">
            {val}
          </span>
        </div>
      </div>
    );
  }

  if (isPassword) {
    return (
      <div className="pointer-events-none">
        <div className="px-2 py-1 rounded-md border border-border bg-muted/50 text-xs text-muted-foreground">
          ••••••••
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none">
      <div
        className={`rounded-md border border-border bg-muted/50 text-xs text-foreground/70 ${
          field.multiline
            ? "px-2 py-1.5 min-h-[2.5rem] line-clamp-2"
            : "px-2 py-1 truncate"
        }`}
        title={displayValue}
      >
        {displayValue || field.placeholder || (
          <span className="italic text-muted-foreground/50">Empty</span>
        )}
      </div>
    </div>
  );
}

// ─── Main node component ─────────────────────────────────────────────────────

function DemoPortalsNode({ data, selected }: NodeProps) {
  const nodeData = data as any;
  const nodeType = nodeData?.type ?? "";
  const nodeConfig = nodeData?.node;
  const displayName = nodeConfig?.display_name ?? nodeType;
  const description = nodeConfig?.description ?? "";
  const icon = nodeConfig?.icon ?? "";
  const template: Record<string, TemplateField> = nodeConfig?.template ?? {};
  const outputs = nodeConfig?.outputs ?? [];

  // Filter template fields to show (skip internal ones like _type, code)
  const visibleFields = useMemo(() => {
    return Object.entries(template).filter(([key, field]) => {
      if (
        key === "_type" ||
        key === "code" ||
        key === "_frontend_node_flow_id" ||
        key === "_frontend_node_folder_id"
      )
        return false;
      if (key === "is_refresh") return false;
      return field.show !== false;
    });
  }, [template]);

  // Separate advanced and non-advanced fields
  const { normalFields, advancedFields } = useMemo(() => {
    const normal: typeof visibleFields = [];
    const advanced: typeof visibleFields = [];
    for (const [key, field] of visibleFields) {
      if (field.advanced) {
        advanced.push([key, field] as [string, TemplateField]);
      } else {
        normal.push([key, field] as [string, TemplateField]);
      }
    }
    return { normalFields: normal, advancedFields: advanced };
  }, [visibleFields]);

  const nodeColor = getNodeColor(nodeType);

  // ── Note node rendering ──────────────────────────────────────────────────
  if (nodeData?.type === "note" || nodeData?.type === "noteNode") {
    const noteBg = nodeConfig?.template?.backgroundColor;
    const bgClass =
      noteBg === "neutral"
        ? "bg-amber-50/80 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800"
        : "bg-transparent border-border/50";
    return (
      <div
        className={`rounded-xl border-2 shadow-sm backdrop-blur-sm ${bgClass} ${
          selected ? "ring-2 ring-primary ring-offset-2" : ""
        }`}
        style={{ width: 324, minHeight: 140 }}
      >
        <div className="nodrag nowheel p-4 text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none">
          <div className="flex items-start gap-2">
            <span className="shrink-0 mt-0.5 text-amber-500 dark:text-amber-400">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z" />
                <path d="M15 3v6h6" />
              </svg>
            </span>
            <div className="whitespace-pre-wrap">{description}</div>
          </div>
        </div>
      </div>
    );
  }

  // ── Generic node rendering ───────────────────────────────────────────────

  // Determine input handle types from input_types in template fields
  const hasInputHandle = normalFields.some(
    ([, f]) => f.input_types && f.input_types.length > 0,
  );

  // Determine output handle types from outputs
  const hasOutputHandle = outputs.length > 0;

  return (
    <div
      className={`relative w-80 rounded-xl border-2 shadow-sm transition-all duration-75 hover:shadow-md bg-card text-card-foreground ${
        selected
          ? "border-primary ring-2 ring-primary/20 ring-offset-1"
          : "border-border"
      }`}
    >
      {/* ── Target handle (left side) ──────────────────────────────────────── */}
      {hasInputHandle && (
        <Handle
          type="target"
          position={Position.Left}
          id="target"
          className="!absolute !-left-3 !top-1/2 !-translate-y-1/2 !w-3 !h-5 !rounded-md !border-2 !border-border !bg-background/80 hover:!scale-110 hover:!bg-primary/80 transition-all"
          style={{ background: nodeColor, borderColor: nodeColor }}
        />
      )}

      {/* ── Source handle (right side) ─────────────────────────────────────── */}
      {hasOutputHandle && (
        <Handle
          type="source"
          position={Position.Right}
          id="source"
          className="!absolute !-right-3 !top-1/2 !-translate-y-1/2 !w-3 !h-5 !rounded-md !border-2 !border-border !bg-background/80 hover:!scale-110 hover:!bg-primary/80 transition-all"
          style={{ background: nodeColor, borderColor: nodeColor }}
        />
      )}

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-2.5 px-4 py-3 rounded-t-xl border-b border-border"
        style={{
          background: `linear-gradient(135deg, ${nodeColor}15, ${nodeColor}08)`,
        }}
      >
        <div
          className="flex items-center justify-center w-7 h-7 rounded-lg shrink-0 text-white"
          style={{ background: nodeColor }}
        >
          {getLucideIcon(nodeType)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold tracking-wide truncate text-foreground">
              {displayName}
            </span>
            {outputs.length > 0 && (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-mono">
                {outputs[0].types?.[0] ?? "Message"}
              </span>
            )}
          </div>
          {description && (
            <div className="text-[10px] text-muted-foreground truncate leading-tight mt-0.5">
              {description}
            </div>
          )}
        </div>
      </div>

      {/* ── Template fields ──────────────────────────────────────────────────── */}
      <div className="px-4 py-2.5 space-y-2">
        {normalFields.map(([key, field]) => (
          <div key={key} className="space-y-0.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                {field.display_name ?? key}
                {field.required && (
                  <span className="text-destructive ml-0.5">*</span>
                )}
              </label>
              {field.input_types && field.input_types.length > 0 && (
                <span className="text-[9px] px-1 py-0.5 rounded bg-datatype-indigo/10 text-datatype-indigo font-mono">
                  {field.input_types.join(" | ")}
                </span>
              )}
            </div>
            <FieldInput field={field} />
          </div>
        ))}

        {/* Advanced fields toggle (show collapsed in demo) */}
        {advancedFields.length > 0 && (
          <details className="group">
            <summary className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors select-none list-none flex items-center gap-1">
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="transition-transform group-open:rotate-90"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
              Advanced ({advancedFields.length})
            </summary>
            <div className="mt-2 space-y-2 pl-2 border-l-2 border-muted">
              {advancedFields.map(([key, field]) => (
                <div key={key} className="space-y-0.5">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    {field.display_name ?? key}
                  </label>
                  <FieldInput field={field} />
                </div>
              ))}
            </div>
          </details>
        )}

        {normalFields.length === 0 && advancedFields.length === 0 && (
          <div className="py-2 text-center text-[10px] text-muted-foreground italic">
            No configurable parameters
          </div>
        )}
      </div>

      {/* ── Output indicators ────────────────────────────────────────────────── */}
      {outputs.length > 0 && (
        <div className="px-4 py-2 border-t border-border bg-muted/30 rounded-b-xl">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">
              Outputs:
            </span>
            {outputs.map((output: any, i: number) => (
              <span
                key={output.name ?? i}
                className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/5 text-primary/80 font-mono border border-primary/10"
              >
                {output.display_name ?? output.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(DemoPortalsNode);
