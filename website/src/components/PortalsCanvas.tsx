/**
 * PortalsCanvas
 *
 * A lightweight, self-contained React Flow canvas that renders a read-only
 * demo of the Portals workspace.  Zero backend dependencies — works purely
 * from static JSON data.
 *
 * Usage (in Astro):
 *   ---
 *   import PortalsCanvas from "../components/PortalsCanvas";
 *   ---
 *   <PortalsCanvas client:load />
 */

import { memo, useMemo, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type NodeProps,
  type NodeTypes,
  useNodesState,
  useEdgesState,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { demoNodes, demoEdges, demoViewport, NODE_COLORS, TYPE_TO_ICON } from "../data/demoFlowData";

// ─── Lucide-icon SVG snippets (self-contained, no icon library needed) ────
const LUCIDE_ICONS: Record<string, React.ReactNode> = {
  MessagesSquare: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  Braces: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1" />
      <path d="M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1" />
    </svg>
  ),
  BrainCircuit: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
      <path d="M12 5a3 3 0 1 0 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
      <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
      <path d="M11.5 17v.01" />
      <path d="M12 9v.01" />
    </svg>
  ),
  StickyNote: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z" />
      <path d="M15 3v6h6" />
    </svg>
  ),
};

function getLucideIcon(type: string): React.ReactNode {
  const iconName = TYPE_TO_ICON[type] ?? "File";
  return LUCIDE_ICONS[iconName] ?? null;
}

// ─── Template field renderer ──────────────────────────────────────────────

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
        <div className={`w-8 h-4 rounded-full transition-colors ${field.value === true ? "bg-emerald-500" : "bg-neutral-600"}`}>
          <div className={`w-3 h-3 rounded-full bg-white shadow-sm transition-transform mt-0.5 ${field.value === true ? "ml-4" : "ml-0.5"}`} />
        </div>
        <span className="text-[11px] text-neutral-400">{field.value === true ? "Enabled" : "Disabled"}</span>
      </div>
    );
  }

  if (field.options && field.options.length > 0) {
    return (
      <div className="pointer-events-none">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-white/10 bg-white/5 text-[11px] text-white/70">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-400">
            <path d="m6 9 6 6 6-6" />
          </svg>
          <span className="truncate">{displayValue || field.placeholder || "Select..."}</span>
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
          <div className="flex-1 h-1.5 rounded-full bg-neutral-700 overflow-hidden">
            <div className="h-full rounded-full bg-white/30" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[11px] text-neutral-400 tabular-nums min-w-[3ch] text-right">{val}</span>
        </div>
      </div>
    );
  }

  if (isPassword) {
    return (
      <div className="pointer-events-none">
        <div className="px-2 py-1 rounded-md border border-white/10 bg-white/5 text-[11px] text-neutral-400">••••••••</div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none">
      <div
        className={`rounded-md border border-white/10 bg-white/5 text-[11px] text-white/70 ${
          field.multiline ? "px-2 py-1.5 min-h-[2.5rem] line-clamp-2" : "px-2 py-1 truncate"
        }`}
        title={displayValue}
      >
        {displayValue || field.placeholder || <span className="italic text-neutral-500">Empty</span>}
      </div>
    </div>
  );
}

// ─── Generic Node component ───────────────────────────────────────────────

function GenericDemoNode({ data, selected }: NodeProps) {
  const nodeData = data as any;
  const nodeType = nodeData?.type ?? "";
  const nodeConfig = nodeData?.node;
  const displayName = nodeConfig?.display_name ?? nodeType;
  const description = nodeConfig?.description ?? "";
  const template: Record<string, TemplateField> = nodeConfig?.template ?? {};
  const outputs = nodeConfig?.outputs ?? [];
  const nodeColor = NODE_COLORS[nodeType] ?? "#9CA3AF";

  const visibleFields = useMemo(
    () =>
      Object.entries(template).filter(([key, field]) => {
        if (["_type", "code", "_frontend_node_flow_id", "_frontend_node_folder_id", "is_refresh"].includes(key))
          return false;
        return field.show !== false;
      }),
    [template],
  );

  const { normalFields, advancedFields } = useMemo(() => {
    const normal: [string, TemplateField][] = [];
    const advanced: [string, TemplateField][] = [];
    for (const [key, field] of visibleFields) {
      if (field.advanced) advanced.push([key, field]);
      else normal.push([key, field]);
    }
    return { normalFields: normal, advancedFields: advanced };
  }, [visibleFields]);

  const hasInputHandle = normalFields.some(([, f]) => f.input_types && f.input_types.length > 0);
  const hasOutputHandle = outputs.length > 0;

  return (
    <div
      className={`relative w-80 rounded-xl border-2 shadow-sm transition-all duration-75 bg-zinc-900/90 backdrop-blur-sm ${
        selected ? "border-zinc-400 ring-2 ring-white/10" : "border-white/10"
      }`}
    >
      {/* Target handle (left) */}
      {hasInputHandle && (
        <Handle
          type="target"
          position={Position.Left}
          id="target"
          className="!absolute !-left-3 !top-1/2 !-translate-y-1/2 !w-3 !h-5 !rounded-md !border-2 !border-white/20 !bg-zinc-800/80 transition-all"
          style={{ background: nodeColor, borderColor: nodeColor }}
        />
      )}

      {/* Source handle (right) */}
      {hasOutputHandle && (
        <Handle
          type="source"
          position={Position.Right}
          id="source"
          className="!absolute !-right-3 !top-1/2 !-translate-y-1/2 !w-3 !h-5 !rounded-md !border-2 !border-white/20 !bg-zinc-800/80 transition-all"
          style={{ background: nodeColor, borderColor: nodeColor }}
        />
      )}

      {/* Header */}
      <div
        className="flex items-center gap-2.5 px-4 py-3 rounded-t-xl border-b border-white/10"
        style={{ background: `linear-gradient(135deg, ${nodeColor}25, ${nodeColor}08)` }}
      >
        <div
          className="flex items-center justify-center w-7 h-7 rounded-lg shrink-0 text-white"
          style={{ background: nodeColor }}
        >
          {getLucideIcon(nodeType)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold tracking-wide truncate text-white">
              {displayName}
            </span>
            {outputs.length > 0 && (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-neutral-300 font-mono">
                {outputs[0].types?.[0] ?? "Message"}
              </span>
            )}
          </div>
          {description && (
            <div className="text-[10px] text-neutral-400 truncate leading-tight mt-0.5">{description}</div>
          )}
        </div>
      </div>

      {/* Template fields */}
      <div className="px-4 py-2.5 space-y-2">
        {normalFields.map(([key, field]) => (
          <div key={key} className="space-y-0.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider">
                {field.display_name ?? key}
                {field.required && <span className="text-red-400 ml-0.5">*</span>}
              </label>
              {field.input_types && field.input_types.length > 0 && (
                <span className="text-[9px] px-1 py-0.5 rounded bg-purple-500/10 text-purple-300 font-mono">
                  {field.input_types.join(" | ")}
                </span>
              )}
            </div>
            <FieldInput field={field} />
          </div>
        ))}

        {advancedFields.length > 0 && (
          <details className="group">
            <summary className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors select-none list-none flex items-center gap-1">
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
            <div className="mt-2 space-y-2 pl-2 border-l-2 border-white/10">
              {advancedFields.map(([key, field]) => (
                <div key={key} className="space-y-0.5">
                  <label className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider">
                    {field.display_name ?? key}
                  </label>
                  <FieldInput field={field} />
                </div>
              ))}
            </div>
          </details>
        )}

        {normalFields.length === 0 && advancedFields.length === 0 && (
          <div className="py-2 text-center text-[10px] text-neutral-500 italic">No configurable parameters</div>
        )}
      </div>

      {/* Output indicators */}
      {outputs.length > 0 && (
        <div className="px-4 py-2 border-t border-white/10 bg-white/[0.02] rounded-b-xl">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] font-medium text-neutral-400 uppercase tracking-wider">Outputs:</span>
            {outputs.map((output: any, i: number) => (
              <span
                key={output.name ?? i}
                className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/5 text-white/60 font-mono border border-white/10"
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

// ─── Note Node component ──────────────────────────────────────────────────

function NoteDemoNode({ data, selected }: NodeProps) {
  const nodeData = data as any;
  const description = nodeData?.node?.description ?? "";
  const bgColor = nodeData?.node?.template?.backgroundColor;

  const isNeutral = bgColor === "neutral";

  return (
    <div
      className={`rounded-xl border-2 shadow-sm backdrop-blur-sm ${
        isNeutral
          ? "bg-amber-500/10 border-amber-500/30"
          : "bg-white/[0.02] border-white/10"
      } ${selected ? "ring-2 ring-white/20" : ""}`}
      style={{ width: 324, minHeight: 140 }}
    >
      <div className="nodrag nowheel p-4 text-sm leading-relaxed max-w-none">
        <div className="flex items-start gap-2">
          <span className="shrink-0 mt-0.5 text-amber-400/70">
            {LUCIDE_ICONS.StickyNote}
          </span>
          <div className="whitespace-pre-wrap text-white/80 text-[13px] leading-relaxed [&_strong]:text-white/90 [&_h3]:text-white [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mb-1 [&_p]:mb-1">
            {description}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Custom edge component (animated flow line) ────────────────────────────

function AnimatedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
}: any) {
  const edgePath = useMemo(() => {
    // Horizontal offset for bezier curve
    const dx = Math.abs(targetX - sourceX);
    const offset = Math.max(40, dx * 0.4);

    let sourceControlX: number;
    let targetControlX: number;

    if (sourcePosition === "left") {
      sourceControlX = sourceX - offset;
    } else {
      sourceControlX = sourceX + offset;
    }

    if (targetPosition === "left") {
      targetControlX = targetX - offset;
    } else {
      targetControlX = targetX + offset;
    }

    return `M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`;
  }, [sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition]);

  return (
    <>
      {/* Glow layer */}
      <path
        id={`${id}-glow`}
        className="react-flow__edge-path"
        d={edgePath}
        fill="none"
        stroke={selected ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.04)"}
        strokeWidth={selected ? 4 : 3}
      />
      {/* Main line */}
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        fill="none"
        stroke={selected ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.15)"}
        strokeWidth={1.5}
      />
      {/* Animated dot */}
      <circle r="2" fill="rgba(255,255,255,0.5)">
        <animateMotion dur="2s" repeatCount="indefinite" path={edgePath} />
      </circle>
    </>
  );
}

// ─── Canvas wrapper ────────────────────────────────────────────────────────

const nodeTypes: NodeTypes = {
  genericNode: memo(GenericDemoNode),
  noteNode: memo(NoteDemoNode),
};

const edgeTypes = {
  animated: AnimatedEdge,
};

// Helper: map demo edges to use the custom animated type
function prepareEdges(edges: Edge[]): Edge[] {
  return edges.map((e) => ({ ...e, type: "animated" }));
}

export default function PortalsCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState(demoNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(prepareEdges(demoEdges));

  const defaultEdgeOptions = useMemo(
    () => ({
      style: { stroke: "rgba(255,255,255,0.15)", strokeWidth: 1.5 },
      type: "animated",
    }),
    [],
  );

  const onConnect = useCallback(() => {
    // No-op: read-only canvas
  }, []);

  return (
    <div className="w-full h-full relative" style={{ minHeight: "480px" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        defaultViewport={demoViewport}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        elementsSelectable={true}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        preventScrolling={true}
        proOptions={{ hideAttribution: true }}
        className="!bg-transparent"
        colorMode="dark"
      >
        <Background
          color="rgba(255,255,255,0.04)"
          gap={24}
          size={1}
        />
        <Controls
          showInteractive={false}
          className="!bg-zinc-900/80 !border !border-white/10 !rounded-lg !backdrop-blur-sm [&_button]:!text-white/60 [&_button]:!border-white/10 [&_button:hover]:!bg-white/10 [&_button:hover]:!text-white"
        />
      </ReactFlow>
    </div>
  );
}
