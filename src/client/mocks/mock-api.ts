import { vi } from "vitest";
import { createDeepMock } from "#shared/mocks/mock.utils.js";
import type { trpcClient as actualClient } from "#client/lib/trpc.js";

const {
  mockUploadImage,
  mockUploadAudio,
  mockCreateAsset,
  mockCreateEntities,
  mockCreateSceneWithAutoFill,
  mockGetSceneAssets,
  mockGetCharacterAssets,
  mockGetLocationAssets,
  mockSetAssets,
  mockAddNode,
  mockCreateNode,
  mockFileToBase64,
  mockGetMentionSuggestions,
} = vi.hoisted(() => ({
  mockUploadImage: vi.fn(),
  mockUploadAudio: vi.fn(),
  mockCreateAsset: vi.fn(),
  mockCreateEntities: vi.fn(),
  mockCreateSceneWithAutoFill: vi.fn(),
  mockGetSceneAssets: vi.fn(),
  mockGetCharacterAssets: vi.fn(),
  mockGetLocationAssets: vi.fn(),
  mockSetAssets: vi.fn(),
  mockAddNode: vi.fn(),
  mockCreateNode: vi.fn(),
  mockFileToBase64: vi.fn(),
  mockGetMentionSuggestions: vi.fn().mockResolvedValue({ suggestions: [], totalAvailable: 0 }),
}));

export {
  mockUploadImage,
  mockUploadAudio,
  mockCreateAsset,
  mockCreateEntities,
  mockCreateSceneWithAutoFill,
  mockGetSceneAssets,
  mockGetCharacterAssets,
  mockGetLocationAssets,
  mockSetAssets,
  mockAddNode,
  mockCreateNode,
  mockFileToBase64,
  mockGetMentionSuggestions,
};

vi.mock("#client/lib/api.js", async (originalImport) => {
  return {
    api: {
      assets: {
        uploadImage: { mutate: mockUploadImage },
        uploadAudio: { mutate: mockUploadAudio },
        create: { mutate: mockCreateAsset },
      },
      entities: {
        create: { mutate: mockCreateEntities },
        createSceneWithAutoFill: { mutate: mockCreateSceneWithAutoFill },
      },
      mention: {
        suggest: { query: mockGetMentionSuggestions },
      },
    },
    getSceneAssets: mockGetSceneAssets,
    getCharacterAssets: mockGetCharacterAssets,
    getLocationAssets: mockGetLocationAssets,
    getMentionSuggestions: mockGetMentionSuggestions,
  };
});

vi.mock("#client/lib/trpc.js", () => {
  return {
    trpcClient: createDeepMock<typeof actualClient>(),
    queryClient: {
      getQueryData: vi.fn(),
      setQueryData: vi.fn(),
      invalidateQueries: vi.fn(),

      trpc: createDeepMock(),
      supabase: {
        auth: {
          getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
          onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
        },
      },
    },
  };
});

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
