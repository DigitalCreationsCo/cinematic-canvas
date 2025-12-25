export * from './types';
export * from './google/google-provider';
import { GoogleProvider } from './google/google-provider';
import { LlmProvider, LlmProviderName } from './types';

export class LlmController {
    provider: LlmProvider;

    constructor() {
        const providerName = process.env.LLM_PROVIDER as LlmProviderName;

        let provider;
        switch (providerName) {
            case "google":
                provider = new GoogleProvider()
                break;
            default:
                provider = new GoogleProvider();
                break;
        }
        
        this.provider = provider;
    }

    async generateContent(params: Parameters<this[ 'provider' ][ 'generateContent' ]>[ 0 ], options?: { signal?: AbortSignal }) {
        return this.provider.generateContent(params, options);
    }
    
    async generateImages(params: Parameters<this[ 'provider' ][ 'generateImages' ]>[ 0 ], options?: { signal?: AbortSignal }) {
        return this.provider.generateImages(params, options);
    }

    async generateVideos(params: Parameters<this[ 'provider' ][ 'generateVideos' ]>[ 0 ], options?: { signal?: AbortSignal }) {
        return this.provider.generateVideos(params, options);
    }

    async getVideosOperation(params: any, options?: { signal?: AbortSignal }) {
        return this.provider.getVideosOperation(params, options);
    }
}
