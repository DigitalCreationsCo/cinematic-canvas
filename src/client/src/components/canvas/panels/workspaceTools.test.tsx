import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";

// Mocks for components imported by workspaceTools that might fail in a minimal DOM environment
let lastOnSuccess: (() => void) | undefined;
vi.mock("#client/components/canvas/nodes/SceneCreatorFields.js", () => ({
  createSceneCreatorConfig: vi.fn((opts) => {
    lastOnSuccess = opts?.onSuccess;
    return {
      onSubmit: async () => {
        opts?.onSuccess?.();
      }
    };
  }),
  SceneCreatorFields: () => <div data-testid="mock-scene-creator-fields">Scene Creator Fields</div>,
}));

vi.mock("#client/components/ui/alert-dialog.js", () => ({
  AlertDialog: ({ children, open }: any) => (open ? <div data-testid="alert-dialog">{children}</div> : null),
  AlertDialogContent: ({ children }: any) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: any) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
  AlertDialogAction: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
  AlertDialogCancel: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
}));

vi.mock("#client/services/hybridNodeStorage.js", () => ({
  getHybridNodeStorage: () => ({
    delete: vi.fn(() => Promise.resolve()),
  }),
}));

import { ToolsSidebar } from "#client/components/canvas/panels/ToolsSidebar.js";
import { SceneCreatorToolManager, WORKSPACE_TOOLS } from "#client/components/canvas/panels/workspaceTools.js";
import { useUIMenuStore } from "#client/store/useUIMenuStore.js";
import { useNodeStore } from "#client/store/useNodeStore.js";
import { useProjectStore } from "#client/store/useProjectStore.js";

describe("Workspace Tools & Sidebar", () => {
  beforeEach(() => {
    // Reset stores
    useUIMenuStore.setState({ activeAuxiliarySidebar: null, activeTools: [] });
    useNodeStore.setState({ nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });
    useProjectStore.setState({ selectedProjectId: "test-project-123" });
  });

  it("renders all tool buttons when sidebar is open and none are active", () => {
    // Open the sidebar
    useUIMenuStore.setState({ activeAuxiliarySidebar: "tools" });
    
    render(<ToolsSidebar />);
    
    // Check that the tool button is visible
    WORKSPACE_TOOLS.forEach(tool => {
      expect(screen.getByText(tool.name)).toBeInTheDocument();
    });
  });

  it("tool button is visible when rendered", () => {
    useUIMenuStore.setState({ activeAuxiliarySidebar: "tools" });
    render(<ToolsSidebar />);
    
    const createScenesButton = screen.getByText("Create Scenes");
    expect(createScenesButton).toBeInTheDocument();
    
    // Click "Create Scenes" to activate it
    act(() => {
      fireEvent.click(createScenesButton);
    });
    
    // Verify through store state that tool is active
    const activeTools = useUIMenuStore.getState().activeTools;
    expect(activeTools).toEqual(["create-scenes"]);
    
    // "Create Scenes" button should still be rendered
    expect(screen.getByText("Create Scenes")).toBeInTheDocument();
    
    // Verify the tool button description is rendered
    const activeDescription = screen.getByText("Ask the assistant to generate a sequence of scenes.");
    expect(activeDescription).toBeInTheDocument();
  });

  it("only allows one tool button to be active and handles toggling", () => {
    useUIMenuStore.setState({ activeAuxiliarySidebar: "tools" });
    render(<ToolsSidebar />);
    
    // Activate
    act(() => {
      fireEvent.click(screen.getByText("Create Scenes"));
    });
    
    expect(useUIMenuStore.getState().activeTools).toContain("create-scenes");
    
    // Deactivate by clicking the same button again
    act(() => {
      fireEvent.click(screen.getByText("Create Scenes"));
    });
    
    expect(useUIMenuStore.getState().activeTools).not.toContain("create-scenes");
  });

  it("mounts the node when the respective tool button is active, and unmounts when inactive", () => {
    useUIMenuStore.setState({ activeAuxiliarySidebar: "tools" });
    render(
      <>
        <ToolsSidebar />
        <SceneCreatorToolManager />
      </>
    );
    
    expect(useNodeStore.getState().nodes.length).toBe(0);
    
    // Activate tool
    act(() => {
      fireEvent.click(screen.getByText("Create Scenes"));
    });
    
    // Node should be added to the store (representing it being visible on canvas)
    const activeNodes = useNodeStore.getState().nodes;
    expect(activeNodes.length).toBe(1);
    expect((activeNodes[0] as any).type).toBe("scene-creator");
    
    // Deactivate tool
    act(() => {
      fireEvent.click(screen.getByText("Create Scenes"));
    });
    
    // Node should be removed
    expect(useNodeStore.getState().nodes.length).toBe(0);
  });

  it("unmounts the node when sidebar is closed, and remounts when sidebar is reopened", () => {
    // Start with sidebar open and tool active
    useUIMenuStore.setState({ activeAuxiliarySidebar: "tools", activeTools: ["create-scenes"] });
    
    const { rerender } = render(
      <>
        <ToolsSidebar />
        <SceneCreatorToolManager />
      </>
    );
    
    // Node should exist
    expect(useNodeStore.getState().nodes.length).toBe(1);
    
    // Close sidebar
    act(() => {
      useUIMenuStore.setState({ activeAuxiliarySidebar: null });
    });
    
    // Sidebar unmounts itself when activeAuxiliarySidebar is null
    rerender(
      <>
        <ToolsSidebar />
        <SceneCreatorToolManager />
      </>
    );
    
    // Node should be unmounted (hidden)
    expect(useNodeStore.getState().nodes.length).toBe(0);
    // Tool is still technically 'active' in the store
    expect(useUIMenuStore.getState().activeTools).toContain("create-scenes");
    
    // Reopen sidebar
    act(() => {
      useUIMenuStore.setState({ activeAuxiliarySidebar: "tools" });
    });
    
    rerender(
      <>
        <ToolsSidebar />
        <SceneCreatorToolManager />
      </>
    );
    
    // Node should be remounted (visible again)
    expect(useNodeStore.getState().nodes.length).toBe(1);
    expect((useNodeStore.getState().nodes[0] as any).type).toBe("scene-creator");
  });

  it("major buttons in the tool sidebar are visible and properly contained", () => {
    useUIMenuStore.setState({ activeAuxiliarySidebar: "tools" });
    const { container } = render(<ToolsSidebar />);
    
    // Verify the buttons container is rendered without flex-1 (our layout fix)
    const buttonsContainer = container.querySelector(".overflow-y-auto");
    expect(buttonsContainer).toBeInTheDocument();
    expect(buttonsContainer?.className).not.toContain("flex-1");
    
    // Verify the tool container is rendered
    const toolContainer = container.querySelector("#workspace-tool-container");
    expect(toolContainer).toBeInTheDocument();
    expect(toolContainer?.className).toContain("flex-1");
  });

  it("deactivates the tool and removes the node when the form is successfully submitted", async () => {
    useUIMenuStore.setState({ activeAuxiliarySidebar: "tools" });
    render(
      <>
        <ToolsSidebar />
        <SceneCreatorToolManager />
      </>
    );

    // 1. Activate the tool
    act(() => {
      fireEvent.click(screen.getByText("Create Scenes"));
    });

    expect(useUIMenuStore.getState().activeTools).toContain("create-scenes");
    expect(useNodeStore.getState().nodes.length).toBe(1);

    // 2. Trigger the onSuccess callback (simulating form submission)
    // In the real app, this happens inside FormNode calling onSubmit in formConfig.
    // Here we manually trigger the callback that was passed to createSceneCreatorConfig.
    act(() => {
      lastOnSuccess?.();
    });

    // 3. Verify tool is deactivated and node is removed
    expect(useUIMenuStore.getState().activeTools).not.toContain("create-scenes");
    
    // The node should be removed from the store
    expect(useNodeStore.getState().nodes.length).toBe(0);
  });
});
