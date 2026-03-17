const API_BASE = '/api';

const createRoute = (path: string) => Object.assign(() => path, { path });

const api = Object.assign(
  () => API_BASE,
  {
    base: createRoute(API_BASE),
    teams: Object.assign(
      () => `${API_BASE}/teams`,
      {
        joinOrCreate: createRoute(`${API_BASE}/teams/join-or-create`),
      }
    ),
    worlds: Object.assign(
      () => `${API_BASE}/worlds`,
      {
        list: createRoute(`${API_BASE}/worlds`),
        get: (worldId: string) => `${API_BASE}/worlds/${worldId}`,
        entities: (worldId: string) => `${API_BASE}/worlds/${worldId}/entities`,
        access: (worldId: string) => `${API_BASE}/worlds/${worldId}/access`,
      }
    ),
    projects: Object.assign(
      () => `${API_BASE}/projects`,
      {
        list: createRoute(`${API_BASE}/projects`),
        get: (projectId: string) => `${API_BASE}/project/${projectId}`,
        start: createRoute(`${API_BASE}/project/start`),
        stop: createRoute(`${API_BASE}/project/stop`),
        resume: (projectId: string) => `${API_BASE}/project/${projectId}/resume`,
        regenerateScene: (projectId: string) => `${API_BASE}/project/${projectId}/regenerate-scene`,
        regenerateFrame: (projectId: string) => `${API_BASE}/project/${projectId}/regenerate-frame`,
        resolveIntervention: (projectId: string) => `${API_BASE}/project/${projectId}/resolve-intervention`,
        requestState: (projectId: string) => `${API_BASE}/project/${projectId}/request-state`,
        command: (projectId: string, commandId: string) => `${API_BASE}/project/${projectId}/command/${commandId}`,
        assets: (projectId: string) => `${API_BASE}/project/${projectId}/assets`,
        sceneAssets: (projectId: string, sceneId: string) => `${API_BASE}/project/${projectId}/scene/${sceneId}/assets`,
        characterAssets: (projectId: string, characterId: string) => `${API_BASE}/project/${projectId}/character/${characterId}/assets`,
        locationAssets: (projectId: string, locationId: string) => `${API_BASE}/project/${projectId}/location/${locationId}/assets`,
      }
    ),
    entities: Object.assign(
      () => `${API_BASE}/entities`,
      {
        list: createRoute(`${API_BASE}/entities`),
        patch: createRoute(`${API_BASE}/entities`),
        generateFields: createRoute(`${API_BASE}/entities/generate-fields`),
        sceneFrameInput: (sceneId: string) => `${API_BASE}/scenes/${sceneId}/frame-input`,
      }
    ),
    assets: Object.assign(
      () => `${API_BASE}/assets`,
      {
        list: createRoute(`${API_BASE}/assets`),
        get: (entityId: string) => `${API_BASE}/assets/${entityId}`,
        patch: (entityId: string) => `${API_BASE}/assets/${entityId}`,
        uploadAudio: createRoute(`${API_BASE}/upload-audio`),
        uploadImage: createRoute(`${API_BASE}/upload-image`),
      }
    ),
    canvas: Object.assign(
      () => `${API_BASE}/canvas`,
      {
        get: (contextType: string, contextId: string) => `${API_BASE}/canvas/${contextType}/${contextId}`,
        batch: (contextType: string, contextId: string) => `${API_BASE}/canvas/${contextType}/${contextId}/batch`,
        delete: (contextType: string, contextId: string, entityId: string) => `${API_BASE}/canvas/${contextType}/${contextId}/${entityId}`,
        confirmChanges: createRoute(`${API_BASE}/canvas/confirm-changes`),
      }
    ),
    events: Object.assign(
      () => `${API_BASE}/events`,
      {
        project: (projectId: string) => `${API_BASE}/events/${projectId}`,
      }
    ),
    videos: Object.assign(
      () => `${API_BASE}/videos`,
      {
        list: createRoute(`${API_BASE}/videos`),
      }
    ),
    sac: Object.assign(
      () => `${API_BASE}/sac`,
      {
        worldRepo: (worldId: string) => `${API_BASE}/sac/worlds/${worldId}/repo`,
        projectFork: (projectId: string) => `${API_BASE}/sac/projects/${projectId}/fork`,
        repoCommit: (repoId: string) => `${API_BASE}/sac/repos/${repoId}/commit`,
        repoCommits: (repoId: string) => `${API_BASE}/sac/repos/${repoId}/commits`,
      }
    ),
  }
);

export default api;
