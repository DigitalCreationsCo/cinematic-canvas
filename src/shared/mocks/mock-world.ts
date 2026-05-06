import { World } from "#shared/types/schema.types.js";
import { generateId } from "#shared/utils/id.js";

export const createMockWorld = (overrides: Partial<World> = {}) => ({
  id: generateId(),
  teamId: generateId(),
  createdAt: new Date(),
  updatedAt: new Date(),
  name: "New World",
  description: "World description",
  worldRepository: "World Repository Name",
  sacRepoId: generateId(),
  sacRepoUrl: "sac repo url",
  ...overrides,
});
