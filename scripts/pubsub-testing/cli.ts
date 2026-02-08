#!/usr/bin/env tsx
/**
 * PubSub Test CLI
 * Command-line interface for publishing test events to pubsub topics
 *
 * Usage:
 *   tsx scripts/pubsub-testing/cli.ts <command> [options]
 *
 * Commands:
 *   full-state [projectId] [--scenario=<name>] [--dry-run]
 *   job-event <type> <jobId> [projectId] [--error=<msg>]
 *   job-chain <projectId> [--delay=<ms>]
 *   workflow <projectId> [--audio]
 *   batch [--file=<path>] [--delay=<ms>]
 *
 * Examples:
 *   tsx cli.ts full-state --scenario=richStoryboard
 *   tsx cli.ts job-event JOB_DISPATCHED job-123 proj-456
 *   tsx cli.ts job-event JOB_FAILED job-123 proj-456 --error="Test error"
 *   tsx cli.ts workflow proj-789 --audio
 */

import * as dotenv from "dotenv";
dotenv.config();

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { PubSubTestPublisher, publishBatch } from "./publisher.js";
import {
    TestScenarios,
    createFullStateEvent,
    createJobEvent,
    createTestJob,
    type PublishableEvent,
} from "./fixtures.js";
import type { JobType } from "../../src/shared/types/job.types.js";
import { v7 as uuidv7 } from "uuid";

// ============================================================================
// CLI SETUP
// ============================================================================

const argv = yargs(hideBin(process.argv))
    .scriptName("pubsub-test")
    .usage("$0 <command> [args]")
    .command("full-state [projectId]", "Publish a FULL_STATE event", (yargs) => {
        return yargs
            .positional("projectId", {
                describe: "Project ID (optional, generates if missing)",
                type: "string",
            })
            .option("scenario", {
                describe: "Test scenario to use",
                choices: ["minimal", "rich", "audio"] as const,
                default: "rich",
            })
            .option("dry-run", {
                describe: "Log without publishing",
                type: "boolean",
                default: false,
            });
    })
    .command("job-event <type> <jobId> [projectId]", "Publish a job event", (yargs) => {
        return yargs
            .positional("type", {
                describe: "Job event type",
                choices: ["JOB_DISPATCHED", "JOB_STARTED", "JOB_COMPLETED", "JOB_FAILED", "JOB_CANCELLED"] as const,
                demandOption: true,
            })
            .positional("jobId", {
                describe: "Job ID",
                type: "string",
                demandOption: true,
            })
            .positional("projectId", {
                describe: "Project ID (optional for JOB_STARTED/JOB_CANCELLED)",
                type: "string",
            })
            .option("error", {
                describe: "Error message (for JOB_FAILED)",
                type: "string",
                default: "Test failure",
            })
            .option("dry-run", {
                describe: "Log without publishing",
                type: "boolean",
                default: false,
            });
    })
    .command("dispatch-job <type> [projectId]", "Create and dispatch a job", (yargs) => {
        return yargs
            .positional("type", {
                describe: "Job type to dispatch",
                type: "string",
                choices: [
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
                ] as const,
                demandOption: true,
            })
            .positional("projectId", {
                describe: "Project ID (generates if missing)",
                type: "string",
            })
            .option("dry-run", {
                describe: "Log without publishing",
                type: "boolean",
                default: false,
            });
    })
    .command("job-chain [projectId]", "Dispatch a chain of jobs", (yargs) => {
        return yargs
            .positional("projectId", {
                describe: "Project ID (generates if missing)",
                type: "string",
            })
            .option("delay", {
                describe: "Delay between job dispatches (ms)",
                type: "number",
                default: 500,
            })
            .option("dry-run", {
                describe: "Log without publishing",
                type: "boolean",
                default: false,
            });
    })
    .command("workflow [projectId]", "Create a full test workflow project", (yargs) => {
        return yargs
            .positional("projectId", {
                describe: "Project ID (generates if missing)",
                type: "string",
            })
            .option("audio", {
                describe: "Include audio analysis",
                type: "boolean",
                default: false,
            })
            .option("scenes", {
                describe: "Number of scenes",
                type: "number",
                default: 3,
            })
            .option("dry-run", {
                describe: "Log without publishing",
                type: "boolean",
                default: false,
            });
    })
    .option("verbose", {
        describe: "Verbose output",
        alias: "v",
        type: "boolean",
        default: false,
    })
    .help()
    .alias("help", "h")
    .demandCommand(1, "Please specify a command")
    .strict()
    .parseSync();

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

async function handleFullState(args: ReturnType<typeof yargs>["argv"]) {
    const projectId = args.projectId as string | undefined ?? uuidv7();
    const scenario = args.scenario as "minimal" | "rich" | "audio";
    const dryRun = args.dryRun as boolean;

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

    const event = createFullStateEvent(project);

    const publisher = new PubSubTestPublisher({ dryRun });
    const result = await publisher.publishPipelineEvent({
        type: "FULL_STATE",
        projectId,
        payload: event,
        timestamp: new Date().toISOString(),
    });

    if (result.success) {
        console.log(`✅ FULL_STATE published for project: ${projectId}`);
        console.log(`   Project: ${project.metadata.title}`);
        console.log(`   Scenes: ${project.scenes.length}`);
        console.log(`   Characters: ${project.characters.length}`);
        console.log(`   Locations: ${project.locations.length}`);
    } else {
        console.error(`❌ Failed: ${result.error}`);
        process.exit(1);
    }

    await publisher.close();
}

async function handleJobEvent(args: ReturnType<typeof yargs>["argv"]) {
    const type = args.type as "JOB_DISPATCHED" | "JOB_STARTED" | "JOB_COMPLETED" | "JOB_FAILED" | "JOB_CANCELLED";
    const jobId = args.jobId as string;
    const projectId = args.projectId as string | undefined ?? (type === "JOB_STARTED" || type === "JOB_CANCELLED" ? undefined : uuidv7());
    const error = args.error as string;
    const dryRun = args.dryRun as boolean;

    if ((type === "JOB_DISPATCHED" || type === "JOB_COMPLETED") && !projectId) {
        console.error("❌ projectId required for JOB_DISPATCHED and JOB_COMPLETED");
        process.exit(1);
    }

    const event = createJobEvent(type, jobId, projectId!, error);

    const publisher = new PubSubTestPublisher({ dryRun });
    const result = await publisher.publishJobEvent(event as Parameters<typeof publisher.publishJobEvent>[0]);

    if (result.success) {
        console.log(`✅ ${type} published`);
        console.log(`   Job ID: ${jobId}`);
        if (projectId) console.log(`   Project ID: ${projectId}`);
        if (type === "JOB_FAILED") console.log(`   Error: ${error}`);
    } else {
        console.error(`❌ Failed: ${result.error}`);
        process.exit(1);
    }

    await publisher.close();
}

async function handleDispatchJob(args: ReturnType<typeof yargs>["argv"]) {
    const type = args.type as JobType;
    const projectId = args.projectId as string | undefined ?? uuidv7();
    const dryRun = args.dryRun as boolean;

    const job = createTestJob(type, { projectId });

    const publisher = new PubSubTestPublisher({ dryRun });

    // First dispatch the job
    const dispatchResult = await publisher.publishJobEvent({
        type: "JOB_DISPATCHED",
        jobId: job.id,
        projectId,
    });

    if (dispatchResult.success) {
        console.log(`✅ Job dispatched`);
        console.log(`   Type: ${type}`);
        console.log(`   Job ID: ${job.id}`);
        console.log(`   Project ID: ${projectId}`);
        console.log(`   Asset Key: ${job.assetKey}`);
    } else {
        console.error(`❌ Failed: ${dispatchResult.error}`);
        process.exit(1);
    }

    await publisher.close();
}

async function handleJobChain(args: ReturnType<typeof yargs>["argv"]) {
    const projectId = args.projectId as string | undefined ?? uuidv7();
    const delay = args.delay as number;
    const dryRun = args.dryRun as boolean;

    console.log(`🔗 Dispatching job chain for project: ${projectId}`);

    const jobs = TestScenarios.workflowChain(projectId);
    const publisher = new PubSubTestPublisher({ dryRun });

    const events = jobs.map(job => ({
        type: "job" as const,
        data: {
            type: "JOB_DISPATCHED" as const,
            jobId: job.id,
            projectId: job.projectId,
        },
    }));

    const result = await publishBatch(publisher, events, { delayMs: delay, continueOnError: true });

    console.log(`\n📊 Results:`);
    console.log(`   Total: ${result.total}`);
    console.log(`   Successful: ${result.successful}`);
    console.log(`   Failed: ${result.failed}`);

    jobs.forEach((job, i) => {
        const status = result.results[i]?.success ? "✅" : "❌";
        console.log(`   ${status} ${job.type} (${job.id.slice(0, 8)}...)`);
    });

    await publisher.close();
}

async function handleWorkflow(args: ReturnType<typeof yargs>["argv"]) {
    const projectId = args.projectId as string | undefined ?? uuidv7();
    const withAudio = args.audio as boolean;
    const sceneCount = args.scenes as number;
    const dryRun = args.dryRun as boolean;

    console.log(`🎬 Creating workflow test project: ${projectId}`);

    // Create project with FULL_STATE
    let project = withAudio ? TestScenarios.audioProject() : TestScenarios.richStoryboard();
    project.id = projectId;

    // Limit scenes if specified
    if (sceneCount !== project.scenes.length) {
        project.scenes = project.scenes.slice(0, sceneCount);
    }

    // Update project IDs
    project.scenes.forEach((s, i) => {
        s.projectId = projectId;
        s.sceneIndex = i;
    });
    project.characters.forEach(c => c.projectId = projectId);
    project.locations.forEach(l => l.projectId = projectId);

    const publisher = new PubSubTestPublisher({ dryRun });

    // Publish FULL_STATE
    const stateResult = await publisher.publishPipelineEvent({
        type: "FULL_STATE",
        projectId,
        payload: { project },
        timestamp: new Date().toISOString(),
    });

    if (!stateResult.success) {
        console.error(`❌ Failed to publish FULL_STATE: ${stateResult.error}`);
        process.exit(1);
    }

    console.log(`✅ FULL_STATE published`);
    console.log(`   Title: ${project.metadata.title}`);
    console.log(`   Scenes: ${project.scenes.length}`);

    // Dispatch initial job
    const initialJob = withAudio
        ? createTestJob("PROCESS_AUDIO_TO_SCENES", { projectId })
        : createTestJob("EXPAND_CREATIVE_PROMPT", { projectId });

    const jobResult = await publisher.publishJobEvent({
        type: "JOB_DISPATCHED",
        jobId: initialJob.id,
        projectId,
    });

    if (jobResult.success) {
        console.log(`✅ Initial job dispatched: ${initialJob.type}`);
    } else {
        console.error(`❌ Failed to dispatch job: ${jobResult.error}`);
    }

    await publisher.close();
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
    const command = argv._[0] as string;

    try {
        switch (command) {
            case "full-state":
                await handleFullState(argv);
                break;
            case "job-event":
                await handleJobEvent(argv);
                break;
            case "dispatch-job":
                await handleDispatchJob(argv);
                break;
            case "job-chain":
                await handleJobChain(argv);
                break;
            case "workflow":
                await handleWorkflow(argv);
                break;
            default:
                console.error(`Unknown command: ${command}`);
                process.exit(1);
        }
    } catch (error) {
        console.error("❌ Error:", error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

main();
