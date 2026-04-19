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
    BatchResultItem,
    Tool,
    FunctionCallingConfigMode
} from './provider.js';
import { buildProviderTools } from './tools/tools-converter.js';
import { getProviderTextModelNames, getProviderImageModelNames, getProviderQualityCheckModelNames } from './models.js';
import { GlobalCooldown } from '../utils/execute-with-retry.js';
import { PromptLogger } from '../utils/prompt-logger.js';

import {
    BaseChatModel,
    type BaseChatModelCallOptions,
    type BaseChatModelParams,
} from '@langchain/core/language_models/chat_models';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { RunnableBinding, type Runnable } from '@langchain/core/runnables';
import { HumanMessage, type BaseMessage } from '@langchain/core/messages';
import type { ChatGeneration, ChatResult } from '@langchain/core/outputs';
import { convertProviderResponseToAIMessage } from '#shared/lm/message-converter.js';



export const FALLBACK_POLICY = {
    PRIMARY_ATTEMPTS: 1,
    FALLBACK_ATTEMPTS: 1
} as const;

export type ModeModelPriority = 'speed' | 'quality';
export interface ProviderTextModelParams extends BaseChatModelParams {
    provider?: TextModelProviderName,
    options?: {
        /**
         * 'quality' (default): on success, always reset to the primary model.
         * 'speed':             stay on whichever fallback succeeded (sticky).
         */
        modeModelPriority?: ModeModelPriority;
    }
}

export interface ProviderChatModelCallOptions extends BaseChatModelCallOptions {
    /**
     * Google FunctionDeclarations injected by bindTools().
     * Do not set this directly — use model.bindTools(tools) instead.
     */
    providerTools?: Tool[];
}

export class TextModelController extends BaseChatModel<ProviderChatModelCallOptions> {
    private readonly provider: ITextModelProvider;
    private readonly nameProvider: TextModelProviderName;
    private readonly modeModelPriority: ModeModelPriority;

    private modelDefaultText: string;
    private modelCurrentText: string;
    private modelCurrentImage: string;
    private modelCurrentQuality: string;

    private readonly modelsFallback: {
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

    constructor(params: ProviderTextModelParams = {}) {

        super(params);

        const providerEnv = process.env.LLM_TEXT_PROVIDER as TextModelProviderName;
        const providerSelected = params.provider || providerEnv || 'google';

        this.modeModelPriority = params.options?.modeModelPriority || process.env.MODEL_PRIORITY === "speed" ? "speed" : "quality";

        console.info({ providerSelected, modeModelPriority: this.modeModelPriority, testMode: IS_TEST_MODE }, `Initializing text model provider`);

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

    _llmType(): string {
        return 'text-model-controller';
    }
    get currentModel() { return this.modelCurrentText; }
    get defaultModel() { return this.modelDefaultText; }

    get textModel() { return this.modelCurrentText; }
    get imageModel() { return this.modelCurrentImage; }
    get qualityCheckModel() { return this.modelCurrentQuality; }

    /**
     * Converts LangChain StructuredTools to Google FunctionDeclarations and
     * injects them via bind(). Returns a new Runnable — the original model
     * instance is unchanged, safe for concurrent use.
     *
     * Compatible with LangGraph's ToolNode out of the box.
     */
    override bindTools(
        tools: StructuredToolInterface[],
        kwargs?: Partial<ProviderChatModelCallOptions>
    ): Runnable {
        const providerTools = buildProviderTools(tools, this.nameProvider);
        // bypasses TypeScript's failed resolution of the inherited method while keeping the runtime behaviour correct
        return new RunnableBinding({
            bound: this,
            kwargs: { providerTools, ...kwargs },
            config: {},
        });
    }

    // TODO GOOGLE TOOLS DEFINITIONS/CONVERSION SHOULD BE IN THE GOOGLE PROVIDER
    async _generate(
        messages: BaseMessage[],
        options: this['ParsedCallOptions'],
        _runManager?: CallbackManagerForLLMRun
    ): Promise<ChatResult> {

        await GlobalCooldown.wait();
        const timeStartMs = Date.now();

        try {
            const providerTools = (options as ProviderChatModelCallOptions).providerTools;
            const hasTools = providerTools && providerTools.length > 0;

            const config: GenerateContentParameters['config'] = {
                // Override the JSON default from buildGenerateContentParams.
                // JSON mode wraps function call responses and breaks ToolNode.
                responseMimeType: 'text/plain',
                ...(hasTools && {
                    tools: providerTools,
                    toolConfig: {
                        functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO },
                    },
                }),
            };

            const response = await this.provider.generateContent({
                model: this.modelCurrentText,
                messages,
                config,
            });

            PromptLogger.log({
                model: this.modelCurrentText,
                type: 'text',
                input: messages,
                parameters: { messages, config },
                provider: this.nameProvider,
                output: response,
                timeRequestStartMs: timeStartMs,
                timeRequestEndMs: Date.now(),
                tags: [],
            });

            this.handleGenerationSuccess('text');
            GlobalCooldown.markCallComplete();

            const aiMessage = convertProviderResponseToAIMessage(response, this.nameProvider);
            const generation: ChatGeneration = {
                text: typeof aiMessage.content === 'string' ? aiMessage.content : '',
                message: aiMessage,
            };

            return { generations: [generation] };
        } catch (error) {
            GlobalCooldown.markCallComplete();
            this.handleGenerationError('text', error);
            throw error;
        }
    }

    /**
     * Model Controllers and Providers alike transform INPUTS only -> Provider transforms inputs from ModelController, ModelController transforms returns from Provider. 
     * This is the established contract for now until a hard edge case is found.
     * @param params
     * @returns 
     */
    async generateContent(params: { model?: string; } & Omit<Parameters<ITextModelProvider['generateContent']>[0], 'model'>): ReturnType<ITextModelProvider['generateContent']> {

        await GlobalCooldown.wait();
        const timeStartMs = Date.now();
        const contentModality = params.config?.responseModalities?.includes("IMAGE") ? "image" : "text";

        try {
            const result = await this.provider.generateContent({
                ...params,
                model: params.model || this.modelCurrentText
            });
            PromptLogger.log({
                model: params.model || this.modelCurrentText,
                type: 'text',
                input: params.messages,
                parameters: params,
                provider: this.nameProvider,
                output: result,
                timeRequestStartMs: timeStartMs,
                timeRequestEndMs: Date.now(),
                tags: []
            });

            this.handleGenerationSuccess(contentModality);
            GlobalCooldown.markCallComplete();
            return result;
        } catch (error) {
            GlobalCooldown.markCallComplete();
            this.handleGenerationError(contentModality, error);
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
                input: params.requests.flatMap(r => r.messages),
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
                input: params.requests.flatMap(r => r.messages),
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
            console.debug(`[TextModelController] Advancing ${typeModel} model (Round Robin enabled). New index: ${this.indexCurrentModel[typeModel]}`);
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

    override async getNumTokens(text: string): Promise<number> {
        const response = await this.provider.countTokens({
            model: this.modelCurrentText,
            messages: [new HumanMessage({ content: text })],
        });
        return response.totalTokens ?? 0;
    }

    async countTokens(params: { model?: string; } & Omit<Parameters<ITextModelProvider['countTokens']>[0], 'model'>): ReturnType<ITextModelProvider['countTokens']> {
        return this.provider.countTokens({ ...params, model: params.model || this.modelCurrentText });
    }

    async getBatchJob(params: Parameters<ITextModelProvider['getBatchJob']>[0]): Promise<BatchJob> {
        return this.provider.getBatchJob(params);
    }
}
