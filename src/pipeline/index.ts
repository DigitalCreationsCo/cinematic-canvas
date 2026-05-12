// src/pipeline/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cinematic Canvas – Pipeline Domain
//
// Supports two execution modes:
//   1. Monolith  – called via initializePipeline({ eventBus, poolManager, lockManager })
//   2. Distributed – run directly; bootstraps its own PubSubEventBus + resources
// ─────────────────────────────────────────────────────────────────────────────
import * as dotenv from "dotenv";
dotenv.config();

import * as fs from "node:fs/promises";
import * as path from "node:path";

import { ApiError as StorageApiError } from "@google-cloud/storage";

import { IEventBus } from "#shared/messaging/event-bus.types.js";
import { SUBSCRIPTION_NAMES } from "#shared/config.js";
import {
  PipelineCommand,
  PipelineEvent,
  ChatStreamChunkEvent,
  ChatMessageEvent,
} from "#shared/types/pipeline.types.js";
import { JobEvent } from "#shared/types/job.types.js";

import { CheckpointerManager } from "#pipeline/checkpointer-manager.js";
import { WorkflowOperator } from "#pipeline/workflow-service.js";
import { CinematicVideoWorkflow } from "#pipeline/graph.js";
import { PipelineCommandHandler } from "#pipeline/pipeline-command-handler.js";

import { PoolManager } from "#shared/services/pool-manager.js";
import { DistributedLockManager } from "#shared/services/lock-manager.js";
import { JobControlPlane } from "#shared/services/job-control-plane.js";
import { JobLifecycleMonitor } from "#shared/services/job-lifecycle-monitor.js";
import { ProjectRepository } from "#shared/services/project-repository.js";
import { GCPStorageManager } from "#shared/services/storage-manager.js";
import { MediaGarbageCollector } from "#shared/services/media-garbage-collector.js";
import { getSacGitService } from "#shared/services/sac/SacGitServiceStub.js";
import { ChatAgent, createChatAgent } from "#shared/services/chat-agent.js";
import { chatService } from "#shared/services/chat-service.js";

import { generateId } from "#shared/utils/id.js";
import { initLogger, logContextStore, LogContext } from "#shared/logger/index.js";
import { getPool, initializeDatabase } from "#shared/db/index.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { PipelineEventHandler } from "#pipeline/pipeline-event-handler.js";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface PipelineDependencies {
  eventBus: IEventBus;
  poolManager: PoolManager;
  lockManager: DistributedLockManager;
}

export interface PipelineHandle {
  stop(): Promise<void>;
}

// ─── Core initialiser (Monolith + Distributed shared logic) ──────────────────
export async function initializePipeline(deps: PipelineDependencies): Promise<PipelineHandle> {
  const { eventBus, poolManager, lockManager } = deps;

  const pipelineInstanceId = generateId();
  const logContext: LogContext = {
    w_id: pipelineInstanceId,
    correlationId: generateId(),
    shouldPublish: false,
  };

  console.log({ pipelineInstanceId }, "[Pipeline] Initialising pipeline domain...");

  // ── Infrastructure ──────────────────────────────────────────────────────
  const gcpProjectId = process.env.GOOGLE_CLOUD_PROJECT;
  if (!gcpProjectId) throw new Error("[Pipeline] GOOGLE_CLOUD_PROJECT is not set.");

  const bucketName = process.env.GOOGLE_CLOUD_BUCKET;
  if (!bucketName) throw new Error("[Pipeline] GOOGLE_CLOUD_BUCKET is not set.");

  const postgresUrl = process.env.POSTGRES_URL;
  if (!postgresUrl) throw new Error("[Pipeline] POSTGRES_URL is not set.");

  // ── Domain services ─────────────────────────────────────────────────────

  const checkpointerManager = new CheckpointerManager({ pool: getPool() });
  await checkpointerManager.init();
  console.debug("[Pipeline] CheckpointerManager initialised.");

  await lockManager.init();
  console.debug("[Pipeline] LockManager initialised.");

  // Thin wrappers so domain services call eventBus instead of raw PubSub
  const publishJobEventViaEventBus = (eventPayload: JobEvent): Promise<string> =>
    eventBus.publishJobEvent(eventPayload);

  const publishPipelineEventViaEventBus = (eventPayload: PipelineEvent): Promise<string> =>
    eventBus.publishPipelineEvent(eventPayload);

  const jobControlPlane = new JobControlPlane(poolManager, publishJobEventViaEventBus);

  const jobLifecycleMonitor = JobLifecycleMonitor.getInstance(jobControlPlane);
  jobLifecycleMonitor.start();
  console.debug("[Pipeline] JobLifecycleMonitor started.");

  const storageManagerGcp = new GCPStorageManager(gcpProjectId, bucketName);
  const mediaGarbageCollector = new MediaGarbageCollector(storageManagerGcp, {
    gracePeriodDays: 30,
    intervalMs: 12 * 60 * 60 * 1_000, // 12 h
  });
  mediaGarbageCollector.start();
  console.debug("[Pipeline] MediaGarbageCollector started.");

  checkpointerManager.getCheckpointer();

  const projectRepository = new ProjectRepository();
  const sacGitService = getSacGitService();

  const workflowOperator = new WorkflowOperator(
    checkpointerManager,
    jobControlPlane,
    publishPipelineEventViaEventBus,
    projectRepository,
    sacGitService,
    lockManager,
    gcpProjectId,
    bucketName,
  );

  // ── Optional debug graph export ─────────────────────────────────────────

  const isDebugMode = process.env.DEBUG === "true" || process.env.NODE_ENV === "development";

  if (isDebugMode) {
    try {
      const testWorkflowForGraph = new CinematicVideoWorkflow({
        gcpProjectId,
        projectId: "debug-graph-export",
        bucketName,
        jobControlPlane,
        lockManager,
        controller: new AbortController(),
      });

      const compiledGraphForDebug = testWorkflowForGraph.graph.compile();
      const graphDataForDebug = await compiledGraphForDebug.getGraphAsync();
      const mermaidTextForDebug = graphDataForDebug.drawMermaid();

      const textOutputPath = path.resolve("./website/src/content/docs/graph_structure.mmd");
      await fs
        .writeFile(textOutputPath, mermaidTextForDebug)
        .catch((errWriteGraph) => console.error("[Pipeline][Debug] Failed to write .mmd:", errWriteGraph));
      console.debug(`[Pipeline][Debug] Graph definition saved: file://${textOutputPath}`);

      try {
        const pngBlobForDebug = await graphDataForDebug.drawMermaidPng();
        const pngBufferForDebug = Buffer.from(await pngBlobForDebug.arrayBuffer());
        const pngOutputPath = path.resolve("./website/contents/docs/graph_diagram.png");
        await fs.writeFile(pngOutputPath, pngBufferForDebug);
        console.debug(`[Pipeline][Debug] Graph PNG saved: file://${pngOutputPath}`);
      } catch (errPng) {
        console.warn("[Pipeline][Debug] PNG generation failed (canvas/playwright may be needed).");
      }
    } catch (errDebugInit) {
      console.warn("[Pipeline][Debug] Could not export graph structure:", errDebugInit);
    }
  }

  // ── Command subscription ─────────────────────────────────────────────────
  //
  // STOP_PIPELINE: the cancellation-fanout pattern (PIPELINE_CANCELLATIONS
  // topic) is a PubSub-only concern. In monolith/InMemory mode we call
  // workflowOperator.stopPipeline() directly. PubSubEventBus handles its
  // own ephemeral cancellation subscriptions internally.

  const handleCommandFromEventBus = async (commandRaw: PipelineCommand): Promise<void> => {
    const { projectId } = commandRaw;

    try {
      await logContextStore.run(
        {
          ...logContext,
          projectId,
          commandId: commandRaw.commandId,
          shouldPublish: false,
        },
        async () => {
          console.log({ command: commandRaw }, "[Pipeline] Received command.");

          switch (commandRaw.type) {
            // ── Workflow lifecycle ─────────────────────────────────
            case "START_PIPELINE":
              try {
                await workflowOperator.startPipeline(commandRaw, commandRaw.payload);
              } catch (errStartPipeline) {
                console.error({ command: commandRaw, error: errStartPipeline }, "[Pipeline] Error starting pipeline.");
              }
              break;

            case "RESUME_PIPELINE":
              try {
                await workflowOperator.resumePipeline(commandRaw, commandRaw.payload);
              } catch (errResumePipeline) {
                console.error(
                  { command: commandRaw, error: errResumePipeline },
                  "[Pipeline] handleResumePipelineCommand failed.",
                );
                await workflowOperator.publishEvent({
                  commandId: generateId(),
                  type: "WORKFLOW_FAILED",
                  projectId,
                  worldId: commandRaw.worldId,
                  teamId: commandRaw.teamId,
                  userId: commandRaw.userId,
                  payload: { error: errResumePipeline as string },
                  timestamp: new Date().toISOString(),
                });
              }
              break;

            case "REQUEST_FULL_STATE":
              try {
                await workflowOperator.getProjectState(commandRaw);
              } catch (errFullState) {
                console.error(
                  { command: commandRaw, error: errFullState },
                  "[Pipeline] Error handling REQUEST_FULL_STATE.",
                );
              }
              break;

            case "STOP_PIPELINE":
              try {
                console.log({ projectId }, "[Pipeline] Broadcasting stop command.");
                // Direct invocation works for both InMemory and PubSub
                // (PubSub mode also fans out via eventBus.publishCommand
                // to other instances if needed upstream).
                await workflowOperator.stopPipeline(projectId);
              } catch (errStop) {
                console.error({ command: commandRaw, error: errStop }, "[Pipeline] Error stopping pipeline.");
              }
              break;

            case "RESOLVE_INTERVENTION":
              try {
                await workflowOperator.resolveIntervention(commandRaw, commandRaw.payload);
              } catch (errResolve) {
                console.error({ command: commandRaw, error: errResolve }, "[Pipeline] Error resolving intervention.");
              }
              break;

            // ── On-demand generation commands ──────────────────────
            case "GENERATE_COMPOSITE":
              try {
                await PipelineCommandHandler.handleGenerateCompositeImage(commandRaw, jobControlPlane);
              } catch (errComposites) {
                console.error(
                  { command: commandRaw, error: errComposites },
                  `[Pipeline] Error dispatching GENERATE_COMPOSITE for ${projectId}.`,
                );
              }
              break;

            case "GENERATE_CHARACTERS":
              try {
                await PipelineCommandHandler.handleGenerateCharacters(commandRaw, jobControlPlane);
              } catch (errCharacters) {
                console.error(
                  { command: commandRaw, error: errCharacters },
                  `[Pipeline] Error dispatching GENERATE_CHARACTERS for ${projectId}.`,
                );
              }
              break;

            case "GENERATE_CHARACTER_IMAGES":
              try {
                await PipelineCommandHandler.handleGenerateCharacterImages(commandRaw, jobControlPlane);
              } catch (errCharacters) {
                console.error(
                  { command: commandRaw, error: errCharacters },
                  `[Pipeline] Error dispatching GENERATE_CHARACTER_IMAGES for ${projectId}.`,
                );
              }
              break;

            case "GENERATE_LOCATIONS":
              try {
                await PipelineCommandHandler.handleGenerateLocations(commandRaw, jobControlPlane);
              } catch (errLocations) {
                console.error(
                  { command: commandRaw, error: errLocations },
                  `[Pipeline] Error dispatching GENERATE_LOCATIONS for ${projectId}.`,
                );
              }
              break;

            case "GENERATE_LOCATION_IMAGES":
              try {
                await PipelineCommandHandler.handleGenerateLocationImages(commandRaw, jobControlPlane);
              } catch (errLocations) {
                console.error(
                  { command: commandRaw, error: errLocations },
                  `[Pipeline] Error dispatching GENERATE_LOCATION_IMAGES for ${projectId}.`,
                );
              }
              break;

            case "GENERATE_ENTITIES":
              try {
                await PipelineCommandHandler.handleGenerateEntities(commandRaw, jobControlPlane);
              } catch (errSceneCreate) {
                console.error(
                  { command: commandRaw, error: errSceneCreate },
                  `[Pipeline] Error dispatching GENERATE_ENTITIES for ${projectId}.`,
                );
              }
              break;

            case "CREATE_SCENES_WITH_ENTITIES":
              try {
                await PipelineCommandHandler.handleCreateSceneWithEntities(commandRaw, jobControlPlane);
              } catch (errSceneCreate) {
                console.error(
                  { command: commandRaw, error: errSceneCreate },
                  `[Pipeline] Error dispatching CREATE_SCENES_WITH_ENTITIES for ${projectId}.`,
                );
              }
              break;

            case "GENERATE_SCENE_FRAMES":
              try {
                await PipelineCommandHandler.handleGenerateSceneFrames(commandRaw, jobControlPlane);
              } catch (errFrames) {
                console.error(
                  { command: commandRaw, error: errFrames },
                  `[Pipeline] Error dispatching GENERATE_SCENE_FRAMES for ${projectId}.`,
                );
              }
              break;

            case "GENERATE_SCENE_VIDEO":
              try {
                await PipelineCommandHandler.handleRegenerateScene(commandRaw, jobControlPlane);
              } catch (errSceneVideo) {
                console.error(
                  { command: commandRaw, error: errSceneVideo },
                  `[Pipeline] Error dispatching GENERATE_SCENE_VIDEO for ${projectId}.`,
                );
              }
              break;

            default:
              console.warn({ commandRaw }, "[Pipeline] Unhandled command type.");
          }
        },
      );
    } catch (error) {
      // throw top level errors, as they're considered fatal.
      console.error(`[Pipeline Command] Error processing command for project ${commandRaw.projectId}:`, error);
      throw error;
    }
  };

  // ── Job-event subscription ───────────────────────────────────────────────
  //
  // The pipeline listens for JOB_COMPLETED / JOB_FAILED to drive workflow
  // resumption and RAI/Safety intervention events.

  const handleJobEventFromEventBus = async (jobEventRaw: JobEvent): Promise<void> => {
    if (!("type" in jobEventRaw) || !jobEventRaw.type.startsWith("JOB_")) {
      return;
    }

    await logContextStore.run(
      {
        ...logContext,
        jobId: jobEventRaw.metadata.jobId,
        shouldPublish: false,
      },
      async () => {
        console.debug({ event: jobEventRaw }, "[Pipeline] Received job event.");

        const { jobId } = jobEventRaw.metadata;

        if (jobEventRaw.type === "JOB_COMPLETED") {
          try {
            await PipelineEventHandler.handleJobCompletion(
              jobId,
              jobControlPlane,
              workflowOperator,
              publishPipelineEventViaEventBus,
            );
          } catch (errJobCompleted) {
            console.error("[Pipeline] Error handling JOB_COMPLETED:", errJobCompleted);
          }
          return;
        }

        if (jobEventRaw.type === "JOB_FAILED") {
          try {
            await PipelineEventHandler.handleJobFailure(jobId, jobControlPlane, publishPipelineEventViaEventBus);
          } catch (errJobFailed) {
            console.error("[Pipeline] Error handling JOB_FAILED:", errJobFailed);
          }
        }
      },
    );
  };

  await eventBus.subscribeToCommands(SUBSCRIPTION_NAMES.PIPELINE_COMMANDS_SUBSCRIPTION, handleCommandFromEventBus);
  console.log(
    `[Pipeline ${pipelineInstanceId}] Subscribed to commands on ${SUBSCRIPTION_NAMES.PIPELINE_COMMANDS_SUBSCRIPTION}.`,
  );

  await eventBus.subscribeToJobEvents(SUBSCRIPTION_NAMES.PIPELINE_JOB_EVENTS_SUBSCRIPTION, handleJobEventFromEventBus, {
    filter: 'attributes.type = "JOB_COMPLETED" OR attributes.type = "JOB_FAILED"',
  });
  console.log(
    `[Pipeline ${pipelineInstanceId}] Subscribed to job events on ${SUBSCRIPTION_NAMES.PIPELINE_JOB_EVENTS_SUBSCRIPTION}.`,
  );

  // ── Chat event handler ────────────────────────────────────────────────────────
  //
  // The pipeline can optionally handle CHAT_MESSAGE events to provide an
  // AI-powered chat response using ChatAgent. This is triggered when the
  // client sends a message, and emits streaming chunks back via CHAT_STREAM_CHUNK.

  const chatAgents = new Map<string, ChatAgent>();
  const chatAgentLastUsed = new Map<string, number>();
  const CHAT_AGENT_TTL_MS = 30 * 60 * 1000;
  let chatAgentCleanupInterval: number | null = null;

  const createIncrementAttemptHook = (conversationId: string) => {
    return async (error: string, _strategy: any): Promise<any> => {
      console.warn({ conversationId, error }, "[ChatAgent] Retry attempt recorded.");
      return null;
    };
  };

  const getOrCreateChatAgent = async (
    conversationId: string,
    projectId: string,
    userId: string,
  ): Promise<ChatAgent> => {
    let agent = chatAgents.get(conversationId);
    if (!agent) {
      const textController = new TextModelController();

      let storyboard = undefined;
      try {
        const project = await projectRepository.getProject(projectId);
        storyboard = project.storyboard;
      } catch (error) {
        console.warn(
          { conversationId, projectId, error },
          "[Pipeline] Failed to fetch project storyboard for chat context.",
        );
      }

      agent = createChatAgent({
        conversationId,
        projectId,
        userId,
        storyboard,
        toolContext: {
          provider: textController,
          safetyRetries: 1,
          storageManager: storageManagerGcp,
          projectRepository,
          console: console,
          traceId: `chat-${conversationId}`,
          projectId,
          incrementAttempt: createIncrementAttemptHook(conversationId),
        },
      });
      chatAgents.set(conversationId, agent);
      chatAgentLastUsed.set(conversationId, Date.now());
    } else {
      chatAgentLastUsed.set(conversationId, Date.now());
    }
    return agent;
  };

  chatAgentCleanupInterval = setInterval(
    () => {
      const now = Date.now();
      for (const [conversationId, lastUsed] of chatAgentLastUsed.entries()) {
        if (now - lastUsed > CHAT_AGENT_TTL_MS) {
          chatAgents.delete(conversationId);
          chatAgentLastUsed.delete(conversationId);
          console.log({ conversationId }, "[Pipeline] Cleaned up idle chat agent.");
        }
      }
    },
    5 * 60 * 1000,
  ) as unknown as number;

  const handleChatEventFromEventBus = async (chatEvent: PipelineEvent): Promise<void> => {
    if (chatEvent.type !== "CHAT_MESSAGE") return;

    const payload = chatEvent.payload;
    const { conversationId, content, role } = payload;
    const userId = chatEvent.userId;

    if (role !== "human") return;

    console.log({ conversationId, content }, "[Pipeline] Processing chat message.");

    try {
      const conversation = await chatService.getConversation(conversationId);
      if (!conversation) {
        console.warn(`[Pipeline] Conversation ${conversationId} not found for chat event.`);
        return;
      }

      const agent = await getOrCreateChatAgent(conversationId, conversation.projectId, userId);

      // Do NOT pre-create the assistant message here — sendMessage() handles
      // creation internally. Pre-creating it would leave an empty AI message
      // in the DB that pollutes the conversation history when loadHistory()
      // runs. sendMessage() yields the new message ID in its first chunk.
      let activeMessageId: string | undefined;

      for await (const chunk of agent.sendMessage(content)) {
        // Capture the message ID from the first yield (sendMessage creates
        // the assistant message and includes its ID in the first chunk).
        if (!activeMessageId && chunk.messageId) {
          activeMessageId = chunk.messageId;
        }

        const streamEvent: ChatStreamChunkEvent = {
          type: "CHAT_STREAM_CHUNK",
          projectId: conversation.projectId,
          teamId: chatEvent.teamId || "",
          userId,
          timestamp: new Date().toISOString(),
          payload: {
            conversationId,
            messageId: chunk.messageId || activeMessageId || "",
            chunk: chunk.chunk,
            isComplete: chunk.isComplete,
          },
        };

        await publishPipelineEventViaEventBus(streamEvent);

        if (chunk.isComplete) {
          const finalMessageEvent: ChatMessageEvent = {
            type: "CHAT_MESSAGE",
            projectId: conversation.projectId,
            teamId: chatEvent.teamId || "",
            userId,
            timestamp: new Date().toISOString(),
            payload: {
              conversationId,
              messageId: chunk.messageId || activeMessageId || "",
              role: "ai",
              content: chunk.chunk,
              tokenCount: 0,
              metadata: {},
            },
          };

          await publishPipelineEventViaEventBus(finalMessageEvent);
        }
      }

      console.log({ conversationId, messageId: activeMessageId }, "[Pipeline] Chat response completed.");
    } catch (errChatProcess) {
      console.error({ conversationId, error: errChatProcess }, "[Pipeline] Error processing chat message.");

      await publishPipelineEventViaEventBus({
        type: "CHAT_STREAM_CHUNK",
        projectId: chatEvent.projectId || "",
        teamId: chatEvent.teamId || "",
        userId,
        timestamp: new Date().toISOString(),
        payload: {
          conversationId,
          messageId: "",
          chunk: `Error: ${errChatProcess instanceof Error ? errChatProcess.message : "Unknown error"}`,
          isComplete: true,
        },
      });
    }
  };

  const handleChatStopEventFromEventBus = async (stopEvent: PipelineEvent): Promise<void> => {
    if (stopEvent.type !== "CHAT_STOP") return;

    const { conversationId } = stopEvent.payload as { conversationId: string };
    const userId = stopEvent.userId;

    console.log({ conversationId }, "[Pipeline] Received CHAT_STOP event.");

    const agent = chatAgents.get(conversationId);
    if (agent) {
      agent.stop();
      console.log({ conversationId }, "[Pipeline] Chat agent stop signal sent.");
    } else {
      console.warn({ conversationId }, "[Pipeline] No active chat agent found to stop.");
    }
  };

  // Subscribe to CHAT_MESSAGE events
  const chatSubscriptionName = `pipeline-chat-events-${pipelineInstanceId}`;
  await eventBus.subscribeToPipelineEvents(chatSubscriptionName, handleChatEventFromEventBus, {
    temporary: true,
    filter: 'attributes.type = "CHAT_MESSAGE"',
  });
  console.log(`[Pipeline ${pipelineInstanceId}] Subscribed to chat events on ${chatSubscriptionName}.`);

  const chatStopSubscriptionName = `pipeline-chat-stop-events-${pipelineInstanceId}`;
  await eventBus.subscribeToPipelineEvents(chatStopSubscriptionName, handleChatStopEventFromEventBus, {
    temporary: true,
    filter: 'attributes.type = "CHAT_STOP"',
  });
  console.log(`[Pipeline ${pipelineInstanceId}] Subscribed to chat stop events on ${chatStopSubscriptionName}.`);

  const stop = async (): Promise<void> => {
    console.log("[Pipeline] Initiating graceful shutdown...");
    clearInterval(chatAgentCleanupInterval);
    chatAgents.clear();
    chatAgentLastUsed.clear();
    await eventBus.unsubscribe(SUBSCRIPTION_NAMES.PIPELINE_COMMANDS_SUBSCRIPTION);
    await eventBus.unsubscribe(SUBSCRIPTION_NAMES.PIPELINE_JOB_EVENTS_SUBSCRIPTION);
    await eventBus.unsubscribe(chatSubscriptionName);
    jobLifecycleMonitor.stop();
    mediaGarbageCollector.stop();
    await lockManager.close();
    console.log("[Pipeline] Graceful shutdown complete.");
  };

  console.log({ pipelineInstanceId }, "[Pipeline] Pipeline domain ready.");

  return { stop };
}

// ─── Distributed mode entry-point ─────────────────────────────────────────────

async function main(): Promise<void> {
  const gcpProjectId = process.env.GOOGLE_CLOUD_PROJECT;
  if (!gcpProjectId) throw new Error("[Pipeline:main] GOOGLE_CLOUD_PROJECT is not set.");

  const postgresUrl = process.env.POSTGRES_URL;
  if (!postgresUrl) throw new Error("[Pipeline:main] POSTGRES_URL is not set.");

  // Lazy import keeps the Monolith bundle free of @google-cloud/pubsub
  const { PubSubEventBus } = await import("../shared/messaging/pubsub-event-bus.js");
  const eventBusInstance: IEventBus = new PubSubEventBus(gcpProjectId);

  initLogger();
  initializeDatabase(getPool());

  const poolManagerInstance = new PoolManager();
  const workerIdForDistributed = generateId();
  const lockManagerInstance = new DistributedLockManager(poolManagerInstance, workerIdForDistributed);

  const pipelineHandle = await initializePipeline({
    eventBus: eventBusInstance,
    poolManager: poolManagerInstance,
    lockManager: lockManagerInstance,
  });

  const handleShutdown = async (code = 0): Promise<void> => {
    console.log("[Pipeline:main] SIGINT/SIGTERM received – shutting down...");
    await pipelineHandle.stop();
    await eventBusInstance.close();
    await poolManagerInstance.close();
    console.log("[Pipeline:main] Shutdown complete.");
    process.exit(code);
  };

  process.on("SIGINT", handleShutdown);
  process.on("SIGTERM", handleShutdown);

  if ((import.meta as any).hot) {
    (import.meta as any).hot.dispose(handleShutdown);
  }
}

// Run directly only when this file is the process entry-point
const isEntryPoint = process.argv[1] && (await import("url")).fileURLToPath(import.meta.url) === process.argv[1];

if (isEntryPoint) {
  main().catch((fatalError) => {
    console.error("[Pipeline:main] FATAL:", fatalError);
    process.exit(1);
  });
}
