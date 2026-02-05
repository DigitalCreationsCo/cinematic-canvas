export * from './provider-types.js';
import { GoogleProvider } from './google/provider.js';
import {
    ITextModelProvider,
    TextModelProviderName,
} from './provider-types.js';
import { pollForBatchJob } from '../utils/poll-batch-job.js';

export class TextModelController {
    provider: ITextModelProvider;

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
    }

    async generateContent(params: Parameters<ITextModelProvider[ 'generateContent' ]>[ 0 ]) {
        return this.provider.generateContent(params);
    }

    async generateBatchContent(params: Parameters<ITextModelProvider[ 'generateBatchContent' ]>[ 0 ]) {
        const batchJob = await this.provider.generateBatchContent(params);
        return await pollForBatchJob(this, batchJob, params.config?.displayName || "Batch Job");
    }

    async generateImages(params: Parameters<ITextModelProvider[ 'generateImages' ]>[ 0 ]) {
        return this.provider.generateImages(params);
    }

    async generateBatchImages(params: Parameters<ITextModelProvider[ 'generateBatchImages' ]>[ 0 ]) {
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
