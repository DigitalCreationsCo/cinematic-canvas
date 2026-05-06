import { createMockNode } from "#client/mocks/mock-node.js";
import { createMockProject } from "#shared/mocks/mock-project.js";

import { useProjectStore } from "#client/store/useProjectStore.ts";
import { MetadataNodeInspector } from "#client/components/canvas/inspection/MetadataNodeInspector.js";
import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect } from "vitest";

vi.mock("#client/store/useWorldStore.js", () => ({
  useWorldStore: vi.fn((selector) => {
    const mockWorldState = {
      worldId: "test-world-id",
      worldName: "Test World",
      role: "owner" as const,
      licenseType: "full-collab",
      sacRepoId: "sac-repo-123",
      commitHistory: [
        { id: "1", message: "Initial commit" },
        { id: "2", message: "Second commit" },
      ],
      isDirty: false,
    };
    if (typeof selector === "function") {
      return selector(mockWorldState);
    }
    return mockWorldState;
  }),
}));

describe("MetadataNodeInspector", () => {
  describe("rendering with linked world", () => {
    it("renders World and Project tabs when world is linked", () => {
      const node = createMockNode();
      render(<MetadataNodeInspector node={node} />);

      expect(screen.getByTestId("tab-trigger-world")).toBeInTheDocument();
      expect(screen.getByTestId("tab-trigger-project")).toBeInTheDocument();
    });

    it("displays world name in header", () => {
      const node = createMockNode();
      render(<MetadataNodeInspector node={node} />);

      expect(screen.getByText(/Test World/i)).toBeInTheDocument();
    });

    it("displays project title in header", () => {
      const mockProject = createMockProject({
        worldId: "test-world-id",
        metadata: {
          title: "A new world awaits",
        },
      });
      const store = useProjectStore.getState();
      store.hydrateProject(mockProject);

      const node = createMockNode();
      render(<MetadataNodeInspector node={node} />);

      const projectTitle = screen.queryByTestId("title-project");
      expect(projectTitle).toBeInTheDocument(); // Better than toBeDefined()
      // Use textContent instead of innerText
      expect(projectTitle?.textContent).toBe("A new world awaits");
    });

    it("renders RbacBanner component", () => {
      const node = createMockNode({ data: { isLocked: true } });
      render(<MetadataNodeInspector node={node} />);

      expect(screen.getByTestId("rbac-banner")).toBeInTheDocument();
    });
  });

  describe("node data", () => {
    it("renders with isLocked=false", () => {
      const node = createMockNode({
        data: { ...createMockNode().data, isLocked: false },
      });
      const { container } = render(<MetadataNodeInspector node={node} />);

      expect(container).toBeInTheDocument();
    });

    it("renders with isLocked=true", () => {
      const node = createMockNode({ data: { ...createMockNode().data, isLocked: true } });
      const { container } = render(<MetadataNodeInspector node={node} />);

      expect(container).toBeInTheDocument();
    });

    it("renders with scope=world", () => {
      const node = createMockNode({ data: { ...createMockNode().data, scope: "world" } });
      const { container } = render(<MetadataNodeInspector node={node} />);

      expect(container).toBeInTheDocument();
    });

    it("renders with scope=project", () => {
      const node = createMockNode({
        data: { ...createMockNode().data, scope: "project" },
      });
      const { container } = render(<MetadataNodeInspector node={node} />);

      expect(container).toBeInTheDocument();
    });
  });
});
