/**
 * DemoWorkspace
 *
 * A standalone, purely static demo of the Portals visual canvas.
 *
 * This page:
 *   • Loads static graph data from demoFlow.json (no backend API calls)
 *   • Renders a full <ReactFlow> canvas with <Background> and <Controls>
 *   • Uses DemoPortalsNode to render each node in the Portals style
 *   • Nodes are NOT draggable (demo purposes only)
 *   • Zero backend connectivity — no API polling, no Uvicorn server
 */

import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  MiniMap,
  type Node,
  type NodeChange,
  type NodeTypes,
  ReactFlow,
  useNodesState,
} from "@xyflow/react";
import { useCallback, useMemo, useRef } from "react";
import "@xyflow/react/dist/style.css";

import demoFlow from "../../../demoFlow.json";
import DemoPortalsNode from "../../CustomNodes/DemoPortalsNode";

// ─── Constants ───────────────────────────────────────────────────────────────

const DEMO_NODE_TYPES: NodeTypes = {
  genericNode: DemoPortalsNode,
  noteNode: DemoPortalsNode,
};

const EDGE_STYLE_DEFAULT: React.CSSProperties = {
  stroke: "#64748b",
  strokeWidth: 2,
  vectorEffect: "non-scaling-stroke",
};

const EDGE_STYLE_ACTIVE: React.CSSProperties = {
  stroke: "#6366f1",
  strokeWidth: 3,
  vectorEffect: "non-scaling-stroke",
};

// ─── Page component ──────────────────────────────────────────────────────────

export default function DemoWorkspace() {
  // Parse the static JSON data
  const {
    nodes: initialNodes,
    edges: initialEdges,
    viewport,
  } = useMemo(() => {
    const flowData = (demoFlow as any).data;
    const rawNodes: any[] = flowData?.nodes ?? [];
    const rawEdges: any[] = flowData?.edges ?? [];
    const vp = flowData?.viewport ?? { x: 0, y: 0, zoom: 0.85 };

    // Mark all nodes as undraggable and non-deletable for the demo
    const nodes: Node[] = rawNodes.map((n: any) => ({
      id: n.id,
      type: n.type ?? "genericNode",
      position: n.position ?? { x: 0, y: 0 },
      data: n.data ?? {},
      draggable: false,
      selected: false,
    }));

    // Map edges with clean IDs and styles
    const edges: Edge[] = rawEdges.map((e: any, idx: number) => ({
      id: e.id ?? `demo-edge-${idx}`,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      type: e.type ?? "default",
      animated: e.animated ?? true,
      style: e.animated ? EDGE_STYLE_ACTIVE : EDGE_STYLE_DEFAULT,
      data: e.data ?? {},
    }));

    return { nodes, edges, viewport: vp };
  }, []);

  const [nodes, setNodes] = useNodesState(initialNodes);

  // Prevent all node dragging by overriding changes
  // We filter out position/dimension changes so nodes stay in place
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const filtered = changes.filter(
        (c) => c.type !== "position" && c.type !== "dimensions",
      );
      if (filtered.length > 0) {
        setNodes((nds) => applyNodeChanges(filtered, nds));
      }
    },
    [setNodes],
  );

  // The flow container ref
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // Default viewport from the JSON
  const defaultViewport = useMemo(
    () => ({
      x: viewport?.x ?? 0,
      y: viewport?.y ?? 0,
      zoom: viewport?.zoom ?? 0.85,
    }),
    [viewport],
  );

  return (
    <div className="h-screen w-screen flex flex-col bg-canvas overflow-hidden">
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between h-14 px-5 border-b border-border bg-background/90 backdrop-blur-sm shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5" />
                <line x1="12" y1="22" x2="12" y2="15.5" />
                <polyline points="22 8.5 12 15.5 2 8.5" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-semibold text-foreground leading-tight">
                Portals Demo
              </h1>
              <p className="text-[10px] text-muted-foreground leading-tight">
                {(demoFlow as any).name ?? "Basic Prompting"} — Static Canvas
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden sm:flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
            {initialNodes.length} nodes
          </span>
          <span className="hidden sm:flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="inline-block w-2 h-2 rounded-full bg-indigo-400" />
            {initialEdges.length} edges
          </span>
          <a
            href="/"
            className="text-xs px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            Back to App
          </a>
        </div>
      </header>

      {/* ── React Flow canvas ──────────────────────────────────────────────── */}
      <div ref={reactFlowWrapper} className="flex-1 w-full">
        <ReactFlow
          nodes={nodes}
          edges={initialEdges}
          onNodesChange={onNodesChange}
          nodeTypes={DEMO_NODE_TYPES}
          defaultViewport={defaultViewport}
          fitView={false}
          minZoom={0.1}
          maxZoom={2}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={true}
          panOnDrag={true}
          zoomOnScroll={true}
          selectNodesOnDrag={false}
          panOnScroll={false}
          preventScrolling={true}
          deleteKeyCode={null}
          multiSelectionKeyCode="Shift"
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="hsl(var(--canvas-dot))"
          />
          <Controls
            showInteractive={false}
            className="!rounded-lg !border !border-border !shadow-sm !bg-background/90 !backdrop-blur-sm"
          />
          <MiniMap
            nodeStrokeWidth={2}
            nodeColor={(n) => {
              const type = (n.data as any)?.type;
              const colors: Record<string, string> = {
                ChatInput: "#10B981",
                ChatOutput: "#AA2411",
                Prompt: "#4367BF",
                LanguageModelComponent: "#ab11ab",
              };
              return colors[type] ?? "#64748b";
            }}
            maskColor="hsl(var(--canvas)/0.6)"
            className="!rounded-lg !border !border-border !shadow-sm"
            style={{ background: "hsl(var(--background)/0.9)" }}
          />
        </ReactFlow>
      </div>
    </div>
  );
}
