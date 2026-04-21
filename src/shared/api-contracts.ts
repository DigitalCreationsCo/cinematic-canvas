import { z } from 'zod';

export const apiContract = {
  teams: {
    list: { method: 'GET' as const, path: '/teams' },
    joinOrCreate: { method: 'POST' as const, path: '/teams/join-or-create', body: z.object({ name: z.string() }) },
  },
  worlds: {
    list: { method: 'GET' as const, path: '/worlds' },
    create: { method: 'POST' as const, path: '/worlds', body: z.object({ name: z.string(), description: z.string().optional() }) },
    get: { method: 'GET' as const, path: '/worlds/:worldId' },
    entities: { method: 'GET' as const, path: '/worlds/:worldId/entities' },
    access: { method: 'GET' as const, path: '/worlds/:worldId/access' },
  },
  projects: {
    list: { method: 'GET' as const, path: '/projects', query: z.object({ worldId: z.string().optional() }) },
    create: { method: 'POST' as const, path: '/projects', body: z.object({ title: z.string().optional(), initialPrompt: z.string().optional(), teamId: z.string() }) },
    get: { method: 'GET' as const, path: '/project/:projectId' },
    start: { method: 'POST' as const, path: '/project/start', body: z.object({ projectId: z.string(), initialPrompt: z.string().optional() }) },
    stop: { method: 'POST' as const, path: '/project/stop', body: z.object({ projectId: z.string() }) },
    resume: { method: 'POST' as const, path: '/project/:projectId/resume', body: z.object({ commandId: z.string().optional(), payload: z.any().optional() }) },
    requestState: { method: 'POST' as const, path: '/project/:projectId/request-state', body: z.object({ commandId: z.string().optional() }) },
    regenerateScene: { method: 'POST' as const, path: '/project/:projectId/regenerate-scene', body: z.object({ payload: z.object({ sceneId: z.string() }) }) },
    regenerateFrame: { method: 'POST' as const, path: '/project/:projectId/regenerate-frame', body: z.object({ payload: z.object({ sceneId: z.string(), assetKeys: z.array(z.string()) }) }) },
    resolveIntervention: { method: 'POST' as const, path: '/project/:projectId/resolve-intervention', body: z.object({ payload: z.object({ action: z.string() }) }) },
    generateComposites: { method: 'POST' as const, path: '/project/:projectId/generate-composites', body: z.object({ payload: z.object({ imageId: z.string(), inputImages: z.array(z.string()), prompt: z.string() }) }) },
    assets: { method: 'GET' as const, path: '/project/:projectId/assets' },
    sceneAssets: { method: 'GET' as const, path: '/project/:projectId/scene/:sceneId/assets' },
    characterAssets: { method: 'GET' as const, path: '/project/:projectId/character/:characterId/assets' },
    locationAssets: { method: 'GET' as const, path: '/project/:projectId/location/:locationId/assets' },
  },
  jobs: {
    list: { method: 'GET' as const, path: '/project/:projectId/jobs' },
    cancel: { method: 'DELETE' as const, path: '/project/:projectId/jobs/:jobId' },
  },
  entities: {
    list: { method: 'GET' as const, path: '/entities' },
    create: { method: 'POST' as const, path: '/entities', body: z.any() },
    patch: { method: 'PATCH' as const, path: '/entities', body: z.any() },
    delete: { method: 'DELETE' as const, path: '/entities/:entityId', body: z.object({ entityType: z.enum(['scene', 'character', 'location']) }) },
    generateFields: { method: 'POST' as const, path: '/entities/generate-fields', body: z.any() },
    createSceneWithAutoFill: { method: 'POST' as const, path: '/entities/create-scene-with-auto-fill', body: z.any() },
    sceneFrameInput: { method: 'POST' as const, path: '/scenes/:sceneId/frame-input', body: z.any() },
  },
  assets: {
    list: { method: 'GET' as const, path: '/assets' },
    create: { method: 'POST' as const, path: '/assets', body: z.any() },
    get: { method: 'GET' as const, path: '/assets/:entityId' },
    patch: { method: 'PATCH' as const, path: '/assets/:entityId', body: z.any() },
    uploadAudio: { method: 'POST' as const, path: '/upload-audio' },
    uploadImage: { method: 'POST' as const, path: '/upload-image' },
    generateCharacterImage: { method: 'POST' as const, path: '/generate-character-image', body: z.any() },
    generateLocationImage: { method: 'POST' as const, path: '/generate-location-image', body: z.any() },
  },
  canvas: {
    get: { method: 'GET' as const, path: '/canvas/:contextType/:contextId' },
    batch: { method: 'PUT' as const, path: '/canvas/:contextType/:contextId/batch', body: z.array(z.any()) },
    delete: { method: 'DELETE' as const, path: '/canvas/:contextType/:contextId/:entityId' },
    confirmChanges: { method: 'POST' as const, path: '/canvas/confirm-changes', body: z.any() },
  },
  events: { project: { method: 'GET' as const, path: '/events/:projectId' } },
  videos: { list: { method: 'GET' as const, path: '/videos' } },
  sac: {
    worldRepo: { method: 'POST' as const, path: '/sac/worlds/:worldId/repo' },
    projectFork: { method: 'POST' as const, path: '/sac/projects/:projectId/fork', body: z.object({ worldId: z.string() }) },
    repoCommit: { method: 'POST' as const, path: '/sac/repos/:repoId/commit', body: z.any() },
    repoCommits: { method: 'GET' as const, path: '/sac/repos/:repoId/commits' },
  },
  mention: {
    resolve: { method: 'POST' as const, path: '/entities/resolve', body: z.any() },
    suggest: { method: 'GET' as const, path: '/entities/:projectId/suggest', query: z.object({ query: z.string().optional(), limit: z.coerce.number().optional() }) },
    register: { method: 'POST' as const, path: '/entities/register', body: z.any() },
    unregister: { method: 'DELETE' as const, path: '/entities/:handle' },
    getHandle: { method: 'GET' as const, path: '/entities/:handle' },
  },
};

export type ApiContract = typeof apiContract;
export default apiContract;