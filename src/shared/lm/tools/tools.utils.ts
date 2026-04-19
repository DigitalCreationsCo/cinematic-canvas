import { TextModelController } from "#shared/lm/text-model-controller.js";
import { VideoModelController } from "#shared/lm/video-model-controller.js";
import { AgentOptions } from "#shared/agents/agent.options.js";
import { GCPStorageManager } from "#shared/services/storage-manager.js";

export type ToolContext<T extends TextModelController | VideoModelController> = {
    provider: T;
    safetyRetries: number;
    storageManager: GCPStorageManager;
    console: Console;
    traceId: string;
    projectId: string;
    options?: AgentOptions;
}

/**
    * Returns true when a string contains substantive plain-text entity
    * descriptions beyond @mention handles or whitespace.
    * Use as a gate before calling parseCharactersFromText / parseLocationFromText
    * to avoid unnecessary LLM calls.
    */
export function needsEntityTextParsing(text: string): boolean {
    if (!text?.trim()) return false;
    const withoutHandles = text.replace(/@\w+/g, "").replace(/\s+/g, " ").trim();
    return withoutHandles.length > 2;
}

/** Returns a copy of an object with undefined / null / empty-string values removed. */
export function filterDefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
    return Object.fromEntries(
        Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== "")
    ) as Partial<T>;
}

/** Converts an entity name to a URL-safe reference id (without the @ prefix). */
export function nameToReferenceId(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}