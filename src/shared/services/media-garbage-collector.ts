import { db } from "../db/index.js";
import { mediaObjects } from "../db/schema.js";
import { and, lte, eq } from "drizzle-orm";
import { GCPStorageManager } from "./storage-manager.js";

export interface CleanupConfig {
    intervalMs?: number;
    gracePeriodDays?: number;
    batchSize?: number;
}

/**
 * MediaGarbageCollector
 * * Periodically identifies and purges physical GCS objects that have a 
 * zero reference count and have exceeded a safety grace period.
 */
export class MediaGarbageCollector {
    private timer: NodeJS.Timeout | null = null;
    private readonly config: Required<CleanupConfig>;

    constructor(
        private storageManager: GCPStorageManager,
        config: CleanupConfig = {}
    ) {
        this.config = {
            intervalMs: config.intervalMs ?? 12 * 60 * 60 * 1000, // 12 hours
            gracePeriodDays: config.gracePeriodDays ?? 30,
            batchSize: config.batchSize ?? 200,
        };
    }

    /**
     * Starts the background interval.
     */
    public start(): void {
        if (this.timer) return;

        console.info(
            `[MediaGC] Service started. Interval: ${this.config.intervalMs / 3600000}h, Grace Period: ${this.config.gracePeriodDays}d`
        );

        this.timer = setInterval(() => this.runSweep(), this.config.intervalMs);

        // Optional: Run an immediate sweep on startup
        this.runSweep().catch(err => console.error("[MediaGC] Initial sweep failed", err));
    }

    /**
     * Stops the background interval safely.
     */
    public stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
            console.info("[MediaGC] Service stopped.");
        }
    }

    /**
     * Core logic to identify and delete orphaned media objects.
     */
    public async runSweep(): Promise<void> {
        try {
            console.debug("[MediaGC] Initiating orphan sweep...");

            const thresholdDate = new Date(
                Date.now() - this.config.gracePeriodDays * 24 * 60 * 60 * 1000
            );

            const orphans = await db
                .select()
                .from(mediaObjects)
                .where(
                    and(
                        lte(mediaObjects.refCount, 0),
                        lte(mediaObjects.lastReferencedAt, thresholdDate)
                    )
                )
                .limit(this.config.batchSize);

            if (orphans.length === 0) {
                console.debug("[MediaGC] No orphaned media found.");
                return;
            }

            console.info(`[MediaGC] Purging ${orphans.length} objects.`);

            for (const media of orphans) {
                // 1. Delete physical object first
                // If this fails, we don't delete the DB record, ensuring retry on next sweep.
                await this.storageManager.deleteObject(media.data);

                // 2. Remove the registry record
                await db.delete(mediaObjects).where(eq(mediaObjects.data, media.data));
            }

            console.log(`[MediaGC] Sweep complete.`);
        } catch (error) {
            console.error({ error }, "[MediaGC] Fatal error during sweep execution.");
        }
    }
}