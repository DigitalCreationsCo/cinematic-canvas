import {
  CharacterCondensed,
  LocationCondensed,
  SceneCondensed,
  LiveStoryboard,
  Storyboard,
} from "#shared/types/storyboard.types.js";
import { createMockProjectMetadata } from "#shared/mocks/mock-metadata.js";
import { ProjectMetadata } from "#shared/types/metadata.types.js";

export const createMockStoryboard = (overrides?: Partial<Storyboard>): Storyboard => ({
  metadata: createMockProjectMetadata(overrides?.metadata),
  scenes: overrides?.scenes ?? [],
  characters: overrides?.characters ?? [],
  locations: overrides?.locations ?? [],
});

export function createMockStoryboardLive(
  overrides: {
    metadata?: Partial<ProjectMetadata>;
    characters?: CharacterCondensed[];
    locations?: LocationCondensed[];
    scenes?: SceneCondensed[];
  } = {},
): LiveStoryboard {
  return {
    metadata: createMockProjectMetadata(overrides.metadata),
    characters: overrides.characters ?? [],
    locations: overrides.locations ?? [],
    scenes: overrides.scenes ?? [],
  };
}
