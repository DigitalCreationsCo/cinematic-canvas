export * from './provider-types.js';
import { GoogleProvider } from './google/provider.js';
import {
    ITextModelProvider,
    TextModelProviderName,
} from './provider-types.js';

export class TextModelController {
    provider: ITextModelProvider;

    constructor(providerArg?: TextModelProviderName) {
        const envProvider = process.env.LLM_TEXT_PROVIDER as TextModelProviderName;
        const selectedProvider = providerArg || envProvider || 'google';

        console.info(`Initializing text provider: ${selectedProvider}`);

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

    async generateImages(params: Parameters<ITextModelProvider[ 'generateImages' ]>[ 0 ]) {
        return this.provider.generateImages(params);
    }

    async countTokens(params: Parameters<ITextModelProvider[ 'countTokens' ]>[ 0 ]) {
        return this.provider.countTokens(params);
    }
}
