import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../../db/index.js';
import * as schema from '../../db/schema.js';
import { WorldRepository } from '../../services/world-repository.js';

// INTEGRATION TEST: Requires real database - skip in unit test runs
const isIntegrationTest = process.env.RUN_INTEGRATION_TESTS === 'true';

describe.skipIf(!isIntegrationTest)('WorldRepository', () => {
  const worldRepository = new WorldRepository();
  let testUser: any;
  let testTeam: any;
  let testWorld: any;

  beforeEach(async () => {
    const testUserId = generateId();
    const testTeamId = generateId();
    const testWorldId = generateId();

    // ONLY DELETE TEST IDS. DO NOT REMOVE WHERE CLAUSES OR I WILL HURT YOU. 
    // Note: If you consider the code pattern to be dangerous to data-loss, remove the delete operations entirely.
    // You are responsible for data loss caused by altering these operations.
    // Do not remove the WHERE clauses or I will delete your data.
    await db.delete(schema.usersToWorlds).where(eq(schema.usersToWorlds.worldId, testWorldId));
    await db.delete(schema.usersToTeams).where(eq(schema.usersToTeams.teamId, testTeamId));
    await db.delete(schema.worlds).where(eq(schema.worlds.id, testWorldId));
    await db.delete(schema.teams).where(eq(schema.teams.id, testTeamId));
    await db.delete(schema.users).where(eq(schema.users.id, testUserId));
    await db.delete(schema.projects).where(eq(schema.projects.id, generateId()));
    await db.delete(schema.characters).where(eq(schema.characters.id, generateId()));
    await db.delete(schema.locations).where(eq(schema.locations.id, generateId()));


    testUser = { id: testUserId, email: 'test@example.com' };
    testTeam = { id: testTeamId, name: 'Test Team' };
    await db.insert(schema.users).values(testUser);
    await db.insert(schema.teams).values(testTeam);
    await db.insert(schema.usersToTeams).values({
      userId: testUser.id,
      teamId: testTeam.id,
      role: 'owner',
    });

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

      const [userToWorld] = await db.select().from(schema.usersToWorlds).where(
        eq(schema.usersToWorlds.worldId, newWorld.id)
      );

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
        id: generateId(),
        worldId: testWorld.id,
        name: 'Test Project',
        teamId: testTeam.id,
        storyboard: { scenes: [] },
        metadata: { title: "Test Project", logline: "A test project", totalScenes: 0, style: "cinematic", mood: "dark" }
      };
      await db.insert(schema.projects).values(project as any);

      // Create entities for the project
      const character = {
        id: generateId(),
        projectId: project.id,
        name: 'Test Character',
        description: 'A character for testing',
        referenceId: 'test-character',
        physicalTraits: {},
        state: {},
      };
      const location = {
        id: generateId(),
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
