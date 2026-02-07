import { Bucket, Storage } from "@google-cloud/storage";
import path from "path";
import { AssetType, GcsObjectType } from "../types/index.js";
import readline from 'readline';
import { BatchJob, GenerateBatchContentParameters } from "../lm/provider.js";
import { extractGeneratedResponse, TypeToResponseType } from "../lm/parts-extractor.js";

type ObjectPathParam<T extends GcsObjectType> = | {
  type: T;
  uniqueId?: string;
};

type FinalOutputParam = ObjectPathParam<"final_output"> & { projectId: string; version: number; };
type CharacterImageParam = ObjectPathParam<"character_image"> & { characterId: string; version: number; };
type LocationImageParam = ObjectPathParam<"location_image"> & { locationId: string; version: number; };
type SceneVideoParam = ObjectPathParam<"scene_video"> & { sceneId: string; version: number; };
type SceneStartFrameParam = ObjectPathParam<"scene_start_frame"> & { sceneId: string; version: number; };
type SceneEndFrameParam = ObjectPathParam<"scene_end_frame"> & { sceneId: string; version: number; };
type RenderVideoParam = ObjectPathParam<"render_video"> & { projectId: string; version: number; };
type CompositeFrameParam = ObjectPathParam<"composite_frame"> & { sceneId: string; version: number; };

export type GcsObjectPathParams =
  | FinalOutputParam
  | CharacterImageParam
  | LocationImageParam
  | SceneVideoParam
  | SceneStartFrameParam
  | SceneEndFrameParam
  | RenderVideoParam
  | CompositeFrameParam;

type BatchResultItem =
  | {
    custom_id: string;
    version: number;
    status: 'FAILED';
    error?: any;
  } | {
    custom_id: string;
    version: number;
    src: string;
    status: 'SUCCESS';
    error?: never;
  }

/**
 * Manages all Google Cloud Storage interactions for the pipeline.
 *
 * Responsibilities:
 * - Path Standardization: Generates consistent, versioned paths for assets using specific naming schemas.
 * - I/O Operations: Provides high-level abstractions for uploading/downloading Buffers, Files, and JSON.
 * - URI Management: Converts between local paths, gs:// URIs, and public HTTPS URLs.
 * * NOTE: This class is stateless regarding versioning; it relies on passed parameters 
 * to construct paths. It performs a permission check on instantiation.
 */
export class GCPStorageManager {
  private storage: Storage;
  bucketName: string;
  private videoId: string;

  /**
   * Initializes the storage manager and performs an immediate IAM permission handshake.
   * * Verifies the following capabilities:
   * - `get`: Download and metadata retrieval.
   * - `list`: Bucket indexing.
   * - `create`: Uploading new objects.
   * - `delete`: Overwriting or removing existing objects.
   * * @param gcpProjectId - The target Google Cloud Project ID.
   * @param videoId - The unique identifier for the current video project (used for path scoping).
   * @param bucketName - The target GCS bucket name.
   * @throws Error if any required permissions are missing or if the handshake fails.
   */
  constructor(gcpProjectId: string, videoId: string, bucketName: string) {
    this.storage = new Storage({ projectId: gcpProjectId });
    this.bucketName = bucketName;
    this.videoId = videoId;

    const permissionsToCheck = [
      'storage.objects.get',
      'storage.objects.list',
      'storage.objects.create',
      'storage.objects.delete'
    ];
    console.log({ storagePermissionsToCheck: permissionsToCheck });

    this.storage.bucket(this.bucketName).iam.testPermissions(permissionsToCheck).then((res) => {
      const [ permissions ] = res;
      const hasAll = permissionsToCheck.every(p => permissions[ p ]);
      console.debug({ permissions });
      if (hasAll) {
        console.debug("✅ Credentials have the specified permissions.");
      } else {
        console.error("❌ Credentials are missing the specified permissions.");
        throw Error(`Credentials are missing the specified permissions.`);
      }
    }, (error) => {
      console.error({ error }, "Error checking permissions.");
      throw error;
    });
  }

  /**
   * Generates a directory-level path for specific entity categories within the project.
   * Useful for listing assets or bulk operations within a specific scope.
   * * @param entity - The category scope ('scenes', 'characters', or 'locations').
   * @returns A posix-normalized path to the entity directory: [bucket]/[videoId]/[category]/
   */
  getProjectPath(entity: 'scenes' | 'characters' | 'locations'): string {
    const categoryMap = {
      characters: 'images/characters',
      locations: 'images/locations',
      scenes: 'scenes'
    };

    return path.posix.join(this.bucketName, this.videoId, categoryMap[ entity ]);
  }

  /**
   * Generates a standardized GCS object path including the bucket name.
   * * Schema: [bucket]/[videoId]/[subfolder]/[filename]
   * Filenames are zero-padded (IDs to 3 digits, versions to 2) and optionally 
   * include a `uniqueId` suffix before the extension.
   * * @param params - Configuration object defining the asset type and identifiers.
   * @returns A posix-normalized path starting with the bucket name.
   */
  getObjectPath(params: GcsObjectPathParams): string {
    const basePath = path.posix.join(this.bucketName, this.videoId);
    const suffix = params.uniqueId ? `_${params.uniqueId}` : '';

    switch (params.type) {
      case 'character_image':
        return path.posix.join(basePath, 'images', 'characters', `${params.characterId}_reference_${params.version.toString().padStart(2, '0')}${suffix}.png`);

      case 'location_image':
        return path.posix.join(basePath, 'images', 'locations', `${params.locationId}_reference_${params.version.toString().padStart(2, '0')}${suffix}.png`);

      case 'scene_start_frame':
        return path.posix.join(basePath, 'images', 'frames', `scene_${params.sceneId.toString().padStart(3, '0')}_frame_start_${params.version.toString().padStart(2, '0')}${suffix}.png`);

      case 'scene_end_frame':
        return path.posix.join(basePath, 'images', 'frames', `scene_${params.sceneId.toString().padStart(3, '0')}_frame_end_${params.version.toString().padStart(2, '0')}${suffix}.png`);

      case 'composite_frame':
        return path.posix.join(basePath, 'images', 'frames', `scene_${params.sceneId.toString().padStart(3, '0')}_composite_${params.version.toString().padStart(2, '0')}${suffix}.png`);

      case 'scene_video':
        return path.posix.join(basePath, 'scenes', `scene_${params.sceneId.toString().padStart(3, '0')}_${params.version.toString().padStart(2, '0')}${suffix}.mp4`);

      case 'render_video':
        return path.posix.join(basePath, 'final', `movie_${params.version.toString().padStart(2, '0')}${suffix}.mp4`);

      case 'final_output':
        return path.posix.join(basePath, 'final', `final_output_${params.version.toString().padStart(2, '0')}${suffix}.json`);

      default:
        throw new Error(`Unknown GCS object type: ${(params as any).type}`);
    }
  }

  /**
   * Uploads a local file to GCS with a long-lived public cache header.
   * * @param localPath - The source path on the local filesystem.
   * @param destination - The GCS destination (accepts gs:// URI, public URL, or relative path).
   * @returns The full gs:// URI of the uploaded object.
   */
  async uploadFile(
    localPath: string,
    destination: string
  ): Promise<string> {
    const bucket = this.storage.bucket(this.bucketName);
    const normalizedDest = this.normalizePath(destination);
    const relativeDest = this.getBucketRelativePath(normalizedDest);

    await bucket.upload(localPath, {
      destination: relativeDest,
      metadata: {
        cacheControl: "public, max-age=31536000",
      },
    });
    return this.getGcsUrl(normalizedDest);
  };

  /**
   * Uploads a Buffer to GCS with specified Content-Type and public cache headers.
   * * @param buffer - The raw data to be stored.
   * @param destination - The GCS destination (automatically normalized to bucket-relative).
   * @param contentType - The MIME type (e.g., 'image/png').
   * @returns The full gs:// URI of the uploaded object.
   */
  async uploadBuffer(
    buffer: Buffer,
    destination: string,
    contentType: string
  ): Promise<string> {
    const bucket = this.storage.bucket(this.bucketName);
    const normalizedDest = this.normalizePath(destination);
    const relativeDest = this.getBucketRelativePath(normalizedDest);
    const file = bucket.file(relativeDest);

    await file.save(buffer, {
      contentType,
      metadata: {
        cacheControl: "public, max-age=31536000",
      },
    });
    return this.getGcsUrl(normalizedDest);
  };

  /**
   * Serializes a JavaScript object to a pretty-printed JSON string and uploads it.
   * * @param data - The object to serialize.
   * @param destination - The GCS destination.
   * @returns The full gs:// URI of the uploaded object.
   */
  async uploadJSON(data: any, destination: string): Promise<string> {
    const buffer = Buffer.from(JSON.stringify(data, null, 2));
    return this.uploadBuffer(buffer, destination, "application/json");
  };

  /**
   * Uploads an audio file to a hardcoded `audio/` directory relative to the bucket root.
   * * Implementation Note: This method is idempotent. It checks for the file's 
   * existence before initiating an upload to save bandwidth/costs.
   * * @param localPath - Local path to the audio file.
   * @returns The full gs:// URI of the audio file in GCS.
   */
  async uploadAudioFile(localPath: string): Promise<string> {
    const fileName = path.basename(localPath);
    const destination = `audio/${fileName}`;
    const gcsUri = this.getGcsUrl(destination);

    const exists = await this.fileExists(destination);
    if (exists) {
      console.log({ gcsUri }, `Audio file already exists. Skipping upload.`);
      return gcsUri;
    }

    console.log({ localPath, destination }, `Uploading to GCS.`);
    return this.uploadFile(localPath, destination);
  };

  /**
   * Downloads a JSON file from GCS and parses it into a typed object.
   * * @param source - The GCS path or URI (gs:// or HTTPS).
   * @returns The parsed content as type T.
   */
  async downloadJSON<T>(source: string): Promise<T> {
    const bucket = this.storage.bucket(this.bucketName);
    const path = this.getBucketRelativePath(source);
    const file = bucket.file(path);
    const [ contents ] = await file.download();
    return JSON.parse(contents.toString()) as T;
  }

  /**
   * Downloads a GCS object to the local filesystem.
   * * @param gcsPath - The source GCS path or URI.
   * @param localDestination - The destination path on the local disk.
   */
  async downloadFile(gcsPath: string, localDestination: string): Promise<void> {
    const path = this.getBucketRelativePath(gcsPath);
    const bucket = this.storage.bucket(this.bucketName);
    const file = bucket.file(path);
    await file.download({ destination: localDestination });
  };

  /**
   * Fetches a GCS object and returns its contents as a Buffer.
   * * @param gcsPath - The GCS path or URI.
   * @returns A Buffer containing the file data.
  */
  async downloadToBuffer(gcsPath: string): Promise<Buffer> {
    const path = this.getBucketRelativePath(gcsPath);
    const bucket = this.storage.bucket(this.bucketName);
    const file = bucket.file(path);
    const [ contents ] = await file.download();
    return contents;
  };

  /**
 * Processes Text Batch results: extracts model response text and saves as JSON.
 * @param gcsUri The full gs:// path to the batch output JSONL.
 *
 * Note: This method may exceed memory limits for large text values. Consider using a streaming approach for large batch outputs.
 */
  async processTextBatchResults(gcsUri: string): Promise<BatchResultItem[]> {
    return this.processBatchInternal(gcsUri, "text", async (res) => {
      const textSet = extractGeneratedResponse("text", res, 'google');
      return textSet?.flatMap(text => {
        if (!text) return { src: '', ok: false };
        return { src: text, ok: true };
      }) || [];
    });
  }

  /**
 * Processes Video Batch results: extracts Base64 video data and saves as MP4.
 * @param gcsUri The full gs:// path to the batch output JSONL.
 */
  async processVideoBatchResults(gcsUri: string): Promise<BatchResultItem[]> {
    return this.processBatchInternal(gcsUri, "video", async (res, customId, version) => {
      const videoBase64Set = extractGeneratedResponse("video", res, 'google');
      return Promise.all(videoBase64Set?.flatMap(async (videoBase64Data) => {
        if (!videoBase64Data) return { src: '', ok: false };

        const targetFilePath = this.getObjectPath({ sceneId: customId, type: "scene_video", version });
        await this.uploadBuffer(Buffer.from(videoBase64Data, 'base64'), targetFilePath, 'video/mp4');
        return { src: this.getGcsUrl(targetFilePath), ok: true };
      }) || []);
    });
  }

  /**
 * Processes Image Batch results: extracts Base64 image data and saves as PNG.
 * @param gcsUri The full gs:// path to the batch output JSONL.
 * @returns @type {BatchResultItem[]} An array of BatchResultItem objects.
 */
  async processImageBatchResults(gcsUri: string): Promise<BatchResultItem[]> {
    return this.processBatchInternal(gcsUri, "image", async (res, customId, version) => {
      const imageBase64Set = extractGeneratedResponse("image", res, 'google');
      return Promise.all(imageBase64Set?.flatMap(async imageBase64Data => {
        if (!imageBase64Data) return { src: '', ok: false };

        const targetFilePath = this.getObjectPath({
          characterId: customId,
          type: "character_image",
          version
        });

        await this.uploadBuffer(Buffer.from(imageBase64Data, 'base64'), targetFilePath, 'image/png');
        return { src: this.getGcsUrl(targetFilePath), ok: true };
      }) || []);
    });
  }

  /**
  * Reads a JSONL output file from a Batch Job GCS URI.
  * @param gcsUri The full gs:// path provided by the batch job output
  * @param type The type of the batch job (e.g., "text", "video", "image").
  * @param saver A function that handles formatting and saving the batch results.
  */
  private async processBatchInternal<T extends AssetType>(
    gcsUri: string,
    type: T,
    saver: (
      response: TypeToResponseType[ T ],
      customId: string,
      version: number) => Promise<{ src: string, ok: boolean; }[]> | { src: string, ok: boolean; }[]
  ): Promise<BatchResultItem[]> {
    const { bucketName, fileName } = this.parseGcsUri(gcsUri);
    const bucket = this.storage.bucket(bucketName);
    const file = bucket.file(fileName);
    if (!(await file.exists())[ 0 ]) throw new Error(`Batch file not found: ${fileName}`);

    const summary: BatchResultItem[] = [];
    const rl = readline.createInterface({
      input: file.createReadStream(),
      crlfDelay: Infinity
    });

    console.log({ gcsUri, projectId: this.videoId }, `Processing results at ${this.getBucketRelativePath(gcsUri)}`);
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const json = JSON.parse(line);
        const { custom_id: customId, metadata, response } = json;
        const version = metadata?.version;

        const awaitingResults = await saver(response, customId, version);
        const results = await Promise.all(awaitingResults);

        for (const s of results) {
          summary.push({
            custom_id: customId,
            version,
            src: s.src,
            status: s.ok ? 'SUCCESS' : 'FAILED',
            error: s.ok ? undefined : (json.status?.message || `No ${type} data found`)
          });
        };
      } catch (e) {
        console.error({ error: e, projectId: this.videoId, type, gcsUri }, `Failed to process ${type} line`);
      }
    }
    console.log({ projectId: this.videoId }, `Parsed ${summary.length} items from batch manifest.`);

    return summary;
  }

  private parseGcsUri(uri: string) {
    const parts = uri.slice(5).split('/');
    return { bucketName: parts.shift()!, fileName: parts.join('/') };
  }

  /**
   * Verifies if an object exists in the bucket.
   * * @param gcsPath - The GCS path or URI.
   * @returns True if the object exists, false otherwise.
  */
  async fileExists(gcsPath: string): Promise<boolean> {
    const path = this.getBucketRelativePath(gcsPath);
    const bucket = this.storage.bucket(this.bucketName);
    const file = bucket.file(path);
    const [ exists ] = await file.exists();
    return exists;
  };

  /**
   * Generates a public HTTPS URL for an object.
   * * Logic: Normalizes the input and ensures the bucket name is prepended 
   * to the path if it is missing.
   * * @param pathOrUri - The GCS path, gs:// URI, or partial path.
   * @returns A URL in the format https://storage.googleapis.com/[bucket]/[path]
   */
  getPublicUrl(pathOrUri: string): string {
    let cleanPath = pathOrUri.replace(/^gs:\/\//, '');
    cleanPath = cleanPath.replace(/^https:\/\/storage\.googleapis\.com\//, '');
    // Ensure no leading slashes
    while (cleanPath.startsWith('/')) {
      cleanPath = cleanPath.substring(1);
    }
    // Heuristic: If the path doesn't start with the bucket name, prepend it.
    // This is safe because all assets handled by this manager are within 'this.bucketName'.
    if (!cleanPath.startsWith(this.bucketName + '/')) {
      cleanPath = `${this.bucketName}/${cleanPath}`;
    }
    return `https://storage.googleapis.com/${cleanPath}`;
  }

  /**
   * Sanitizes and standardizes disparate path formats into a consistent POSIX string.
   * * This handles three primary input patterns:
   * 1. Google Cloud URIs (`gs://bucket/path`)
   * 2. Public HTTPS URLs (`https://storage.googleapis.com/bucket/path`)
   * 3. Raw strings or absolute local-style paths (`/bucket/path`)
   * * @param inputPath - The raw path or URI string to be cleaned.
   * @returns A stripped, normalized POSIX path with no leading slashes or protocol prefixes.
   * @private
   */
  private normalizePath(inputPath: string): string {
    let cleanPath = inputPath.replace(/^gs:\/\//, '');
    cleanPath = cleanPath.replace(/^https:\/\/storage\.googleapis\.com\//, '');
    cleanPath = path.posix.normalize(cleanPath);
    if (cleanPath.startsWith('/')) {
      cleanPath = cleanPath.substring(1);
    }
    return cleanPath;
  }

  /**
   * Extracts the object path relative to the bucket root by stripping the bucket name.
   * * This is required because Google Cloud Storage SDK methods (e.g., `bucket.file()`) 
   * expect paths relative to the bucket, whereas our internal logic often passes 
   * absolute-style paths or URIs.
   * * @param pathOrUri - The full GCS path, gs:// URI, or HTTPS URL to be processed.
   * @returns The path segment after the bucket name. Returns an empty string if 
   * the path matches the bucket name exactly.
   * @private
   */
  private getBucketRelativePath(pathOrUri: string): string {
    const fullPath = this.normalizePath(pathOrUri);
    if (fullPath === this.bucketName) return '';
    if (fullPath.startsWith(this.bucketName + '/')) {
      return fullPath.substring(this.bucketName.length + 1);
    }
    return fullPath;
  }

  /**
   * Converts a path or URL into a standardized gs:// URI.
   * * @param path - The string to convert.
   * @returns The formatted gs://[path] URI.
   */
  getGcsUrl(path: string): string {
    const normalizedPath = this.normalizePath(path);
    return `gs://${normalizedPath}`;
  }

  /**
   * Retrieves the 'contentType' metadata from a GCS object.
   * * @param gcsPath - The GCS path or URI.
   * @returns The MIME type string, or undefined if not set.
   */
  async getObjectMimeType(gcsPath: string): Promise<string | undefined> {
    const path = this.getBucketRelativePath(gcsPath);
    const bucket = this.storage.bucket(this.bucketName);
    const file = bucket.file(path);
    const [ metadata ] = await file.getMetadata();
    return metadata.contentType;
  };
}
