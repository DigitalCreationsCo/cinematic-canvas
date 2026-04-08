// src/shared/tools/generation-tools.ts
// Stateless LLM utility class. All DB I/O and orchestration live in WorkerService.

import { TextModelController, Tool } from "../lm/text-model-controller.js";
import {
    CharacterAttributes,
    LocationAttributes,
    SceneAttributes,
} from "../types/index.js";
import { getJSONSchema } from "../utils/utils.js";
import { z } from "zod";

// ─── Shared utilities ────────────────────────────────────────────────────────

/** Converts an entity name to a URL-safe reference id (without the @ prefix). */
export function toReferenceId(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Returns a copy of an object with undefined / null / empty-string values removed. */
function filterDefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
    return Object.fromEntries(
        Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== "")
    ) as Partial<T>;
}

// ─── Parse-result schemas ─────────────────────────────────────────────────────
// These are deliberately minimal: only `name` is required; every other field
// the LLM infers is welcomed but optional — generateAttributes fills the rest.

const CharacterParseResult = z.object({
    characters: z.array(
        z.object({ name: z.string() }).passthrough()
    ),
});

const LocationParseResult = z.object({
    location: z.object({ name: z.string() }).passthrough().nullable(),
});

// ─── Tool definitions (unchanged, preserved for consumers) ───────────────────

export const toolDefinitions: Tool[] = [
    {
        functionDeclarations: [
            {
                name: "generate_character",
                description: "Generates a new character with the given properties.",
                parametersJsonSchema: CharacterAttributes,
            },
            {
                name: "generate_location",
                description: "Generates a new location with the given properties.",
                parametersJsonSchema: LocationAttributes,
            },
            {
                name: "generate_scene",
                description: "Generates a new scene with the given properties.",
                parametersJsonSchema: SceneAttributes,
            },
        ],
    },
];

// ─── GenerationTools ─────────────────────────────────────────────────────────

export class GenerationTools {
    private llm = new TextModelController();

    // ── Static helpers ───────────────────────────────────────────────────────

    /**
     * Returns true when a string contains substantive plain-text entity
     * descriptions beyond @mention handles or whitespace.
     * Use as a gate before calling parseCharactersFromText / parseLocationFromText
     * to avoid unnecessary LLM calls.
     */
    static needsTextParsing(text: string): boolean {
        if (!text?.trim()) return false;
        const withoutHandles = text.replace(/@\w+/g, "").replace(/\s+/g, " ").trim();
        return withoutHandles.length > 2;
    }

    // ── Pass 1: Text Parsing ─────────────────────────────────────────────────

    /**
     * Parses plain text and returns one partial CharacterAttributes object per
     * distinct character found. Returns an empty array when none are identified.
     */
    async parseCharactersFromText(
        text: string
    ): Promise<Array<Partial<CharacterAttributes>>> {
        const prompt = `You are an expert creative writer.
Analyze the following text and extract ALL distinct characters mentioned.
For each character, extract their name and any attributes directly inferable from context.
Return an empty array if no clear characters are present.

Text: "${text}"

Respond ONLY with valid JSON matching the schema.`;

        const result = await this.llm.generateContent({
            model: this.llm.textModel,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
                responseMimeType: "application/json",
                responseSchema: getJSONSchema(CharacterParseResult),
            },
        });

        const raw = result.text?.replace(/```json\n?|\n?```/g, "") ?? '{"characters":[]}';
        const { characters } = CharacterParseResult.parse(JSON.parse(raw));
        return characters as Partial<CharacterAttributes>[];
    }

    /**
     * Parses plain text and returns a partial LocationAttributes object, or null
     * if no clear location is described.
     */
    async parseLocationFromText(
        text: string
    ): Promise<Partial<LocationAttributes> | null> {
        const prompt = `You are an expert creative writer.
Analyze the following text and extract location information.
Return null for the location field if no clear location is described.

Text: "${text}"

Respond ONLY with valid JSON matching the schema.`;

        const result = await this.llm.generateContent({
            model: this.llm.textModel,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
                responseMimeType: "application/json",
                responseSchema: getJSONSchema(LocationParseResult),
            },
        });

        const raw = result.text?.replace(/```json\n?|\n?```/g, "") ?? '{"location":null}';
        const { location } = LocationParseResult.parse(JSON.parse(raw));
        return location as Partial<LocationAttributes> | null;
    }

    // ── Pass 2: Attribute Generation ─────────────────────────────────────────

    /**
     * Produces a complete CharacterAttributes object from a partial.
     * Fields already set by the caller are preserved exactly — only missing
     * or empty fields are generated by the LLM.
     */
    async generateCharacterAttributes(
        partial: Partial<CharacterAttributes>,
        imageGcsUri?: string,
        mimeType?: string
    ): Promise<CharacterAttributes> {
        return this.generateAttributes(
            CharacterAttributes,
            partial,
            "character profile",
            imageGcsUri,
            mimeType
        );
    }

    /**
     * Produces a complete LocationAttributes object from a partial.
     */
    async generateLocationAttributes(
        partial: Partial<LocationAttributes>,
        imageGcsUri?: string,
        mimeType?: string
    ): Promise<LocationAttributes> {
        return this.generateAttributes(
            LocationAttributes,
            partial,
            "location profile",
            imageGcsUri,
            mimeType
        );
    }

    /**
     * Produces a complete SceneAttributes object from a partial.
     * Supply context (character names, location name) so the LLM can ground
     * cinematic details in the actual cast and setting.
     * Entity-relationship fields (characterReferenceIds, locationReferenceId,
     * characterIds, locationId) are NOT generated — they must be set by the caller.
     */
    async generateSceneAttributes(
        partial: Partial<SceneAttributes>,
        context?: { characterNames?: string[]; locationName?: string },
        imageGcsUri?: string,
        mimeType?: string
    ): Promise<SceneAttributes> {
        const contextHint = context
            ? `\nScene context — Characters: ${context.characterNames?.join(", ") || "unknown"}; Location: ${context.locationName || "unknown"}`
            : "";
        return this.generateAttributes(
            SceneAttributes,
            partial,
            `scene specification${contextHint}`,
            imageGcsUri,
            mimeType
        );
    }

    // ── Image Generation ─────────────────────────────────────────────────────

    /** Generates a portrait-orientation character image. */
    async generateCharacterImage(
        attrs: Partial<CharacterAttributes>
    ): Promise<{ imageBytes: string; mimeType: string }> {
        const prompt = `Cinematic character portrait.
Name: ${attrs.name ?? "Unknown"}
${attrs.description ? `Description: ${attrs.description}` : ""}
High quality, film production ready. Portrait orientation.`;
        return this.generateImage(prompt, "9:16");
    }

    /** Generates a landscape-orientation location image. */
    async generateLocationImage(
        attrs: Partial<LocationAttributes>
    ): Promise<{ imageBytes: string; mimeType: string }> {
        const prompt = `Cinematic location visualization.
Name: ${attrs.name ?? "Unknown"}
${attrs.description ? `Description: ${attrs.description}` : ""}
High quality, film production ready. Landscape orientation.`;
        return this.generateImage(prompt, "16:9");
    }

    // ── Private core ─────────────────────────────────────────────────────────

    /**
     * Unified attribute generation for any entity type.
     * The LLM fills ALL fields; then caller-supplied values overwrite the
     * generated ones — so user input is always preserved verbatim.
     */
    private async generateAttributes<T>(
        schema: z.ZodType<T>,
        partial: Partial<T>,
        entityDescription: string,
        imageGcsUri?: string,
        mimeType?: string
    ): Promise<T> {
        const alreadyFilled = Object.keys(
            filterDefined(partial as Record<string, unknown>)
        );

        const prompt = `You are an expert creative writer and world builder.
Complete the following ${entityDescription} by populating ONLY missing or empty fields.
DO NOT change these already-filled fields: ${alreadyFilled.length ? alreadyFilled.join(", ") : "(none — fill everything)"}.

Current (partial) data:
${JSON.stringify(partial, null, 2)}

Return ONLY valid JSON with ALL fields populated.
Preserve filled fields exactly. Fill missing fields with rich, specific, internally consistent creative content.`;

        const parts: any[] = [{ text: prompt }];
        if (imageGcsUri && mimeType) {
            parts.push({ fileData: { mimeType, fileUri: imageGcsUri } });
        }

        const responseSchema = getJSONSchema(schema);
        const result = await this.llm.generateContent({
            model: this.llm.textModel,
            contents: [{ role: "user", parts }],
            config: {
                responseMimeType: "application/json",
                responseSchema: responseSchema
            },
        });

        if (!result.text) throw new Error(`LLM returned no content for ${entityDescription}`);

        const generated = JSON.parse(result.text.replace(/```json\n?|\n?```/g, ""));

        // Caller-provided values always win over LLM output.
        const merged = { ...generated, ...filterDefined(partial as Record<string, unknown>) };
        return schema.parse(merged);
    }

    private async generateImage(
        prompt: string,
        aspectRatio: "9:16" | "16:9"
    ): Promise<{ imageBytes: string; mimeType: string }> {
        const result = await this.llm.generateImages({
            model: this.llm.imageModel,
            prompt,
            config: { numberOfImages: 1, aspectRatio, imageSize: "1K", outputMimeType: "image/png" },
        });

        const image = result.generatedImages?.[0]?.image;
        if (!image?.imageBytes) throw new Error("Image generation returned no output");

        return { imageBytes: image.imageBytes, mimeType: image.mimeType ?? "image/png" };
    }
}