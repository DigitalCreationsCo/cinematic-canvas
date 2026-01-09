import { db } from "../shared/db";
import * as schema from "../shared/schema";
import { scenes, projects, characters, locations } from "../shared/schema";
import { eq, asc, inArray } from "drizzle-orm";
import { SceneSchema, Scene, ProjectSchema, ProjectMetadataSchema, CharacterSchema, Character, LocationSchema, Location, Project, InitialProject } from "../shared/types/pipeline.types";
import { GCPStorageManager } from "src/workflow/storage-manager";



export class ProjectRepository {

    async getProjects() {
        const allProjects = await db.select().from(projects);
        return allProjects;
    }

    async getProject(projectId: string) {
        const [ project ] = await db.select().from(projects).where(eq(projects.id, projectId));
        if (!project) throw new Error(`Project ${projectId} not found`);
        return project as Omit<Project, "characters" | "locations" | "scenes">;
    }

    async getProjectFullState(projectId: string): Promise<Project> {
        const project = await db.query.projects.findFirst({
            where: eq(projects.id, projectId),
            with: {
                scenes: {
                    orderBy: asc(scenes.sceneIndex),
                },
                characters: true,
                locations: true,
            },
        });

        if (!project) throw new Error(`Project ${projectId} not found`);

        const parsedScenes = project.scenes.map(record => {
            const parsedData = SceneSchema.parse(record.data);
            return {
                ...parsedData,
                id: record.id,
                sceneIndex: record.sceneIndex,
                status: record.status,
            };
        });

        return {
            ...project,
            scenes: parsedScenes,
            characters: project.characters.map(c => CharacterSchema.parse(c.data)),
            locations: project.locations.map(l => LocationSchema.parse(l.data)),
        } as unknown as Project;
    }


    async createProject(insertProject: typeof projects.$inferInsert): Promise<Project> {
        const [ project ] = await db.insert(projects).values(insertProject).returning();
        return project as Project;
    }

    async updateProject(projectId: string, data: Partial<InitialProject>): Promise<Project> {
        const update = await db.update(projects)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(projects.id, projectId));
        return update.rows[ 0 ];
    }

    async getScene(sceneId: string): Promise<Scene> {
        const [ record ] = await db.select().from(scenes).where(eq(scenes.id, sceneId));
        if (!record) throw new Error(`Scene ${sceneId} not found`);

        const parsedData = SceneSchema.parse(record.data);
        return {
            ...parsedData,
            id: record.id,
            sceneIndex: record.sceneIndex,
            status: record.status as any,
        };
    }

    async getProjectScenes(projectId: string, validate = true): Promise<Scene[]> {
        const records = await db.select()
            .from(scenes)
            .where(eq(scenes.projectId, projectId))
            .orderBy(asc(scenes.sceneIndex));

        return records.map(record => {
            let parsedData: Scene;
            parsedData = validate ? SceneSchema.parse(record.data) : record.data as Scene;
            return {
                ...parsedData,
                id: record.id as any,
                sceneIndex: record.sceneIndex,
                status: record.status as any,
            };
        });
    }

    async createScenes(projectId: string, scenesData: schema.InsertScene[]): Promise<Scene[]> {
        const rows = scenesData.map((scene, index) => ({
            projectId,
            sceneIndex: index, // preserving the order
            status: 'pending',
            data: { ...scene, sceneIndex: index } // we store the full scene object in data, including its logic ID and index
        }));

        let created: Scene[] = [];
        if (rows.length > 0) {
            created = await db.insert(scenes).values(rows).returning() as Scene[];
        }
        return created;
    }

    // FIX (HOW?)
    async updateSceneData(sceneId: string, data: Scene): Promise<Scene> {
        const validData = SceneSchema.parse(data);

        const [ scene ]: any = await db.update(scenes)
            .set({
                data: validData,
                updatedAt: new Date()
            })
            .where(eq(scenes.id, sceneId))
            .returning();
        return scene;
    }

    async updateSceneStatus(sceneId: string, status: string): Promise<Scene> {
        const [ scene ]: any = await db.update(scenes)
            .set({
                status,
                updatedAt: new Date()
            })
            .where(eq(scenes.id, sceneId))
            .returning();
        return scene;
    }

    async updateScenes(updates: Scene[]): Promise<Scene[]> {
        return await Promise.all(
            updates.map(async (scene) => {
                const [ row ]: any = await db.update(scenes)
                    .set(scene)
                    .where(eq(scenes.id, scene.id))
                    .returning();
                return row;
            })
        );
    }

    async getProjectCharacters(projectId: string): Promise<Character[]> {
        const records = await db.select().from(characters).where(eq(characters.projectId, projectId));
        return records.map(r => CharacterSchema.parse(r.data));
    }

    async getCharacters(ids: string[]): Promise<Character[]> {
        if (ids.length === 0) return [];
        const records = await db.select().from(characters).where(inArray(characters.id, ids));
        const map = new Map(records.map(r => [ r.id, r ]));
        return ids.map(id => map.get(id)).filter(r => !!r).map(r => CharacterSchema.parse(r!.data));
    }

    async createCharacters(projectId: string, charactersData: schema.InsertCharacter[]): Promise<Character[]> {
        const rows = charactersData.map(char => ({
            projectId,
            name: char.name,
            data: char
        }));

        let created: Character[] = [];
        if (rows.length > 0) {
            created = await db.insert(characters).values(rows).returning() as Character[];
        }
        return created;
    }

    async updateCharacters(updates: Character[]) {
        return await Promise.all(
            updates.map(async (char) => {
                const [ row ]: any = await db.update(characters)
                    .set(char)
                    .where(eq(characters.id, char.id))
                    .returning();
                return row;
            })
        );
    }

    async getProjectLocations(projectId: string): Promise<Location[]> {
        const records = await db.select().from(locations).where(eq(locations.projectId, projectId));
        return records.map(r => LocationSchema.parse(r.data));
    }

    async getLocations(ids: string[]): Promise<Location[]> {
        if (ids.length === 0) return [];
        const records = await db.select().from(locations).where(inArray(locations.id, ids));
        const map = new Map(records.map(r => [ r.id, r ]));
        return ids.map(id => map.get(id)).filter(r => !!r).map(r => LocationSchema.parse(r!.data));
    }

    async createLocations(projectId: string, locationsData: schema.InsertLocation[]): Promise<Location[]> {
        const rows = locationsData.map(loc => ({
            projectId,
            name: loc.name,
            data: loc
        }));

        let created: Location[] = [];
        if (rows.length > 0) {
            created = await db.insert(locations).values(rows).returning() as Location[];
        }
        return created;
    }

    async updateLocations(updates: Location[]) {
        return await Promise.all(
            updates.map(async (loc) => {
                const [ row ]: any = await db.update(locations)
                    .set(loc)
                    .where(eq(locations.id, loc.id))
                    .returning();
                return row;
            })
        );
    }
}
