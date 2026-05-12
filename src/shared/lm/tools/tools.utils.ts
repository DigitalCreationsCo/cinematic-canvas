import { TextModelController } from "#shared/lm/text-model-controller.js";
import { VideoModelController } from "#shared/lm/video-model-controller.js";
import { AgentOptions } from "#shared/agents/agent.options.js";
import { GCPStorageManager } from "#shared/services/storage-manager.js";
import {
  SaveAssetsCallback,
  UpdateEntitiesCallback,
  IncrementAttemptHook,
  PipelineEvent,
} from "#shared/types/pipeline.types.js";
import { ProjectRepository } from "#shared/services/project-repository.js";

/**
 * Callback injected by the owning agent that publishes a pipeline event over
 * PubSub. The function is pre-bound with projectId / teamId / userId / worldId
 * so individual tools only need to supply type + payload.
 *
 * Usage inside a tool:
 *   await context.publishPipelineEvent?.({ type: "ENTITY_UPDATED", payload: [...] });
 */
export type PublishPipelineEventFn<T extends PipelineEvent["type"]> = (
  event: Omit<Extract<PipelineEvent, { type: T }>, "projectId" | "teamId" | "userId" | "timestamp"> &
    Partial<Pick<Extract<PipelineEvent, { type: T }>, "timestamp" | "payload">>,
) => Promise<void>;

export type ToolContext<T extends TextModelController | VideoModelController> = {
  provider: T;
  safetyRetries: number;
  storageManager: GCPStorageManager;
  projectRepository?: ProjectRepository;
  console: Console;
  traceId: string;
  projectId: string;
  worldId?: string;
  // teamId: string;
  // userId: string;
  options?: AgentOptions;
  /**
   * Optional callbacks injected by the owning agent.
   * Tools call these after results come back from the provider —
   * never during in-flight generation.
   */
  saveAssets?: SaveAssetsCallback;
  sendEntityUpdate?: UpdateEntitiesCallback;
  incrementAttempt?: IncrementAttemptHook;
  /**
   * Publish a pipeline event. The owning agent binds projectId / teamId / userId
   * before injecting this callback, so tools only supply type + payload.
   */
  publishPipelineEvent?: PublishPipelineEventFn;
};

/**
 * Returns true when a string contains substantive plain-text entity
 * descriptions beyond @mention handles or whitespace.
 */
export function needsEntityTextParsing(text: string): boolean {
  if (!text?.trim()) return false;
  const withoutHandles = text.replace(/@\w+/g, "").replace(/\s+/g, " ").trim();
  return withoutHandles.length > 2;
}

/** Returns a copy of an object with undefined / null / empty-string values removed. */
export function filterDefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  ) as Partial<T>;
}

/** Converts an entity name to a URL-safe reference id (without the @ prefix). */
export function nameToReferenceId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
