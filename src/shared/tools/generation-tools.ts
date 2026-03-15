import { db } from "../db/index.js";
import * as schema from "../db/schema.js";
import { v7 as uuidv7 } from "uuid";
import { TextModelController } from "../lm/text-model-controller.js";
import { Character, Location } from "../types/workflow.types.js";
import { getJSONSchema } from "../utils/utils.js";
import { z } from "zod";

export const toolDefinitions = [
    {
        name: "generate_character",
        description: "Generates a new character with the given properties and saves it to the project.",
        input_schema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "The ID of the project to add the character to." },
                name: { type: "string", description: "The name of the character." },
                description: { type: "string", description: "A description of the character." },
            },
            required: ["projectId", "name", "description"],
        }
    },
    {
        name: "generate_location",
        description: "Generates a new location with the given properties and saves it to the project.",
        input_schema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "The ID of the project to add the location to." },
                name: { type: "string", description: "The name of the location." },
                description: { type: "string", description: "A description of the location." },
            },
            required: ["projectId", "name", "description"],
        }
    }
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
                responseMimeType: 'application/json',
                responseSchema: getJSONSchema(Character)
            }
        });

        const text = result.text;
        if (!text) throw new Error("No text generated");
        
        const cleanText = text.replace(/```json\n?|\n?```/g, '');
        return JSON.parse(cleanText);
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
                responseSchema: getJSONSchema(Location)
            }
        });

        const text = result.text;
        if (!text) throw new Error("No text generated");

        const cleanText = text.replace(/```json\n?|\n?```/g, '');
        return JSON.parse(cleanText);
    }
}
