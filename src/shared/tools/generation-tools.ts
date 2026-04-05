import { db } from "../db/index.js";
import * as schema from "../db/schema.js";
import { generateId } from "#shared/utils/id.js";
import { TextModelController, Tool } from "../lm/text-model-controller.js";
import { Character, CharacterAttributes, Location, LocationAttributes, Scene, SceneAttributes } from "../types/index.js";
import { getJSONSchema } from "../utils/utils.js";
import { z } from "zod";

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

export class GenerationTools {
    private llm = new TextModelController();

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