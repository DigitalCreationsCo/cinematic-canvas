import { GoogleProvider } from './google/provider.js';
import { LTXVideoProvider } from './ltx/provider.js';
import {
    IVideoModelProvider,
    VideoModelProviderName,
    GenerateVideosParameters,
} from './provider.js';
import { buildGenerateVideosParams } from './params.js';
import { getProviderVideoModelName } from './models.js';

export class VideoModelController {
    private provider: IVideoModelProvider;
    private providerName: VideoModelProviderName;
    private _defaultModel: string;
    private _model: string;

    constructor(providerArg?: VideoModelProviderName) {
        const envProvider = process.env.LLM_VIDEO_PROVIDER as VideoModelProviderName;
        const selectedProvider = providerArg || envProvider || 'google';

        console.info(`Initializing video model provider: ${selectedProvider}`);

        switch (selectedProvider) {
            case 'ltx':
                this.provider = new LTXVideoProvider();
                break;
            case 'google':
            default:
                this.provider = new GoogleProvider();
                break;
        }
        this.providerName = selectedProvider;
        this._defaultModel = getProviderVideoModelName(selectedProvider);
        this._model = this._defaultModel;
    }

    get model() {
        return this._model;
    }

    async generateVideos(params: { model?: string | undefined; } & Omit<GenerateVideosParameters, 'model'>) {
        return this.provider.generateVideos(buildGenerateVideosParams({ ...params }, this.providerName));
    }

    async getVideosOperation(params: Parameters<IVideoModelProvider[ 'getVideosOperation' ]>[ 0 ]) {
        return this.provider.getVideosOperation(params);
    }
}
