import {
    Character
} from "../types/workflow.types.js";
import {
    CharacterEntity,
    InsertCharacter
} from "../db/zod-db.js";
import { z } from "zod";



export function mapDbCharacterToDomain(entity: CharacterEntity): Character {
    return Character.parse(entity);
}

export function mapDomainCharacterToInsertCharacterDb(char: z.input<typeof InsertCharacter>): z.infer<typeof InsertCharacter> {
    return InsertCharacter.parse(char);
}