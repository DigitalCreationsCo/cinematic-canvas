// src/shared/tools/generation-tools.ts
import { Tool } from "../text-model-controller.js";
import {
    CharacterAttributes,
    LocationAttributes,
    SceneAttributes,
} from "../../types/index.js";

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