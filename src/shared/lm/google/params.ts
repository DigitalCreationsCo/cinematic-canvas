import { HarmBlockMethod, HarmBlockThreshold, HarmCategory, Modality } from "@google/genai";
import { ITextModelProvider, IVideoModelProvider, GenerateContentParameters } from "#shared/lm/provider.js";
import { GoogleGenerateContentParameters, CountTokensParameters } from "#shared/lm/google/provider.js";
import { validateInputBySupportedModelFeatures } from "#shared/lm/google/utils.js";
import { convertMessagesToGoogle } from "#shared/lm/message-converter.js";

// ─── Text generation ─────────────────────────────────────────────────────────

export const buildGenerateContentParams = (
  input: { model: string; messages: GenerateContentParameters["messages"] } & Partial<GenerateContentParameters>,
): GoogleGenerateContentParameters => {
  const { messages, ...restInput } = input;

  // Convert LangChain BaseMessage[] → Google Content[] + optional systemInstruction
  const { systemInstruction, contents } = convertMessagesToGoogle(messages);

  const validatedInput = validateInputBySupportedModelFeatures({
    contents,
    ...restInput,
    config: {
      ...restInput.config,
      ...(systemInstruction ? { systemInstruction } : {}),
    },
  });

  return {
    ...validatedInput,
    model: validatedInput.model,
    config: {
      candidateCount: 1,
      responseMimeType: "application/json",
      responseModalities: [Modality.TEXT],
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_UNSPECIFIED,
          threshold: HarmBlockThreshold.OFF,
          method: HarmBlockMethod.HARM_BLOCK_METHOD_UNSPECIFIED,
        },
      ],
      // Caller config spreads last — allows overriding responseMimeType,
      // responseModalities, toolConfig, etc. per call site.
      // NOTE: chat/tool-call paths must pass responseMimeType: 'text/plain'
      // to override the 'application/json' default above, since JSON mode
      // wraps function call responses and breaks LangGraph's ToolNode.
      ...validatedInput.config,
      // abortSignal is a client-side JS construct — always preserved from
      // the original input, never lost in a validatedInput spread.
      abortSignal: input.config?.abortSignal,
    },
  };
};

// ─── Image generation ────────────────────────────────────────────────────────
// TODO MESSAGE INPUT PARAMETERS
export const buildGenerateImagesParams = (
  input: { model: string } & Omit<Parameters<ITextModelProvider["generateImages"]>[0], "model">,
): Parameters<ITextModelProvider["generateImages"]>[0] => {
  const {
    config: { abortSignal, ...restConfig },
  } = input;
  return {
    ...input,
    config: { ...restConfig },
  };
};

// ─── Video generation ────────────────────────────────────────────────────────

// TODO MESSAGE INPUT PARAMETERS
export const buildGenerateVideosParams = (
  input: { model: string } & Omit<Parameters<IVideoModelProvider["generateVideos"]>[0], "model">,
): Parameters<IVideoModelProvider["generateVideos"]>[0] => {
  const { abortSignal, ...restConfig } = input.config || {};
  return {
    ...input,
    model: input.model,
    config: Object.keys(restConfig).length ? { ...restConfig } : undefined,
  };
};

// ─── Token counting ──────────────────────────────────────────────────────────

export function buildCountTokensParams(
  params: Parameters<ITextModelProvider["countTokens"]>[0],
): CountTokensParameters {
  const { messages, ...restInput } = params;
  const { systemInstruction, contents } = convertMessagesToGoogle(messages);
  return {
    ...restInput,
    contents,
    config: {
      ...(systemInstruction ? { systemInstruction } : {}),
    },
  };
}

// ─── Batch content ───────────────────────────────────────────────────────────

/**
 * Serialises generateBatchContent requests to Vertex AI JSONL format.
 *
 * Each request carries LangChain BaseMessage[] which must be converted to
 * Google Content[] before serialisation — the native batch API speaks Google's
 * wire format, not LangChain's message schema.
 *
 * abortSignal is stripped: it is a client-side JS construct that Vertex AI
 * cannot serialise and rejects with "Cannot store struct 'request.config.abortSignal'
 * with no fields".
 */
function prepareBatchInputs(requests: Parameters<ITextModelProvider["generateBatchContent"]>[0]["requests"]): string {
  return requests
    .map((req) => {
      const { config, metadata, messages, ...rest } = req;

      // Convert LangChain messages to Google Contents for the wire format.
      // systemInstruction is hoisted out — it belongs at the request root,
      // not inside contents.
      const { systemInstruction, contents } = convertMessagesToGoogle(messages);

      const { abortSignal, ...cleanConfig } = (config || {}) as any;

      return JSON.stringify({
        request: {
          ...rest,
          contents,
          ...(systemInstruction ? { systemInstruction } : {}),
          // config: cleanConfig,  ← re-enable when Vertex batch API
          //                         supports per-request config fields
        },
      });
    })
    .join("\n");
}

export function buildBatchParams(
  params: Parameters<ITextModelProvider["generateBatchContent"]>[0],
): { model: string; requests: string } & Omit<Parameters<ITextModelProvider["generateBatchContent"]>[0], "requests"> {
  return {
    ...params,
    requests: prepareBatchInputs(params.requests),
  };
}
