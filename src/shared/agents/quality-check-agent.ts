
import { Scene, Character, Location } from "#shared/types/workflow.types.js";
import { QualityEvaluationResult, QualityConfig, QualityEvaluationAttributes } from "#shared/types/quality.types.js";
import { getModelCompatibleSchema } from '#shared/utils/utils.js';
import { GCPStorageManager } from "#shared/services/storage-manager.js";
import { buildFrameEvaluationPrompt, buildSceneVideoEvaluationPrompt } from "#shared/prompts/must-review/quality-evaluation.prompt.js";
import { buildCorrectionPrompt } from "#shared/prompts/must-review/correction.prompt.js";
import { TextModelController, UserMessage } from "#shared/lm/text-model-controller.js";
import { FileData } from "@google/genai";
import { buildSafetyGuidelinesPrompt, printSafetyErrorCodes } from "#shared/prompts/safety-guidelines.prompt.js";
import { detectRelevantDomainRules, getProactiveRules } from "#shared/prompts/must-review/domain-rules.js";
import { UpdateEntitiesCallback } from "#shared/types/pipeline.types.js";
import { AgentOptions } from "#shared/agents/agent.options.js";
import { z } from "zod";



const malformedJsonRepairPrompt = (malformedJson: string) => `
The following string is not valid JSON. Please fix it and return only the valid JSON.
Do not include any other text in response, only the JSON object.
Do not include the markdown characters that denote a a code block.

${malformedJson}
`;


export class QualityCheckAgent {
  private lm: TextModelController;
  private storageManager: GCPStorageManager;
  qualityConfig: Readonly<QualityConfig>;
  private options?: AgentOptions;

  constructor(
    lm: TextModelController,
    storageManager: GCPStorageManager,
    options?: AgentOptions,
    qualityConfig?: Partial<QualityConfig>,
  ) {
    this.lm = lm;
    this.storageManager = storageManager;
    this.options = options;

    // 1. Define hardcoded defaults
    const defaults: QualityConfig = {
      enabled: false,
      acceptThreshold: 0.95,
      minorIssueThreshold: 0.90,
      majorIssueThreshold: 0.7,
      failThreshold: 0.7,
      maxRetries: 3,
      safetyRetries: 2,
    };

    // 2. Environment variable overrides (parsed)
    const envOverrides: Partial<QualityConfig> = {
      ...(process.env.ENABLE_QUALITY_CONTROL && { enabled: process.env.ENABLE_QUALITY_CONTROL === "true" }),
      ...(process.env.ACCEPT_THRESHOLD && { acceptThreshold: Number(process.env.ACCEPT_THRESHOLD) }),
      ...(process.env.MINOR_ISSUE_THRESHOLD && { minorIssueThreshold: Number(process.env.MINOR_ISSUE_THRESHOLD) }),
      ...(process.env.MAJOR_ISSUE_THRESHOLD && { majorIssueThreshold: Number(process.env.MAJOR_ISSUE_THRESHOLD) }),
      ...(process.env.FAIL_THRESHOLD && { failThreshold: Number(process.env.FAIL_THRESHOLD) }),
      ...(process.env.MAX_RETRIES && { maxRetries: Number(process.env.MAX_RETRIES) }),
      ...(process.env.SAFETY_RETRIES && { safetyRetries: Number(process.env.SAFETY_RETRIES) }),
    };

    // 3. Merge: Defaults < Args < Env
    this.qualityConfig = {
      ...defaults,
      ...qualityConfig,
      ...envOverrides
    };

    this.validateConfig();
  }

  private validateConfig() {
    const keys: (keyof QualityConfig)[] = [
      'acceptThreshold', 'minorIssueThreshold', 'majorIssueThreshold',
      'failThreshold', 'maxRetries', 'safetyRetries'
    ];

    for (const key of keys) {
      if (typeof this.qualityConfig[key] === 'number' && isNaN(this.qualityConfig[key] as number)) {
        throw new Error(`QualityConfig Error: ${key} is not a number`);
      }
    }
  }

  /**
   * Attempts to parse and validate a JSON string against a Zod schema.
   * If parsing fails, it will try to repair the JSON string using an LLM.
   * @param jsonString The JSON string to parse.
   * @param schema The Zod schema to validate against.
   * @returns The parsed and validated object.
   * @throws An error if parsing, validation, and repair all fail.
   */
  private async parseAndValidateJson<T extends z.ZodTypeAny>(
    jsonString: string,
    schema: T
  ): Promise<z.infer<T>> {
    try {
      // First attempt to parse directly
      return schema.parse(JSON.parse(jsonString));
    } catch (error) {
      console.warn("   ⚠️ Initial JSON parsing failed. Attempting to repair...");

      try {
        // Attempt to repair the JSON using the LLM
        const repairResponse = await this.lm.generateContent({
          model: this.lm.qualityCheckModel,
          messages: [new UserMessage({ content: malformedJsonRepairPrompt(jsonString) })],
          config: {
            abortSignal: this.options?.signal,
            temperature: 0.1
          }
        });

        if (!repairResponse.text) {
          throw new Error("Failed to repair JSON: LLM returned no text.");
        }

        // Attempt to parse the repaired JSON
        return schema.parse(JSON.parse(repairResponse.text));

      } catch (repairError) {
        console.error("   ✗ JSON repair failed:", repairError);
        // Add original error as cause for better debugging
        throw new Error(`Failed to parse and validate JSON after repair. Original error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  async evaluateFrameQuality(
    frameUri: string,
    scene: Scene,
    framePosition: "start" | "end",
    characters: Character[],
    locations: Location[],
    previousFrameUri?: FileData,
    activeRules?: string[]
  ): Promise<QualityEvaluationResult> {
    const relevantRules = activeRules && activeRules.length > 0
      ? activeRules
      : [
        ...getProactiveRules(),
        ...detectRelevantDomainRules([scene.description])
      ];

    const evaluationPrompt = buildFrameEvaluationPrompt(
      scene,
      frameUri,
      framePosition,
      QualityEvaluationAttributes,
      characters,
      locations,
      previousFrameUri,
      relevantRules
    );

    const response = await this.lm.generateContent({
      model: this.lm.qualityCheckModel,
      messages: [
        new UserMessage({ content: evaluationPrompt }),
        new UserMessage({
          content: [{
            type: "image_url",
            image_url: frameUri,
            mimeType: await this.storageManager.getObjectMimeType(frameUri) || 'image/png'
          }]
        }),
        new UserMessage({
          content: [{
            type: "image_url",
            fileUri: previousFrameUri,
            mimeType: await this.storageManager.getObjectMimeType(frameUri) || 'image/png'
          }]
        }),
      ],
      // new UserMessage({ content: evaluationPrompt }),
      //     new UserMessage({
      //       fileData: {
      //         displayName: "frame",
      //         fileUri: frameUri,
      //         mimeType: await this.storageManager.getObjectMimeType(frameUri) || 'image/png'
      //       }
      //     },
      //     {
      //       fileData: {
      //         displayName: "previous frame",
      //         fileUri: frameUri,
      //         mimeType: await this.storageManager.getObjectMimeType(frameUri) || 'image/png'
      //       }
      //     },
      //   ]
      // }
      config: {
        abortSignal: this.options?.signal,
        responseJsonSchema: getModelCompatibleSchema(QualityEvaluationAttributes),
        temperature: 0.3,
      }
    });

    if (!response.text) {
      throw new Error("No quality evaluation generated from LLM from Quality Check Agent");
    }

    // Use the robust parsing and validation method
    const evaluationData = await this.parseAndValidateJson(response.text, QualityEvaluationAttributes);

    const overallScore = this.calculateOverallScore(evaluationData.scores);
    const overallRating = this.determineOverallRating(overallScore);

    const evaluation: QualityEvaluationResult = {
      ...evaluationData,
      grade: overallRating,
      score: overallScore,
      model: this.lm.qualityCheckModel
    };

    this.logEvaluationResults(scene.id, evaluation, overallScore);
    return evaluation;
  }

  /**
   * Perform comprehensive quality check on generated video
   */
  async evaluateScene(
    scene: Scene,
    generatedVideo: string,
    enhancedPrompt: string,
    characters: Character[],
    location: Location,
    attempt: number,
    previousScene?: Scene,
    sendEntityUpdate?: UpdateEntitiesCallback,
    activeRules?: string[]
  ): Promise<QualityEvaluationResult> {

    sendEntityUpdate?.([{ id: scene.id, entityType: "scene", entity: { status: "evaluating", progressMessage: "Evaluating scene quality..." } }], false);

    const relevantRules = activeRules && activeRules.length > 0
      ? activeRules
      : [
        ...getProactiveRules(),
        ...detectRelevantDomainRules([scene.description])
      ];

    const evaluationPrompt = buildSceneVideoEvaluationPrompt(
      scene,
      this.storageManager.getPublicUrl(generatedVideo),
      enhancedPrompt,
      QualityEvaluationAttributes,
      characters,
      location,
      previousScene,
      relevantRules
    );

    const response = await this.lm.generateContent({
      model: this.lm.qualityCheckModel,
      messages: [
        new UserMessage({
          content: [
            { type: 'text', text: evaluationPrompt },
            {
              type: 'image_url',
              image_url: generatedVideo,
              mimeType: await this.storageManager.getObjectMimeType(generatedVideo) || 'video/mp4'
            }
          ]
        })
      ],
      config: {
        abortSignal: this.options?.signal,
        responseJsonSchema: getModelCompatibleSchema(QualityEvaluationAttributes),
        temperature: 0.3,
      }
    });

    if (!response.text) {
      throw new Error("No quality evaluation generated from LLM from Quality Check Agent");
    }

    // Use the robust parsing and validation method
    const evaluationData = await this.parseAndValidateJson(response.text, QualityEvaluationAttributes);

    const overallScore = this.calculateOverallScore(evaluationData.scores);
    const overallRating = this.determineOverallRating(overallScore);

    const evaluation: QualityEvaluationResult = {
      ...evaluationData,
      grade: overallRating,
      score: overallScore,
      model: this.lm.qualityCheckModel
    };

    this.logEvaluationResults(scene.id, evaluation, overallScore);
    return evaluation;
  }

  /**
   * Apply prompt corrections and regenerate enhanced prompt
   */
  async applyQualityCorrections(
    originalPrompt: string,
    evaluation: QualityEvaluationResult,
    scene: Scene,
    characters: Character[],
    attempt: number,
    sendEntityUpdate?: UpdateEntitiesCallback,
  ): Promise<string> {

    if (!evaluation.promptCorrections || evaluation.promptCorrections.length === 0) {
      console.log(`   🔄 Attempt ${attempt + 1}: Retrying with original prompt`);
      return originalPrompt;
    }

    console.log(`   🔧 Attempt ${attempt + 1}: Applying ${evaluation.promptCorrections.length} corrections`);
    sendEntityUpdate?.([{ id: scene.id, entityType: "scene", entity: { status: "evaluating", progressMessage: `Applying ${evaluation.promptCorrections.length} corrections...` } }], false);

    const correctionPrompt = buildCorrectionPrompt(originalPrompt, scene, evaluation.promptCorrections);

    try {
      const response = await this.lm.generateContent({
        model: this.lm.qualityCheckModel,
        messages: [new UserMessage({ content: correctionPrompt })],
        config: {
          abortSignal: this.options?.signal,
          temperature: 0.5
        }
      });

      if (!response.text) throw new Error("No correction prompt generated from LLM from Quality Check Agent");

      const correctedPrompt = response.text.trim();

      console.log(`   ✓ Prompt corrected: ${originalPrompt.length} → ${correctedPrompt.length} chars`);

      return correctedPrompt;

    } catch (error) {
      console.error("   ✗ Failed to apply prompt corrections:", error);
      return originalPrompt; // Fallback to original
    }
  }

  async sanitizePrompt(originalPrompt: string, errorMessage?: string): Promise<string> {
    const logMessage = errorMessage
      ? `   ⚠️ Safety filter triggered. Sanitizing prompt...`
      : `   🛡️ Proactively sanitizing prompt...`;
    console.log(logMessage);

    try {
      const instructions = errorMessage
        ? `Read the error message carefully to understand what triggered the safety filter. Revise the original_prompt to ensure the prompt will not trigger safety filters.`
        : `Review the prompt for potential violations of AI safety guidelines. `;

      const prompt = buildSafetyGuidelinesPrompt(instructions, originalPrompt, errorMessage) + printSafetyErrorCodes();

      const response = await this.lm.generateContent({
        model: this.lm.qualityCheckModel,
        messages: [
          new UserMessage({ content: [{ type: 'text', text: prompt }] }),
          new UserMessage({ content: [{ type: 'text', text: 'Output ONLY the corrected prompt text, no JSON, no preamble.' }] })
        ],
        config: {
          abortSignal: this.options?.signal,
          responseMimeType: 'text/plain'
        }
      });

      const sanitized = response.text;
      console.log("   ✓ Prompt sanitized.");
      return sanitized || originalPrompt;
    } catch (e) {
      console.warn("   ⚠️ Failed to sanitize prompt, using original:", e);
      return originalPrompt;
    }
  }

  /**
   * Calculate weighted overall score
   */
  private calculateOverallScore(scores: QualityEvaluationResult["scores"]): number {
    const ratingToScore = {
      "PASS": 1.0,
      "MINOR_ISSUES": 0.7,
      "MAJOR_ISSUES": 0.4,
      "FAIL": 0.0
    };

    let totalScore = 0;
    let totalWeight = 0;

    for (const key in scores) {
      if (Object.prototype.hasOwnProperty.call(scores, key)) {
        const score = scores[key as keyof typeof scores];
        totalScore += ratingToScore[score.rating] * score.weight;
        totalWeight += score.weight;
      }
    }

    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  /**
   * Determine overall rating from score
   */
  private determineOverallRating(score: number): QualityEvaluationResult["grade"] {
    if (score >= this.qualityConfig.acceptThreshold) return "ACCEPT";
    if (score >= this.qualityConfig.minorIssueThreshold) return "ACCEPT_WITH_NOTES";
    if (score >= this.qualityConfig.majorIssueThreshold) return "REGENERATE_MINOR";
    return "FAIL";
  }

  /**
   * Internal: Log attempt result concisely.
   */
  private logAttemptResult(attempt: number, score: number, rating: string): void {
    const scorePercent = (score * 100).toFixed(1);
    const icon = score >= this.qualityConfig.acceptThreshold ? '✓' : '⚠';
    console.log(`   ${icon} Attempt ${attempt}: ${scorePercent}% (${rating})`);
  }

  /**
   * Log evaluation results
   */
  private logEvaluationResults(
    id: string,
    evaluation: QualityEvaluationResult,
    overallScore: number
  ): void {
    const scorePercentage = (overallScore * 100).toFixed(1);

    console.log(`   Overall Rating ${id}: ${evaluation.grade} (${scorePercentage}%)`);

    Object.entries(evaluation.scores).forEach(([category, score]) => {
      const icon = score.rating === "PASS" ? "✓" :
        score.rating === "MINOR_ISSUES" ? "⚠" : "✗";
      console.log(`     ${icon} ${category}: ${score.rating}`);
    });

    if (evaluation.issues.length > 0) {
      console.log(`   Issues found: ${evaluation.issues.length}`);
      evaluation.issues.forEach((issue, i) => {
        console.log(`     ${i + 1}. [${issue.severity}] ${issue.description}`);
      });
    }
  }

  /**
   * Get default passing scores (fallback)
   */
  private getDefaultScores(): QualityEvaluationResult["scores"] {
    return {
      narrativeFidelity: { rating: "PASS", weight: 0.30, details: "Not evaluated" },
      characterConsistency: { rating: "PASS", weight: 0.25, details: "Not evaluated" },
      technicalQuality: { rating: "PASS", weight: 0.20, details: "Not evaluated" },
      emotionalAuthenticity: { rating: "PASS", weight: 0.15, details: "Not evaluated" },
      continuity: { rating: "PASS", weight: 0.10, details: "Not evaluated" }
    };
  }
}
