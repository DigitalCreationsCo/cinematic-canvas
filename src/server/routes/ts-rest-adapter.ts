import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

export const apiContract = {
  teams: {
    list: { method: 'GET' as const, path: '/teams', responses: z.object({ teams: z.array(z.object({ id: z.string(), name: z.string() })) }) },
    joinOrCreate: { method: 'POST' as const, path: '/teams/join-or-create', body: z.object({ name: z.string().min(1) }), responses: z.object({ id: z.string(), name: z.string() }) },
  },
  worlds: {
    list: { method: 'GET' as const, path: '/worlds', responses: z.object({ worlds: z.array(z.object({ id: z.string(), name: z.string() })) }) },
    create: { method: 'POST' as const, path: '/worlds', body: z.object({ name: z.string(), description: z.string().optional() }), responses: z.object({ id: z.string(), name: z.string() }) },
    get: { method: 'GET' as const, path: '/worlds/:worldId', responses: z.object({ id: z.string(), name: z.string() }) },
    entities: { method: 'GET' as const, path: '/worlds/:worldId/entities', responses: z.any() },
    access: { method: 'GET' as const, path: '/worlds/:worldId/access', responses: z.object({ role: z.string(), licenseType: z.string() }) },
  },
  projects: {
    list: { method: 'GET' as const, path: '/projects', query: z.object({ worldId: z.string().optional() }), responses: z.object({ projects: z.array(z.object({ id: z.string(), title: z.string().optional(), createdAt: z.string() })) }) },
    create: { method: 'POST' as const, path: '/projects', body: z.object({ title: z.string().optional(), initialPrompt: z.string().optional(), teamId: z.string() }), responses: z.any() },
    get: { method: 'GET' as const, path: '/project/:projectId', responses: z.any() },
    start: { method: 'POST' as const, path: '/project/start', body: z.object({ commandId: z.string().optional(), projectId: z.string(), initialPrompt: z.string().optional() }), responses: z.object({ message: z.string(), projectId: z.string(), commandId: z.string() }) },
    stop: { method: 'POST' as const, path: '/project/stop', body: z.object({ commandId: z.string().optional(), projectId: z.string() }), responses: z.object({ message: z.string(), projectId: z.string(), commandId: z.string() }) },
    resume: { method: 'POST' as const, path: '/project/:projectId/resume', body: z.object({ commandId: z.string().optional(), payload: z.any().optional() }), responses: z.object({ message: z.string(), projectId: z.string(), commandId: z.string() }) },
    requestState: { method: 'POST' as const, path: '/project/:projectId/request-state', body: z.object({ commandId: z.string().optional() }), responses: z.object({ message: z.string(), projectId: z.string(), commandId: z.string() }) },
    regenerateScene: { method: 'POST' as const, path: '/project/:projectId/regenerate-scene', body: z.object({ payload: z.object({ sceneId: z.string() }) }), responses: z.object({ message: z.string(), projectId: z.string(), commandId: z.string() }) },
    regenerateFrame: { method: 'POST' as const, path: '/project/:projectId/regenerate-frame', body: z.object({ payload: z.object({ sceneId: z.string(), assetKeys: z.array(z.string()) }) }), responses: z.object({ message: z.string(), projectId: z.string(), commandId: z.string() }) },
    resolveIntervention: { method: 'POST' as const, path: '/project/:projectId/resolve-intervention', body: z.object({ payload: z.object({ action: z.string() }) }), responses: z.object({ message: z.string(), projectId: z.string(), commandId: z.string() }) },
    generateComposites: { method: 'POST' as const, path: '/project/:projectId/generate-composites', body: z.object({ payload: z.object({ imageId: z.string(), inputImages: z.array(z.string()), prompt: z.string() }) }), responses: z.object({ message: z.string(), projectId: z.string(), imageId: z.string(), commandId: z.string() }) },
    assets: { method: 'GET' as const, path: '/project/:projectId/assets', responses: z.any() },
    sceneAssets: { method: 'GET' as const, path: '/project/:projectId/scene/:sceneId/assets', responses: z.any() },
    characterAssets: { method: 'GET' as const, path: '/project/:projectId/character/:characterId/assets', responses: z.any() },
    locationAssets: { method: 'GET' as const, path: '/project/:projectId/location/:locationId/assets', responses: z.any() },
  },
  jobs: {
    list: { method: 'GET' as const, path: '/project/:projectId/jobs', responses: z.object({ jobs: z.array(z.object({ id: z.string(), type: z.string(), state: z.string(), projectId: z.string() })) }) },
    cancel: { method: 'DELETE' as const, path: '/project/:projectId/jobs/:jobId', responses: z.union([z.object({ success: z.literal(true) }), z.object({ error: z.string() })]) },
  },
  entities: {
    list: { method: 'GET' as const, path: '/entities', responses: z.any() },
    create: { method: 'POST' as const, path: '/entities', body: z.any(), responses: z.any() },
    patch: { method: 'PATCH' as const, path: '/entities', body: z.any(), responses: z.object({ success: z.literal(true) }) },
    delete: { method: 'DELETE' as const, path: '/entities/:entityId', body: z.object({ entityType: z.enum(['scene', 'character', 'location']) }), responses: z.object({ success: z.literal(true) }) },
    generateFields: { method: 'POST' as const, path: '/entities/generate-fields', body: z.any(), responses: z.any() },
    createSceneWithAutoFill: { method: 'POST' as const, path: '/entities/create-scene-with-auto-fill', body: z.any(), responses: z.object({ message: z.string(), projectId: z.string() }) },
    sceneFrameInput: { method: 'POST' as const, path: '/scenes/:sceneId/frame-input', body: z.any(), responses: z.any() },
  },
  assets: {
    list: { method: 'GET' as const, path: '/assets', responses: z.any() },
    create: { method: 'POST' as const, path: '/assets', body: z.any(), responses: z.object({ success: z.literal(true) }) },
    get: { method: 'GET' as const, path: '/assets/:entityId', responses: z.any() },
    patch: { method: 'PATCH' as const, path: '/assets/:entityId', body: z.any(), responses: z.object({ success: z.literal(true) }) },
    uploadAudio: { method: 'POST' as const, path: '/upload-audio', responses: z.object({ audioPublicUri: z.string(), audioGcsUri: z.string() }) },
    uploadImage: { method: 'POST' as const, path: '/upload-image', responses: z.object({ imagePublicUri: z.string(), imageGcsUri: z.string() }) },
    generateCharacterImage: { method: 'POST' as const, path: '/generate-character-image', body: z.any(), responses: z.object({ message: z.string(), characterIds: z.array(z.string()) }) },
    generateLocationImage: { method: 'POST' as const, path: '/generate-location-image', body: z.any(), responses: z.object({ message: z.string(), locationIds: z.array(z.string()) }) },
  },
  canvas: {
    get: { method: 'GET' as const, path: '/canvas/:contextType/:contextId', responses: z.any() },
    batch: { method: 'PUT' as const, path: '/canvas/:contextType/:contextId/batch', body: z.array(z.any()), responses: z.union([z.object({ success: z.literal(true), newVersions: z.record(z.string(), z.number()) }), z.object({ error: z.string() })]) },
    delete: { method: 'DELETE' as const, path: '/canvas/:contextType/:contextId/:entityId', responses: z.object({ success: z.literal(true) }) },
    confirmChanges: { method: 'POST' as const, path: '/canvas/confirm-changes', body: z.any(), responses: z.object({ success: z.literal(true), newVersions: z.record(z.string(), z.number()) }) },
  },
  events: { project: { method: 'GET' as const, path: '/events/:projectId', responses: z.any() } },
  videos: { list: { method: 'GET' as const, path: '/videos', responses: z.object({ success: z.literal(true), count: z.number(), data: z.array(z.any()) }) } },
  sac: {
    worldRepo: { method: 'POST' as const, path: '/sac/worlds/:worldId/repo', responses: z.object({ repoId: z.string(), repoUrl: z.string() }) },
    projectFork: { method: 'POST' as const, path: '/sac/projects/:projectId/fork', body: z.object({ worldId: z.string() }), responses: z.object({ forkId: z.string(), forkUrl: z.string() }) },
    repoCommit: { method: 'POST' as const, path: '/sac/repos/:repoId/commit', body: z.any(), responses: z.object({ commitId: z.string() }) },
    repoCommits: { method: 'GET' as const, path: '/sac/repos/:repoId/commits', responses: z.array(z.any()) },
  },
  mention: {
    resolve: { method: 'POST' as const, path: '/entities/resolve', body: z.any(), responses: z.any() },
    suggest: { method: 'GET' as const, path: '/entities/:projectId/suggest', query: z.object({ query: z.string().optional(), limit: z.coerce.number().optional() }), responses: z.any() },
    register: { method: 'POST' as const, path: '/entities/register', body: z.any(), responses: z.any() },
    unregister: { method: 'DELETE' as const, path: '/entities/:handle', responses: z.undefined() },
    getHandle: { method: 'GET' as const, path: '/entities/:handle', responses: z.union([z.object({ handle: z.string(), entityId: z.string(), entityType: z.string() }), z.object({ error: z.string() })]) },
  },
};

export type ApiContract = typeof apiContract;

export function validateRequest<T>(schema: { body?: z.ZodType<T>; query?: z.ZodType<any> }) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schema.body) {
        req.body = schema.body.parse(req.body);
      }
      if (schema.query) {
        req.query = schema.query.parse(req.query);
      }
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', details: error.issues });
      } else {
        next(error);
      }
    }
  };
}

export function contractResponse<T>(res: Response, status: number, body: T) {
  return res.status(status).json(body);
}

export default apiContract;