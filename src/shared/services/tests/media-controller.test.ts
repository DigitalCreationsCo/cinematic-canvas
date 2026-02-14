import { MediaController } from "../media-controller.js";
import fs from "fs";

jest.mock("fs");

describe("MediaController - renderScenes", () => {
  let controller: MediaController;
  let mockStorage: any;

  beforeEach(() => {
    mockStorage = {
      getObjectPath: jest.fn().mockResolvedValue("path/to/obj"),
      uploadFile: jest.fn().mockResolvedValue("gs://final_video.mp4"),
      getPublicUrl: jest.fn().mockReturnValue("https://cdn.com/video.mp4")
    };
    controller = new MediaController(mockStorage);

    // Mocking internal methods to isolate renderScenes logic
    (controller as any).executeRenderVideo = jest.fn().mockResolvedValue("/tmp/local_video.mp4");
    (controller as any).createAndUploadThumbnail = jest.fn().mockResolvedValue({ gcsUri: "gs://thumb.jpg" });
    (controller as any).getAudioDuration = jest.fn().mockResolvedValue(45);

    (fs.existsSync as jest.Mock).mockReturnValue(true);
  });

  it("should orchestrate full render, upload, and cleanup", async () => {
    const result = await controller.renderScenes([ "v1", "v2" ], "p1", 1, "a1");

    expect(result).toEqual({
      gcsUri: "gs://final_video.mp4",
      thumbnailGcsUri: "gs://thumb.jpg",
      duration: 45
    });

    expect(mockStorage.uploadFile).toHaveBeenCalledWith("/tmp/local_video.mp4", "path/to/obj");
    expect(fs.unlinkSync).toHaveBeenCalledWith("/tmp/local_video.mp4"); // Cleanup verification
  });

  it("should ensure local file cleanup even if upload fails", async () => {
    mockStorage.uploadFile.mockRejectedValue(new Error("Upload Error"));

    await expect(controller.renderScenes([ "v1" ], "p1", 1)).rejects.toThrow("Upload Error");

    // Verifies the 'finally' block execution
    expect(fs.unlinkSync).toHaveBeenCalledWith("/tmp/local_video.mp4");
  });
});