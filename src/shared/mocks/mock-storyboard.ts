import { Storyboard } from "#shared/types/workflow.types.js";
import { createMockProjectMetadata } from "#shared/mocks/mock-metadata.js";

export const createMockStoryboard = (overrides?: Partial<Storyboard>): Storyboard => ({
  metadata: createMockProjectMetadata(overrides?.metadata),
  scenes: overrides?.scenes ?? [],
  characters: overrides?.characters ?? [],
  locations: overrides?.locations ?? [],
});
