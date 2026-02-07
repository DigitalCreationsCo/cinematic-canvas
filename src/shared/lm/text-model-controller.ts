export * from './provider.js';
import { GoogleProvider } from './google/provider.js';
import {
    ITextModelProvider,
    TextModelProviderName,
    GenerateContentParameters,
    GenerateImagesParameters,
    GenerateBatchContentParameters,
} from './provider.js';
import { pollForBatchJob } from '../utils/poll-batch-job.js';
import { buildGenerateContentParams, buildGenerateImagesParams } from './params.js';
import { getProviderImageModelName, getProviderQualityCheckModelName, getProviderTextModelName } from './models.js';

export class TextModelController {
    private provider: ITextModelProvider;
    private providerName: TextModelProviderName;
    private _defaultModel: string;
    private _model: string;

    constructor(providerArg?: TextModelProviderName) {
        const envProvider = process.env.LLM_TEXT_PROVIDER as TextModelProviderName;
        const selectedProvider = providerArg || envProvider || 'google';

        console.info(`Initializing text model provider: ${selectedProvider}`);

        switch (selectedProvider) {
            case 'google':
            default:
                this.provider = new GoogleProvider();
                break;
        }
        this.providerName = selectedProvider;
        this._defaultModel = getProviderTextModelName(selectedProvider);
        this._model = this._defaultModel;
    }

    get model() {
        return this._model;
    }

    get imageModelName() {
        return getProviderImageModelName(this.providerName);
    }

    get qualityCheckModelName() {
        return getProviderQualityCheckModelName(this.providerName);
    }

    async generateContent(params: ({ model?: string; } & Omit<GenerateContentParameters, 'model'>)) {
        return this.provider.generateContent(buildGenerateContentParams({ ...params, }, this.providerName));
    }

    async generateBatchContent(params: { model?: string; } & Omit<GenerateBatchContentParameters, 'model'>) {
        // const batchJob = await this.provider.generateBatchImages({ ...params, config: buildGenerateImagesParams(params, this.providerName).config });
        const batchJob = await this.provider.generateBatchContent(params);
        return await pollForBatchJob(this, batchJob, params.config?.displayName || "Batch Job");
    }

    async generateImages(params: { model?: string; } & Omit<GenerateImagesParameters, 'model'>) {
        return this.provider.generateImages(buildGenerateImagesParams({ ...params }, this.providerName));
    }

    async generateBatchImages(params: { model?: string; } & Omit<GenerateBatchContentParameters, 'model'>) {
        // const batchJob = await this.provider.generateBatchImages({ ...params, config: buildGenerateImagesParams(params, this.providerName).config });
        const batchJob = await this.provider.generateBatchImages(params);
        return await pollForBatchJob(this, batchJob, params.config?.displayName || "Batch Images Job");
    }

    async countTokens(params: Parameters<ITextModelProvider[ 'countTokens' ]>[ 0 ]) {
        return this.provider.countTokens(params);
    }

    async getBatchJob(params: Parameters<ITextModelProvider[ 'getBatchJob' ]>[ 0 ]) {
        return this.provider.getBatchJob(params);
    }
}
