import { PipelineEvent } from "#shared/types/index.js";
import { generateId } from "#shared/utils/id.js";
import {
    subscribeToLayoutChanges,
    unsubscribeFromLayoutChanges,
    isRealtimeConfigured,
    type LayoutChangePayload,
} from "./services/supabaseRealtime.js";
import { JobEvent } from "#shared/types/job.types.js";
import { router, teamProcedure } from "#shared/app-router/trpc.js";
import { IEventBus } from "#shared/messaging/event-bus.types.js";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

// ════════════════════════════════════════════════════════════════════════
// EVENTS - tRPC subscriptions with async generators.
// ════════════════════════════════════════════════════════════════════════

export const createEventsRouter = ({ eventBus }: { eventBus: IEventBus }) => router({
    project: teamProcedure
        .input(z.object({ projectId: z.string() }))
        .subscription(async function* ({ ctx, input, signal }) {
            const { projectId } = input;
            const userId = ctx.user?.id;
            const sessionId = generateId();
            const sseSubscriptionName = `sse-${projectId}-${sessionId}`;
            const jobSseSubscriptionName = `sse-jobs-${projectId}-${userId}-${sessionId}`;

            if (!userId) {
                throw new TRPCError({
                    code: 'UNAUTHORIZED',
                    message: 'User required for events subscription',
                });
            }

            let isConnectionClosed = false;
            let buffer: (string)[] = [];
            let abortHandler = false;

            const pipelineEventHandler = async (evt: PipelineEvent) => {
                if (abortHandler) return;
                if (evt.projectId !== projectId) return;
                if (!evt.type || !evt.timestamp) {
                    console.warn('[Events] Invalid pipeline event:', evt);
                    return;
                }
                buffer.push(`data: ${JSON.stringify(evt)}\n\n`);
            };

            const jobEventHandler = async (evt: JobEvent): Promise<void> => {
                if (abortHandler) return;
                // In-process guard — essential for InMemoryEventBus (monolith / dev mode)
                // which broadcasts all job events to every listener.
                if (evt.projectId !== projectId) return;
                if (evt.userId !== userId) return;
                buffer.push(`data: ${JSON.stringify(evt)}\n\n`);
            };

            let realtimeChannel: any = null;

            try {

                await eventBus.subscribeToPipelineEvents(sseSubscriptionName,
                    pipelineEventHandler, {
                    temporary: true,
                    ackDeadlineSeconds: 60,
                    filter: `attributes.projectId = "${projectId}"`,
                    expirationPolicy: { ttl: { seconds: 12 * 60 * 60 } },
                });

                await eventBus.subscribeToJobEvents(
                    jobSseSubscriptionName,
                    jobEventHandler,
                    {
                        temporary: true,
                        ackDeadlineSeconds: 60,
                        // Broker-level filter: only job events for this project+user reach
                        // this subscription. Requires userId to be published as a message
                        // attribute — see pubsub-event-bus.ts publishJobEvent().
                        filter: `attributes.projectId = "${projectId}" AND attributes.userId = "${userId}"`,
                        expirationPolicy: { ttl: { seconds: 12 * 60 * 60 } },
                    }
                );

                // Supabase Realtime for layout changes (optional)
                if (isRealtimeConfigured()) {
                    try {
                        realtimeChannel = subscribeToLayoutChanges(
                            projectId,
                            (layoutPayload: LayoutChangePayload) => {
                                if (isConnectionClosed) return;
                                const paramsLayoutSseEvent = {
                                    type: "LAYOUT_UPDATED",
                                    timestamp: new Date().toISOString(),
                                    payload: {
                                        contextType: layoutPayload.contextType,
                                        contextId: layoutPayload.contextId,
                                        nodes: [
                                            {
                                                idEntity: layoutPayload.idEntity,
                                                nodeType: layoutPayload.nodeType,
                                                valPosX: layoutPayload.valPosX,
                                                valPosY: layoutPayload.valPosY,
                                                valWidth: layoutPayload.valWidth,
                                                valHeight: layoutPayload.valHeight,
                                                jsonUiMetadata: layoutPayload.jsonUiMetadata,
                                                idxVersion: layoutPayload.idxVersion,
                                            },
                                        ],
                                    },
                                };
                                buffer.push(`data: ${JSON.stringify(paramsLayoutSseEvent)}\n\n`);
                            }
                        );
                        console.debug(
                            `[SSE] Supabase Realtime subscribed for project ${projectId}.`
                        );
                    } catch (errRealtime) {
                        console.error("[SSE] Failed to subscribe to Supabase Realtime:", errRealtime);
                    }
                }
            } catch (err) {
                console.error('[Events] Pipeline subscribe fail:', err);
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: `Pipeline subscribe fail: ${err instanceof Error ? err.message : 'Unknown'}`,
                });
            }

            try {
                while (!signal?.aborted) {
                    while (buffer.length > 0) {
                        yield buffer.shift()!;
                    }
                    await new Promise((r) => setTimeout(r, 500));
                }
            } finally {
                abortHandler = true;
                try {
                    eventBus.unsubscribe(sseSubscriptionName, pipelineEventHandler);
                    eventBus.unsubscribe(jobSseSubscriptionName, jobEventHandler);
                    if (realtimeChannel) {
                        unsubscribeFromLayoutChanges(projectId);
                    }
                    isConnectionClosed = true;
                } catch (e) {
                    console.error('[Events] Pipeline cleanup:', e);
                }
            }
        }),
});