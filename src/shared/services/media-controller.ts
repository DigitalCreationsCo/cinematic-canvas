import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import ffmpegBin from "@ffmpeg-installer/ffmpeg";
import ffprobeBin from "@ffprobe-installer/ffprobe";
import { Scene } from "../types/index.js";
import { getAllBestAssets } from "../utils/assets-utils.js";
import { GCPStorageManager } from "./storage-manager.js";
ffmpeg.setFfmpegPath(ffmpegBin.path);
ffmpeg.setFfprobePath(ffprobeBin.path);


export class MediaController {

    private storageManager: GCPStorageManager;
    private ffmpeg: any;

    constructor(storageManager: GCPStorageManager) {
        this.storageManager = storageManager;
        this.ffmpeg = ffmpeg;
    }

    async performIncrementalVideoRender(
        scenes: Scene[],
        audioGcsUri: string | undefined,
        projectId: string,
        attempt: number,
    ) {

        const videoPaths = scenes
            .map(s => {
                const sceneAssets = getAllBestAssets(s.assets);
                const videoAsset = sceneAssets['scene_video'];
                return videoAsset?.data;
            })
            .filter((url): url is string => !!url);
        if (videoPaths.length === 0) return undefined;

        try {
            return await this.renderScenes(videoPaths, projectId, attempt, audioGcsUri);
        } catch (error) {
            console.warn({ error }, "Incremental rendering failed");
            return undefined;
        }
    }

    async renderScenes(videoPaths: string[], projectId: string, attempt: number, audioPath?: string): Promise<{ gcsUri: string, thumbnailGcsUri: string, duration: number; }> {

        console.log({ numScenes: videoPaths.length, videoPaths, projectId, attempt }, `Stitching scenes`);
        let finalLocalVideoPath: string | undefined;
        try {
            finalLocalVideoPath = await this.executeRenderVideo(videoPaths, audioPath);
            const objectPath = await this.storageManager.getObjectPath({ type: "render_video", projectId, version: attempt });
            console.log({ objectPath, projectId, attempt }, `Uploading Video`);
            const gcsUri = await this.storageManager.uploadFile(finalLocalVideoPath, objectPath);
            console.log({ projectId, attempt, uploaded: this.storageManager.getPublicUrl(gcsUri) });

            const { gcsUri: thumbnailGcsUri } = await this.createAndUploadThumbnail(finalLocalVideoPath, projectId, attempt);
            const duration = await this.getAudioDuration(finalLocalVideoPath);

            return { gcsUri, thumbnailGcsUri, duration };
        } catch (error) {
            console.error({ error }, "Failed to stitch scenes");
            throw error;
        } finally {
            if (finalLocalVideoPath && fs.existsSync(finalLocalVideoPath)) {
                fs.unlinkSync(finalLocalVideoPath);
            }
        }
    }

    private async executeRenderVideo(videoPaths: string[], audioPath?: string): Promise<string> {

        const tmpDir = "/tmp";
        const fileListPath = path.join(tmpDir, "concat_list.txt");
        const intermediateVideoPath = path.join(tmpDir, "intermediate_movie.mp4");
        const finalLocalVideoPath = path.join(tmpDir, "final_movie.mp4");
        const downloadedFiles: string[] = [];
        const localAudioPath = path.join(tmpDir, "audio.mp3");
        try {
            console.log("Downloading clips.");
            await Promise.all(videoPaths.map(async (pathUrl, i) => {
                const localPath = path.join(tmpDir, `clip_${i}.mp4`);
                await this.storageManager.downloadFile(pathUrl, localPath);
                downloadedFiles[ i ] = localPath; // Ensure order is preserved
            }));
            const fileListContent = downloadedFiles.map(f => `file '${f}'`).join("\n");
            fs.writeFileSync(fileListPath, fileListContent);

            if (audioPath) {
                console.log("Downloading audio.");
                await this.storageManager.downloadFile(audioPath, localAudioPath);

                console.log("Stitching videos with ffmpeg.");
                await new Promise<void>((resolve, reject) => {
                    this.ffmpeg()
                        .input(fileListPath)
                        .inputOptions([ "-f", "concat", "-safe", "0" ])
                        .outputOptions("-c copy")
                        .save(intermediateVideoPath)
                        .on("end", () => resolve())
                        .on("error", (err: Error) => reject(err));
                });

                console.log("Adding audio track to the final video.");
                await new Promise<string>((resolve, reject) => {
                    this.ffmpeg()
                        .input(intermediateVideoPath)
                        .input(localAudioPath)
                        .outputOptions([ "-c:v", "copy", "-c:a", "aac", "-strict", "experimental" ])
                        .save(finalLocalVideoPath)
                        .on("end", () => resolve(finalLocalVideoPath))
                        .on("error", (err: Error) => reject(err));
                });
            } else {
                console.log("Stitching videos with ffmpeg (no audio).");
                await new Promise<void>((resolve, reject) => {
                    this.ffmpeg()
                        .input(fileListPath)
                        .inputOptions([ "-f", "concat", "-safe", "0" ])
                        .outputOptions("-c copy")
                        .save(finalLocalVideoPath)
                        .on("end", () => resolve())
                        .on("error", (err: Error) => reject(err));
                });
            }
            return finalLocalVideoPath;
        } finally {
            if (fs.existsSync(fileListPath)) fs.unlinkSync(fileListPath);
            if (audioPath) {
                if (fs.existsSync(intermediateVideoPath)) fs.unlinkSync(intermediateVideoPath);
                if (fs.existsSync(localAudioPath)) fs.unlinkSync(localAudioPath);
            }
            downloadedFiles.forEach(f => {
                if (fs.existsSync(f)) fs.unlinkSync(f);
            });
        }
    }

    getAudioDuration(filePath: string): Promise<number> {
        const duration = new Promise((resolve, reject) => {
            this.ffprobe(filePath, (err: any, metadata: any) => {
                if (err) {
                    reject(err);
                } else {
                    const duration = metadata.format.duration;
                    resolve(duration || 0);
                }
            });
        }) as Promise<number>;
        console.log({ durationSeconds: duration }, "Audio duration (ffprobe)");
        return duration;
    }

    async createThumbnailFromVideo(localVideoPath: string): Promise<string> {
        const localThumbnailPath = localVideoPath.replace(".mp4", "_thumb.jpg");
        await new Promise((resolve, reject) => {
            this.ffmpeg(localVideoPath)
                .screenshots({
                    timestamps: [ 0 ],
                    filename: path.basename(localThumbnailPath),
                    folder: path.dirname(localThumbnailPath),
                })
                .on("end", resolve)
                .on("error", reject);
        });
        return localThumbnailPath;
    }

    async createAndUploadThumbnail(localVideoPath: string, projectId: string, version: number): Promise<{ gcsUri: string; }> {
        const localThumbnailPath = await this.createThumbnailFromVideo(localVideoPath);
        const objectPath = await this.storageManager.getObjectPath({ type: "thumbnail", projectId, version });
        const gcsUri = await this.storageManager.uploadFile(localThumbnailPath, objectPath);
        if (fs.existsSync(localThumbnailPath)) fs.unlinkSync(localThumbnailPath);
        return { gcsUri };
    }

    private ffprobe(filePath: string, callback: (err: any, metadata: any) => void): void {

        this.ffmpeg.ffprobe(filePath, callback);
    }
}
