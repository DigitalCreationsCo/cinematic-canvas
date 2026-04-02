// import { describe, it, expect, beforeEach, afterEach } from 'vitest';
// import { ProjectRepository } from '../services/project-repository.js';
// import { mapSceneWithAssetsToDomainScene } from '../types/entity.types.js';
// import { extractCharacterJoins } from '../entity/character-mappers.js';
// import { db } from '../db/index.js';
// import { Scene } from '../types/workflow.types.js';



// describe('Type Utilities', () => {
//     describe('extractCharacterJoins', () => {
//         it('should extract joins from single scene', () => {
//             const scenes = [
//                 { id: 'scene-1', characterIds: [ 'char-1', 'char-2' ] },
//             ] as Scene[];

//             const joins = extractCharacterJoins(scenes);

//             expect(joins).toEqual([
//                 { sceneId: 'scene-1', characterId: 'char-1' },
//                 { sceneId: 'scene-1', characterId: 'char-2' },
//             ]);
//         });

//         it('should extract joins from multiple scenes', () => {
//             const scenes = [
//                 { id: 'scene-1', characterIds: [ 'char-1' ] },
//                 { id: 'scene-2', characterIds: [ 'char-1', 'char-2' ] },
//             ] as Scene[];

//             const joins = extractCharacterJoins(scenes);

//             expect(joins).toEqual([
//                 { sceneId: 'scene-1', characterId: 'char-1' },
//                 { sceneId: 'scene-2', characterId: 'char-1' },
//                 { sceneId: 'scene-2', characterId: 'char-2' },
//             ]);
//         });

//         it('should handle scenes without characters', () => {
//             const scenes = [
//                 { id: 'scene-1', characterIds: [] },
//                 { id: 'scene-2' },
//             ] as unknown as Scene[];

//             const joins = extractCharacterJoins(scenes);

//             expect(joins).toEqual([]);
//         });

//         it('should handle empty array', () => {
//             const joins = extractCharacterJoins([]);
//             expect(joins).toEqual([]);
//         });
//     });

//     describe('mapSceneWithAssetsToDomainScene', () => {
//         it('should transform query result to domain model', () => {
//             const queryResult = {
//                 id: 'scene-1',
//                 sceneIndex: 0,
//                 description: 'Test scene',
//                 locationId: 'loc-1',
//                 characters: [
//                     { id: 'char-1' },
//                     { id: 'char-2' },
//                 ],
//                 // ... other scene fields
//             };

//             const domainScene = mapSceneWithAssetsToDomainScene(queryResult as any);

//             expect(domainScene.characterIds).toEqual([ 'char-1', 'char-2' ]);
//             expect(domainScene.id).toBe('scene-1');
//             expect(domainScene.locationId).toBe('loc-1');
//         });

//         it('should handle scene with no characters', () => {
//             const queryResult = {
//                 id: 'scene-1',
//                 characters: [],
//                 // ... other fields
//             };

//             const domainScene = mapSceneWithAssetsToDomainScene(queryResult as any);

//             expect(domainScene.characterIds).toEqual([]);
//         });
//     });
// });

// // ============================================================================
// // INTEGRATION TESTS - Repository Operations
// // ============================================================================

// describe('ProjectRepository Integration Tests', () => {
//     let repo: ProjectRepository;
//     let testProjectId: string;

//     beforeEach(async () => {
//         repo = new ProjectRepository();
//         // Create a test project
//         const project = await repo.createProject({
//             metadata: { title: 'Test Project' },
//             storyboard: {},
//         });
//         testProjectId = project.id;
//     });

//     afterEach(async () => {
//         // Cleanup: Delete test project (cascades to all related entities)
//         if (db) {
//             await db.delete(projects).where(eq(projects.id, testProjectId));
//         }
//     });

//     describe('Project Creation', () => {
//         it('should create project with characters, locations, and scenes', async () => {
//             const project = await repo.createProject({
//                 metadata: { title: 'Full Project' },
//                 storyboard: { /* ... */ },
//                 characters: [
//                     {
//                         id: 'char-1',
//                         referenceId: 'HERO',
//                         name: 'Hero',
//                         age: '30',
//                         physicalTraits: { /* ... */ },
//                         appearanceNotes: [],
//                         state: {},
//                     },
//                 ],
//                 locations: [
//                     {
//                         id: 'loc-1',
//                         referenceId: 'FOREST',
//                         name: 'Dark Forest',
//                         type: 'exterior',
//                         mood: 'ominous',
//                         timeOfDay: 'night',
//                         weather: 'foggy',
//                         lightingConditions: { /* ... */ },
//                         colorPalette: [ 'dark green', 'black' ],
//                         architecture: [],
//                         naturalElements: [ 'trees', 'fog' ],
//                         manMadeObjects: [],
//                         groundSurface: 'dirt',
//                         skyOrCeiling: 'overcast',
//                         state: {},
//                     },
//                 ],
//                 scenes: [
//                     {
//                         sceneIndex: 0,
//                         description: 'Hero enters forest',
//                         locationId: 'loc-1',
//                         characterIds: [ 'char-1' ],
//                         // ... other scene fields
//                     },
//                 ],
//             });

//             expect(project.characters).toHaveLength(1);
//             expect(project.locations).toHaveLength(1);
//             expect(project.scenes).toHaveLength(1);
//             expect(project.scenes[ 0 ].characterIds).toEqual([ 'char-1' ]);
//             expect(project.scenes[ 0 ].locationId).toBe('loc-1');
//         });

//         it('should handle project creation without relationships', async () => {
//             const project = await repo.createProject({
//                 metadata: { title: 'Minimal Project' },
//                 storyboard: { /* ... */ },
//             });

//             expect(project.characters).toEqual([]);
//             expect(project.locations).toEqual([]);
//             expect(project.scenes).toEqual([]);
//         });
//     });

//     describe('Relationship Management', () => {
//         it('should update scene character relationships', async () => {
//             // Setup
//             const initial = await repo.createProject({
//                 metadata: { title: 'Test' },
//                 storyboard: {},
//                 characters: [
//                     { id: 'char-1', name: 'A', /* ... */ },
//                     { id: 'char-2', name: 'B', /* ... */ },
//                 ],
//                 scenes: [
//                     { id: 'scene-1', characterIds: [ 'char-1' ], /* ... */ },
//                 ],
//             });

//             // Update to add second character
//             const updated = await repo.updateProject(initial.id, {
//                 scenes: [
//                     { id: 'scene-1', characterIds: [ 'char-1', 'char-2' ] },
//                 ],
//             });

//             expect(updated.scenes[ 0 ].characterIds).toEqual([ 'char-1', 'char-2' ]);

//             // Verify in database
//             const scene = await repo.getScene('scene-1');
//             expect(scene.characterIds).toEqual([ 'char-1', 'char-2' ]);
//         });

//         it('should handle removing all characters from scene', async () => {
//             const initial = await repo.createProject({
//                 metadata: { title: 'Test' },
//                 characters: [ { id: 'char-1', name: 'A', /* ... */ } ],
//                 scenes: [ { id: 'scene-1', characterIds: [ 'char-1' ], /* ... */ } ],
//             });

//             const updated = await repo.updateProject(initial.id, {
//                 scenes: [ { id: 'scene-1', characterIds: [] } ],
//             });

//             expect(updated.scenes[ 0 ].characterIds).toEqual([]);
//         });

//         it('should maintain referential integrity', async () => {
//             const project = await repo.createProject({
//                 metadata: { title: 'Test' },
//                 characters: [ { id: 'char-1', name: 'A', /* ... */ } ],
//                 locations: [ { id: 'loc-1', name: 'Location', /* ... */ } ],
//             });

//             // Try to create scene with non-existent character
//             await expect(
//                 repo.updateProject(project.id, {
//                     scenes: [ {
//                         sceneIndex: 0,
//                         characterIds: [ 'non-existent-char' ],
//                         locationId: 'loc-1',
//                         /* ... */
//                     } ],
//                 })
//             ).rejects.toThrow(); // Foreign key violation
//         });
//     });

//     describe('Concurrent Operations', () => {
//         it('should handle concurrent scene updates with locking', async () => {
//             const project = await repo.createProject({
//                 metadata: { title: 'Test' },
//                 scenes: [ { id: 'scene-1', mood: 'neutral', /* ... */ } ],
//             });

//             // Simulate two concurrent updates
//             const update1 = db!.transaction(async (tx) => {
//                 const scene = await repo.getSceneWithLock('scene-1', tx);
//                 // Simulate work
//                 await new Promise(resolve => setTimeout(resolve, 100));
//                 await tx.update(scenes)
//                     .set({ mood: 'dark' })
//                     .where(eq(scenes.id, 'scene-1'));
//             });

//             const update2 = db!.transaction(async (tx) => {
//                 const scene = await repo.getSceneWithLock('scene-1', tx);
//                 await tx.update(scenes)
//                     .set({ mood: 'light' })
//                     .where(eq(scenes.id, 'scene-1'));
//             });

//             await Promise.all([ update1, update2 ]);

//             // One should win (last write wins)
//             const final = await repo.getScene('scene-1');
//             expect([ 'dark', 'light' ]).toContain(final.mood);
//         });

//         it('should prevent deadlocks with sorted ID locking', async () => {
//             const project = await repo.createProject({
//                 metadata: { title: 'Test' },
//                 characters: [
//                     { id: 'char-1', name: 'A', /* ... */ },
//                     { id: 'char-2', name: 'B', /* ... */ },
//                 ],
//             });

//             // Two transactions locking characters in different order
//             const tx1 = db!.transaction(async (tx) => {
//                 // Locks in sorted order: char-1, char-2
//                 await repo.getCharactersWithLock([ 'char-2', 'char-1' ], tx);
//                 await new Promise(resolve => setTimeout(resolve, 100));
//             });

//             const tx2 = db!.transaction(async (tx) => {
//                 // Also locks in sorted order: char-1, char-2
//                 await repo.getCharactersWithLock([ 'char-1', 'char-2' ], tx);
//             });

//             // Should not deadlock
//             await expect(Promise.all([ tx1, tx2 ])).resolves.toBeDefined();
//         });
//     });

//     describe('Query Efficiency', () => {
//         it('should fetch minimal data for scene relationships', async () => {
//             const project = await repo.createProject({
//                 metadata: { title: 'Test' },
//                 characters: [
//                     {
//                         id: 'char-1',
//                         name: 'Hero',
//                         age: '30',
//                         physicalTraits: { /* large object */ },
//                         appearanceNotes: [ 'note 1', 'note 2', 'note 3' ],
//                         // ... many fields
//                     },
//                 ],
//                 scenes: [
//                     { id: 'scene-1', characterIds: [ 'char-1' ], /* ... */ },
//                 ],
//             });

//             // When getting scene, we should only fetch character IDs, not full objects
//             const scene = await repo.getScene('scene-1');

//             // Scene has character IDs
//             expect(scene.characterIds).toEqual([ 'char-1' ]);
//             // But scene object itself doesn't have full character data
//             expect((scene as any).characters).toBeUndefined();
//         });

//         it('should efficiently load full project state', async () => {
//             const numScenes = 10;
//             const numCharacters = 5;

//             const project = await repo.createProject({
//                 metadata: { title: 'Large Project' },
//                 characters: Array.from({ length: numCharacters }, (_, i) => ({
//                     id: `char-${i}`,
//                     name: `Character ${i}`,
//                     /* ... */
//                 })),
//                 scenes: Array.from({ length: numScenes }, (_, i) => ({
//                     id: `scene-${i}`,
//                     sceneIndex: i,
//                     characterIds: [ `char-${i % numCharacters}` ],
//                     /* ... */
//                 })),
//             });

//             const start = Date.now();
//             const fullState = await repo.getProjectFullState(project.id);
//             const duration = Date.now() - start;

//             expect(fullState.scenes).toHaveLength(numScenes);
//             expect(fullState.characters).toHaveLength(numCharacters);

//             // Should be fast (< 100ms for this small dataset)
//             expect(duration).toBeLessThan(100);
//         });
//     });

//     describe('Asset Management', () => {
//         it('should update assets for all entity types', async () => {
//             const project = await repo.createProject({
//                 metadata: { title: 'Test' },
//                 characters: [ { id: 'char-1', name: 'Hero', /* ... */ } ],
//                 locations: [ { id: 'loc-1', name: 'Forest', /* ... */ } ],
//                 scenes: [ { id: 'scene-1', /* ... */ } ],
//             });

//             // Update assets for each entity type
//             await repo.updateAssets('project', project.id, 'poster', {
//                 url: 'https://example.com/poster.jpg',
//             });
//             await repo.updateAssets('scene', 'scene-1', 'image', {
//                 url: 'https://example.com/scene.jpg',
//             });
//             await repo.updateAssets('character', 'char-1', 'portrait', {
//                 url: 'https://example.com/portrait.jpg',
//             });
//             await repo.updateAssets('location', 'loc-1', 'panorama', {
//                 url: 'https://example.com/panorama.jpg',
//             });

//             // Verify assets were stored
//             const updated = await repo.getProjectFullState(project.id);
//             expect(updated.assets.poster).toBeDefined();
//             expect(updated.scenes[ 0 ].assets.image).toBeDefined();
//             expect(updated.characters[ 0 ].assets.portrait).toBeDefined();
//             expect(updated.locations[ 0 ].assets.panorama).toBeDefined();
//         });

//         it('should merge assets without overwriting existing ones', async () => {
//             const project = await repo.createProject({
//                 metadata: { title: 'Test' },
//                 scenes: [ { id: 'scene-1', /* ... */ } ],
//             });

//             // Add first asset
//             await repo.updateAssets('scene', 'scene-1', 'image', { version: 1 });

//             // Add second asset
//             await repo.updateAssets('scene', 'scene-1', 'audio', { version: 1 });

//             // Both should exist
//             const scene = await repo.getScene('scene-1');
//             expect(scene.assets.image).toBeDefined();
//             expect(scene.assets.audio).toBeDefined();
//         });
//     });

//     describe('Error Handling', () => {
//         it('should throw on non-existent project', async () => {
//             await expect(
//                 repo.getProject('non-existent-id')
//             ).rejects.toThrow('not found');
//         });

//         it('should throw on non-existent scene', async () => {
//             await expect(
//                 repo.getScene('non-existent-id')
//             ).rejects.toThrow('not found');
//         });

//         it('should rollback transaction on error', async () => {
//             const project = await repo.createProject({
//                 metadata: { title: 'Test' },
//                 characters: [ { id: 'char-1', name: 'A', /* ... */ } ],
//             });

//             // Attempt update that will fail
//             try {
//                 await repo.updateProject(project.id, {
//                     scenes: [ {
//                         sceneIndex: 0,
//                         characterIds: [ 'non-existent' ],  // Invalid reference
//                         /* ... */
//                     } ],
//                 });
//             } catch (error) {
//                 // Expected to fail
//             }

//             // Verify nothing was changed
//             const unchanged = await repo.getProjectFullState(project.id);
//             expect(unchanged.scenes).toHaveLength(0);
//             expect(unchanged.characters).toHaveLength(1);
//         });
//     });
// });

// // ============================================================================
// // PERFORMANCE TESTS
// // ============================================================================

// describe('Performance Tests', () => {
//     let repo: ProjectRepository;

//     beforeEach(() => {
//         repo = new ProjectRepository();
//     });

//     it('should handle bulk scene creation efficiently', async () => {
//         const numScenes = 100;

//         const start = Date.now();
//         const project = await repo.createProject({
//             metadata: { title: 'Bulk Test' },
//             scenes: Array.from({ length: numScenes }, (_, i) => ({
//                 sceneIndex: i,
//                 description: `Scene ${i}`,
//                 /* ... */
//             })),
//         });
//         const duration = Date.now() - start;

//         expect(project.scenes).toHaveLength(numScenes);
//         console.log(`Created ${numScenes} scenes in ${duration}ms`);

//         // Should be reasonably fast (adjust threshold as needed)
//         expect(duration).toBeLessThan(5000);
//     });

//     it('should handle bulk character joins efficiently', async () => {
//         const numCharacters = 20;
//         const numScenes = 50;

//         const project = await repo.createProject({
//             metadata: { title: 'Join Test' },
//             characters: Array.from({ length: numCharacters }, (_, i) => ({
//                 id: `char-${i}`,
//                 name: `Character ${i}`,
//                 /* ... */
//             })),
//         });

//         const start = Date.now();
//         await repo.updateProject(project.id, {
//             scenes: Array.from({ length: numScenes }, (_, i) => ({
//                 sceneIndex: i,
//                 // Each scene has 3-5 characters
//                 characterIds: Array.from(
//                     { length: 3 + (i % 3) },
//                     (_, j) => `char-${(i + j) % numCharacters}`
//                 ),
//                 /* ... */
//             })),
//         });
//         const duration = Date.now() - start;

//         const updated = await repo.getProjectFullState(project.id);
//         expect(updated.scenes).toHaveLength(numScenes);

//         console.log(`Created ${numScenes} scenes with joins in ${duration}ms`);
//     });
// });

// // ============================================================================
// // SNAPSHOT TESTS (for regression testing)
// // ============================================================================

// describe('Snapshot Tests', () => {
//     it('should match expected structure for full project', async () => {
//         const repo = new ProjectRepository();

//         const project = await repo.createProject({
//             metadata: {
//                 title: 'Snapshot Test',
//                 director: 'Test Director',
//             },
//             storyboard: { /* ... */ },
//             characters: [
//                 {
//                     id: 'char-1',
//                     referenceId: 'HERO',
//                     name: 'Hero',
//                     /* ... */
//                 },
//             ],
//             locations: [
//                 {
//                     id: 'loc-1',
//                     referenceId: 'FOREST',
//                     name: 'Forest',
//                     /* ... */
//                 },
//             ],
//             scenes: [
//                 {
//                     id: 'scene-1',
//                     sceneIndex: 0,
//                     characterIds: [ 'char-1' ],
//                     locationId: 'loc-1',
//                     /* ... */
//                 },
//             ],
//         });

//         // Remove timestamps for stable snapshot
//         const snapshot = {
//             ...project,
//             createdAt: undefined,
//             updatedAt: undefined,
//             scenes: project.scenes.map(s => ({
//                 ...s,
//                 createdAt: undefined,
//                 updatedAt: undefined,
//             })),
//             characters: project.characters.map(c => ({
//                 ...c,
//                 createdAt: undefined,
//                 updatedAt: undefined,
//             })),
//             locations: project.locations.map(l => ({
//                 ...l,
//                 createdAt: undefined,
//                 updatedAt: undefined,
//             })),
//         };

//         expect(snapshot).toMatchSnapshot();
//     });
// });