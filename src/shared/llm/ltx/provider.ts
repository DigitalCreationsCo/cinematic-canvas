import { IVideoModelProvider } from "../provider-types.js";

export interface LTXGenerateVideoParameters {
    prompt: string;
    config: {
        destination?: string;
        negative_prompt?: string;
        width?: number;
        height?: number;
        num_frames?: number;
        num_inference_steps?: number;
        fps?: number;
        seed?: number;
    };
}

export class LTXVideoProvider implements IVideoModelProvider {
    private endpoint: string;
    private apiKey?: string;

    constructor() {
        this.endpoint = process.env.LTX_API_ENDPOINT || "";
        this.apiKey = process.env.LTX_API_KEY;
    }

    async generateVideos(params: LTXGenerateVideoParameters): Promise<any> {
        if (!this.endpoint) {
             throw new Error("LTX_API_ENDPOINT environment variable is not set");
        }
        
        const ltxParams = params as LTXGenerateVideoParameters; 
        
        const payload = {
            instances: [{
                prompt: ltxParams.prompt,
                negative_prompt: ltxParams.config?.negative_prompt,
                width: ltxParams.config?.width,
                height: ltxParams.config?.height,
                num_frames: ltxParams.config?.num_frames,
                num_inference_steps: ltxParams.config?.num_inference_steps,
                fps: ltxParams.config?.fps,
                seed: ltxParams.config?.seed,
                gcs_destination: ltxParams.config?.destination
            }]
        };

        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };
        
        if (this.apiKey) {
             headers['X-API-Key'] = this.apiKey;
        }

        const response = await fetch(this.endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`LTX API Error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();
        return data;
    }

    async getVideosOperation(params: any): Promise<any> {
         return {
            done: true,
            result: null,
            metadata: { message: "LTX operations are synchronous" }
         };
    }
}
