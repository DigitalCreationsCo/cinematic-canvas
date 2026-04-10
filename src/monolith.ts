// src/monolith.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cinematic Canvas – Monolith Bootstrapper
//
// One-button entry point for running the Pipeline, Worker, and Server
// domains in a single process using an in-memory event bus.
//
// Execution sequence
//   1. Initialise database pool
//   2. Instantiate shared InMemoryEventBus, PoolManager, DistributedLockManager
//   3. Start Pipeline, Worker, and Server domains in parallel
//   4. Register unified SIGINT/SIGTERM handler for graceful teardown
// ─────────────────────────────────────────────────────────────────────────────
import * as dotenv from "dotenv";
dotenv.config();

import { InMemoryEventBus } from "./shared/messaging/event-bus.js";
import { getPool, initializeDatabase } from "./shared/db/index.js";
import { initLogger } from "./shared/logger/index.js";
import { PoolManager } from "./shared/services/pool-manager.js";
import { DistributedLockManager } from "./shared/services/lock-manager.js";

import { initializePipeline } from "./pipeline/index.js";
import { initializeWorker } from "./worker/index.js";
import { initializeServer } from "./server/index.js";
import { generateId } from "#shared/utils/id.js";

async function boot(): Promise<void> {
    initLogger();
    console.log("[Monolith] Bootstrapping Cinematic Canvas...");

    try {
        // ── 1. Database ──────────────────────────────────────────────────────

        const poolInstance = getPool();
        await initializeDatabase(poolInstance);
        console.log("[Monolith] Database pool initialised.");

        // ── 2. Shared singletons ─────────────────────────────────────────────
        //
        // All three domains share a single PoolManager and LockManager in
        // Monolith mode to avoid competing connection pools.

        const workerId = `monolith-${generateId()}`;

        const poolManagerShared = new PoolManager();
        const lockManagerShared = new DistributedLockManager(poolManagerShared, workerId);
        const eventBusInMemory = new InMemoryEventBus();

        console.log("[Monolith] Shared InMemoryEventBus ready. WorkerId: ", workerId);

        // ── 3. Domain initialisation (parallel) ──────────────────────────────

        const paramsSharedDomainDeps = {
            eventBus: eventBusInMemory,
            poolManager: poolManagerShared,
            lockManager: lockManagerShared,
        };

        const portParamServer = parseInt(process.env.PORT ?? "8000", 10);

        const [pipelineHandle, workerHandle, serverHandle] = await Promise.all([
            initializePipeline(paramsSharedDomainDeps),
            initializeWorker(paramsSharedDomainDeps),
            initializeServer({
                eventBus: eventBusInMemory,
                port: portParamServer,
            }),
        ]);

        console.log("🚀 [Monolith] Cinematic Canvas Orchestrator active.");

        // ── 4. Graceful shutdown ─────────────────────────────────────────────

        const handleShutdown = async (): Promise<void> => {
            console.log("[Monolith] Initiating graceful shutdown...");

            try {
                // Domains stop first (flush in-flight work)
                await Promise.allSettled([
                    serverHandle.stop(),
                    pipelineHandle.stop(),
                    workerHandle.stop(),
                ]);

                // Shared infrastructure tears down last
                await eventBusInMemory.close();
                await lockManagerShared.close();
                await poolManagerShared.close();

                console.log("[Monolith] Teardown complete. Exiting.");
            } catch (errShutdown) {
                console.error("[Monolith] Error during shutdown:", errShutdown);
            } finally {
                process.exit(0);
            }
        };

        process.on("SIGINT", handleShutdown);
        process.on("SIGTERM", handleShutdown);

    } catch (errBoot) {
        console.error("[Monolith] FATAL: Bootstrapping failed.", errBoot);
        process.exit(1);
    }
}

boot();