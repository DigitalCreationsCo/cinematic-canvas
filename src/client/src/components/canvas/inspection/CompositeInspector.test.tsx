import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { CompositeInspector } from "./CompositeInspector.js";
import type { CanvasNode } from "#client/domain/canvas/NodeTypes.js";
import { useNodeStore } from "#client/store/useNodeStore.js";
import { useProjectStore } from "#client/store/useProjectStore.js";

vi.mock("lucide-react", () => ({
  Layers: () => null,
  Image: () => null,
}));

vi.mock("../../../store/useNodeStore.js", () => ({
  useNodeStore: vi.fn((selector) => {
    const mockState = {
      edges: [],
      nodes: [],
      updateNodeData: vi.fn(),
    };
    if (typeof selector === "function") {
      return selector(mockState);
    }
    return mockState;
  }),
}));

vi.mock("../../../store/useAssetStore.js", () => ({
  useAssetStore: vi.fn(() => ({
    assets: new Map(),
    getState: () => ({
      assets: new Map(),
    }),
  })),
}));

vi.mock("../../ui/badge.js", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="badge">{children}</span>
  ),
}));

vi.mock("../../ui/label.js", () => ({
  Label: ({ children }: { children: React.ReactNode }) => (
    <label data-testid="label">{children}</label>
  ),
}));

vi.mock("../../ui/textarea.js", () => ({
  Textarea: ({ value, onChange, placeholder }: any) => (
    <textarea
      data-testid="textarea"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
    />
  ),
}));

vi.mock("../../ui/button.js", () => ({
  Button: ({ children, onClick, disabled }: any) => (
    <button data-testid="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock("../../ui/slider.js", () => ({
  Slider: ({ value, onValueChange }: any) => (
    <input
      type="range"
      data-testid="slider"
      value={value?.[0] || 0}
      onChange={(e) => onValueChange?.([parseInt(e.target.value)])}
    />
  ),
}));

vi.mock("../../../../../shared/utils/assets.utils.js", () => ({
  getAllBestAssets: vi.fn().mockReturnValue({}),
}));

const createMockNode = (overrides: Partial<CanvasNode> = {}): CanvasNode =>
  ({
    id: "composite-node-1",
    type: "composite",
    position: { x: 0, y: 0 },
    data: {
      entityId: "composite-entity-1",
      contextId: "test-project",
      contextType: "project",
      scope: "project",
      isLocked: false,
      pipelineSelected: false,
      collapsed: false,
      idxVersion: 1,
      ...overrides,
    },
    ...overrides,
  }) as CanvasNode;

describe("CompositeInspector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNodeStore).mockImplementation((selector: any) => {
      const mockState = {
        edges: [],
        nodes: [],
        updateNodeData: vi.fn(),
      };
      return typeof selector === "function" ? selector(mockState) : mockState;
    });
    vi.mocked(useProjectStore).mockImplementation((selector: any) => {
      const mockState = {
        characters: new Map(),
        locations: new Map(),
        scenes: new Map(),
      };
      return typeof selector === "function" ? selector(mockState) : mockState;
    });
  });

  describe("rendering", () => {
    it("renders the inspector header", () => {
      const node = createMockNode();
      render(<CompositeInspector node={node} />);

      expect(screen.getByText("Composite Operation")).toBeInTheDocument();
    });

    it("renders the Multi-Image Merge subtitle", () => {
      const node = createMockNode();
      render(<CompositeInspector node={node} />);

      expect(screen.getByText("Multi-Image Merge")).toBeInTheDocument();
    });

    it("renders Connected Inputs label", () => {
      const node = createMockNode();
      render(<CompositeInspector node={node} />);

      expect(screen.getByText("Connected Inputs")).toBeInTheDocument();
    });

    it("renders composite prompt textarea", () => {
      const node = createMockNode();
      render(<CompositeInspector node={node} />);

      expect(screen.getByTestId("textarea")).toBeInTheDocument();
    });

    it("renders Generate Output button", () => {
      const node = createMockNode();
      render(<CompositeInspector node={node} />);

      expect(screen.getByText("Generate Output")).toBeInTheDocument();
    });

    it("shows placeholder text when no inputs connected", () => {
      const node = createMockNode();
      render(<CompositeInspector node={node} />);

      expect(screen.getByText(/Connect Character, Location/)).toBeInTheDocument();
    });
  });

  describe("composite prompt persistence", () => {
    it("loads compositePrompt from node data", () => {
      const node = createMockNode({
        data: { compositePrompt: "Warm blend of sunset tones" } as any,
      });
      render(<CompositeInspector node={node} />);

      const textarea = screen.getByTestId("textarea") as HTMLTextAreaElement;
      expect(textarea.value).toBe("Warm blend of sunset tones");
    });

    it("defaults to empty prompt when not set", () => {
      const node = createMockNode();
      render(<CompositeInspector node={node} />);

      const textarea = screen.getByTestId("textarea") as HTMLTextAreaElement;
      expect(textarea.value).toBe("");
    });

    it("renders prompt textarea with correct placeholder", () => {
      const node = createMockNode();
      render(<CompositeInspector node={node} />);

      const textarea = screen.getByTestId("textarea");
      expect(textarea).toHaveAttribute(
        "placeholder",
        "Describe how the inputs should be combined...",
      );
    });
  });

  describe("composite weights persistence", () => {
    it("defaults to 50% weights when not set", () => {
      const node = createMockNode();
      render(<CompositeInspector node={node} />);

      // When no inputs connected, no weight sliders are rendered
      // The default weights array is [50, 50, 50] but it's only shown for connected inputs
      expect(screen.queryByText("Weight 1")).not.toBeInTheDocument();
    });

    it("renders weight slider for connected input", () => {
      // Create a node that has an entityId we can reference
      const compositeNode = createMockNode({
        id: "composite-1",
        data: { entityId: "composite-1" } as any,
      });

      // Mock a connected character node
      const characterNode = createMockNode({
        id: "character-1",
        type: "character" as any,
        data: { entityId: "char-entity-1" } as any,
      });

      const edges = [
        { id: "e1", source: "character-1", target: "composite-1", targetHandle: null },
      ];

      const nodes = [compositeNode, characterNode];

      vi.mocked(useNodeStore).mockImplementation((selector: any) => {
        const mockState = { edges, nodes, updateNodeData: vi.fn() };
        return typeof selector === "function" ? selector(mockState) : mockState;
      });

      vi.mocked(useProjectStore).mockImplementation((selector: any) => {
        const mockState = {
          characters: new Map([
            ["char-entity-1", { id: "char-entity-1", name: "Test Character" }],
          ]),
          locations: new Map(),
          scenes: new Map(),
        };
        return typeof selector === "function" ? selector(mockState) : mockState;
      });

      render(<CompositeInspector node={compositeNode} />);

      expect(screen.getByText("Weight 1")).toBeInTheDocument();
      expect(screen.getByText("Test Character")).toBeInTheDocument();
    });

    it("renders multiple weight sliders for multiple inputs", () => {
      const compositeNode = createMockNode({
        id: "composite-1",
        data: { entityId: "composite-1" } as any,
      });

      const characterNode = createMockNode({
        id: "character-1",
        type: "character" as any,
        data: { entityId: "char-entity-1" } as any,
      });

      const locationNode = createMockNode({
        id: "location-1",
        type: "location" as any,
        data: { entityId: "loc-entity-1" } as any,
      });

      const edges = [
        { id: "e1", source: "character-1", target: "composite-1", targetHandle: null },
        { id: "e2", source: "location-1", target: "composite-1", targetHandle: null },
      ];

      const nodes = [compositeNode, characterNode, locationNode];

      vi.mocked(useNodeStore).mockImplementation((selector: any) => {
        const mockState = { edges, nodes, updateNodeData: vi.fn() };
        return typeof selector === "function" ? selector(mockState) : mockState;
      });

      vi.mocked(useProjectStore).mockImplementation((selector: any) => {
        const mockState = {
          characters: new Map([["char-entity-1", { id: "char-entity-1", name: "Hero" }]]),
          locations: new Map([["loc-entity-1", { id: "loc-entity-1", name: "Studio" }]]),
          scenes: new Map(),
        };
        return typeof selector === "function" ? selector(mockState) : mockState;
      });

      render(<CompositeInspector node={compositeNode} />);

      expect(screen.getByText("Weight 1")).toBeInTheDocument();
      expect(screen.getByText("Weight 2")).toBeInTheDocument();
      expect(screen.getByText("Hero")).toBeInTheDocument();
      expect(screen.getByText("Studio")).toBeInTheDocument();
    });
  });

  describe("Generate Output button state", () => {
    it("button is disabled when no inputs connected", () => {
      const node = createMockNode();
      render(<CompositeInspector node={node} />);

      const button = screen.getByText("Generate Output");
      expect(button).toBeDisabled();
    });

    it("button is enabled when inputs are connected", () => {
      const compositeNode = createMockNode({
        id: "composite-1",
        data: { entityId: "composite-1" } as any,
      });

      const characterNode = createMockNode({
        id: "character-1",
        type: "character" as any,
        data: { entityId: "char-entity-1" } as any,
      });

      const edges = [
        { id: "e1", source: "character-1", target: "composite-1", targetHandle: null },
      ];

      const nodes = [compositeNode, characterNode];

      vi.mocked(useNodeStore).mockImplementation((selector: any) => {
        const mockState = { edges, nodes, updateNodeData: vi.fn() };
        return typeof selector === "function" ? selector(mockState) : mockState;
      });

      vi.mocked(useProjectStore).mockImplementation((selector: any) => {
        const mockState = {
          characters: new Map([["char-entity-1", { id: "char-entity-1", name: "Test" }]]),
          locations: new Map(),
          scenes: new Map(),
        };
        return typeof selector === "function" ? selector(mockState) : mockState;
      });

      render(<CompositeInspector node={compositeNode} />);

      const button = screen.getByText("Generate Output");
      expect(button).not.toBeDisabled();
    });
  });

  describe("connected inputs display", () => {
    it('shows "Connect Character" message when no inputs connected', () => {
      const node = createMockNode();
      render(<CompositeInspector node={node} />);

      expect(screen.getByText(/Connect Character/)).toBeInTheDocument();
    });
  });
});
