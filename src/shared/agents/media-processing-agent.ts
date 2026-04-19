// ============================================================================
// OPTIMIZED AUDIO PROCESSING AGENT
// ============================================================================

import { GCPStorageManager } from "../services/storage-manager.js";
import { AudioAnalysis, AudioAnalysisAttributes, VALID_DURATIONS } from "../types/index.js";
import { FileData, GenerateContentResponse, GoogleGenAI, PartMediaResolution, PartMediaResolutionLevel, ThinkingLevel } from "@google/genai";
import { cleanJsonOutput, formatTime, roundToValidDuration, getModelCompatibleSchema } from "../utils/utils.js";
import { buildAudioProcessingInstruction } from "../prompts/audio-analysis.prompt.js";
import { TextModelController, UserMessage } from "../lm/text-model-controller.js";
import { MediaController } from "../services/media-controller.js";
import { GenerativeResultEnvelope, GenerativeResultProcessAudioToScenes, JobProcessAudioToScenes, JobRenderVideo } from "../types/job.types.js";
import path from "path";
import { AgentOptions } from "#shared/agents/agent.options.js";



export class MediaProcessingAgent {
    private lm: TextModelController;
    private storageManager: GCPStorageManager;
    mediaController: MediaController;
    private options?: AgentOptions;

    constructor(lm: TextModelController, storageManager: GCPStorageManager, mediaController: MediaController, options?: AgentOptions) {
        this.storageManager = storageManager;
        this.lm = lm;
        this.mediaController = mediaController;
        this.options = options;
    }

    /**
     * Processes an audio file to generate a detailed musical analysis and timed scene template.
     * @param audioPath The local path or public storage uri of audio file (mp3, wav) - if not provided, returns empty analysis.
     * @param enhancedPrompt The creative prompt for the video.
     * @returns A promise that resolves to an array of timed scenes and the audio GCS URI.
     */
    async processAudioToScenes(audioPath: string | undefined, enhancedPrompt: string): Promise<GenerativeResultProcessAudioToScenes> {
        if (!audioPath) {
            console.log(`🎤 No audio file provided, skipping audio processing`);
            return {
                data: {
                    analysis: {
                        bpm: 0,
                        keySignature: '',
                        duration: 0,
                        segments: [],
                        audioGcsUri: '',
                    }
                },
                metadata: {
                    model: this.lm.textModel,
                    attempts: 1,
                    acceptedAttempt: 1,
                }
            };
        }

        const start = Date.now();
        console.log({ audioPath }, `Audio processing started...`);

        const durationSeconds = await this.mediaController.getAudioDuration(audioPath);

        const result = await this.doAudioAnalysis(audioPath, enhancedPrompt, durationSeconds);

        return result;
    }

    private async doAudioAnalysis(audioPath: string, userPrompt: string, durationSeconds: number): Promise<GenerativeResultProcessAudioToScenes> {
        const start = Date.now();
        console.log({ audioPath }, `Analyzing audio with Gemini...`);

        const audioGcsUri = this.storageManager.getGcsUrl(audioPath);
        const audioPublicUri = this.storageManager.getPublicUrl(audioGcsUri);

        const audioFile: FileData = {
            displayName: "music track",
            fileUri: audioGcsUri,
            mimeType: "audio/mp3",
        };

        const systemPrompt = buildAudioProcessingInstruction(
            durationSeconds,
            VALID_DURATIONS,
            JSON.stringify(getModelCompatibleSchema(AudioAnalysisAttributes))
        );

        const audioCountToken = await this.lm.countTokens({
            messages: [new UserMessage({ content: [{ type: 'audio_url', audio_url: audioFile }] })]
        });

        /**
         * ANALYZE AUDIO: Multimodal Storyboarding Logic
         * * CRITICAL IMPLEMENTATION NOTES FOR GEMINI 3 PRO PREVIEW:
         * * 1. MEDIA-FIRST POSITIONING: 
         * The `fileData` is placed at index 0 of the parts array. This forces the model 
         * to load the audio buffer into its attention head before parsing the instructions, 
         * significantly reducing "blind" hallucinations based on text-only prompts.
         * * 2. STOCHASTIC GROUNDING (audioEvidence):
         * The schema now requires 'audioEvidence'. This acts as a 'Chain of Verification' 
         * field, forcing the model to identify specific waveform events (transients, 
         * frequency shifts) to justify the creative storyboard choices.
         * * 3. TRANSIENT DETECTION:
         * By asking for 'transientImpact', we force the model to look at the 'attack' 
         * phase of the audio at the startTime, ensuring visual 'Cuts' align with 
         * actual musical beats rather than generic time-slices.
         * * 4. SYSTEM INSTRUCTION VS USER PROMPT:
         * Instructions are separated to maintain a 'Master Musicologist' persona, 
         * preventing the user's creative prompt from over-riding the technical 
         * requirements of the segmentation philosophy.
         */
        const response = await this.lm.generateContent({
            messages: [
                new UserMessage({
                    content: [
                        // Media first mitigates "lost-in-the-middle" effect
                        { type: 'audio_url', audio_url: audioFile, mediaResolution: { numTokens: audioCountToken.totalTokens } },
                        { type: 'text', text: systemPrompt },
                        { type: 'text', text: userPrompt },
                    ],
                }),
            ],
            config: {
                abortSignal: this.options?.signal,
                responseJsonSchema: getModelCompatibleSchema(AudioAnalysisAttributes),
                thinkingConfig: {
                    thinkingLevel: ThinkingLevel.HIGH
                }
            }
        });

        if (!response?.candidates?.[0]?.content?.parts?.[0]?.text) {
            throw Error("No valid analysis result from LLM");
        }

        const rawText = cleanJsonOutput(response.candidates[0].content.parts[0].text);
        console.debug({ output: rawText });
        const analysis = AudioAnalysis.parse(JSON.parse(rawText));

        analysis.audioGcsUri = audioGcsUri;
        analysis.audioPublicUri = audioPublicUri;
        analysis.segments = analysis.segments.map((segment, index) => ({
            ...segment,
            sceneIndex: index,
        }));
        const durationMs = Date.now() - start;
        console.log({
            audioPath,
            durationMs,
            model: this.lm.textModel,
            segmentCount: analysis.segments.length
        }, `Audio analysis completed successfully.`);

        return { data: { analysis }, metadata: { model: this.lm.textModel, attempts: 1, acceptedAttempt: 1 } };
    }

    async renderVideo(job: JobRenderVideo, projectTitle: string): Promise<{
        id: string;
        title: string;
        thumbnailGcsUri: string;
        videoGcsUri: string;
        duration: number;
    }> {
        const { videoPaths, audioGcsUri } = job.payload;
        const { projectId } = job;
        const attempt = job.attempts.currentAttempt;

        try {

            const { gcsUri, thumbnailGcsUri, duration } = await this.mediaController.renderScenes(
                videoPaths,
                projectId,
                attempt,
                audioGcsUri
            );


            return {
                id: projectId,
                title: projectTitle,
                thumbnailGcsUri,
                videoGcsUri: gcsUri,
                duration
            };
        } catch (error) {
            console.error({ error, projectId }, "Failed to process stitched video assets");
            throw error;
        }
    }
}
