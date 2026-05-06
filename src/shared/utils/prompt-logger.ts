import { promises as fsPromises } from "fs";
import path from "path";
import { logContextStore } from "#shared/logger/index.js";
import * as promptlayer from "promptlayer";
const PromptLayer = promptlayer.default || promptlayer.PromptLayer;

const isEnabledPromptLayer = Boolean(process.env.PROMPTLAYER_API_KEY);
const clientPromptLayer = isEnabledPromptLayer ? new PromptLayer() : null;

export interface ParamsLogRequest {
  provider: "openai" | "anthropic" | "google" | string;
  model: string;
  type: "text" | "image" | "video" | "quality" | "chat";
  input: any[] | string; // Content[] | string;
  output: any;
  parameters: any;
  timeRequestStartMs: number;
  timeRequestEndMs: number;
  tags?: string[];
}

export class PromptLogger {
  private static sanitize(obj: any): any {
    if (!obj) return obj;

    if (typeof obj === "string") {
      // Heuristic: Truncate very long strings that look like base64 or binary data
      if (obj.length > 5000 && !obj.includes(" ")) {
        return `<truncated_string_len_${obj.length}>`;
      }
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitize(item));
    }
    if (typeof obj === "object") {
      const newObj: any = {};
      for (const key in obj) {
        if (key === "inlineData" && obj[key]?.data) {
          newObj[key] = { ...obj[key], data: `<base64_data_truncated_len_${obj[key].data.length}>` };
        } else if ((key === "image" || key === "video") && typeof obj[key] === "string" && obj[key].length > 1000) {
          newObj[key] = `<binary_data_truncated_len_${obj[key].length}>`;
        } else if (key === "imageBytes") {
          newObj[key] = `<image_bytes_truncated>`;
        } else {
          newObj[key] = this.sanitize(obj[key]);
        }
      }
      return newObj;
    }
    return obj;
  }

  private static getLogDirectory(projectId: string, jobId: string, jobType: string): string {
    const baseDir = process.env.PROMPT_LOG_DIR || path.join(process.cwd(), "logs", "prompts");
    // Organize by Project -> Stage (Job Type) -> Job
    return path.join(baseDir, projectId, jobType, jobId);
  }

  /**
   * Translates our internal payload format into PromptLayer's required schema.
   */
  private static formatLogRequestPromptLayer(
    paramsLogRequest: ParamsLogRequest,
  ): Parameters<InstanceType<typeof PromptLayer>["logRequest"]>[0] {
    console.trace("[PromptLogger] Formatting payload for PromptLayer", { provider: paramsLogRequest.provider });

    let outputText = "";
    if (typeof paramsLogRequest.output === "string") {
      outputText = paramsLogRequest.output;
    } else if (paramsLogRequest.output?.text) {
      outputText = paramsLogRequest.output.text;
    } else {
      try {
        // If output is complex object (video/image response), stringify it to ensure we send a string
        outputText = JSON.stringify(paramsLogRequest.output, null, 2);
      } catch (e) {
        outputText = "<unable_to_stringify_output>";
      }
    }

    // Base formatting template
    const payloadFormatted: Parameters<InstanceType<typeof PromptLayer>["logRequest"]>[0] = {
      provider: paramsLogRequest.provider || "custom",
      model: paramsLogRequest.model,
      request_start_time: paramsLogRequest.timeRequestStartMs,
      request_end_time: paramsLogRequest.timeRequestEndMs,
      tags: paramsLogRequest.tags || [],
      input: {
        type: "completion",
        content:
          typeof paramsLogRequest.input === "string"
            ? [
                {
                  type: "text",
                  text: paramsLogRequest.input,
                },
              ]
            : paramsLogRequest.input.flatMap((content: any) =>
                (content.parts ?? []).map((part: any) => ({
                  type: "text",
                  text: part.text ?? part.fileData?.fileUri ?? part.inlineData?.data ?? "",
                })),
              ),
      },
      output: {
        type: "completion",
        content: [
          {
            type: "text",
            text: outputText,
          },
        ],
      },
    };

    // Add specific conversions based on provider if necessary (e.g., extracting token counts)
    if (paramsLogRequest.provider === "openai" && paramsLogRequest.output?.usage) {
      payloadFormatted.input_tokens = paramsLogRequest.output.usage.prompt_tokens;
      payloadFormatted.output_tokens = paramsLogRequest.output.usage.completion_tokens;
    }

    return payloadFormatted;
  }

  static async log(params: ParamsLogRequest) {
    const isEnabledLocalLog = process.env.LOG_PROMPTS === "true";
    if (!isEnabledLocalLog && !isEnabledPromptLayer) {
      return;
    }

    const context = logContextStore.getStore();
    const projectId = context?.projectId || "unknown-project";
    const jobId = context?.jobId || "unknown-job";
    const jobType = context?.["jobType"] || "unknown-stage";
    const attempt = context?.["attempt"] || 0;

    console.debug({ jobId, attempt }, `[PromptLogger] Dispatching background log tasks`);

    Promise.resolve()
      .then(async () => {
        const promisesLoggingTargets: Promise<void>[] = [];

        // 1. Local File Logging
        if (isEnabledLocalLog) {
          promisesLoggingTargets.push(
            (async () => {
              try {
                const pathDirLog = this.getLogDirectory(projectId, jobId, jobType);

                // Async, idempotent directory creation (fixes TOCTOU race condition)
                await fsPromises.mkdir(pathDirLog, { recursive: true });

                const nameFile = `${attempt}-${params.type}.json`;
                const pathFileOutput = path.join(pathDirLog, nameFile);

                const entryLogLocal = this.sanitize({
                  timestamp: new Date().toISOString(),
                  ...context,
                  ...params,
                });

                await fsPromises.writeFile(pathFileOutput, JSON.stringify(entryLogLocal, null, 2));
                console.trace(`[PromptLogger] Successfully wrote local log to ${pathFileOutput}`);
              } catch (errLocalLog) {
                console.error("[PromptLogger] Uncaught error during local file logging:", errLocalLog);
              }
            })(),
          );
        }

        // 2. PromptLayer Remote Logging
        if (isEnabledPromptLayer && clientPromptLayer) {
          promisesLoggingTargets.push(
            (async () => {
              try {
                const logRequestPromptLayer = this.formatLogRequestPromptLayer(params);

                // Inject context metadata into PromptLayer tags
                logRequestPromptLayer.tags = logRequestPromptLayer.tags || [];
                logRequestPromptLayer.tags.push(`project:${projectId}`, `job:${jobId}`, `stage:${jobType}`);

                await clientPromptLayer.logRequest(logRequestPromptLayer).catch((err) => {
                  // Safely log error structure if it's not an Error object (e.g. array of validation errors) or has weird message
                  if (err instanceof Error) {
                    console.error("[PromptLogger] Uncaught error during PromptLayer network transmission:", err);
                    if (err.message === "[object Object]") {
                      try {
                        console.error(
                          "[PromptLogger] detailed error structure:",
                          JSON.stringify(err, Object.getOwnPropertyNames(err)),
                        );
                      } catch (jsonErr) {
                        console.error("[PromptLogger] could not stringify error object:", jsonErr);
                      }
                    }
                  } else {
                    console.error(
                      "[PromptLogger] Uncaught error during PromptLayer network transmission (non-Error object):",
                      JSON.stringify(err, null, 2),
                    );
                  }
                  throw err;
                });
                console.trace(`[PromptLogger] Successfully transmitted log to PromptLayer for job: ${jobId}`);
              } catch (errPromptLayer) {
                console.error("[PromptLogger] Uncaught error during PromptLayer network transmission:", errPromptLayer);
              }
            })(),
          );
        }

        // Execute all configured logging targets concurrently
        await Promise.allSettled(promisesLoggingTargets);
      })
      .catch((errCritical) => {
        // Failsafe for issues in the Promise orchestration itself
        console.error("[PromptLogger] CRITICAL ERROR: Background logging dispatcher failed.", errCritical);
      });
  }
}
