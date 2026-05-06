import { vi, type Mock } from "vitest";
import type { GCPStorageManager } from "#shared/services/storage-manager.js";
import { createMockStorage } from "#shared/mocks/mock-gcs.js";

const DEFAULT_BUCKET = "canvas-prod-bucket";

export interface MockStorageManager extends Partial<GCPStorageManager> {
  bucketName: string;
  storage: ReturnType<typeof createMockStorage>["storage"];
  fileExists: Mock;
  uploadBuffer: Mock;
  uploadFile: Mock;
  downloadFile: Mock;
  downloadJSON: Mock;
  downloadToBuffer: Mock;
  deleteObject: Mock;
  getObjectMimeType: Mock;
  uploadJSON: Mock;
  uploadJSONL: Mock;
  uploadAudio: Mock;
}

export const createMockStorageManager = (overrides?: Partial<MockStorageManager>): GCPStorageManager => {
  const bucketName = overrides?.bucketName || DEFAULT_BUCKET;
  const { storage, bucket, file } = createMockStorage();

  return {
    storage: storage as any,
    bucketName,
    fileExists: vi.fn().mockResolvedValue(true),
    uploadBuffer: vi
      .fn()
      .mockImplementation((buffer: Buffer, dest: string) => Promise.resolve(`gs://${bucketName}/${dest}`)),
    uploadFile: vi.fn().mockImplementation((local: string, dest: string) => Promise.resolve(dest)),
    downloadFile: vi.fn().mockResolvedValue(undefined),
    downloadJSON: vi.fn().mockResolvedValue({}),
    downloadToBuffer: vi.fn().mockResolvedValue(Buffer.from("test")),
    deleteObject: vi.fn().mockResolvedValue(undefined),
    getObjectMimeType: vi.fn().mockImplementation((path?: string) => {
      if (!path) return Promise.resolve(undefined);
      return Promise.resolve("image/png");
    }),
    uploadJSON: vi.fn().mockImplementation((data: any, dest: string) => Promise.resolve(`gs://${bucketName}/${dest}`)),
    uploadJSONL: vi
      .fn()
      .mockImplementation((content: string, dest: string) => Promise.resolve(`gs://${bucketName}/${dest}`)),
    uploadAudio: vi.fn().mockImplementation((source: string) => {
      const fileName = typeof source === "string" ? source.split("/").pop() : "audio.mp3";
      return Promise.resolve({
        audioGcsUri: `gs://${bucketName}/audio/${fileName}`,
        audioPublicUri: `https://storage.googleapis.com/${bucketName}/audio/${fileName}`,
      });
    }),
    getPublicUrl: vi.fn().mockImplementation((path: string) => {
      const relativePath = path.startsWith(bucketName) ? path.split("/").slice(1).join("/") : path;
      return `https://storage.googleapis.com/${bucketName}/${relativePath}`;
    }),
    getGcsUrl: vi.fn().mockImplementation((path: string) => `gs://${path}`),
    parseGcsUri: vi.fn().mockImplementation((uri: string) => {
      const clean = uri.replace(/^gs:\/\//, "");
      const parts = clean.split("/");
      const bucketNamePart = parts.shift();
      if (!bucketNamePart) throw new Error(`Invalid GCS URI: ${uri}`);
      return { bucketName: bucketNamePart, fileName: parts.join("/") };
    }),
    getObjectPath: vi.fn().mockImplementation((params: any) => {
      const { projectId, type, version = 1, uniqueId, characterId, sceneId, locationId, imageId } = params;
      const suffix = uniqueId ? `_${uniqueId}` : "";
      const bn = bucketName;
      switch (type) {
        case "thumbnail":
          return `${bn}/${projectId}/images/thumbnails/${projectId}_${version.toString().padStart(2, "0")}${suffix}.png`;
        case "character_image":
          return `${bn}/${projectId}/images/characters/${characterId}_reference_${version.toString().padStart(2, "0")}.png`;
        case "location_image":
          return `${bn}/${projectId}/images/locations/${locationId}_reference_${version.toString().padStart(2, "0")}.png`;
        case "scene_start_frame":
          return `${bn}/${projectId}/images/frames/scene_${sceneId.toString().padStart(3, "0")}_frame_start_${version.toString().padStart(2, "0")}.png`;
        case "scene_end_frame":
          return `${bn}/${projectId}/images/frames/scene_${sceneId.toString().padStart(3, "0")}_frame_end_${version.toString().padStart(2, "0")}.png`;
        case "scene_video":
          return `${bn}/${projectId}/scenes/scene_${sceneId.toString().padStart(3, "0")}_${version.toString().padStart(2, "0")}.mp4`;
        case "render_video":
          return `${bn}/${projectId}/final/movie_${version.toString().padStart(2, "0")}.mp4`;
        case "final_output":
          return `${bn}/${projectId}/final/final_output_${version.toString().padStart(2, "0")}.json`;
        case "batch-data":
          if (!uniqueId) throw new Error("Batch path requires uniqueId");
          return `${bn}/${projectId}/batches/${uniqueId}/input.jsonl`;
        case "image_file":
          return `${bn}/${projectId}/images/composites/${imageId}_${version.toString().padStart(2, "0")}.png`;
        default:
          throw new Error(`Unknown GCS object type: ${type}`);
      }
    }),
    getProjectPath: vi.fn().mockImplementation((projectId: string, entity: string) => {
      const categoryMap: Record<string, string> = {
        characters: "images/characters",
        locations: "images/locations",
        scenes: "scenes",
      };
      return `${bucketName}/${projectId}/${categoryMap[entity]}`;
    }),
    ...overrides,
  } as unknown as GCPStorageManager;
};
