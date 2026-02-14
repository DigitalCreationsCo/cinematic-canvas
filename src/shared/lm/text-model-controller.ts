export * from './provider.js';
import { GoogleProvider } from './google/provider.js';
import {
    ITextModelProvider,
    TextModelProviderName,
    GenerateContentParameters,
    GenerateImagesParameters,
    GenerateBatchContentParameters,
    BatchJob,
    BatchResultItem
} from './provider.js';
import { getProviderTextModelNames, getProviderImageModelNames, getProviderQualityCheckModelNames } from './models.js';
import { GlobalCooldown } from '../utils/lm-retry.js';
import { GCPStorageManager } from '../services/storage-manager.js';

export const FALLBACK_POLICY = {
  PRIMARY_ATTEMPTS: 1,
  FALLBACK_ATTEMPTS: 1
} as const;

export class TextModelController {
    private provider: ITextModelProvider;
    private providerName: TextModelProviderName;
    private _defaultModel: string;
    private _textModel: string;
    private _imageModel: string;
    private _qualityCheckModel: string;
    private _sm: GCPStorageManager;

    // Fallback state
    private fallbackModels: {
        text: string[];
        image: string[];
        quality: string[];
    };
    private currentModelIndex: {
        text: number;
        image: number;
        quality: number;
    };
    private modelAttemptCount: {
        text: number;
        image: number;
        quality: number;
    };

    constructor(sm: GCPStorageManager, providerArg?: TextModelProviderName) {
        const envProvider = process.env.LLM_TEXT_PROVIDER as TextModelProviderName;
        const selectedProvider = providerArg || envProvider || 'google';

        console.info(`Initializing text model provider: ${selectedProvider}`);

        switch (selectedProvider) {
            case 'google':
            default:
                this.provider = new GoogleProvider();
                break;
        }
        this._sm = sm;
        this.providerName = selectedProvider;
        this._defaultModel = getProviderTextModelNames(selectedProvider)[0];
        this._textModel = this._defaultModel;
        this._imageModel = getProviderImageModelNames(selectedProvider)[0];
        this._qualityCheckModel = getProviderQualityCheckModelNames(selectedProvider)[0];

        // Initialize fallback state
        this.fallbackModels = {
            text: getProviderTextModelNames(selectedProvider),
            image: getProviderImageModelNames(selectedProvider),
            quality: getProviderQualityCheckModelNames(selectedProvider)
        };
        this.currentModelIndex = { text: 0, image: 0, quality: 0 };
        this.modelAttemptCount = { text: 0, image: 0, quality: 0 };
    }

    get textModel() {
        return this._textModel;
    }

    get imageModel() {
        return this._imageModel;
    }

    get qualityCheckModel() {
        return this._qualityCheckModel;
    }

    get defaultModel() {
        return this._defaultModel;
    }

    get currentModel() {
        return this._textModel;
    }

    // Note: Use this method if your model supports multimodal output. Define multimodal output in the config.
    async generateContent(params: { model?: string; } & Omit<Parameters<ITextModelProvider['generateContent']>[0], 'model'>): ReturnType<ITextModelProvider['generateContent']> {
        let result;
        try {
            await GlobalCooldown.wait();

            result = await this.provider.generateContent({
                ...params,
                model: params.model || this._textModel
            });
            this.onGenerationSuccess('text');
            GlobalCooldown.markCallComplete();

        } catch (error) {
            GlobalCooldown.markCallComplete();

            const modelSwitched = this.onErrorModelFallback('text');

            console.warn(`Text model attempt failed. Switching to: ${this._textModel}`);
            throw error; // throw exception so outer retry handler can handle
        }
        this.resetFallbackState('text');
        return result;
    }

    async generateBatchContent(params: { model?: string; } & Omit<Parameters<ITextModelProvider['generateBatchContent']>[0], 'model'>): ReturnType<ITextModelProvider['generateBatchContent']> {
        let result;
        try {
            await GlobalCooldown.wait();

            result = await this.provider.generateBatchContent({
                ...params,
                model: params.model || this._textModel
            });
            this.onGenerationSuccess('text');
            GlobalCooldown.markCallComplete();

        } catch (error) {
            GlobalCooldown.markCallComplete();

            const modelSwitched = this.onErrorModelFallback('text');

            console.warn(`Batch content model attempt failed. Switching to: ${this._textModel}`);
            throw error; // throw exception so outer retry handler can handle
        }
        this.resetFallbackState('text');
        return result;
    }

    async generateImages(params: { model?: string; } & Omit<Parameters<ITextModelProvider['generateImages']>[0], 'model'>): ReturnType<ITextModelProvider['generateImages']> {
        let result;
        try {
            await GlobalCooldown.wait();

            result = await this.provider.generateImages({
                ...params,
                model: params.model || this._imageModel
            });
            this.onGenerationSuccess('image');
            GlobalCooldown.markCallComplete();
        } catch (error) {
            GlobalCooldown.markCallComplete();

            const modelSwitched = this.onErrorModelFallback('image');

            console.warn(`Image model attempt failed. Switching to: ${this._imageModel}`);
            throw error; // throw exception so outer retry handler can handle
        }
        this.resetFallbackState('image');
        return result;
    }

    async generateBatchImages(params: { model?: string; } & Omit<Parameters<ITextModelProvider['generateBatchImages']>[0], 'model'>): ReturnType<ITextModelProvider['generateBatchImages']> {
        let result;
        try {
            await GlobalCooldown.wait();

            result = await this.provider.generateBatchImages({
                ...params,
                model: params.model || this._imageModel
            });
            this.onGenerationSuccess('image');
            GlobalCooldown.markCallComplete();

        } catch (error) {
            GlobalCooldown.markCallComplete();

            const modelSwitched = this.onErrorModelFallback('image');

            console.warn(`Batch images model attempt failed. Switching to: ${this._imageModel}`);
            throw error; // throw exception so outer retry handler can handle
        }
        this.resetFallbackState('image');
        return result;
    }

    // Reset fallback state for new generation call
    private resetFallbackState(modelType: 'text' | 'image' | 'quality'): void {
        this.currentModelIndex[modelType] = 0;
        this.modelAttemptCount[modelType] = 0;
        this.updateCurrentModel(modelType);
    }

    // Update current model based on type
    private updateCurrentModel(modelType: 'text' | 'image' | 'quality'): void {
        switch (modelType) {
            case 'text':
                this._textModel = this.fallbackModels.text[this.currentModelIndex.text];
                break;
            case 'image':
                this._imageModel = this.fallbackModels.image[this.currentModelIndex.image];
                break;
            case 'quality':
                this._qualityCheckModel = this.fallbackModels.quality[this.currentModelIndex.quality];
                break;
        }
    }

    // Determine if should switch models
    private onErrorModelFallback(modelType: 'text' | 'image' | 'quality'): boolean {
        this.modelAttemptCount[modelType]++;

        const isPrimary = this.currentModelIndex[modelType] === 0;
    const maxAttempts = isPrimary 
  ? FALLBACK_POLICY.PRIMARY_ATTEMPTS 
  : FALLBACK_POLICY.FALLBACK_ATTEMPTS;

        if (this.modelAttemptCount[modelType] >= maxAttempts && this.currentModelIndex[modelType] < this.fallbackModels[modelType].length - 1) {
            // Move to next fallback model, do not overflow increment
            this.currentModelIndex[modelType]++;
            this.modelAttemptCount[modelType] = 0;
            this.updateCurrentModel(modelType);
            return true; // Model switched
        }

        return false; // Same model, retry
    }

    // Reset after successful generation
    private onGenerationSuccess(modelType: 'text' | 'image' | 'quality'): void {
        this.resetFallbackState(modelType);
    }

    async countTokens(params: { model?: string; } & Omit<Parameters<ITextModelProvider['countTokens']>[0], 'model'>): ReturnType<ITextModelProvider['countTokens']> {
        return this.provider.countTokens({ ...params, model: params.model || this._textModel });
    }

    async getBatchJob(params: Parameters<ITextModelProvider['getBatchJob']>[0]): Promise<BatchJob> {
        return this.provider.getBatchJob(params);
    }
}
