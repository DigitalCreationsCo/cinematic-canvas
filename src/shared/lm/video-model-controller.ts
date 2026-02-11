import { GoogleProvider } from './google/provider.js';
import { LTXVideoProvider } from './ltx/provider.js';
import {
    IVideoModelProvider,
    VideoModelProviderName,
    GenerateVideosParameters,
} from './provider.js';
import { buildGenerateVideosParams } from './params.js';
import { getProviderVideoModelNames } from './models.js';
import { GlobalCooldown } from '../utils/lm-retry.js';

export const FALLBACK_POLICY = {
  PRIMARY_ATTEMPTS: 1,
  FALLBACK_ATTEMPTS: 1
} as const;

export class VideoModelController {
    private provider: IVideoModelProvider;
    private providerName: VideoModelProviderName;
    private _defaultModel: string;
    private _model: string;
    
    // Fallback state
    private fallbackModels: string[];
    private currentModelIndex: number = 0;
    private modelAttemptCount: number = 0;

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
        this._defaultModel = getProviderVideoModelNames(selectedProvider)[0];
        this._model = this._defaultModel;
        
        // Initialize fallback state
        this.fallbackModels = getProviderVideoModelNames(selectedProvider);
        this.currentModelIndex = 0;
        this.modelAttemptCount = 0;
    }

    get model() {
        return this._model;
    }
    
    get defaultModel() {
        return this._defaultModel;
    }

    async generateVideos(params: { model?: string | undefined; } & Omit<GenerateVideosParameters, 'model'>) {
        let result;
            try {
                await GlobalCooldown.wait();
                
                result = await this.provider.generateVideos(buildGenerateVideosParams({ 
                    ...params, 
                    model: params.model || this._model 
                }, this.providerName));
                this.onGenerationSuccess();
                            GlobalCooldown.markCallComplete();
                
            } catch (error) {
                            GlobalCooldown.markCallComplete();
                
                const modelSwitched = this.handleError();
                
                // Continue loop with new model or retry same model
                console.warn(`Video model attempt failed. Switching to: ${this._model}`);
                throw error; // throw exception so outer retry handler can handle
            }
            this.resetFallbackState();
        return result;
    }

    // Reset fallback state for new generation call
    private resetFallbackState(): void {
        this.currentModelIndex = 0;
        this.modelAttemptCount = 0;
        this._model = this.fallbackModels[0];
    }
    
    // Handle error and determine if should switch models
    private handleError(): boolean {
        this.modelAttemptCount++;
        
        // Primary model gets 2 attempts, fallbacks get 1 each
        const isPrimary = this.currentModelIndex === 0;
        const maxAttempts = isPrimary 
          ? FALLBACK_POLICY.PRIMARY_ATTEMPTS 
          : FALLBACK_POLICY.FALLBACK_ATTEMPTS;
        
        if (this.modelAttemptCount >= maxAttempts && this.currentModelIndex < this.fallbackModels.length - 1) {
            // Move to next fallback model
            this.currentModelIndex++;
            this.modelAttemptCount = 0;
            this._model = this.fallbackModels[this.currentModelIndex];
            return true; // Model switched
        }
        
        return false; // Same model, retry
    }
    
    // Reset after successful generation
    private onGenerationSuccess(): void {
        this.resetFallbackState();
    }
    
    async getVideosOperation(params: Parameters<IVideoModelProvider[ 'getVideosOperation' ]>[ 0 ]) {
        return this.provider.getVideosOperation(params);
    }
}
