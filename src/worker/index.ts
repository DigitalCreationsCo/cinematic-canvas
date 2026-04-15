// src/worker/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cinematic Canvas – Worker Domain
//
// Supports two execution modes:
//   1. Monolith  – called via initializeWorker({ eventBus, poolManager, lockManager })
//   2. Distributed – run directly; bootstraps its own PubSubEventBus + resources
// ─────────────────────────────────────────────────────────────────────────────
import * as dotenv from "dotenv";
dotenv.config();

import { IEventBus } from "../shared/messaging/event-bus.types.js";
import {
    TOPIC_NAMES,
    SUBSCRIPTION_NAMES,
} from "../shared/config.js";
import { JobEvent } from "../shared/types/job.types.js";
import { PipelineEvent } from "../shared/types/pipeline.types.js";

import { PoolManager } from "../shared/services/pool-manager.js";
import { JobControlPlane } from "../shared/services/job-control-plane.js";
import { DistributedLockManager } from "../shared/services/lock-manager.js";
import { WorkerService } from "./worker-service.js";

import { generateId } from "#shared/utils/id.js";
import { initLogger, LogContext, logContextStore } from "../shared/logger/init-logger.js";
import { getPool, initializeDatabase } from "../shared/db/index.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorkerDependencies {
    eventBus: IEventBus;
    poolManager: PoolManager;
    lockManager: DistributedLockManager;
}

export interface WorkerHandle {
    stop(): Promise<void>;
}

// ─── Core initialiser ─────────────────────────────────────────────────────────

export async function initializeWorker(
    deps: WorkerDependencies
): Promise<WorkerHandle> {
    const { eventBus, poolManager, lockManager } = deps;

    const workerInstanceId = generateId();
    const logContext: LogContext = {
        w_id: workerInstanceId,
        correlationId: generateId(),
        shouldPublish: false,
    };

    console.log(
        { workerInstanceId },
        "[Worker] Initialising worker domain..."
    );

    // ── Environment guards ───────────────────────────────────────────────────

    const gcpProjectId = process.env.GOOGLE_CLOUD_PROJECT;
    if (!gcpProjectId) throw new Error("[Worker] GOOGLE_CLOUD_PROJECT is not set.");

    const bucketName = process.env.GOOGLE_CLOUD_BUCKET;
    if (!bucketName) throw new Error("[Worker] GOOGLE_CLOUD_BUCKET is not set.");

    // ── Domain services ──────────────────────────────────────────────────────

    // Thin adapters that route publish calls through the injected event bus
    const publishJobEventViaEventBus = (
        eventPayload: JobEvent
    ): Promise<string> => eventBus.publishJobEvent(eventPayload);

    const publishPipelineEventViaEventBus = (
        eventPayload: PipelineEvent
    ): Promise<string> => eventBus.publishPipelineEvent(eventPayload);

    const jobControlPlane = new JobControlPlane(
        poolManager,
        publishJobEventViaEventBus
    );

    const workerServiceInstance = new WorkerService(
        gcpProjectId,
        workerInstanceId,
        bucketName,
        jobControlPlane,
        lockManager,
        publishJobEventViaEventBus,
        publishPipelineEventViaEventBus
    );

    // ── Job-event subscription ───────────────────────────────────────────────
    //
    // The worker listens only for JOB_DISPATCHED events.  Any other event
    // types that arrive on this subscription are silently acknowledged and
    // discarded (they are destined for the Pipeline domain).

    const handleJobEventFromEventBus = async (
        jobEventRaw: JobEvent
    ): Promise<void> => {
        if (!jobEventRaw || jobEventRaw.type !== "JOB_DISPATCHED") {
            // Not our concern – discard gracefully
            console.debug(
                { eventType: jobEventRaw?.type },
                "[Worker] Ignoring non-JOB_DISPATCHED event."
            );
            return;
        }

        await logContextStore.run(
            {
                ...logContext,
                jobId: jobEventRaw.metadata.jobId,
                shouldPublish: false,
            },
            async () => {
                console.log(
                    { event: jobEventRaw },
                    "[Worker] Received JOB_DISPATCHED – beginning async processing."
                );

                // Fire-and-forget: failures are tracked via JobControlPlane state,
                // not by the subscription ack mechanism.
                workerServiceInstance.processJob(jobEventRaw.metadata.jobId).catch(
                    (errProcessJob) => {
                        console.error(
                            { error: errProcessJob, jobId: jobEventRaw.metadata.jobId },
                            "[Worker] Unhandled error in processJob."
                        );
                    }
                );
            }
        );
    };

    await eventBus.subscribeToJobEvents(
        SUBSCRIPTION_NAMES.WORKER_JOB_EVENTS_SUBSCRIPTION,
        handleJobEventFromEventBus,
        {
            filter: 'attributes.type = "JOB_DISPATCHED"'
        }
    );
    console.log(
        `[Worker ${workerInstanceId}] Subscribed to job events on ${SUBSCRIPTION_NAMES.WORKER_JOB_EVENTS_SUBSCRIPTION}.`
    );

    // ── Shutdown handle ──────────────────────────────────────────────────────

    const stop = async (): Promise<void> => {
        console.log("[Worker] Initiating graceful shutdown...");
        await lockManager.close();
        console.log("[Worker] Graceful shutdown complete.");
    };

    console.log(
        { workerInstanceId },
        "[Worker] Worker domain ready."
    );

    return { stop };
}

// ─── Distributed mode entry-point ─────────────────────────────────────────────

async function main(): Promise<void> {
    const gcpProjectId = process.env.GOOGLE_CLOUD_PROJECT;
    if (!gcpProjectId) throw new Error("[Worker:main] GOOGLE_CLOUD_PROJECT is not set.");

    const postgresUrl = process.env.POSTGRES_URL;
    if (!postgresUrl) throw new Error("[Worker:main] POSTGRES_URL is not set.");

    // Lazy import keeps the Monolith bundle free of @google-cloud/pubsub
    const { PubSubEventBus } = await import(
        "../shared/messaging/pubsub-event-bus.js"
    );

    initLogger();
    initializeDatabase(getPool());

    console.log("[Worker:main] Starting worker in distributed mode...");

    const poolManagerInstance = new PoolManager();
    const workerIdForDistributed = generateId();
    const lockManagerInstance = new DistributedLockManager(
        poolManagerInstance,
        workerIdForDistributed
    );

    const paramsGoogleProvider = { projectId: gcpProjectId };
    const eventBusInstance: IEventBus = new PubSubEventBus(
        paramsGoogleProvider.projectId
    );

    const workerHandle = await initializeWorker({
        eventBus: eventBusInstance,
        poolManager: poolManagerInstance,
        lockManager: lockManagerInstance,
    });

    const handleShutdown = async (): Promise<void> => {
        console.log("[Worker:main] SIGINT/SIGTERM received – shutting down...");
        await workerHandle.stop();
        await eventBusInstance.close();
        await poolManagerInstance.close();
        console.log("[Worker:main] Shutdown complete.");
        process.exit(0);
    };

    process.on("SIGINT", handleShutdown);
    process.on("SIGTERM", handleShutdown);

    console.log(
        { workerIdForDistributed },
        "[Worker:main] Worker service ready (distributed)."
    );
}

// Run directly only when this file is the process entry-point
const isEntryPoint =
    process.argv[1] &&
    (await import("url")).fileURLToPath(import.meta.url) === process.argv[1];

if (isEntryPoint) {
    main().catch((fatalError) => {
        console.error("[Worker:main] FATAL:", fatalError);
        process.exit(1);
    });
}