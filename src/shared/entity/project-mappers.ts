import {
    Project,
    Scene, Character, Location,
    InsertProject,
    ProjectEntity,
    SceneEntity,
    CharacterEntity,
    LocationEntity,
    SceneWithAssets,
    CharacterWithAssets,
    LocationWithAssets
} from "../types/index.js";
import { projects } from "../db/schema.js";
import { z } from "zod";



type MapDBProjectToDomainProps = typeof projects.$inferSelect & {
    scenes?: SceneWithAssets[],
    characters?: CharacterWithAssets[],
    locations?: LocationWithAssets[],
}

/**
 * Maps a DB ProjectEntity + hydrated relations to a strict Project domain object.
 * Enforces ProjectSchema validation - throws if project is not fully hydrated.
 */
export function mapDbProjectToDomainProject({ scenes = [], characters = [], locations = [], ...entity }: MapDBProjectToDomainProps): Project {
    const project = {
        ...entity,
        scenes,
        characters,
        locations,
    };
    const parsed = JSON.parse(JSON.stringify(project));
    return Project.parse(parsed);
}

export function mapDomainProjectToInsertProject(project: z.input<typeof InsertProject>): InsertProject {
    return InsertProject.parse(project);
}