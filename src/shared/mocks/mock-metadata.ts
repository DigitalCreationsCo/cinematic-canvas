import { ProjectMetadata } from "#shared/types/metadata.types.js";
import { generateId } from "#shared/utils/id.js";

export const createMockProjectMetadata = (overrides?: Partial<ProjectMetadata>): ProjectMetadata => ({
  title: overrides?.title ?? "Test Project",
  // aspectRatio: overrides?.aspectRatio ?? "widescreen",
  duration: overrides?.duration ?? 60,
  // stylePreset: overrides?.stylePreset ?? "cinematic",
  initialPrompt: overrides?.initialPrompt ?? "A test creative project",
  enhancedPrompt: overrides?.enhancedPrompt ?? "An elaborated creative vision for testing",
  hasAudio: overrides?.hasAudio ?? false,
  audioGcsUri: overrides?.audioGcsUri,
  audioPublicUri: overrides?.audioPublicUri,
  bpm: overrides?.bpm ?? 0,
  keySignature: overrides?.keySignature ?? "",
  logline: overrides?.logline ?? "",
  totalScenes: overrides?.totalScenes ?? 0,
  style: overrides?.style ?? "",
  description: overrides?.description ?? "",
  colorPalette: overrides?.colorPalette ?? [],
  tags: overrides?.tags ?? [],
  projectId: overrides?.projectId ?? generateId(),
});
