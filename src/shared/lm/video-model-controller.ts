import { GoogleProvider } from "#shared/lm/google/provider.js";
import { LTXVideoProvider } from "#shared/lm/ltx/provider.js";
import { IVideoModelProvider, VideoModelProviderName, GenerateVideosParameters } from "#shared/lm/provider.js";
import { getProviderVideoModelNames } from "#shared/lm/models.js";
import { GlobalCooldown } from "#shared/utils/global-cooldown.js";
import { PromptLogger } from "#shared/utils/prompt-logger.js";

export const FALLBACK_POLICY = {
  PRIMARY_ATTEMPTS: 1,
  FALLBACK_ATTEMPTS: 1,
} as const;

export type ModeModelPriority = "speed" | "quality";

export class VideoModelController {
  private provider: IVideoModelProvider;
  private nameProvider: VideoModelProviderName;
  private modeModelPriority: ModeModelPriority;

  private modelDefaultVideo: string;
  private modelCurrentVideo: string;

  private modelsFallbackVideo: string[];
  private indexCurrentModelVideo: number = 0;
  private countAttemptModelVideo: number = 0;

  constructor(providerArg?: VideoModelProviderName, modePriorityArg: ModeModelPriority = "quality") {
    const providerEnv = process.env.LLM_VIDEO_PROVIDER as VideoModelProviderName;
    const providerSelected = providerArg || providerEnv || "google";

    this.provider = providerSelected === "ltx" ? new LTXVideoProvider() : new GoogleProvider();
    this.nameProvider = providerSelected;
    this.modeModelPriority = modePriorityArg;

    this.modelsFallbackVideo = getProviderVideoModelNames(providerSelected);
    this.modelDefaultVideo = this.modelsFallbackVideo[0];
    this.modelCurrentVideo = this.modelDefaultVideo;
  }

  get model() {
    return this.modelCurrentVideo;
  }
  get defaultModel() {
    return this.modelDefaultVideo;
  }

  async generateVideos(params: { model?: string | undefined } & Omit<GenerateVideosParameters, "model">) {
    try {
      await GlobalCooldown.wait();
      const timeStartMs = Date.now();
      const result = await this.provider.generateVideos({
        ...params,
        model: params.model || this.modelCurrentVideo,
      });

      PromptLogger.log({
        model: params.model || this.modelCurrentVideo,
        type: "video",
        input: params.prompt,
        parameters: params,
        provider: this.nameProvider,
        output: result,
        timeRequestStartMs: timeStartMs,
        timeRequestEndMs: Date.now(),
        tags: [],
      });
      this.handleGenerationSuccess();
      GlobalCooldown.markCallComplete();
      return result;
    } catch (error) {
      GlobalCooldown.markCallComplete();
      this.handleGenerationError(error);
      throw error;
    }
  }

  /**
   * Polls or retrieves the status of a video generation operation.
   * Guaranteed passthrough for the Cinematic Canvas engine to track render progress.
   */
  async getVideosOperation(params: Parameters<IVideoModelProvider["getVideosOperation"]>[0]) {
    return this.provider.getVideosOperation(params);
  }

  private handleGenerationSuccess(): void {
    console.trace(
      `[VideoModelController] Success. Mode: ${this.modeModelPriority}. Index: ${this.indexCurrentModelVideo}`,
    );
    this.countAttemptModelVideo = 0;

    // Quality mode resets to primary (index 0)
    // Speed mode remains 'sticky' on the current successful fallback
    if (this.modeModelPriority === "quality") {
      this.indexCurrentModelVideo = 0;
      this.modelCurrentVideo = this.modelsFallbackVideo[0];
    }
  }

  private handleGenerationError(error: unknown): void {
    this.countAttemptModelVideo++;

    const isPrimary = this.indexCurrentModelVideo === 0;
    const attemptsMax = isPrimary ? FALLBACK_POLICY.PRIMARY_ATTEMPTS : FALLBACK_POLICY.FALLBACK_ATTEMPTS;

    console.trace(`[VideoModelController] Attempt ${this.countAttemptModelVideo}/${attemptsMax} failed.`);

    if (this.countAttemptModelVideo >= attemptsMax) {
      // Increments and wraps around back to 0 if the end of the list is reached
      this.indexCurrentModelVideo = (this.indexCurrentModelVideo + 1) % this.modelsFallbackVideo.length;
      this.countAttemptModelVideo = 0;
      this.modelCurrentVideo = this.modelsFallbackVideo[this.indexCurrentModelVideo];
      console.debug(`[VideoModelController] Fallback triggered. New model: ${this.modelCurrentVideo}`);
    }

    console.warn(`[VideoModelController] Model failure. Next attempt targets: ${this.modelCurrentVideo}`);
  }
}
