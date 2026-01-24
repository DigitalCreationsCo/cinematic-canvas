import {
    Scene, Character, Location, Project
} from "../types/workflow.types.js";
import {
    InsertProject,
    ProjectEntity
} from "../db/zod-db.js";
import { z } from "zod";



interface MapDBProjectToDomainProps {
    project: ProjectEntity,
    scenes?: Scene[],
    characters?: Character[],
    locations?: Location[],
}

/**
 * Maps a DB ProjectEntity + hydrated relations to a strict Project domain object.
 * Enforces ProjectSchema validation - throws if project is not fully hydrated.
 */
export function mapDbProjectToDomain({ project: entity, scenes = [], characters = [], locations = [] }: MapDBProjectToDomainProps): Project {
    const project: Project = {
        ...entity,
        scenes,
        characters,
        locations,
    };
    return Project.parse(project);
}

export function mapDomainProjectToInsertProjectDb(project: Project): z.infer<typeof InsertProject> {
    const { scenes, characters, locations, ...projectFields } = project;
    return InsertProject.parse({ ...projectFields });
}