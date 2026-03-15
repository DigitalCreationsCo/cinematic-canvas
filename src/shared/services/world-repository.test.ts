import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import * as schema from '../db/schema';
import { WorldRepository } from './world-repository';
import { v7 as uuidv7 } from 'uuid';
import { eq } from 'drizzle-orm';

describe('WorldRepository', () => {
    const worldRepository = new WorldRepository();
    let testUser: any;
    let testTeam: any;
    let testWorld: any;
  
    beforeEach(async () => {
      // Clean up the database before each test
      await db.delete(schema.usersToWorlds);
      await db.delete(schema.usersToTeams);
      await db.delete(schema.worlds);
      await db.delete(schema.teams);
      await db.delete(schema.users);
      await db.delete(schema.projects);
      await db.delete(schema.characters);
      await db.delete(schema.locations);

  
      // Create a test user and team
      testUser = { id: uuidv7(), email: 'test@example.com' };
      testTeam = { id: uuidv7(), name: 'Test Team' };
      await db.insert(schema.users).values(testUser);
      await db.insert(schema.teams).values(testTeam);
      await db.insert(schema.usersToTeams).values({
        userId: testUser.id,
        teamId: testTeam.id,
        role: 'owner',
      });
  
      // Create a test world
      testWorld = await worldRepository.createWorld({
        name: 'Test World',
        description: 'A world for testing',
        teamId: testTeam.id,
        userId: testUser.id,
      });
    });
  
    describe('createWorld', () => {
      it('should create a new world and associate it with the user', async () => {
        const worldName = 'New Test World';
        const worldDescription = 'A brand new world for testing';
  
        const newWorld = await worldRepository.createWorld({
          name: worldName,
          description: worldDescription,
          teamId: testTeam.id,
          userId: testUser.id,
        });
  
        expect(newWorld).toBeDefined();
        expect(newWorld.name).toBe(worldName);
        expect(newWorld.description).toBe(worldDescription);
  
        const userToWorld = await db.query.usersToWorlds.findFirst({
          where: eq(schema.usersToWorlds.worldId, newWorld.id),
        });
  
        expect(userToWorld).toBeDefined();
        expect(userToWorld?.userId).toBe(testUser.id);
      });
    });

    describe('getWorldsForUser', () => {
        it('should return all worlds associated with the user', async () => {
          const worlds = await worldRepository.getWorldsForUser(testUser.id);
    
          expect(worlds).toBeDefined();
          expect(worlds.length).toBe(1);
          expect(worlds[0].id).toBe(testWorld.id);
        });
      });

      describe('getWorldEntities', () => {
        it('should return all entities within a world', async () => {
          // Create a project in the test world
          const project = {
            id: uuidv7(),
            worldId: testWorld.id,
            name: 'Test Project',
            teamId: testTeam.id,
            storyboard: { scenes: [] },
            metadata: { title: "Test Project", logline: "A test project", totalScenes: 0, style: "cinematic", mood: "dark" }
          };
          await db.insert(schema.projects).values(project as any);
    
          // Create entities for the project
          const character = {
            id: uuidv7(),
            projectId: project.id,
            name: 'Test Character',
            description: 'A character for testing',
            referenceId: 'test-character',
            physicalTraits: {},
            state: {},
          };
          const location = {
            id: uuidv7(),
            projectId: project.id,
            name: 'Test Location',
            description: 'A location for testing',
            referenceId: 'test-location',
            type: 'indoor',
            mood: 'calm',
            lightingConditions: {},
            timeOfDay: 'day',
            weather: 'clear',
            colorPalette: [],
            architecture: [],
            naturalElements: [],
            manMadeObjects: [],
            groundSurface: 'wood',
            skyOrCeiling: 'ceiling',
            state: {},
          };
          await db.insert(schema.characters).values(character as any);
          await db.insert(schema.locations).values(location as any);
    
          const entities = await worldRepository.getWorldEntities(testWorld.id);
    
          expect(entities).toBeDefined();
          expect(entities.characters.length).toBe(1);
          expect(entities.locations.length).toBe(1);
          expect(entities.characters[0].id).toBe(character.id);
          expect(entities.locations[0].id).toBe(location.id);
        });
      });
});
