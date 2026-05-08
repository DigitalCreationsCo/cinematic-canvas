import type { ComponentProps } from "react";
import { createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  NewEntityModal,
  clearFileInputValue,
  getAssetKeyForEntityType,
  getSelectedFileName,
  mergeOnlyEmptyFields,
} from "#client/components/canvas/panels/NewEntityModal.js";
import userEvent, { UserEvent } from "@testing-library/user-event";
import { useAssetStore } from "#client/store/useAssetStore.js";
import { NodeFactory } from "#client/domain/canvas/NodeFactory.js";
import { useNodeStore } from "#client/store/useNodeStore.ts";

vi.mock("#client/store/useAssetStore.js", async (originalImport) => {
  const actual = await originalImport();
  return actual;
});
vi.mock("#client/domain/canvas/NodeFactory.js", async (originalImport) => {
  const actual = await originalImport();
  return actual;
});

const {
  mockUploadImage,
  mockUploadAudio,
  mockCreateAsset,
  mockCreateEntities,
  mockCreateSceneWithAutoFill,
  mockGetSceneAssets,
  mockGetCharacterAssets,
  mockGetLocationAssets,
  mockFileToBase64,
  mockGetMentionSuggestions,
} = vi.hoisted(() => ({
  mockUploadImage: vi.fn(),
  mockUploadAudio: vi.fn(),
  mockCreateAsset: vi.fn(),
  mockCreateEntities: vi.fn(),
  mockCreateSceneWithAutoFill: vi.fn(),
  mockGetSceneAssets: vi.fn(),
  mockGetCharacterAssets: vi.fn(),
  mockGetLocationAssets: vi.fn(),
  mockFileToBase64: vi.fn(),
  mockGetMentionSuggestions: vi
    .fn()
    .mockResolvedValue({ suggestions: [], totalAvailable: 0 }),
}));

vi.mock("#client/lib/api.js", async (originalImport) => {
  return {
    api: {
      assets: {
        uploadImage: { mutate: mockUploadImage },
        uploadAudio: { mutate: mockUploadAudio },
        create: { mutate: mockCreateAsset },
      },
      entities: {
        create: { mutate: mockCreateEntities },
        createSceneWithAutoFill: { mutate: mockCreateSceneWithAutoFill },
      },
      mention: {
        suggest: { query: mockGetMentionSuggestions },
      },
    },
    getSceneAssets: mockGetSceneAssets,
    getCharacterAssets: mockGetCharacterAssets,
    getLocationAssets: mockGetLocationAssets,
    getMentionSuggestions: mockGetMentionSuggestions,
  };
});

const createFile = (name: string, type: string, content = "file") =>
  new File([content], name, { type });

describe("NewEntityModal helpers", () => {
  let user: UserEvent;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    user = userEvent.setup();
  });

  it("maps asset keys by entity type", () => {
    expect(getAssetKeyForEntityType("character")).toBe("character_image");
    expect(getAssetKeyForEntityType("location")).toBe("location_image");
    expect(getAssetKeyForEntityType("scene")).toBe("scene_start_frame");
    expect(getAssetKeyForEntityType("prop")).toBe("prop_image");
  });

  it("merges only empty fields from AI output", () => {
    expect(
      mergeOnlyEmptyFields(
        {
          name: "Existing",
          description: "",
          aliases: undefined,
          physicalTraits: undefined,
        },
        {
          name: "Ignored",
          description: "Generated description",
          aliases: ["Ace"],
          physicalTraits: {
            hair: "Braided",
            build: "ignored",
          },
        },
      ),
    ).toEqual({
      name: "Existing",
      description: "Generated description",
      aliases: ["Ace"],
      physicalTraits: {
        hair: "Braided",
        build: "ignored",
      },
    });
  });

  it("clears file inputs when present and tolerates null refs", () => {
    const input = document.createElement("input");
    input.value = "filled";

    clearFileInputValue(input);
    clearFileInputValue(null);

    expect(input.value).toBe("");
  });

  it("prefers the uploaded file name and falls back to the initial file name", () => {
    expect(
      getSelectedFileName(
        createFile("uploaded.wav", "audio/wav"),
        createFile("initial.wav", "audio/wav"),
      ),
    ).toBe("uploaded.wav");
    expect(getSelectedFileName(null, createFile("initial.wav", "audio/wav"))).toBe(
      "initial.wav",
    );
    expect(getSelectedFileName(null, null)).toBeUndefined();
  });
});

describe("NewEntityModal", () => {
  const onClose = vi.fn();
  let user: UserEvent;
  let spySetAssets: any;
  let spyCreateNode: any;
  let spyAddNode: any;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    user = userEvent.setup();

    spySetAssets = vi.spyOn(useAssetStore.getState(), "setAssets");
    spyCreateNode = vi.spyOn(NodeFactory, "createNode");
    spyAddNode = vi.spyOn(useNodeStore.getState(), "addNode");

    mockUploadImage.mockResolvedValue({
      gcsUri: "gs://uploads/mock",
      publicUri: "https://cdn.example/mock",
    });
    mockUploadAudio.mockResolvedValue({
      gcsUri: "gs://audio/mock",
      publicUri: "https://cdn.example/audio",
    });
    mockCreateAsset.mockResolvedValue({});
    mockCreateEntities.mockResolvedValue({});
    mockCreateSceneWithAutoFill.mockResolvedValue({});
    mockGetSceneAssets.mockResolvedValue(["scene-asset"]);
    mockGetCharacterAssets.mockResolvedValue(["character-asset"]);
    mockGetLocationAssets.mockResolvedValue(["location-asset"]);
    (NodeFactory.createNode as any).mockReturnValue({ id: "node-1", type: "character" });
    mockFileToBase64.mockResolvedValue("ZmFrZS1iYXNlNjQ=");
    vi.spyOn(URL, "createObjectURL").mockImplementation(
      (file: Blob) => `blob:${(file as File).name}`,
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  const renderModal = (overrides: Partial<ComponentProps<typeof NewEntityModal>> = {}) =>
    render(
      <NewEntityModal
        isOpen={true}
        onClose={onClose}
        entityType="character"
        initialImageFile={null}
        projectId="project-1"
        {...overrides}
      />,
    );

  it("renders nothing when closed", () => {
    const { container } = renderModal({ isOpen: false });

    expect(container).toBeEmptyDOMElement();
  });

  it("enables submit after any input", () => {
    renderModal();

    expect(screen.getByTestId("button-submit")).toBeDisabled();

    fireEvent.change(screen.getByTestId("input-name"), { target: { value: "Hero" } });

    expect(screen.getByTestId("button-submit")).not.toBeDisabled();
  });

  it("clears validation on close and on entity type changes", async () => {
    const { rerender } = renderModal();

    fireEvent.change(screen.getByTestId("input-name"), { target: { value: "Hero" } });
    fireEvent.click(screen.getByTestId("button-submit"));
    expect(screen.getByText("Description is required")).toBeInTheDocument();

    rerender(
      <NewEntityModal
        isOpen={false}
        onClose={onClose}
        entityType="character"
        initialImageFile={null}
        projectId="project-1"
      />,
    );

    rerender(
      <NewEntityModal
        isOpen={true}
        onClose={onClose}
        entityType="location"
        initialImageFile={null}
        projectId="project-1"
      />,
    );

    // After reopening with different entity type, errors should be cleared
    expect(screen.queryByText("Description is required")).not.toBeInTheDocument();
  });

  it("marks required fields with an asterisk", () => {
    renderModal({ entityType: "character" });

    const descriptionLabel = screen.getByText(/description/i);
    expect(descriptionLabel).toHaveTextContent("*");

    const nameLabel = screen.getByText(/name/i);
    expect(nameLabel).not.toHaveTextContent("*");
  });

  it("enables submit after any input and validates on click", async () => {
    renderModal({ entityType: "character" });

    const submitBtn = screen.getByTestId("button-submit");
    expect(submitBtn).toBeDisabled();

    // Entering a non-required field enables the button
    await user.type(screen.getByTestId("input-name"), "Hero");
    expect(submitBtn).not.toBeDisabled();

    // Clicking submit triggers validation for actually required fields
    await user.click(submitBtn);

    // Character requires 'description', so an error should appear
    expect(screen.getByRole("alert")).toHaveTextContent(/Description is required/i);
  });

  it("requires multiple fields for scene entities", async () => {
    renderModal({ entityType: "scene" });

    await user.type(screen.getByTestId("input-description"), "Opening Scene");
    await user.click(screen.getByTestId("button-submit"));

    // Should still show error because locationTextInput is missing
    expect(screen.getByText(/Location is required/i)).toBeInTheDocument();

    // Fill the final required field
    await user.type(screen.getByTestId("input-location-text-input"), "Kitchen");

    // Errors should clear after revalidation
    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  it("revalidates after the first failed submit", async () => {
    renderModal();
    fireEvent.change(screen.getByTestId("input-name"), { target: { value: "Hero" } });
    fireEvent.click(screen.getByTestId("button-submit"));

    const errorMessages = screen.getAllByRole("alert").map((el) => el.textContent);
    expect(errorMessages).toContain("Description is required");
    fireEvent.change(screen.getByTestId("input-description"), {
      target: { value: "Lead character" },
    });
    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  it("closes from the dialog callback and the cancel button", () => {
    renderModal();

    fireEvent.click(screen.getByTestId("dialog-close"));
    fireEvent.click(screen.getByTestId("button-cancel"));

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("handles drag state transitions and dropped image files", async () => {
    renderModal();
    const dialogContent = screen.getByTestId("dialog-content");
    const imageFile = createFile("reference.png", "image/png");

    fireEvent.dragEnter(dialogContent, { dataTransfer: { types: ["Files"] } });
    fireEvent.dragEnter(dialogContent, { dataTransfer: { types: ["Files"] } });
    expect(screen.getByText("Drop file here")).toBeInTheDocument();
    expect(dialogContent.className).toContain("ring-2");

    fireEvent.dragLeave(dialogContent, { dataTransfer: { types: ["Files"] } });
    expect(screen.getByText("Drop file here")).toBeInTheDocument();

    fireEvent.dragLeave(dialogContent, { dataTransfer: { types: ["Files"] } });
    expect(screen.queryByText("Drop file here")).not.toBeInTheDocument();

    fireEvent.drop(dialogContent, {
      dataTransfer: {
        files: [imageFile],
        types: ["Files"],
      },
    });

    await waitFor(() => {
      expect(screen.getByAltText("Preview")).toHaveAttribute("src", "blob:reference.png");
    });
  });

  it("ignores drag and drop cases without supported files", async () => {
    renderModal({ entityType: "prop" });
    const dialogContent = screen.getByTestId("dialog-content");
    const dragOverEvent = createEvent.dragOver(dialogContent);
    dragOverEvent.preventDefault = vi.fn();
    dragOverEvent.stopPropagation = vi.fn();

    fireEvent.dragEnter(dialogContent, { dataTransfer: { types: [] } });
    expect(screen.queryByText("Drop file here")).not.toBeInTheDocument();

    fireEvent(dialogContent, dragOverEvent);
    expect(dragOverEvent.preventDefault).toHaveBeenCalled();
    expect(dragOverEvent.stopPropagation).toHaveBeenCalled();
    fireEvent.drop(dialogContent, {
      dataTransfer: {
        files: [],
        types: ["Files"],
      },
    });
    fireEvent.change(screen.getByTestId("input-image"), {
      target: {
        files: [createFile("voice.wav", "audio/wav")],
      },
    });
    await waitFor(() => {
      expect(screen.queryByAltText("Preview")).not.toBeInTheDocument();
    });
    fireEvent.drop(dialogContent, {
      dataTransfer: {
        files: [createFile("notes.txt", "text/plain")],
        types: ["Files"],
      },
    });
    expect(screen.queryByTestId("input-audio-file")).not.toBeInTheDocument();
  });

  it("handles image input changes and image removal", async () => {
    renderModal();
    const imageInput = screen.getByTestId("input-image");
    fireEvent.change(imageInput, {
      target: {
        files: [createFile("picked.png", "image/png")],
      },
    });

    await waitFor(() => {
      expect(screen.getByAltText("Preview")).toHaveAttribute("src", "blob:picked.png");
    });
    fireEvent.click(screen.getByTestId("button-image-x"));
    await waitFor(() => {
      expect(screen.queryByAltText("Preview")).not.toBeInTheDocument();
    });
  });

  it("opens the hidden file pickers from their clickable upload surfaces", () => {
    const inputClickSpy = vi
      .spyOn(HTMLInputElement.prototype, "click")
      .mockImplementation(() => {});

    renderModal();
    fireEvent.click(screen.getByText("Click to upload reference image"));

    expect(inputClickSpy).toHaveBeenCalledTimes(1);

    inputClickSpy.mockClear();

    renderModal({ entityType: "scene" });
    const uploadPrompts = screen.getAllByText("Upload an image");
    fireEvent.click(uploadPrompts[0]);
    fireEvent.click(uploadPrompts[1]);

    expect(inputClickSpy).toHaveBeenCalledTimes(2);
  });

  // it("accepts dropped audio files for characters and renders the audio form", async () => {
  //   renderModal();
  //   fireEvent.drop(screen.getByTestId("dialog-content"), {
  //     dataTransfer: {
  //       files: [createFile("voice.wav", "audio/wav")],
  //       types: ["Files"],
  //     },
  //   });

  //   await waitFor(() => {
  //     expect(screen.getByTestId("input-audio-file")).toBeInTheDocument();
  //   });
  //   expect(screen.getByTestId("audio-file-name")).toHaveTextContent("voice.wav");
  //   expect(screen.queryByTestId("form-fields-entity")).not.toBeInTheDocument();
  // });

  it("creates a character with image upload, asset creation, and node creation", async () => {
    const imageFile = createFile("hero.png", "image/png");
    let resolveCreate: () => void = () => {};
    mockCreateEntities.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCreate = resolve;
        }),
    );

    renderModal({ initialImageFile: imageFile });

    await user.type(screen.getByTestId("input-name"), "Hero Prime");
    await user.type(screen.getByTestId("input-description"), "Lead character");
    await user.click(screen.getByTestId("button-submit"));

    expect(screen.getByTestId("button-submit")).toHaveTextContent("Creating...");
    await waitFor(() => {
      expect(mockCreateEntities).toHaveBeenCalledTimes(1);
    });
    resolveCreate();
    await waitFor(() => {
      expect(NodeFactory.createNode).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "character",
          contextId: "project-1",
          contextType: "project",
          scope: "project",
          posCanvas: expect.objectContaining({}),
        }),
      );
    });

    expect(mockUploadImage).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: "hero.png",
        mimeType: "image/png",
      }),
    );
    expect(mockCreateEntities).toHaveBeenCalledWith([
      {
        entityType: "character",
        data: expect.objectContaining({
          name: "Hero Prime",
          description: "Lead character",
        }),
        images: [
          {
            gcsUri: "gs://uploads/mock",
            publicUri: "https://cdn.example/mock",
            mimeType: "image/png",
          },
        ],
      },
    ]);
    expect(spyAddNode).toHaveBeenCalledWith({
      id: "node-1",
      type: "character",
    });
    expect(mockCreateAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        entityType: "character",
        assetKey: "character_image",
        url: "https://cdn.example/mock",
      }),
    );
    expect(mockGetCharacterAssets).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
      }),
    );

    expect(spySetAssets).toHaveBeenCalled(expect.any(String), ["character-asset"]);
    expect(onClose).toHaveBeenCalled();
  });

  it("defaults location metadata and refreshes location assets", async () => {
    renderModal({ entityType: "location" });
    fireEvent.change(screen.getByTestId("input-description"), {
      target: { value: "Quiet alley at dusk" },
    });
    fireEvent.click(screen.getByTestId("button-submit"));

    await waitFor(() => {
      expect(mockCreateEntities).toHaveBeenCalledWith([
        expect.objectContaining({
          entityType: "location",
          data: expect.objectContaining({
            description: "Quiet alley at dusk",
          }),
        }),
      ]);
    });

    expect(mockGetLocationAssets).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
      }),
    );
    expect(spySetAssets).toHaveBeenCalled();
  });

  // it("uses the generic image asset key for prop entities", async () => {
  //   renderModal({
  //     entityType: "prop",
  //     initialImageFile: createFile("prop.png", "image/png"),
  //   });

  //   user.type(screen.getByTestId("input-name"), "A vintage camera");
  //   user.click(screen.getByTestId("button-submit"));

  //   await waitFor(() => {
  //     expect(mockCreateAsset).toHaveBeenCalledWith({
  //       projectId: "project-1",
  //       entityId: "entity-123",
  //       entityType: "prop",
  //       assetKey: "image_file",
  //       url: "https://cdn.example/mock",
  //     });
  //   });

  //   expect(mockGetSceneAssets).toHaveBeenCalledWith({
  //     projectId: "project-1",
  //     sceneId: "entity-123",
  //   });
  //   expect(mockSetAssets).toHaveBeenCalledWith("entity-123", ["scene-asset"]);
  // });

  // it("creates scenes without frame uploads when none are provided", async () => {
  //   renderModal({ entityType: "scene" });

  //   fireEvent.change(screen.getByTestId("mock-description"), {
  //     target: { value: "A moody opening" },
  //   });
  //   fireEvent.change(screen.getByTestId("mock-location-text-input"), {
  //     target: { value: "Warehouse floor" },
  //   });
  //   fireEvent.click(screen.getByTestId("button-submit"));

  //   await waitFor(() => {
  //     expect(mockCreateSceneWithAutoFill).toHaveBeenCalledWith({
  //       projectId: "project-1",
  //       sceneFields: expect.objectContaining({
  //         id: "entity-123",
  //         description: "A moody opening",
  //         locationTextInput: "Warehouse floor",
  //       }),
  //       startFrameGcsUri: undefined,
  //       startFrameMimeType: undefined,
  //       endFrameGcsUri: undefined,
  //       endFrameMimeType: undefined,
  //     });
  //   });

  //   expect(mockCreateEntities).not.toHaveBeenCalled();
  //   expect(useNodeStore.getState().addNode).not.toHaveBeenCalled();
  // });

  it("uploads start and end frames before scene creation", async () => {
    mockUploadImage
      .mockResolvedValueOnce({
        gcsUri: "gs://uploads/start",
        publicUri: "https://cdn.example/start",
      })
      .mockResolvedValueOnce({
        gcsUri: "gs://uploads/end",
        publicUri: "https://cdn.example/end",
      });
    renderModal({ entityType: "scene" });
    fireEvent.change(screen.getByTestId("input-start-frame"), {
      target: { files: [createFile("start.png", "image/png")] },
    });
    fireEvent.change(screen.getByTestId("input-end-frame"), {
      target: { files: [createFile("end.png", "image/png")] },
    });
    fireEvent.change(screen.getByTestId("input-description"), {
      target: { value: "Climactic transition" },
    });
    await user.type(screen.getByTestId("input-location-text-input"), "Sky bridge"); // using user event for mentiontextarea avoids value setter issues
    fireEvent.click(screen.getByTestId("button-submit"));

    await waitFor(() => {
      expect(mockCreateSceneWithAutoFill).toHaveBeenCalledWith({
        sceneFields: expect.objectContaining({
          description: "Climactic transition",
          locationTextInput: "Sky bridge",
        }),
        startFrameGcsUri: "gs://uploads/start",
        startFrameMimeType: "image/png",
        endFrameGcsUri: "gs://uploads/end",
        endFrameMimeType: "image/png",
      });
    });
  });

  it("removes selected scene frame previews", async () => {
    renderModal({ entityType: "scene" });

    fireEvent.change(screen.getByTestId("input-start-frame"), {
      target: { files: [createFile("start.png", "image/png")] },
    });
    fireEvent.change(screen.getByTestId("input-end-frame"), {
      target: { files: [createFile("end.png", "image/png")] },
    });

    await waitFor(() => {
      expect(screen.getByAltText("Start Frame")).toBeInTheDocument();
      expect(screen.getByAltText("End Frame")).toBeInTheDocument();
    });

    const removeButtons = screen
      .getAllByTestId("button-image-x")
      .map((icon) => icon.closest("button")!);
    fireEvent.click(removeButtons[0]);
    fireEvent.click(removeButtons[1]);

    await waitFor(() => {
      expect(screen.queryByAltText("Start Frame")).not.toBeInTheDocument();
      expect(screen.queryByAltText("End Frame")).not.toBeInTheDocument();
    });
  });

  it("ignores empty scene frame picker changes", async () => {
    renderModal({ entityType: "scene" });

    fireEvent.change(screen.getByTestId("input-start-frame"), {
      target: { files: [] },
    });
    fireEvent.change(screen.getByTestId("input-end-frame"), {
      target: { files: [] },
    });

    await waitFor(() => {
      expect(screen.queryByAltText("Start Frame")).not.toBeInTheDocument();
      expect(screen.queryByAltText("End Frame")).not.toBeInTheDocument();
    });
  });

  // it("creates audio file entity and uploads the audio asset", async () => {
  //   const audioFile = createFile("voice.wav", "audio/wav", "ab");
  //   Object.defineProperty(audioFile, "arrayBuffer", {
  //     value: vi.fn().mockResolvedValue(new Uint8Array([65, 66]).buffer),
  //   });

  //   renderModal({
  //     entityType: "character",
  //     initialImageFile: audioFile,
  //   });

  //   user.type(screen.getByTestId("input-name"), "Narrator");
  //   user.type(screen.getByTestId(""), {
  //     target: { value: "Voiceover track" },
  //   });
  //   fireEvent.click(screen.getByTestId("button-submit"));

  //   await waitFor(() => {
  //     expect(screen.getByTestId("title")).toHaveTextContent("New Audio");
  //   });

  //   expect(mockUploadAudio).toHaveBeenCalledWith({
  //     fileData: "QUI=",
  //     fileName: "voice.wav",
  //     mimeType: "audio/wav",
  //   });
  //   expect(mockCreateEntities).toHaveBeenCalledWith([
  //     expect.objectContaining({
  //       entityType: "character",
  //       data: expect.objectContaining({
  //         name: "Narrator",
  //         description: "Voiceover track",
  //         referenceId: "narrator",
  //       }),
  //     }),
  //   ]);
  // });

  it("logs submission errors and resets the submit state", async () => {
    mockCreateEntities.mockRejectedValueOnce(new Error("boom"));

    renderModal();

    await user.type(screen.getByTestId("input-description"), "Submit will break");
    await user.click(screen.getByTestId("button-submit"));

    await waitFor(() => {
      expect(console.error).toHaveBeenCalled();
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("button-submit")).toBeDefined();
  });
});
