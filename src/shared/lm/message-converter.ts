/**
 * message-converter.ts
 *
 * Bidirectional conversion between LangChain BaseMessage types and the
 * Google GenAI Content format used by @google/genai (Vertex AI).
 *
 * LangChain → Google  (convertMessagesToGoogle)
 * Google → LangChain  (convertResponseToAIMessage)
 *
 * ── Google API constraints ───────────────────────────────────────────────────
 *  • SystemMessage   → config.systemInstruction, NOT a content turn
 *  • ToolMessages    → role 'user' with functionResponse parts; consecutive
 *                      ToolMessages MUST be merged into a single user turn
 *  • AIMessage tool_calls → role 'model' with functionCall parts
 *  • Empty parts arrays are rejected by the API — always guard before pushing
 */

import { AIMessage, type BaseMessage, type ToolMessage } from '@langchain/core/messages';
import type { ToolCall } from '@langchain/core/messages/tool';
import type { Content, GenerateContentResponse, Part } from './google/provider.js';
import { TextModelProviderName } from '#shared/lm/provider.js';

// ─── LangChain → GoogleProvider ──────────────────────────────────────────────────────

interface ConvertedGoogleContents {
    contents: Content[];
    systemInstruction?: string;
}
/**
 * Converts a LangChain message array to Google GenAI Contents.
 *
 * Multiple SystemMessages are joined with a newline separator.
 * Consecutive ToolMessages are merged into a single user turn — the Google
 * API requires all function responses for one model turn in one Content node.
 */
export function convertMessagesToGoogle(messages: BaseMessage[]): ConvertedGoogleContents {
    const systemParts: string[] = [];
    const contents: Content[] = [];

    for (const message of messages) {
        const type = message._getType();

        // ── System ──────────────────────────────────────────────────────────
        if (type === 'system') {
            systemParts.push(coerceToString(message.content));
            continue;
        }

        // ── Human ────────────────────────────────────────────────────────────
        if (type === 'human') {
            const parts = contentToParts(message.content);
            if (parts.length > 0) {
                contents.push({ role: 'user', parts });
            }
            continue;
        }

        // ── AI (model turn) ──────────────────────────────────────────────────
        if (type === 'ai') {
            const aiMsg = message as AIMessage;
            const parts: Part[] = [];

            if (aiMsg.content) {
                parts.push(...contentToParts(aiMsg.content));
            }

            for (const tc of aiMsg.tool_calls ?? []) {
                parts.push({
                    functionCall: {
                        name: tc.name,
                        args: tc.args as Record<string, unknown>,
                    },
                });
            }

            if (parts.length > 0) {
                contents.push({ role: 'model', parts });
            }
            continue;
        }

        // ── Tool (function response) ─────────────────────────────────────────
        //
        // Google requires all function responses for one model turn to be
        // batched into a single user-role Content node. We merge consecutive
        // ToolMessages rather than emitting separate Content entries.
        if (type === 'tool') {
            const toolMsg = message as ToolMessage;
            const output = coerceToString(toolMsg.content);

            // `name` is the tool/function name. `tool_call_id` carries our
            // call_<functionName>_<hex> convention as a fallback.
            const functionName =
                toolMsg.name ?? parseFunctionNameFromCallId(toolMsg.tool_call_id);

            const responsePart: Part = {
                functionResponse: {
                    name: functionName,
                    response: { output },
                },
            };

            const last = contents[contents.length - 1];
            const lastIsToolResponse =
                last?.role === 'user' &&
                last.parts?.some((p) => p.functionResponse !== undefined);

            if (lastIsToolResponse) {
                last.parts!.push(responsePart);
            } else {
                contents.push({ role: 'user', parts: [responsePart] });
            }
            continue;
        }

        // ── Fallback ─────────────────────────────────────────────────────────
        console.warn(
            `[message-converter] Unhandled message type "${type}" — converting to user text.`
        );
        contents.push({ role: 'user', parts: [{ text: JSON.stringify(message.content) }] });
    }

    return {
        systemInstruction: systemParts.length > 0 ? systemParts.join('\n') : undefined,
        contents,
    };
}

export function convertProviderResponseToAIMessage(response: GenerateContentResponse, providerName: TextModelProviderName): AIMessage {
    switch (providerName) {
        case 'google':
        default:
            return convertResponseToAIMessage(response);
    }
}

// ─── Google → LangChain ──────────────────────────────────────────────────────

/**
 * Converts a Google GenerateContentResponse to a LangChain AIMessage.
 *
 * Text parts are concatenated into `content`.
 * FunctionCall parts become `tool_calls`, which ToolNode uses to dispatch.
 *
 * Tool call ID format: `call_<functionName>_<8-char hex>`
 * This is parsed back in convertMessagesToGoogle when a ToolMessage is missing
 * an explicit `name` field.
 */
export function convertResponseToAIMessage(response: GenerateContentResponse): AIMessage {
    const parts = response.candidates?.[0]?.content?.parts;

    if (!parts?.length) {
        return new AIMessage({ content: '' });
    }

    const textSegments: string[] = [];
    const toolCalls: ToolCall[] = [];

    for (const part of parts) {
        if (part.text) {
            textSegments.push(part.text);
        }

        if (part.functionCall?.name) {
            toolCalls.push({
                id: buildCallId(part.functionCall.name),
                name: part.functionCall.name,
                args: (part.functionCall.args as Record<string, unknown>) ?? {},
                type: 'tool_call',
            });
        }
    }

    return new AIMessage({
        content: textSegments.join(''),
        ...(toolCalls.length > 0 && { tool_calls: toolCalls }),
    });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Converts a LangChain message content value to Google Part[].
 * Handles: plain string, text blocks, base64 data URIs, and GCS/remote URIs.
 *
 * @param mimeTypeFallback - Optional MIME type from the parent message's
 *   additional_kwargs.mimeType, used when the content block itself carries no
 *   type information (e.g. a gs:// fileData URL with no data: prefix).
 */
function contentToParts(
    content: BaseMessage['content'],
    mimeTypeFallback?: string
): Part[] {
    if (typeof content === 'string') {
        return content.length > 0 ? [{ text: content }] : [];
    }

    return content.flatMap((block): Part[] => {
        if (block.type === 'text') {
            return block.text ? ([{ text: block.text }] as Part[]) : [];
        }

        if (block.type === 'image_url') {
            const url = (block as any).image_url?.url as string | undefined;
            if (!url) return [];

            if (url.startsWith('data:')) {
                // MIME type is encoded in the data URI header — ignore fallback
                const [header, data] = url.split(',');
                const mimeType = header.replace('data:', '').replace(';base64', '');
                return [{ inlineData: { data, mimeType } }];
            }

            // GCS URI (gs://) or remote URL → fileData.
            // Inject mimeType from additional_kwargs if available — Vertex AI
            // uses this to route the content correctly for non-JPEG image types.
            return [{
                fileData: {
                    fileUri: url,
                    ...(mimeTypeFallback ? { mimeType: mimeTypeFallback } : {}),
                },
            }];
        }

        console.warn('[message-converter] Unknown content block type, stringifying:', block.type);
        return [{ text: JSON.stringify(block) }];
    });
}

function coerceToString(content: BaseMessage['content']): string {
    return typeof content === 'string' ? content : JSON.stringify(content);
}

/** Builds a unique, readable tool call ID: `call_<functionName>_<8-char hex>` */
function buildCallId(functionName: string): string {
    const hex = Math.floor(Math.random() * 0xffffffff)
        .toString(16)
        .padStart(8, '0');
    return `call_${functionName}_${hex}`;
}

/**
 * Extracts the function name from a call ID produced by buildCallId.
 * `call_search_a3f1bc20` → `search`
 * Returns the full ID unchanged if the format doesn't match.
 */
function parseFunctionNameFromCallId(callId: string): string {
    const match = callId.match(/^call_(.+)_[0-9a-f]{8}$/);
    return match?.[1] ?? callId;
}