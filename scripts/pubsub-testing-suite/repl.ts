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
import { PubSubTestPublisher, PublishResult, publishBatch } from "./publisher.js";
import {
    TestScenarios,
    createFullStateEvent,
    createJobEvent,
    createTestJob,
    createTestProject,
    PIPELINE_JOB_TYPES
} from "./fixtures.js";
import type { JobEvent, JobType } from "../../src/shared/types/job.types.js";
import { generateId } from "#shared/utils/id.js";
import { Project } from "#shared/types/index.js";
import { getContext, TestContext } from "./context.js";

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
    _context: null as TestContext | null,

    async getContext(): Promise<TestContext> {
        if (!this._context) {
            this._context = await getContext();
        }
        return this._context;
    },

    setContext(ctx: TestContext) {
        this._context = ctx;
    },

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

        const ctx = await this.getContext();

        const { scenario = "rich", projectId = ctx.projectId, dryRun = false } = options;

        console.log(`📦 Creating ${scenario} scenario project...`);

        let project: Project;
        switch (scenario) {
            case "minimal":
                project = TestScenarios.minimalProject();
                break;
            case "audio":
                project = TestScenarios.audioProject();
                break;
            case "rich":
            default:
                project = TestScenarios.enrichedStoryboard();
                break;
        }

        project.id = projectId;
        project.scenes.forEach(s => s.projectId = projectId);
        project.characters.forEach(c => c.projectId = projectId);
        project.locations.forEach(l => l.projectId = projectId);

        const publisher = dryRun ? new PubSubTestPublisher({ dryRun: true }) : this.getPublisher();

        const result = await publisher.publishPipelineEvent(createFullStateEvent(project, ctx));

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
        error?: string,
        context?: TestContext,
    ): Promise<{ success: boolean; error?: string }> {

        context = context ?? await this.getContext();

        if ((type === "JOB_DISPATCHED" || type === "JOB_COMPLETED") && !context.projectId) {
            throw new Error(`projectId is required for ${type}`);
        }

        const event = createJobEvent(type, jobId, context, error);
        const result = await this.getPublisher().publishJobEvent(
            event as JobEvent
        );

        if (result.success) {
            console.log(`✅ ${type} published`);
            console.log(`   Job ID: ${jobId}`);
            if (context.projectId) console.log(`   Project ID: ${context.projectId}`);
            if (error) console.log(`   Error: ${error}`);
        } else {
            console.error(`❌ Failed: ${result.error}`);
        }

        return { success: result.success, error: result.error };
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
        payload?: Record<string, unknown>,
        ctx?: TestContext,
    ): Promise<PublishResult<JobEvent>> {
        ctx = ctx ?? await this.getContext();
        const pid = ctx.projectId;
        const job = await createTestJob(type, { projectId: pid, payload }, ctx);

        const result = await this.getPublisher().publishJobEvent({
            type: "JOB_DISPATCHED",
            teamId: ctx.teamId,
            userId: ctx.userId,
            projectId: pid,
            metadata: {
                jobType: type,
                jobId: job.id,
            }
        });

        if (result.success) {
            console.log(`✅ Job dispatched: ${type}`);
            console.log(`   Job ID: ${job.id}`);
            console.log(`   Project ID: ${pid}`);
        } else {
            console.error(`❌ Failed: ${result.error}`);
        }

        return result;
    },

    /**
     * Dispatch a chain of all workflow jobs
     * @param projectId - Optional project ID (generates if missing)
     * @param delayMs - Delay between dispatches (default: 500ms)
     */
    async dispatchJobChain(
        delayMs: number = 500,
        ctx?: TestContext,
    ): Promise<{ success: boolean; projectId: string; results: { type: JobType; success: boolean }[] }> {

        ctx = ctx ?? await this.getContext();
        const pid = ctx.projectId;
        console.log(`🔗 Dispatching job chain for project: ${pid}`);

        const jobs = await TestScenarios.workflowChain(ctx);

        const events = jobs.map(job => ({
            type: "job" as const,
            data: {
                type: "JOB_DISPATCHED" as const,
                teamId: "team-123",
                userId: "user-123",
                projectId: job.projectId,
                metadata: {
                    jobType: job.type,
                    jobId: job.id,
                }
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

    // ========================================================================
    // WORKFLOW SCENARIOS
    // ========================================================================

    /**
     * Create a complete workflow with FULL_STATE + initial job
     * @param options.ctx - Optional context
     * @param options.audio - Include audio analysis
     * @param options.sceneCount - Number of scenes (default: 3)
     */
    async createWorkflow(options: {
        ctx?: TestContext;
        audio?: boolean;
        sceneCount?: number;
    } = {}): Promise<{ success: boolean; projectId: string; error?: string }> {
        const ctx = options.ctx ?? await this.getContext();
        const { audio = false, sceneCount = 3 } = options;

        console.log(`🎬 Creating workflow: ${ctx.projectId}`);

        // Create and publish FULL_STATE
        const stateResult = await this.publishFullState({
            scenario: audio ? "audio" : "rich",
            projectId: ctx.projectId,
        });

        if (!stateResult.success) {
            return stateResult;
        }

        // Dispatch initial job
        const initialJobType: JobType = audio ? "PROCESS_AUDIO_TO_SCENES" : "EXPAND_CREATIVE_PROMPT";
        const jobResult = await this.dispatchJob(initialJobType, {}, ctx);

        return {
            success: jobResult.success,
            projectId: ctx.projectId,
            error: jobResult.error,
        };
    },

    /**
     * Dispatch a batch stress test workflow
     * @param ctx - Optional context
     * @param delayMs - Delay between dispatches (default: 500ms)
     */
    async dispatchBatchStressTest(
        delayMs: number = 500,
        ctx?: TestContext,
    ): Promise<{ success: boolean; projectId: string; results: { type: JobType; success: boolean; }[]; }> {
        ctx = ctx ?? await this.getContext();
        const pid = ctx.projectId;
        console.log(`🔗 Dispatching batch stress test for project: ${pid}`);

        const jobs = await TestScenarios.batchStressTest(ctx);

        const events = jobs.map(job => ({
            type: "job" as const,
            data: {
                type: "JOB_DISPATCHED" as const,
                teamId: ctx.teamId,
                userId: ctx.userId,
                projectId: job.projectId,
                metadata: {
                    jobType: job.type,
                    jobId: job.id,
                }
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
            full: TestScenarios.fullProject,
            enriched: TestScenarios.enrichedStoryboard,
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
    get jobTypes() {
        return PIPELINE_JOB_TYPES;
    },
};

// ============================================================================
// REPL SERVER
// ============================================================================

async function startInteractiveSession() {
    console.log("🚀 PubSub Testing REPL");
    console.log("=====================\n");

    // 1. Resolve context first. 
    // Ensure getContext() uses its own internal readline and CLOSES it.
    const context = await getContext();

    console.log("Available commands:");
    console.log("  ps.publishFullState({ scenario: 'rich' })");
    console.log("  ps.dispatchJob('EXPAND_CREATIVE_PROMPT')");
    console.log("  await ps.close()\n");

    // 2. Only start the REPL after the initial prompts are finished.
    const replServer = repl.start({
        prompt: "pubsub-test> ",
        useGlobal: true,
    });

    // 3. Inject the resolved context and the testing module
    replServer.context.pubsubTesting = pubsubTesting;
    replServer.context.ps = pubsubTesting;
    replServer.context.ctx = context;

    replServer.on("exit", async () => {
        await pubsubTesting.close();
        console.log("\n👋 Goodbye!");
        process.exit(0);
    });
}

// Entry point execution
if (import.meta.url === `file://${process.argv[1]}`) {
    startInteractiveSession().catch((err) => {
        console.error("Failed to start session:", err);
        process.exit(1);
    });
}

// Export for module usage
export default pubsubTesting;
