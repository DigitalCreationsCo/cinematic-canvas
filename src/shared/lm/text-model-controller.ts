export * from './provider.js';
import { GoogleProvider } from './google/provider.js';
import { MockProvider } from '../mocks/mock-provider.js';
import { IS_TEST_MODE } from '../config.js';
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
import { GlobalCooldown } from '../utils/execute-with-retry.js';
import { GCPStorageManager } from '../services/storage-manager.js';
import { PromptLogger } from '../utils/prompt-logger.js';

export const FALLBACK_POLICY = {
    PRIMARY_ATTEMPTS: 1,
    FALLBACK_ATTEMPTS: 1
} as const;

export type ModeModelPriority = 'speed' | 'quality';

export class TextModelController {
    private provider: ITextModelProvider;
    private nameProvider: TextModelProviderName;
    private modeModelPriority: ModeModelPriority;

    private modelDefaultText: string;
    private modelCurrentText: string;
    private modelCurrentImage: string;
    private modelCurrentQuality: string;

    private modelsFallback: {
        text: string[];
        image: string[];
        quality: string[];
    };

    private indexCurrentModel: {
        text: number;
        image: number;
        quality: number;
    };

    private countAttemptModel: {
        text: number;
        image: number;
        quality: number;
    };

    constructor(providerArg?: TextModelProviderName, { modeModelPriority }: { modeModelPriority?: ModeModelPriority; } = {}) {
        const providerEnv = process.env.LLM_TEXT_PROVIDER as TextModelProviderName;
        const providerSelected = providerArg || providerEnv || 'google';

        this.modeModelPriority = modeModelPriority || process.env.MODEL_PRIORITY === "speed" ? "speed" : "quality";

        console.info({ providerSelected, modeModelPriority, testMode: IS_TEST_MODE }, `Initializing text model provider`);

        if (IS_TEST_MODE) {
            console.info(`[TextModelController] TEST_MODE enabled - using MockProvider`);
            this.provider = new MockProvider();
        } else {
            switch (providerSelected) {
                case 'google':
                default:
                    this.provider = new GoogleProvider();
                    break;
            }
        }
        this.nameProvider = providerSelected;

        this.modelDefaultText = getProviderTextModelNames(providerSelected)[0];
        this.modelCurrentText = this.modelDefaultText;
        this.modelCurrentImage = getProviderImageModelNames(providerSelected)[0];
        this.modelCurrentQuality = getProviderQualityCheckModelNames(providerSelected)[0];

        this.modelsFallback = {
            text: getProviderTextModelNames(providerSelected),
            image: getProviderImageModelNames(providerSelected),
            quality: getProviderQualityCheckModelNames(providerSelected)
        };
        this.indexCurrentModel = { text: 0, image: 0, quality: 0 };
        this.countAttemptModel = { text: 0, image: 0, quality: 0 };
    }

    get textModel() { return this.modelCurrentText; }
    get imageModel() { return this.modelCurrentImage; }
    get qualityCheckModel() { return this.modelCurrentQuality; }
    get defaultModel() { return this.modelDefaultText; }
    get currentModel() { return this.modelCurrentText; }

    async generateContent(params: { model?: string; } & Omit<Parameters<ITextModelProvider['generateContent']>[0], 'model'>): ReturnType<ITextModelProvider['generateContent']> {
        try {
            await GlobalCooldown.wait();
            const timeStartMs = Date.now();
            const result = await this.provider.generateContent({
                ...params,
                model: params.model || this.modelCurrentText
            });
            PromptLogger.log({
                model: params.model || this.modelCurrentText,
                type: 'text',
                input: params.contents,
                parameters: params,
                provider: this.nameProvider,
                output: result,
                timeRequestStartMs: timeStartMs,
                timeRequestEndMs: Date.now(),
                tags: []
            });
            this.handleGenerationSuccess('text');
            GlobalCooldown.markCallComplete();
            return result;
        } catch (error) {
            GlobalCooldown.markCallComplete();
            this.handleGenerationError('text', error);
            throw error;
        }
    }

    async generateImages(params: { model?: string; } & Omit<Parameters<ITextModelProvider['generateImages']>[0], 'model'>): ReturnType<ITextModelProvider['generateImages']> {
        try {
            await GlobalCooldown.wait();
            const timeStartMs = Date.now();
            const result = await this.provider.generateImages({
                ...params,
                model: params.model || this.modelCurrentImage
            });
            PromptLogger.log({
                model: params.model || this.modelCurrentImage,
                type: 'image',
                input: params.prompt,
                parameters: params,
                provider: this.nameProvider,
                output: result,
                timeRequestStartMs: timeStartMs,
                timeRequestEndMs: Date.now(),
                tags: []
            });
            this.handleGenerationSuccess('image');
            GlobalCooldown.markCallComplete();
            return result;
        } catch (error) {
            GlobalCooldown.markCallComplete();
            this.handleGenerationError('image', error);
            throw error;
        }
    }

    async generateBatchContent(params: { model?: string; } & Omit<Parameters<ITextModelProvider['generateBatchContent']>[0], 'model'>): ReturnType<ITextModelProvider['generateBatchContent']> {
        try {
            await GlobalCooldown.wait();
            const timeStartMs = Date.now();
            const result = await this.provider.generateBatchContent({
                ...params,
                model: params.model || this.modelCurrentText
            });
            PromptLogger.log({
                model: params.model || this.modelCurrentText,
                type: 'text',
                input: params.requests.flatMap(r => r.contents),
                parameters: params,
                provider: this.nameProvider,
                output: result,
                timeRequestStartMs: timeStartMs,
                timeRequestEndMs: Date.now(),
                tags: []
            });
            this.handleGenerationSuccess('text');
            GlobalCooldown.markCallComplete();
            return result;
        } catch (error) {
            GlobalCooldown.markCallComplete();
            this.handleGenerationError('text', error);
            throw error;
        }
    }

    async generateBatchImages(params: { model?: string; } & Omit<Parameters<ITextModelProvider['generateBatchImages']>[0], 'model'>): ReturnType<ITextModelProvider['generateBatchImages']> {
        try {
            await GlobalCooldown.wait();
            const timeStartMs = Date.now();
            const result = await this.provider.generateBatchImages({
                ...params,
                model: params.model || this.modelCurrentImage
            });
            PromptLogger.log({
                model: params.model || this.modelCurrentImage,
                type: 'image',
                input: params.requests.flatMap(r => r.contents),
                parameters: params,
                provider: this.nameProvider,
                output: result,
                timeRequestStartMs: timeStartMs,
                timeRequestEndMs: Date.now(),
                tags: []
            });
            this.handleGenerationSuccess('image');
            GlobalCooldown.markCallComplete();
            return result;
        } catch (error) {
            GlobalCooldown.markCallComplete();
            this.handleGenerationError('image', error);
            throw error;
        }
    }

    private handleGenerationSuccess(typeModel: 'text' | 'image' | 'quality'): void {
        console.trace({ shouldPublish: false }, `[TextModelController] Generation successful for ${typeModel}. Resolving state based on priority: ${this.modeModelPriority}`);
        this.countAttemptModel[typeModel] = 0;

        if (this.modeModelPriority === 'quality') {
            this.indexCurrentModel[typeModel] = 0;
            this.updateCurrentModel(typeModel);
        }
    }

    private updateCurrentModel(typeModel: 'text' | 'image' | 'quality'): void {
        switch (typeModel) {
            case 'text': this.modelCurrentText = this.modelsFallback.text[this.indexCurrentModel.text]; break;
            case 'image': this.modelCurrentImage = this.modelsFallback.image[this.indexCurrentModel.image]; break;
            case 'quality': this.modelCurrentQuality = this.modelsFallback.quality[this.indexCurrentModel.quality]; break;
        }
    }

    private handleGenerationError(typeModel: 'text' | 'image' | 'quality', error: unknown): void {
        this.countAttemptModel[typeModel]++;

        const isPrimary = this.indexCurrentModel[typeModel] === 0;
        const attemptsMax = isPrimary ? FALLBACK_POLICY.PRIMARY_ATTEMPTS : FALLBACK_POLICY.FALLBACK_ATTEMPTS;

        console.trace({ error, typeModel, model: this.getCurrentModelString(typeModel) } as any, `[TextModelController] Attempt ${this.countAttemptModel[typeModel]}/${attemptsMax} failed`);

        if (this.countAttemptModel[typeModel] >= attemptsMax) {
            this.indexCurrentModel[typeModel] = (this.indexCurrentModel[typeModel] + 1) % this.modelsFallback[typeModel].length;
            this.countAttemptModel[typeModel] = 0;
            this.updateCurrentModel(typeModel);
            console.debug(`[TextModelController] Advancing ${typeModel} model (Wraparound enabled). New index: ${this.indexCurrentModel[typeModel]}`);
        }

        console.warn(`[TextModelController] Model attempt failed. Next model targeting: ${this.getCurrentModelString(typeModel)}`);
    }

    private getCurrentModelString(typeModel: 'text' | 'image' | 'quality'): string {
        switch (typeModel) {
            case 'text': return this.modelCurrentText;
            case 'image': return this.modelCurrentImage;
            case 'quality': return this.modelCurrentQuality;
        }
    }

    async countTokens(params: { model?: string; } & Omit<Parameters<ITextModelProvider['countTokens']>[0], 'model'>): ReturnType<ITextModelProvider['countTokens']> {
        return this.provider.countTokens({ ...params, model: params.model || this.modelCurrentText });
    }

    async getBatchJob(params: Parameters<ITextModelProvider['getBatchJob']>[0]): Promise<BatchJob> {
        return this.provider.getBatchJob(params);
    }
}
