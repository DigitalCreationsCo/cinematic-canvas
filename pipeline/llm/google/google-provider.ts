import { GoogleGenAI, GenerateContentParameters, Operation, GenerateContentResponse, GenerateVideosResponse, GenerateVideosParameters, GenerateImagesParameters, GenerateImagesResponse } from "@google/genai";
import { LlmProvider } from "../types";

export class GoogleProvider implements LlmProvider {
    public llm: GoogleGenAI;
    private videoModel: GoogleGenAI;

    constructor() {
        const projectId = process.env.GCP_PROJECT_ID || "your-project-id";

        const llm = new GoogleGenAI({
            vertexai: true,
            project: projectId,
            location: "global"
        });
        this.llm = llm;
        this.videoModel = llm;
    }

    async generateContent(params: GenerateContentParameters, options?: { signal?: AbortSignal; }): Promise<GenerateContentResponse> {
        return (this.llm.models as any).generateContent(params, { signal: options?.signal });
    }

    async generateImages(params: GenerateImagesParameters, options?: { signal?: AbortSignal; }): Promise<GenerateImagesResponse> {
        return (this.videoModel.models as any).generateImages(params, { signal: options?.signal });
    }

    async generateVideos(params: GenerateVideosParameters, options?: { signal?: AbortSignal; }): Promise<Operation<GenerateVideosResponse>> {
        return (this.videoModel.models as any).generateVideos(params, { signal: options?.signal });
    }

    async getVideosOperation(params: { operation: Operation<GenerateVideosResponse>; }, options?: { signal?: AbortSignal; }): Promise<Operation<GenerateVideosResponse>> {
        return (this.videoModel.operations as any).getVideosOperation(params, { signal: options?.signal });
    }
}
