#!/usr/bin/env tsx
/**
 * PubSub Testing REPL
 * Interactive testing environment for pubsub messages
 *
 * Usage:
 *   npx tsx scripts/pubsub-testing/repl.ts
 *
 * Or programmatically:
 *   import pubsubTesting from "./index.js";
 *   await pubsubTesting.publishFullState({ scenario: "rich" });
 */

import * as dotenv from "dotenv";
dotenv.config();

import repl from "node:repl";
import { PubSubTestPublisher, publishBatch } from "./publisher.js";
import {
    TestScenarios,
    createFullStateEvent,
    createJobEvent,
    createTestJob,
    createTestProject,
} from "./fixtures.js";
import type { JobType } from "../../src/shared/types/job.types.js";
import { v7 as uuidv7 } from "uuid";

// ============================================================================
// REPL TESTING MODULE
// ============================================================================

/**
 * Main PubSub Testing Module - REPL Friendly
 * All functions are async and return promises for easy await in REPL
 */
export const pubsubTesting = {
    /**
     * Internal publisher instance (lazy initialized)
     */
    _publisher: null as PubSubTestPublisher | null,

    /**
     * Get or create publisher instance
     */
    getPublisher(): PubSubTestPublisher {
        if (!this._publisher) {
            this._publisher = new PubSubTestPublisher();
        }
        return this._publisher;
    },

    /**
     * Close the publisher connection
     */
    async close(): Promise<void> {
        if (this._publisher) {
            await this._publisher.close();
            this._publisher = null;
        }
    },

    // ========================================================================
    // FULL STATE EVENTS
    // ========================================================================

    /**
     * Publish a FULL_STATE event with a test project
     * @param options.scenario - "minimal", "rich", or "audio"
     * @param options.projectId - Optional project ID (generates if missing)
     * @param options.dryRun - Log without publishing
     */
    async publishFullState(options: {
        scenario?: "minimal" | "rich" | "audio";
        projectId?: string;
        dryRun?: boolean;
    } = {}): Promise<{ success: boolean; projectId: string; error?: string }> {
        const { scenario = "rich", projectId = uuidv7(), dryRun = false } = options;

        console.log(`📦 Creating ${scenario} scenario project...`);

        let project;
        switch (scenario) {
            case "minimal":
                project = TestScenarios.minimalProject();
                break;
            case "audio":
                project = TestScenarios.audioProject();
                break;
            case "rich":
            default:
                project = TestScenarios.richStoryboard();
                break;
        }

        project.id = projectId;
        project.scenes.forEach(s => s.projectId = projectId);
        project.characters.forEach(c => c.projectId = projectId);
        project.locations.forEach(l => l.projectId = projectId);

        const publisher = dryRun ? new PubSubTestPublisher({ dryRun: true }) : this.getPublisher();

        const result = await publisher.publishPipelineEvent({
            type: "FULL_STATE",
            projectId,
            payload: { project },
            timestamp: new Date().toISOString(),
        });

        if (result.success) {
            console.log(`✅ FULL_STATE published for project: ${projectId}`);
            console.log(`   Title: ${project.metadata.title}`);
            console.log(`   Scenes: ${project.scenes.length}`);
            console.log(`   Characters: ${project.characters.length}`);
            console.log(`   Locations: ${project.locations.length}`);
        } else {
            console.error(`❌ Failed: ${result.error}`);
        }

        if (dryRun) await publisher.close();

        return {
            success: result.success,
            projectId,
            error: result.error,
        };
    },

    /**
     * Alias: givenFullState()
     */
    async givenFullState(options?: Parameters<typeof this.publishFullState>[0]): ReturnType<typeof this.publishFullState> {
        return this.publishFullState(options);
    },

    // ========================================================================
    // JOB EVENTS
    // ========================================================================

    /**
     * Publish a job lifecycle event
     * @param type - Event type: JOB_DISPATCHED, JOB_STARTED, JOB_COMPLETED, JOB_FAILED, JOB_CANCELLED
     * @param jobId - Job ID
     * @param projectId - Project ID (required for DISPATCHED/COMPLETED)
     * @param error - Error message (for JOB_FAILED)
     */
    async publishJobEvent(
        type: "JOB_DISPATCHED" | "JOB_STARTED" | "JOB_COMPLETED" | "JOB_FAILED" | "JOB_CANCELLED",
        jobId: string,
        projectId?: string,
        error?: string
    ): Promise<{ success: boolean; error?: string }> {
        if ((type === "JOB_DISPATCHED" || type === "JOB_COMPLETED") && !projectId) {
            throw new Error(`projectId is required for ${type}`);
        }

        const event = createJobEvent(type, jobId, projectId!, error);
        const result = await this.getPublisher().publishJobEvent(
            event as Parameters<PubSubTestPublisher["publishJobEvent"]>[0]
        );

        if (result.success) {
            console.log(`✅ ${type} published`);
            console.log(`   Job ID: ${jobId}`);
            if (projectId) console.log(`   Project ID: ${projectId}`);
            if (error) console.log(`   Error: ${error}`);
        } else {
            console.error(`❌ Failed: ${result.error}`);
        }

        return { success: result.success, error: result.error };
    },

    /**
     * Alias: givenJobDispatched()
     */
    async givenJobDispatched(jobId: string, projectId: string): Promise<{ success: boolean; error?: string }> {
        return this.publishJobEvent("JOB_DISPATCHED", jobId, projectId);
    },

    /**
     * Alias: givenJobStarted()
     */
    async givenJobStarted(jobId: string): Promise<{ success: boolean; error?: string }> {
        return this.publishJobEvent("JOB_STARTED", jobId);
    },

    /**
     * Alias: givenJobCompleted()
     */
    async givenJobCompleted(jobId: string, projectId: string): Promise<{ success: boolean; error?: string }> {
        return this.publishJobEvent("JOB_COMPLETED", jobId, projectId);
    },

    /**
     * Alias: givenJobFailed()
     */
    async givenJobFailed(jobId: string, projectId: string, error: string): Promise<{ success: boolean; error?: string }> {
        return this.publishJobEvent("JOB_FAILED", jobId, projectId, error);
    },

    // ========================================================================
    // JOB DISPATCHING
    // ========================================================================

    /**
     * Dispatch a job of specified type
     * @param type - Job type (EXPAND_CREATIVE_PROMPT, GENERATE_STORYBOARD, etc.)
     * @param projectId - Optional project ID (generates if missing)
     */
    async dispatchJob(
        type: JobType,
        projectId?: string
    ): Promise<{ success: boolean; jobId: string; projectId: string; error?: string }> {
        const pid = projectId ?? uuidv7();
        const job = await createTestJob(type, { projectId: pid });

        const result = await this.getPublisher().publishJobEvent({
            type: "JOB_DISPATCHED",
            jobId: job.id,
            projectId: pid,
        });

        if (result.success) {
            console.log(`✅ Job dispatched: ${type}`);
            console.log(`   Job ID: ${job.id}`);
            console.log(`   Project ID: ${pid}`);
        } else {
            console.error(`❌ Failed: ${result.error}`);
        }

        return {
            success: result.success,
            jobId: job.id,
            projectId: pid,
            error: result.error,
        };
    },

    /**
     * Alias: givenJobDispatch()
     */
    async givenJobDispatch(type: JobType, projectId?: string): ReturnType<typeof this.dispatchJob> {
        return this.dispatchJob(type, projectId);
    },

    /**
     * Dispatch a chain of all workflow jobs
     * @param projectId - Optional project ID (generates if missing)
     * @param delayMs - Delay between dispatches (default: 500ms)
     */
    async dispatchJobChain(
        projectId?: string,
        delayMs: number = 500
    ): Promise<{ success: boolean; projectId: string; results: { type: JobType; success: boolean }[] }> {
        const pid = projectId ?? uuidv7();
        console.log(`🔗 Dispatching job chain for project: ${pid}`);

        const jobs = TestScenarios.workflowChain(pid);

        const events = jobs.map(job => ({
            type: "job" as const,
            data: {
                type: "JOB_DISPATCHED" as const,
                jobId: job.id,
                projectId: job.projectId,
            },
        }));

        const result = await publishBatch(this.getPublisher(), events, {
            delayMs,
            continueOnError: true,
        });

        console.log(`\n📊 Results:`);
        console.log(`   Total: ${result.total}`);
        console.log(`   Successful: ${result.successful}`);
        console.log(`   Failed: ${result.failed}`);

        const results = jobs.map((job, i) => ({
            type: job.type,
            success: result.results[i]?.success ?? false,
        }));

        results.forEach((r, i) => {
            const icon = r.success ? "✅" : "❌";
            console.log(`   ${icon} ${r.type}`);
        });

        return {
            success: result.failed === 0,
            projectId: pid,
            results,
        };
    },

    /**
     * Alias: givenJobChain()
     */
    async givenJobChain(projectId?: string, delayMs?: number): ReturnType<typeof this.dispatchJobChain> {
        return this.dispatchJobChain(projectId, delayMs);
    },

    // ========================================================================
    // WORKFLOW SCENARIOS
    // ========================================================================

    /**
     * Create a complete workflow with FULL_STATE + initial job
     * @param options.projectId - Optional project ID
     * @param options.audio - Include audio analysis
     * @param options.sceneCount - Number of scenes (default: 3)
     */
    async createWorkflow(options: {
        projectId?: string;
        audio?: boolean;
        sceneCount?: number;
    } = {}): Promise<{ success: boolean; projectId: string; error?: string }> {
        const { projectId = uuidv7(), audio = false, sceneCount = 3 } = options;

        console.log(`🎬 Creating workflow: ${projectId}`);

        // Create and publish FULL_STATE
        const stateResult = await this.publishFullState({
            scenario: audio ? "audio" : "rich",
            projectId,
        });

        if (!stateResult.success) {
            return stateResult;
        }

        // Dispatch initial job
        const initialJobType: JobType = audio ? "PROCESS_AUDIO_TO_SCENES" : "EXPAND_CREATIVE_PROMPT";
        const jobResult = await this.dispatchJob(initialJobType, projectId);

        return {
            success: jobResult.success,
            projectId,
            error: jobResult.error,
        };
    },

    /**
     * Alias: givenWorkflow()
     */
    async givenWorkflow(options?: Parameters<typeof this.createWorkflow>[0]): ReturnType<typeof this.createWorkflow> {
        return this.createWorkflow(options);
    },

    // ========================================================================
    // STATUS & UTILITIES
    // ========================================================================

    /**
     * Get publisher status
     */
    status(): Record<string, unknown> {
        return this.getPublisher().getStatus();
    },

    /**
     * Get available test scenarios
     */
    getScenarios(): Record<string, () => unknown> {
        return {
            minimal: TestScenarios.minimalProject,
            rich: TestScenarios.richStoryboard,
            audio: TestScenarios.audioProject,
        };
    },

    /**
     * Create a test project (without publishing)
     */
    createProject: createTestProject,

    /**
     * Create a test job (without publishing)
     */
    createJob: createTestJob,

    /**
     * Available job types
     */
    get jobTypes(): JobType[] {
        return [
            "EXPAND_CREATIVE_PROMPT",
            "GENERATE_STORYBOARD",
            "PROCESS_AUDIO_TO_SCENES",
            "ENHANCE_STORYBOARD",
            "SEMANTIC_ANALYSIS",
            "GENERATE_CHARACTER_ASSETS",
            "GENERATE_LOCATION_ASSETS",
            "GENERATE_SCENE_FRAMES",
            "GENERATE_SCENE_VIDEO",
            "RENDER_VIDEO",
        ];
    },
};

// ============================================================================
// REPL SERVER
// ============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
    console.log("🚀 PubSub Testing REPL");
    console.log("=====================\n");
    console.log("Available commands:");
    console.log("  pubsubTesting.publishFullState({ scenario: 'rich' })");
    console.log("  pubsubTesting.givenFullState()");
    console.log("  pubsubTesting.dispatchJob('EXPAND_CREATIVE_PROMPT', 'proj-123')");
    console.log("  pubsubTesting.givenJobDispatch('GENERATE_STORYBOARD')");
    console.log("  pubsubTesting.dispatchJobChain('proj-123', 500)");
    console.log("  pubsubTesting.givenWorkflow({ audio: true, sceneCount: 5 })");
    console.log("  pubsubTesting.givenJobDispatched('job-123', 'proj-123')");
    console.log("  pubsubTesting.givenJobCompleted('job-123', 'proj-123')");
    console.log("  pubsubTesting.givenJobFailed('job-123', 'proj-123', 'error message')");
    console.log("  pubsubTesting.status()");
    console.log("  pubsubTesting.jobTypes");
    console.log("  await pubsubTesting.close()\n");

    const replServer = repl.start({
        prompt: "pubsub-test> ",
        useGlobal: true,
    });

    // Make pubsubTesting available in REPL context
    replServer.context.pubsubTesting = pubsubTesting;
    replServer.context.ps = pubsubTesting; // Short alias

    replServer.on("exit", async () => {
        await pubsubTesting.close();
        console.log("\n👋 Goodbye!");
        process.exit(0);
    });
}

// Export for module usage
export default pubsubTesting;
