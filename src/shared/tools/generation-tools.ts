import { db } from "../db/index.js";
import * as schema from "../db/schema.js";
import { generateId } from "#shared/utils/id.js";
import { TextModelController, Tool } from "../lm/text-model-controller.js";
import { Character, CharacterAttributes, Location, LocationAttributes, Scene, SceneAttributes } from "../types/index.js";
import { getJSONSchema } from "../utils/utils.js";
import { z } from "zod";
import { ProjectRepository } from "../services/project-repository.js";
import { KBHydrator } from "../services/sac/KBHydrator.js";
import { WorldRepository } from "../services/world-repository.js";

export const toolDefinitions: Tool[] = [
    {
        functionDeclarations: [
            {
                name: "generate_character",
                description: "Generates a new character with the given properties and saves it to the project.",
                parametersJsonSchema: CharacterAttributes,
            },
            {
                name: "generate_location",
                description: "Generates a new location with the given properties and saves it to the project.",
                parametersJsonSchema: LocationAttributes
            },
            {
                name: "generate_scene",
                description: "Generates a new scene with the given properties and saves it to the project.",
                parametersJsonSchema: SceneAttributes
            }
        ]
    },
];

// Schema for parsing character descriptions from plain text
const CharacterParseResult = z.object({
    characters: z.array(z.object({
        name: z.string(),
        description: z.string(),
    }))
});

// Schema for parsing location description from plain text
const LocationParseResult = z.object({
    location: z.object({
        name: z.string(),
        description: z.string(),
    })
});

// Extended scene fields type that includes characterIds and locationId
interface SceneFieldsWithIds extends Partial<SceneAttributes> {
    characterIds?: string[];
    locationId?: string;
}

export class GenerationTools {
    private llm = new TextModelController();
    private projectRepo = new ProjectRepository();
    private kbHydrator = new KBHydrator(new WorldRepository());

    /**
     * Parses plain text to extract character information.
     * Uses single LLM call to extract all characters from text.
     */
    private async parseCharactersFromText(text: string): Promise<{ name: string; description: string }[]> {
        const prompt = `
You are an expert creative writer specializing in analyzing narrative text.
Analyze the following text and extract ALL characters mentioned.

Text: "${text}"

For each character found:
1. Extract their name (e.g., "Big John", "Mary, the assistant")
2. Extract or infer a brief description based on context

Respond ONLY with a valid JSON object matching this schema:
{
  "characters": [
    { "name": "character name", "description": "brief description or inferred traits" }
  ]
}

If no characters are clearly identifiable, return an empty array.
`;

        const result = await this.llm.generateContent({
            model: this.llm.textModel,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                responseMimeType: 'application/json',
                responseSchema: getJSONSchema(CharacterParseResult)
            }
        });

        const textResult = result.text;
        if (!textResult) return [];

        const cleanText = textResult.replace(/```json\n?|\n?```/g, '');
        const parsed = CharacterParseResult.parse(JSON.parse(cleanText));
        return parsed.characters;
    }

    /**
     * Parses plain text to extract location information.
     */
    private async parseLocationFromText(text: string): Promise<{ name: string; description: string }> {
        const prompt = `
You are an expert creative writer specializing in analyzing narrative text.
Analyze the following text and extract location information.

Text: "${text}"

Extract:
1. Location name (e.g., "Enormous Warehouse", "Dark Beach")
2. Location description based on context clues

Respond ONLY with a valid JSON object matching this schema:
{
  "location": {
    "name": "location name",
    "description": "location description"
  }
}
`;

        const result = await this.llm.generateContent({
            model: this.llm.textModel,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                responseMimeType: 'application/json',
                responseSchema: getJSONSchema(LocationParseResult)
            }
        });

        const textResult = result.text;
        if (!textResult) return { name: '', description: '' };

        const cleanText = textResult.replace(/```json\n?|\n?```/g, '');
        const parsed = LocationParseResult.parse(JSON.parse(cleanText));
        return parsed.location;
    }

    /**
     * Auto-fill and generate characters from partial attributes.
     * Handles both @mention handles (via KBHydrator) and plain text descriptions.
     * Creates all characters in a single batch operation.
     */
    async autoFillCharacterAndGenerate(
        projectId: string,
        userId: string,
        characters: Partial<CharacterAttributes>[]
    ): Promise<Character[]> {
        if (characters.length === 0) return [];

        const charactersToCreate: Partial<CharacterAttributes>[] = [];

        for (const char of characters) {
            const referenceId = char.referenceId;
            
            if (referenceId && referenceId.startsWith('@')) {
                const handle = referenceId.substring(1);
                const htmlInput = `<span data-type="mention" data-handle="${handle}"></span>`;
                
                const hydrationResult = await this.kbHydrator.execute({
                    userId,
                    projectId,
                    htmlInput
                });

                if (hydrationResult.success && hydrationResult.prompt) {
                    const traitsMatch = hydrationResult.prompt.match(/Traits:\s*(.+?)(?:\n|$)/);
                    const nameMatch = hydrationResult.prompt.match(/Name:\s*(.+?)(?:\n|Traits)/);
                    
                    charactersToCreate.push({
                        ...char,
                        name: nameMatch?.[1]?.trim() || char.name || handle,
                        description: traitsMatch?.[1]?.trim() || char.description || '',
                    });
                } else {
                    charactersToCreate.push(char);
                }
            } else if (char.name && char.description) {
                charactersToCreate.push(char);
            } else if (char.name && !char.description) {
                const generated = await this.generateCharacterFields({
                    name: char.name,
                    description: char.description || ''
                });
                charactersToCreate.push({
                    ...char,
                    ...generated,
                    referenceId: char.referenceId || `${char.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`
                });
            }
        }

        if (charactersToCreate.length === 0) return [];

        const createdCharacters = await this.projectRepo.createCharacters(
            projectId,
            charactersToCreate as z.input<typeof import("../types/index.js").InsertCharacter>[]
        );

        return createdCharacters as Character[];
    }

    /**
     * Auto-fill and generate locations from partial attributes.
     * Handles both @mention handles (via KBHydrator) and plain text descriptions.
     */
    async autoFillLocationAndGenerate(
        projectId: string,
        userId: string,
        locations: Partial<LocationAttributes>[]
    ): Promise<Location[]> {
        if (locations.length === 0) return [];

        const locationsToCreate: Partial<LocationAttributes>[] = [];

        for (const loc of locations) {
            const referenceId = loc.referenceId;
            
            if (referenceId && referenceId.startsWith('@')) {
                const handle = referenceId.substring(1);
                const htmlInput = `<span data-type="mention" data-handle="${handle}"></span>`;
                
                const hydrationResult = await this.kbHydrator.execute({
                    userId,
                    projectId,
                    htmlInput
                });

                if (hydrationResult.success && hydrationResult.prompt) {
                    const traitsMatch = hydrationResult.prompt.match(/Traits:\s*(.+?)(?:\n|$)/);
                    const nameMatch = hydrationResult.prompt.match(/Name:\s*(.+?)(?:\n|Traits)/);
                    
                    locationsToCreate.push({
                        ...loc,
                        name: nameMatch?.[1]?.trim() || loc.name || handle,
                        description: traitsMatch?.[1]?.trim() || loc.description || '',
                    });
                } else {
                    locationsToCreate.push(loc);
                }
            } else if (loc.name && loc.description) {
                locationsToCreate.push(loc);
            } else if (loc.name && !loc.description) {
                const generated = await this.generateLocationFields({
                    name: loc.name,
                    description: loc.description || ''
                });
                locationsToCreate.push({
                    ...loc,
                    ...generated,
                    referenceId: loc.referenceId || `${loc.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`
                });
            }
        }

        if (locationsToCreate.length === 0) return [];

        const createdLocations = await this.projectRepo.createLocations(
            projectId,
            locationsToCreate as z.input<typeof import("../types/index.js").InsertLocation>[]
        );

        return createdLocations as Location[];
    }

    /**
     * Auto-fill and generate a scene with automatic character/location processing.
     * Parses @mention handles and plain text, creates needed entities, then creates scene.
     */
    async autoFillSceneAndGenerate(
        projectId: string,
        userId: string,
        sceneFields: SceneFieldsWithIds,
        existingCharacters: { referenceId: string; id: string }[],
        existingLocations: { referenceId: string; id: string }[]
    ): Promise<{ scene: Scene; createdCharacters: Character[]; createdLocations: Location[] }> {
        const createdCharacters: Character[] = [];
        const createdLocations: Location[] = [];

        let characterReferenceIds: string[] = sceneFields.characterReferenceIds || [];
        let characterIds: string[] = sceneFields.characterIds || [];
        let locationReferenceId = sceneFields.locationReferenceId;
        let locationId = sceneFields.locationId;

        const locationText = sceneFields.locationReferenceId || '';
        if (locationText && !locationText.startsWith('@')) {
            const parsed = await this.parseLocationFromText(locationText);
            if (parsed.name) {
                const newLocs = await this.autoFillLocationAndGenerate(projectId, userId, [{
                    name: parsed.name,
                    description: parsed.description,
                    referenceId: `loc_${parsed.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`
                }]);
                if (newLocs.length > 0) {
                    createdLocations.push(...newLocs);
                    locationId = newLocs[0].id;
                    locationReferenceId = newLocs[0].referenceId;
                }
            }
        } else if (locationText.startsWith('@')) {
            const handle = locationText.substring(1);
            const existingLoc = existingLocations.find(l => l.referenceId === handle);
            if (existingLoc) {
                locationId = existingLoc.id;
                locationReferenceId = handle;
            }
        }

        const characterText = sceneFields.characterReferenceIds?.join(' ') || '';
        const mentionHandles: string[] = [];
        const plainTextParts: string[] = [];
        
        if (sceneFields.characterReferenceIds) {
            for (const ref of sceneFields.characterReferenceIds) {
                if (ref.startsWith('@')) {
                    mentionHandles.push(ref.substring(1));
                } else {
                    plainTextParts.push(ref);
                }
            }
        }

        if (plainTextParts.length > 0) {
            const parsedCharacters = await this.parseCharactersFromText(plainTextParts.join(' '));
            if (parsedCharacters.length > 0) {
                const newChars = await this.autoFillCharacterAndGenerate(projectId, userId, 
                    parsedCharacters.map((c, i) => ({
                        name: c.name,
                        description: c.description,
                        referenceId: `char_${c.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`
                    }))
                );
                createdCharacters.push(...newChars);
                characterIds = [...characterIds, ...newChars.map(c => c.id)];
            }
        }

        for (const handle of mentionHandles) {
            const existingChar = existingCharacters.find(c => c.referenceId === handle);
            if (existingChar) {
                characterIds.push(existingChar.id);
            }
        }

        characterReferenceIds = characterIds.length > 0 
            ? [...new Set([...characterReferenceIds, ...createdCharacters.map(c => c.referenceId)])]
            : characterReferenceIds;

        const finalSceneFields: SceneFieldsWithIds = {
            ...sceneFields,
            characterReferenceIds,
            characterIds,
            locationId: locationId || undefined,
            locationReferenceId,
        };

        const generatedScene = await this.generateSceneFields(finalSceneFields as Record<string, unknown>);
        
        const sceneIndex = await this.projectRepo.getProjectScenes(projectId).then(
            scenes => scenes.length,
            () => 0
        );

        const insertSceneData = {
            ...generatedScene,
            ...finalSceneFields,
            sceneIndex,
        };

        const createdScenes = await this.projectRepo.createScenes(
            projectId,
            [insertSceneData as any]
        );

        return {
            scene: createdScenes[0] as Scene,
            createdCharacters,
            createdLocations
        };
    }

    async generateCharacterFields({ name, description, imageGcsUri, mimeType }: { name: string, description: string, imageGcsUri?: string, mimeType?: string }): Promise<Partial<Character>> {
        const prompt = `
            You are an expert creative writer and world builder.
            You need to generate a detailed character profile based on the following information.
            
            Name: ${name}
            Description: ${description}
            
            Please complete any missing fields or expand on the existing ones to make a rich, detailed character.
            Respond ONLY with a valid JSON object matching the Character schema.
        `;

        const parts: any[] = [{ text: prompt }];
        if (imageGcsUri && mimeType) {
            parts.push({ fileData: { mimeType, fileUri: imageGcsUri } });
        }

        const result = await this.llm.generateContent({
            model: this.llm.textModel,
            contents: [{ role: 'user', parts }],
            config: {
                tools: [],
                toolConfig: {},
                responseMimeType: 'application/json',
                responseSchema: getJSONSchema(CharacterAttributes)
            }
        });

        const text = result.text;
        if (!text) throw new Error("No text generated");

        const cleanText = text.replace(/```json\n?|\n?```/g, '');
        return JSON.parse(cleanText);
    }

    async generateCharacterImage({ name, description }: { name: string; description: string }): Promise<{ imageBytes: string; mimeType: string }> {
        const prompt = `
            You are an expert visual artist and character designer.
            You need to generate a character portrait image based on the following information.
            
            Name: ${name}
            Description: ${description}
            
            Create a detailed visual representation of this character that captures their essence, appearance, and personality.
            Focus on creating a clear, high-quality portrait that would be suitable for use in a cinematic production.
        `;

        try {
            const result = await this.llm.generateImages({
                model: this.llm.imageModel,
                prompt,
                config: {
                    numberOfImages: 1,
                    aspectRatio: "9:16",
                    imageSize: "1K",
                    outputMimeType: "image/png"
                }
            });

            if (!result.generatedImages || result.generatedImages.length === 0) {
                throw new Error("No images generated");
            }

            const generatedImage = result.generatedImages[0];
            if (!generatedImage?.image) {
                throw new Error("Generated image is missing");
            }

            return {
                imageBytes: generatedImage.image.imageBytes ?? '',
                mimeType: generatedImage.image.mimeType ?? 'image/png'
            };
        } catch (error) {
            console.error("Failed to generate character image:", error);
            throw error;
        }
    }

    async generateLocationFields({ name, description, imageGcsUri, mimeType }: { name: string, description: string, imageGcsUri?: string, mimeType?: string }): Promise<Partial<Location>> {
        const prompt = `
            You are an expert creative writer and world builder.
            You need to generate a detailed location profile based on the following information.
            
            Name: ${name}
            Description: ${description}
            
            Please complete any missing fields or expand on the existing ones to make a rich, detailed location.
            Respond ONLY with a valid JSON object matching the Location schema.
        `;

        const parts: any[] = [{ text: prompt }];
        if (imageGcsUri && mimeType) {
            parts.push({ fileData: { mimeType, fileUri: imageGcsUri } });
        }

        const result = await this.llm.generateContent({
            model: this.llm.textModel,
            contents: [{ role: 'user', parts }],
            config: {
                responseMimeType: 'application/json',
                responseSchema: getJSONSchema(LocationAttributes)
            }
        });

        const text = result.text;
        if (!text) throw new Error("No text generated");

        const cleanText = text.replace(/```json\n?|\n?```/g, '');
        return JSON.parse(cleanText);
    }

    async generateLocationImage({ name, description }: { name: string; description: string }): Promise<{ imageBytes: string; mimeType: string }> {
        const prompt = `
            You are an expert visual artist and location designer.
            You need to generate a location visualization image based on the following information.
            
            Name: ${name}
            Description: ${description}
            
            Create a detailed visual representation of this location that captures its atmosphere, setting, and key features.
            Focus on creating a clear, high-quality landscape or interior shot that would be suitable for use in a cinematic production.
        `;

        try {
            const result = await this.llm.generateImages({
                model: this.llm.imageModel,
                prompt,
                config: {
                    numberOfImages: 1,
                    aspectRatio: "16:9",
                    imageSize: "1K",
                    outputMimeType: "image/png"
                }
            });

            if (!result.generatedImages || result.generatedImages.length === 0) {
                throw new Error("No images generated");
            }

            const generatedImage = result.generatedImages[0];
            if (!generatedImage?.image) {
                throw new Error("Generated image is missing");
            }

            return {
                imageBytes: generatedImage.image.imageBytes ?? '',
                mimeType: generatedImage.image.mimeType ?? 'image/png'
            };
        } catch (error) {
            console.error("Failed to generate location image:", error);
            throw error;
        }
    }

    async generateSceneFields(currentFields: Record<string, unknown>, imageGcsUri?: string, mimeType?: string): Promise<Partial<Scene>> {
        const prompt = `
            You are an expert creative writer and film production specialist.
            You need to generate a detailed scene specification based on the following user-provided information.
            
            User provided fields:
            ${JSON.stringify(currentFields, null, 2)}
            
            Please complete any missing fields or expand on the existing ones to make a rich, detailed scene specification.
            Include all necessary cinematic details such as shot type, camera angle, camera movement, composition, lighting, transition type, etc.
            If timing fields (startTime, endTime, duration, sceneIndex) are provided, preserve them exactly as given.
            If character or location references are provided, include them in the output.
            Respond ONLY with a valid JSON object matching the Scene schema.
        `;

        const parts: any[] = [{ text: prompt }];
        if (imageGcsUri && mimeType) {
            parts.push({ fileData: { mimeType, fileUri: imageGcsUri } });
        }

        const result = await this.llm.generateContent({
            model: this.llm.textModel,
            contents: [{ role: 'user', parts }],
            config: {
                responseMimeType: 'application/json',
                responseSchema: getJSONSchema(SceneAttributes)
            }
        });

        const text = result.text;
        if (!text) throw new Error("No text generated");

        const cleanText = text.replace(/```json\n?|\n?```/g, '');
        return JSON.parse(cleanText);
    }
}