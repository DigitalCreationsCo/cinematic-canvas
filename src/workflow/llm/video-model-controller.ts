export * from './provider-types';
import { GoogleProvider } from './google/provider';
import { LTXVideoProvider } from './ltx/provider';
import {
    IVideoModelProvider,
    VideoModelProviderName,
} from './provider-types';

export class VideoModelController {
    provider: IVideoModelProvider;

    constructor(providerArg?: VideoModelProviderName) {
        const envProvider = process.env.LLM_VIDEO_PROVIDER as VideoModelProviderName;
        const selectedProvider = providerArg || envProvider || 'google';

        console.info(`Initializing video provider: ${selectedProvider}`);

        switch (selectedProvider) {
            case 'ltx':
                this.provider = new LTXVideoProvider();
                break;
            case 'google':
            default:
                this.provider = new GoogleProvider();
                break;
        }
    }

    async generateVideos(params: Parameters<IVideoModelProvider[ 'generateVideos' ]>[ 0 ]) {
        return this.provider.generateVideos(params);
    }

    async getVideosOperation(params: Parameters<IVideoModelProvider[ 'getVideosOperation' ]>[ 0 ]) {
        return this.provider.getVideosOperation(params);
    }
}
