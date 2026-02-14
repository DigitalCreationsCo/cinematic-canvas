/**
 * content-utils.ts
 * Standalone utility for normalizing AI content inputs (Strings, Parts, Contents).
 */

// --- Types ---

export interface Part {
    text?: string;
    inlineData?: {
        mimeType: string;
        data: string;
    };
    functionCall?: {
        name: string;
        args: Record<string, unknown>;
    };
    functionResponse?: {
        name: string;
        response: Record<string, unknown>;
    };
    fileData?: {
        mimeType?: string;
        fileUri: string;
    };
    executableCode?: {
        language: string;
        code: string;
    };
    codeExecutionResult?: {
        outcome: string;
        output?: string;
    };
    [ key: string ]: unknown;
}

export interface Content {
    role?: string;
    parts: Part[];
}

// Input types that users might pass in
export type PartInput = Part | string;
export type PartListInput = PartInput | PartInput[];
export type ContentInput = Content | PartListInput;
export type ContentListInput = ContentInput | ContentInput[];

// --- Type Guards ---

function isContent(origin: unknown): origin is Content {
    return (
        origin !== null &&
        origin !== undefined &&
        typeof origin === 'object' &&
        'parts' in origin &&
        Array.isArray((origin as Content).parts)
    );
}

function isFunctionCallPart(origin: unknown): boolean {
    return (
        origin !== null &&
        origin !== undefined &&
        typeof origin === 'object' &&
        'functionCall' in origin
    );
}

function isFunctionResponsePart(origin: unknown): boolean {
    return (
        origin !== null &&
        origin !== undefined &&
        typeof origin === 'object' &&
        'functionResponse' in origin
    );
}

// --- Transformers ---

/**
 * Normalizes a single input into a Part object.
 * Strings are converted to text parts.
 */
export function normalizePart(origin?: PartInput | null): Part {
    if (origin === null || origin === undefined) {
        throw new Error('Part input is required');
    }
    if (typeof origin === 'string') {
        return { text: origin };
    }
    if (typeof origin === 'object') {
        return origin as Part;
    }
    throw new Error(`Unsupported part type: ${typeof origin}`);
}

/**
 * Normalizes an input (single or array) into an array of Part objects.
 */
export function normalizeParts(origin?: PartListInput | null): Part[] {
    if (
        origin === null ||
        origin === undefined ||
        (Array.isArray(origin) && origin.length === 0)
    ) {
        throw new Error('PartList input is required');
    }
    if (Array.isArray(origin)) {
        return origin.map((item) => normalizePart(item));
    }
    return [ normalizePart(origin) ];
}

/**
 * Normalizes an input into a Content object.
 * If the input is already Content, it returns it.
 * Otherwise, it wraps the input (Parts/Strings) in a user Content object.
 */
export function normalizeContent(origin?: ContentInput): Content {
    if (origin === null || origin === undefined) {
        throw new Error('Content input is required');
    }
    if (isContent(origin)) {
        return origin;
    }

    // Treat as parts and wrap in a User role
    return {
        role: 'user',
        parts: normalizeParts(origin as PartListInput),
    };
}

/**
 * The main entry point. Normalizes any input shape into an array of Content objects.
 * Handles:
 * - "Hello" -> [{ role: 'user', parts: [{ text: "Hello" }] }]
 * - [{ text: "Hi" }] -> [{ role: 'user', parts: [{ text: "Hi" }] }]
 * - { role: 'model', parts: [...] } -> [{ role: 'model', parts: [...] }]
 * - [ { role: 'user', ... }, { role: 'model', ... } ] -> returns as is
 */
export function normalizeContents(origin?: ContentListInput): Content[] {
    if (
        origin === null ||
        origin === undefined ||
        (Array.isArray(origin) && origin.length === 0)
    ) {
        throw new Error('Contents are required');
    }

    // 1. Handle non-array inputs (Single Content, Single Part, Single String)
    if (!Array.isArray(origin)) {
        // If it's a naked Function Call/Response part, it must be wrapped in Content explicitly by the caller
        // to avoid ambiguity about the role, though usually these are 'user' or 'function'.
        // The original logic throws here to enforce structure.
        if (isFunctionCallPart(origin) || isFunctionResponsePart(origin)) {
            throw new Error(
                'To specify functionCall or functionResponse parts, please wrap them in a Content object, specifying the role for them'
            );
        }
        return [ normalizeContent(origin) ];
    }

    // 2. Handle Array inputs
    const result: Content[] = [];
    const accumulatedParts: PartInput[] = [];

    // We need to determine if this is an array of Content objects or an array of Parts.
    // The original logic enforces that you cannot mix Content objects and bare Parts in the top-level array.
    const isContentArray = isContent(origin[ 0 ]);

    for (const item of origin) {
        const itemIsContent = isContent(item);

        if (itemIsContent !== isContentArray) {
            throw new Error(
                'Mixing Content objects and Parts/Strings in the top-level array is not supported. Please group parts into appropriate Content objects.'
            );
        }

        if (itemIsContent) {
            result.push(item as Content);
        } else if (isFunctionCallPart(item) || isFunctionResponsePart(item)) {
            // Original logic restriction: these specific parts shouldn't be loose in a generic array
            // if we are inferring roles.
            throw new Error(
                'To specify functionCall or functionResponse parts, please wrap them in Content objects with the correct role.'
            );
        } else {
            accumulatedParts.push(item as PartInput);
        }
    }

    // If we collected parts (strings/part objects), wrap them in a single User content block
    if (!isContentArray && accumulatedParts.length > 0) {
        result.push({ role: 'user', parts: normalizeParts(accumulatedParts) });
    }

    return result;
}