import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BulkFilesStagingPanel } from "#client/components/canvas/panels/BulkFilesStagingPanel.js";

function TestHarness({ initialFiles }: { initialFiles: File[] }) {
  const [stagedFiles, setStagedFiles] = useState(initialFiles);

  return (
    <>
      <div id="bulk-files-staging-panel-root" />
      <div data-testid="staged-count">{stagedFiles.length}</div>
      <BulkFilesStagingPanel
        files={stagedFiles}
        setStagedFiles={setStagedFiles}
        projectId="project-123"
        onPlace={vi.fn()}
        onClose={vi.fn()}
      />
    </>
  );
}

const createDropEvent = (files: File[]) => {
  const event = new Event("drop", { bubbles: true, cancelable: true }) as DragEvent;

  Object.defineProperty(event, "dataTransfer", {
    value: {
      files,
      types: ["Files"],
      dropEffect: "none",
    },
  });

  return event;
};

describe("BulkFilesStagingPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn((file: File) => `blob:${file.name}`),
        revokeObjectURL: vi.fn(),
      }),
    );
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  it("adds a single dropped image to stagedFiles and renders its staged card", async () => {
    const initialFile = new File(["a"], "initial.png", { type: "image/png" });
    const droppedFile = new File(["b"], "dropped.png", { type: "image/png" });

    await act(async () => {
      root.render(<TestHarness initialFiles={[initialFile]} />);
    });

    await act(async () => {
      window.dispatchEvent(createDropEvent([droppedFile]));
    });

    expect(container.querySelector('[data-testid="staged-count"]')?.textContent).toBe(
      "2",
    );
    expect(container.querySelector('img[alt="dropped.png"]')).not.toBeNull();
    expect(container.textContent).toContain("2 images");
  });

  it("adds multiple dropped images and blocks the graph from receiving the drop event", async () => {
    const initialFile = new File(["a"], "initial.png", { type: "image/png" });
    const droppedFileOne = new File(["b"], "dropped-1.png", { type: "image/png" });
    const droppedFileTwo = new File(["c"], "dropped-2.png", { type: "image/png" });
    const graphDropHandler = vi.fn();
    const graph = document.createElement("div");

    graph.addEventListener("drop", graphDropHandler);
    document.body.appendChild(graph);

    await act(async () => {
      root.render(<TestHarness initialFiles={[initialFile]} />);
    });

    await act(async () => {
      graph.dispatchEvent(createDropEvent([droppedFileOne, droppedFileTwo]));
    });

    expect(container.querySelector('[data-testid="staged-count"]')?.textContent).toBe(
      "3",
    );
    expect(graphDropHandler).not.toHaveBeenCalled();
    expect(container.querySelector('img[alt="dropped-1.png"]')).not.toBeNull();
    expect(container.querySelector('img[alt="dropped-2.png"]')).not.toBeNull();
    expect(container.textContent).toContain("3 images");

    graph.remove();
  });
});
