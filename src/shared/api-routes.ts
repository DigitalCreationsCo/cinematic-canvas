const createRoute = (path: string) => Object.assign(() => path, { path });

const api = Object.assign(
  () => '',
  {
    base: createRoute(''),
    teams: Object.assign(
      () => '/teams',
      {
        joinOrCreate: createRoute('/teams/join-or-create'),
      }
    ),
    worlds: Object.assign(
      () => '/worlds',
      {
        list: createRoute('/worlds'),
        get: (worldId: string) => `/worlds/${worldId}`,
        entities: (worldId: string) => `/worlds/${worldId}/entities`,
        access: (worldId: string) => `/worlds/${worldId}/access`,
      }
    ),
    projects: Object.assign(
      () => '/projects',
      {
        list: createRoute('/projects'),
        get: (projectId: string) => `/project/${projectId}`,
        start: createRoute('/project/start'),
        stop: createRoute('/project/stop'),
        resume: (projectId: string) => `/project/${projectId}/resume`,
        regenerateScene: (projectId: string) => `/project/${projectId}/regenerate-scene`,
        regenerateFrame: (projectId: string) => `/project/${projectId}/regenerate-frame`,
        resolveIntervention: (projectId: string) => `/project/${projectId}/resolve-intervention`,
        generateComposites: (projectId: string) => `/project/${projectId}/generate-composites`,
        requestState: (projectId: string) => `/project/${projectId}/request-state`,
        command: (projectId: string, commandId: string) => `/project/${projectId}/command/${commandId}`,
        assets: (projectId: string) => `/project/${projectId}/assets`,
        sceneAssets: (projectId: string, sceneId: string) => `/project/${projectId}/scene/${sceneId}/assets`,
        characterAssets: (projectId: string, characterId: string) => `/project/${projectId}/character/${characterId}/assets`,
        locationAssets: (projectId: string, locationId: string) => `/project/${projectId}/location/${locationId}/assets`,
      }
    ),
    entities: Object.assign(
      () => '/entities',
      {
        list: createRoute('/entities'),
        patch: createRoute('/entities'),
        delete: (entityId: string) => `/entities/${entityId}`,
        generateFields: createRoute('/entities/generate-fields'),
        sceneFrameInput: (sceneId: string) => `/scenes/${sceneId}/frame-input`,
      }
    ),
    assets: Object.assign(
      () => '/assets',
      {
        list: createRoute('/assets'),
        get: (entityId: string) => `/assets/${entityId}`,
        patch: (entityId: string) => `/assets/${entityId}`,
        uploadAudio: createRoute('/upload-audio'),
        uploadImage: createRoute('/upload-image'),
        generateCharacterImage: createRoute('/generate-character-image'),
        generateLocationImage: createRoute('/generate-location-image'),
      }
    ),
    canvas: Object.assign(
      () => '/canvas',
      {
        get: (contextType: string, contextId: string) => `/canvas/${contextType}/${contextId}`,
        batch: (contextType: string, contextId: string) => `/canvas/${contextType}/${contextId}/batch`,
        delete: (contextType: string, contextId: string, entityId: string) => `/canvas/${contextType}/${contextId}/${entityId}`,
        confirmChanges: createRoute('/canvas/confirm-changes'),
      }
    ),
    events: Object.assign(
      () => '/events',
      {
        project: (projectId: string) => `/events/${projectId}`,
      }
    ),
    videos: Object.assign(
      () => '/videos',
      {
        list: createRoute('/videos'),
      }
    ),
    sac: Object.assign(
      () => '/sac',
      {
        worldRepo: (worldId: string) => `/sac/worlds/${worldId}/repo`,
        projectFork: (projectId: string) => `/sac/projects/${projectId}/fork`,
        repoCommit: (repoId: string) => `/sac/repos/${repoId}/commit`,
        repoCommits: (repoId: string) => `/sac/repos/${repoId}/commits`,
      }
    ),
  }
);

export default api;