/**
 * Canonical API contract — single source of truth for routes, methods,
 * request/response schemas.  Replaces api-routes.ts + api-contracts.ts.
 *
 * Shared by client (initClient) and server (initServer / createExpressEndpoints).
 *
 * Install:
 *   npm install @ts-rest/core @ts-rest/express zod
 */

import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

// ---------------------------------------------------------------------------
// Reusable primitives
// ---------------------------------------------------------------------------

/** Tighten these as your API stabilises — start permissive, lock down later. */
const AnyJson = z.any();

const CommandResponse = z.object({
  projectId: z.string(),
  message: z.string(),
  commandId: z.string(),
});

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

export const contract = c.router({

  // ── Teams ────────────────────────────────────────────────────────────────
  teams: c.router({
    list: {
      method: 'GET',
      path: '/teams',
      responses: { 200: AnyJson },
    },
    joinOrCreate: {
      method: 'POST',
      path: '/teams/join-or-create',
      body: z.object({ name: z.string().min(1) }),
      responses: { 200: AnyJson },
    },
  }),

  // ── Worlds ───────────────────────────────────────────────────────────────
  worlds: c.router({
    list: {
      method: 'GET',
      path: '/worlds',
      responses: { 200: AnyJson },
    },
    create: {
      method: 'POST',
      path: '/worlds',
      body: z.object({
        name: z.string(),
        description: z.string().optional(),
      }),
      responses: { 200: AnyJson },
    },
    get: {
      method: 'GET',
      path: '/worlds/:worldId',
      pathParams: z.object({ worldId: z.string() }),
      responses: { 200: AnyJson },
    },
    entities: {
      method: 'GET',
      path: '/worlds/:worldId/entities',
      pathParams: z.object({ worldId: z.string() }),
      responses: { 200: AnyJson },
    },
    access: {
      method: 'GET',
      path: '/worlds/:worldId/access',
      pathParams: z.object({ worldId: z.string() }),
      responses: { 200: AnyJson },
    },
  }),

  // ── Projects ─────────────────────────────────────────────────────────────
  projects: c.router({
    list: {
      method: 'GET',
      path: '/projects',
      query: z.object({ worldId: z.string().optional() }),
      responses: {
        200: z.array(z.object({ id: z.string(), createdAt: z.string() })),
      },
    },
    create: {
      method: 'POST',
      path: '/projects',
      body: z.object({
        title: z.string().optional(),
        initialPrompt: z.string().optional(),
        teamId: z.string(),
        audioGcsUri: z.string().optional(),
        audioPublicUri: z.string().optional(),
        worldId: z.string().optional(),
      }),
      responses: { 200: AnyJson },
    },
    get: {
      method: 'GET',
      path: '/project/:projectId',
      pathParams: z.object({ projectId: z.string() }),
      responses: { 200: AnyJson },
    },
    start: {
      method: 'POST',
      path: '/project/start',
      body: z.object({
        projectId: z.string().optional(),
        initialPrompt: z.string().optional(),
      }),
      responses: { 200: CommandResponse },
    },
    stop: {
      method: 'POST',
      path: '/project/stop',
      body: z.object({ projectId: z.string() }),
      responses: { 200: CommandResponse },
    },
    resume: {
      method: 'POST',
      path: '/project/:projectId/resume',
      pathParams: z.object({ projectId: z.string() }),
      body: z.object({
        commandId: z.string().optional(),
        payload: z.any().optional(),
      }),
      responses: { 200: CommandResponse },
    },
    requestState: {
      method: 'POST',
      path: '/project/:projectId/request-state',
      pathParams: z.object({ projectId: z.string() }),
      body: z.object({ commandId: z.string().optional() }),
      responses: { 200: CommandResponse },
    },
    regenerateScene: {
      method: 'POST',
      path: '/project/:projectId/regenerate-scene',
      pathParams: z.object({ projectId: z.string() }),
      body: z.object({ payload: z.object({ sceneId: z.string() }) }),
      responses: { 200: CommandResponse },
    },
    regenerateFrame: {
      method: 'POST',
      path: '/project/:projectId/regenerate-frame',
      pathParams: z.object({ projectId: z.string() }),
      body: z.object({
        payload: z.object({
          sceneId: z.string(),
          assetKeys: z.array(z.string()),
        }),
      }),
      responses: { 200: CommandResponse },
    },
    resolveIntervention: {
      method: 'POST',
      path: '/project/:projectId/resolve-intervention',
      pathParams: z.object({ projectId: z.string() }),
      body: z.object({ payload: z.object({ action: z.string() }) }),
      responses: { 200: CommandResponse },
    },
    generateComposites: {
      method: 'POST',
      path: '/project/:projectId/generate-composites',
      pathParams: z.object({ projectId: z.string() }),
      body: z.object({
        payload: z.object({
          imageId: z.string(),
          inputImages: z.array(z.string()),
          prompt: z.string(),
        }),
      }),
      responses: {
        202: z.object({
          message: z.string(),
          projectId: z.string(),
          imageId: z.string(),
          commandId: z.string(),
        }),
      },
    },
    assets: {
      method: 'GET',
      path: '/project/:projectId/assets',
      pathParams: z.object({ projectId: z.string() }),
      responses: { 200: AnyJson },
    },
    sceneAssets: {
      method: 'GET',
      path: '/project/:projectId/scene/:sceneId/assets',
      pathParams: z.object({ projectId: z.string(), sceneId: z.string() }),
      responses: { 200: AnyJson },
    },
    characterAssets: {
      method: 'GET',
      path: '/project/:projectId/character/:characterId/assets',
      pathParams: z.object({
        projectId: z.string(),
        characterId: z.string(),
      }),
      responses: { 200: AnyJson },
    },
    locationAssets: {
      method: 'GET',
      path: '/project/:projectId/location/:locationId/assets',
      pathParams: z.object({
        projectId: z.string(),
        locationId: z.string(),
      }),
      responses: { 200: AnyJson },
    },
    command: {
      method: 'GET',
      path: '/project/:projectId/command/:commandId',
      pathParams: z.object({
        projectId: z.string(),
        commandId: z.string(),
      }),
      responses: { 200: AnyJson },
    },
  }),

  // ── Jobs ─────────────────────────────────────────────────────────────────
  jobs: c.router({
    list: {
      method: 'GET',
      path: '/project/:projectId/jobs',
      pathParams: z.object({ projectId: z.string() }),
      responses: { 200: AnyJson },
    },
    cancel: {
      method: 'DELETE',
      path: '/project/:projectId/jobs/:jobId',
      pathParams: z.object({ projectId: z.string(), jobId: z.string() }),
      // ts-rest requires an explicit body shape even for DELETE
      body: z.object({}),
      responses: {
        200: AnyJson,
        /** Job is RUNNING — cannot cancel */
        409: z.object({ error: z.string() }),
      },
    },
  }),

  // ── Entities ─────────────────────────────────────────────────────────────
  entities: c.router({
    list: {
      method: 'GET',
      path: '/entities',
      responses: { 200: AnyJson },
    },
    create: {
      method: 'POST',
      path: '/entities',
      body: AnyJson,
      responses: {
        202: z.object({
          message: z.string(),
          entityIds: z.array(z.string()),
        }),
      },
    },
    patch: {
      method: 'PATCH',
      path: '/entities',
      body: AnyJson,
      responses: { 200: AnyJson },
    },
    delete: {
      method: 'DELETE',
      path: '/entities/:entityId',
      pathParams: z.object({ entityId: z.string() }),
      body: z.object({
        entityType: z.enum(['scene', 'character', 'location']),
      }),
      responses: { 200: z.object({ success: z.boolean() }) },
    },
    generateFields: {
      method: 'POST',
      path: '/entities/generate-fields',
      body: AnyJson,
      responses: { 200: AnyJson },
    },
    createSceneWithAutoFill: {
      method: 'POST',
      path: '/entities/create-scene-with-auto-fill',
      body: AnyJson,
      responses: { 200: AnyJson },
    },
    sceneFrameInput: {
      method: 'POST',
      path: '/scenes/:sceneId/frame-input',
      pathParams: z.object({ sceneId: z.string() }),
      body: AnyJson,
      responses: { 200: AnyJson },
    },
  }),

  // ── Assets ───────────────────────────────────────────────────────────────
  assets: c.router({
    list: {
      method: 'GET',
      path: '/assets',
      responses: { 200: AnyJson },
    },
    get: {
      method: 'GET',
      path: '/assets/:entityId',
      pathParams: z.object({ entityId: z.string() }),
      responses: { 200: AnyJson },
    },
    patch: {
      method: 'PATCH',
      path: '/assets/:entityId',
      pathParams: z.object({ entityId: z.string() }),
      body: AnyJson,
      responses: { 200: AnyJson },
    },
    uploadAudio: {
      method: 'POST',
      path: '/upload-audio',
      contentType: 'multipart/form-data',
      body: c.type<{ audio: File }>(),
      responses: {
        200: z.object({
          audioPublicUri: z.string(),
          audioGcsUri: z.string(),
        }),
      },
    },
    uploadImage: {
      method: 'POST',
      path: '/upload-image',
      contentType: 'multipart/form-data',
      body: c.type<{ image: File }>(),
      responses: { 200: AnyJson },
    },
    generateCharacterImage: {
      method: 'POST',
      path: '/generate-character-image',
      body: z.object({
        projectId: z.string(),
        name: z.string(),
        description: z.string(),
      }),
      responses: {
        202: z.object({ message: z.string(), characterId: z.string() }),
      },
    },
    generateLocationImage: {
      method: 'POST',
      path: '/generate-location-image',
      body: z.object({
        projectId: z.string(),
        name: z.string(),
        description: z.string(),
      }),
      responses: {
        202: z.object({ message: z.string(), locationId: z.string() }),
      },
    },
  }),

  // ── Canvas ───────────────────────────────────────────────────────────────
  canvas: c.router({
    get: {
      method: 'GET',
      path: '/canvas/:contextType/:contextId',
      pathParams: z.object({
        contextType: z.string(),
        contextId: z.string(),
      }),
      responses: { 200: AnyJson },
    },
    batch: {
      method: 'PUT',
      path: '/canvas/:contextType/:contextId/batch',
      pathParams: z.object({
        contextType: z.string(),
        contextId: z.string(),
      }),
      body: z.array(z.any()),
      responses: { 200: AnyJson },
    },
    delete: {
      method: 'DELETE',
      path: '/canvas/:contextType/:contextId/:entityId',
      pathParams: z.object({
        contextType: z.string(),
        contextId: z.string(),
        entityId: z.string(),
      }),
      body: z.object({}),
      responses: { 200: AnyJson },
    },
    confirmChanges: {
      method: 'POST',
      path: '/canvas/confirm-changes',
      body: AnyJson,
      responses: { 200: AnyJson },
    },
  }),

  // ── Events / SSE ─────────────────────────────────────────────────────────
  events: c.router({
    project: {
      method: 'GET',
      path: '/events/:projectId',
      pathParams: z.object({ projectId: z.string() }),
      responses: { 200: AnyJson },
    },
  }),

  // ── Videos ───────────────────────────────────────────────────────────────
  videos: c.router({
    list: {
      method: 'GET',
      path: '/videos',
      responses: { 200: AnyJson },
    },
  }),

  // ── SAC ──────────────────────────────────────────────────────────────────
  sac: c.router({
    worldRepo: {
      method: 'POST',
      path: '/sac/worlds/:worldId/repo',
      pathParams: z.object({ worldId: z.string() }),
      body: AnyJson,
      responses: { 200: AnyJson },
    },
    projectFork: {
      method: 'POST',
      path: '/sac/projects/:projectId/fork',
      pathParams: z.object({ projectId: z.string() }),
      body: z.object({ worldId: z.string() }),
      responses: { 200: AnyJson },
    },
    repoCommit: {
      method: 'POST',
      path: '/sac/repos/:repoId/commit',
      pathParams: z.object({ repoId: z.string() }),
      body: AnyJson,
      responses: { 200: AnyJson },
    },
    repoCommits: {
      method: 'GET',
      path: '/sac/repos/:repoId/commits',
      pathParams: z.object({ repoId: z.string() }),
      responses: { 200: AnyJson },
    },
  }),

  // ── Mention / Tag registry ────────────────────────────────────────────────
  mention: c.router({
    resolve: {
      method: 'POST',
      path: '/entities/resolve',
      body: AnyJson,
      responses: { 200: AnyJson },
    },
    suggest: {
      method: 'GET',
      path: '/entities/:projectId/suggest',
      pathParams: z.object({ projectId: z.string() }),
      query: z.object({
        query: z.string().optional(),
        limit: z.coerce.number().optional(),
      }),
      responses: { 200: AnyJson },
    },
    register: {
      method: 'POST',
      path: '/entities/register',
      body: AnyJson,
      responses: { 200: AnyJson },
    },
    unregister: {
      method: 'DELETE',
      path: '/entities/handle/:handle',
      pathParams: z.object({ handle: z.string() }),
      body: z.object({}),
      responses: { 200: AnyJson },
    },
    getHandle: {
      method: 'GET',
      path: '/entities/handle/:handle',
      pathParams: z.object({ handle: z.string() }),
      responses: { 200: AnyJson, 404: AnyJson },
    },
  }),
});

export type AppContract = typeof contract;
export default contract;