import type { AppRouter } from "#shared/app-router/index.js";
import { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { TRPCClient } from "@trpc/client";
import { Mocked, vi } from "vitest";

const {
  mockWorldsList,
  mockProjectsList,
  mockUploadImage,
  mockUploadAudio,
  mockCreateAsset,
  mockCreateEntities,
  mockDeleteEntities,
  mockCreateSceneWithAutoFill,
  mockGetMentionSuggestions,
} = vi.hoisted(() => ({
  mockWorldsList: vi.fn(),
  mockProjectsList: vi.fn(),
  mockUploadImage: vi.fn(),
  mockUploadAudio: vi.fn(),
  mockCreateAsset: vi.fn(),
  mockCreateEntities: vi.fn(),
  mockDeleteEntities: vi.fn(),
  mockCreateSceneWithAutoFill: vi.fn(),
  mockGetMentionSuggestions: vi.fn().mockResolvedValue({ suggestions: [], totalAvailable: 0 }),
}));

const mockTrpcModule = await vi.hoisted(async () => {
  const mockMutate = vi.fn().mockResolvedValue({});
  const mockQuery = vi.fn().mockResolvedValue({});

  const trpc = {
    worlds: { list: { queryOptions: mockWorldsList } },
    projects: { list: { queryOptions: mockProjectsList } },
    assets: {
      uploadImage: { mutate: mockUploadImage },
      uploadAudio: { mutate: mockUploadAudio },
      create: { mutate: mockCreateAsset },
    },
    entities: {
      create: { mutate: mockCreateEntities },
      delete: { mutate: mockDeleteEntities },
      createSceneWithAutoFill: { mutate: mockCreateSceneWithAutoFill },
    },
    mention: {
      suggest: { query: mockGetMentionSuggestions },
    },
  } as unknown as Mocked<TRPCOptionsProxy<AppRouter>>;

  const trpcClient = {
    projects: {
      start: { mutate: mockMutate },
      stop: { mutate: mockMutate },
      resume: { mutate: mockMutate },
      regenerateScene: { mutate: mockMutate },
      regenerateFrame: { mutate: mockMutate },
      resolveIntervention: { mutate: mockMutate },
      requestState: { mutate: mockMutate },
      generateComposites: { mutate: mockMutate },
      create: { mutate: mockMutate },
      sceneAssets: { query: mockQuery },
      assets: { query: mockQuery },
      characterAssets: { query: mockQuery },
      locationAssets: { query: mockQuery },
      list: { query: mockQuery },
      command: { query: mockQuery },
    },
    assets: {
      generateCharacterImage: { mutate: mockMutate },
      generateLocationImage: { mutate: mockMutate },
      patch: { mutate: mockMutate },
    },
    entities: {
      patch: { mutate: mockMutate },
      delete: { mutate: mockMutate },
    },
    jobs: {
      list: { query: mockQuery },
    },
    mention: {
      resolve: { mutate: mockMutate },
      register: { mutate: mockMutate },
      unregister: { mutate: mockMutate },
      suggest: { query: mockQuery },
      getHandle: { query: mockQuery },
    },
  } as unknown as Mocked<TRPCClient<AppRouter>>;

  const supabase = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  };

  return {
    trpcClient,
    trpc,
    queryClient: {
      getDefaultOptions: vi.fn().mockReturnValue(true),
      getQueryData: vi.fn(),
      setQueryData: vi.fn(),
      invalidateQueries: vi.fn(),
      trpc,
      supabase,
    },
    supabase,
  };
});

vi.mock("#client/lib/trpc.js", () => mockTrpcModule);

const mockApiModuleWithTrpc = await vi.hoisted(async () => {
  const actual = await vi.importMock<typeof import("#client/lib/api.js")>("#client/lib/api.js");
  return actual;
});

vi.mock("#client/lib/api.js", () => mockApiModuleWithTrpc);

export const {
  confirmEntityNode,
  createEntityWithPendingNode,
  createProject,
  deleteEntity,
  fetchActiveJobsForProject,
  generateCharacterImage,
  generateComposites,
  generateLocationImage,
  getCharacterAssets,
  getCommandStatus,
  getLocationAssets,
  getMentionHandle,
  getMentionSuggestions,
  getProjectAssets,
  getProjects,
  getSceneAssets,
  patchAsset,
  patchEntities,
  regenerateFrame,
  regenerateScene,
  registerMentionHandle,
  requestFullState,
  resolveIntervention,
  resolveMentions,
  resumePipeline,
  startPipeline,
  stopPipeline,
  unregisterMentionHandle,
  api,
} = mockApiModuleWithTrpc;

// const {
//   mockUploadImage,
//   mockUploadAudio,
//   mockCreateAsset,
//   mockCreateEntities,
//   mockCreateSceneWithAutoFill,
//   mockGetSceneAssets,
//   mockGetCharacterAssets,
//   mockGetLocationAssets,
//   mockSetAssets,
//   mockAddNode,
//   mockCreateNode,
//   mockFileToBase64,
//   mockGetMentionSuggestions,
// } = vi.hoisted(() => ({
//   mockUploadImage: vi.fn(),
//   mockUploadAudio: vi.fn(),
//   mockCreateAsset: vi.fn(),
//   mockCreateEntities: vi.fn(),
//   mockCreateSceneWithAutoFill: vi.fn(),
//   mockGetSceneAssets: vi.fn(),
//   mockGetCharacterAssets: vi.fn(),
//   mockGetLocationAssets: vi.fn(),
//   mockSetAssets: vi.fn(),
//   mockAddNode: vi.fn(),
//   mockCreateNode: vi.fn(),
//   mockFileToBase64: vi.fn(),
//   mockGetMentionSuggestions: vi.fn().mockResolvedValue({ suggestions: [], totalAvailable: 0 }),
// }));

// export {
//   mockUploadImage,
//   mockUploadAudio,
//   mockCreateAsset,
//   mockCreateEntities,
//   mockCreateSceneWithAutoFill,
//   mockGetSceneAssets,
//   mockGetCharacterAssets,
//   mockGetLocationAssets,
//   mockSetAssets,
//   mockAddNode,
//   mockCreateNode,
//   mockFileToBase64,
//   mockGetMentionSuggestions,
// };

// vi.mock("#client/lib/api.js", async () => {
//   const { trpcClient } = await import("#client/lib/trpc.js");
//   return {
//     api: trpcClient,
//     getSceneAssets: trpcClient.projects.sceneAssets.query,
//     getCharacterAssets: trpcClient.projects.characterAssets.query,
//     getLocationAssets: trpcClient.projects.locationAssets.query,
//     getMentionSuggestions: trpcClient.mention.suggest.query,
//   };
// });

// vi.mock("./trpc.js", () => ({
//   trpcClient: {
//     projects: {
//       start: { mutate: mockMutate },
//       stop: { mutate: mockMutate },
//       resume: { mutate: mockMutate },
//       regenerateScene: { mutate: mockMutate },
//       regenerateFrame: { mutate: mockMutate },
//       resolveIntervention: { mutate: mockMutate },
//       requestState: { mutate: mockMutate },
//       generateComposites: { mutate: mockMutate },
//       create: { mutate: mockMutate },
//       sceneAssets: { query: mockQuery },
//       assets: { query: mockQuery },
//       characterAssets: { query: mockQuery },
//       locationAssets: { query: mockQuery },
//       list: { query: mockQuery },
//       command: { query: mockQuery },
//     },
//     assets: {
//       generateCharacterImage: { mutate: mockMutate },
//       generateLocationImage: { mutate: mockMutate },
//       patch: { mutate: mockMutate },
//     },
//     entities: {
//       patch: { mutate: mockMutate },
//       delete: { mutate: mockMutate },
//     },
//     jobs: {
//       list: { query: mockQuery },
//     },
//     mention: {
//       resolve: { mutate: mockMutate },
//       register: { mutate: mockMutate },
//       unregister: { mutate: mockMutate },
//       suggest: { query: mockQuery },
//       getHandle: { query: mockQuery },
//     },
//   },
// }));
