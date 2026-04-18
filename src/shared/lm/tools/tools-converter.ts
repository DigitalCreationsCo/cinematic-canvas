/**
 * Converts LangChain StructuredTool definitions (Zod-based) to Google GenAI
 * FunctionDeclaration format for use in generateContent config.tools.
 *
 * Define tools once using LangChain's `tool()` helper — they work with any
 * LangGraph ToolNode, and are converted to Google's native function-calling
 * format here when bound to GoogleChatModel via bindTools().
 *
 * Switching providers in future only requires a different converter;
 * tool definitions and graph code remain unchanged.
 *
 * Requires: pnpm add zod-to-json-schema
 */

import type { StructuredToolInterface } from '@langchain/core/tools';
import { TextModelProviderName, Tool } from '#shared/lm/provider.js';
import { convertToolsToGoogleFunctions } from '#shared/lm/google/tools-converter.js';

// ─── Public API ──────────────────────────────────────────────────────────────

export function buildProviderTools(
    tools: StructuredToolInterface[],
    provider: TextModelProviderName
): Tool[] {
    switch (provider) {
        case 'google':
        default:
            return [{ functionDeclarations: convertToolsToGoogleFunctions(tools) }];
    }
}