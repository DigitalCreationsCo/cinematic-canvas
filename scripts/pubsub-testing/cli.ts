#!/usr/bin/env tsx
/**
 * PubSub Testing Interactive CLI (Continuous Session)
 * Choice-based menu interface that maintains session state
 *
 * Revisions:
 * - Added global pageSize to ensure all menu choices are visible.
 * - Improved type safety for menu choices.
 * - Stabilized stdin handling in pause logic.
 */

import * as dotenv from "dotenv";
dotenv.config();

import inquirer from "inquirer";
import { v7 as uuidv7 } from "uuid";
import { pubsubTesting } from "./repl.js";
import type { JobType } from "../../src/shared/types/job.types.js";

// ============================================================================
// CONFIGURATION
// ============================================================================

// Ensures lists show all options without aggressive scrolling
const MENU_PAGE_SIZE = 20;

// ============================================================================
// TYPES
// ============================================================================

interface MenuChoice {
    name: string;
    value: string;
    type?: string; // For Separator
}

interface SessionOperation {
    timestamp: Date;
    type: string;
    description: string;
    projectId?: string;
    jobId?: string;
    success: boolean;
}

interface SessionState {
    operations: SessionOperation[];
    startTime: Date;
    lastProjectId?: string;
    lastJobId?: string;
}

// ============================================================================
// SESSION STATE
// ============================================================================

const session: SessionState = {
    operations: [],
    startTime: new Date(),
};

function addToHistory(operation: SessionOperation) {
    session.operations.push(operation);
    
    // Update last used IDs
    if (operation.projectId) session.lastProjectId = operation.projectId;
    if (operation.jobId) session.lastJobId = operation.jobId;
    
    // Keep only last 20 operations
    if (session.operations.length > 20) {
        session.operations.shift();
    }
}

function getRecentOperations(count: number = 5): SessionOperation[] {
    return session.operations.slice(-count).reverse();
}

function getSessionStats() {
    const total = session.operations.length;
    const successful = session.operations.filter(op => op.success).length;
    const failed = total - successful;
    const duration = Math.floor((new Date().getTime() - session.startTime.getTime()) / 1000);
    
    return { total, successful, failed, duration };
}

// ============================================================================
// DISPLAY UTILITIES
// ============================================================================

function clearScreen() {
    // \x1Bc resets the terminal, generally cleaner than console.clear() for full redraws
    process.stdout.write('\x1Bc'); 
}

function showHeader(title: string, showRecent: boolean = true) {
    console.log("\n" + "═".repeat(70));
    console.log(`  ${title}`);
    console.log("═".repeat(70));
    
    if (showRecent) {
        const recent = getRecentOperations(3);
        if (recent.length > 0) {
            console.log("\n📋 Recent Operations:");
            recent.forEach((op) => {
                const icon = op.success ? "✅" : "❌";
                const time = op.timestamp.toLocaleTimeString();
                const desc = op.description.length > 50 
                    ? op.description.slice(0, 47) + "..." 
                    : op.description;
                console.log(`   ${icon} ${time} - ${desc}`);
            });
        }
    }
    console.log();
}

function showBreadcrumb(path: string[]) {
    if (path.length > 0) {
        console.log(`📍 ${path.join(" → ")}\n`);
    }
}

/**
 * Pauses execution.
 * If autoReturnSeconds > 0, simply waits.
 * If 0, requires user interaction.
 * * Note: Removed the "keypress to skip wait" logic as it interferes 
 * with Inquirer's readline interface on subsequent prompts.
 */
async function pause(autoReturnSeconds: number = 2) {
    if (autoReturnSeconds > 0) {
        console.log(`\n⏎  Returning to menu in ${autoReturnSeconds}s...`);
        await new Promise(resolve => setTimeout(resolve, autoReturnSeconds * 1000));
    } else {
        await inquirer.prompt([{
            type: "input",
            name: "continue",
            message: "Press Enter to continue...",
            prefix: "👉", 
        }]);
    }
}

// ============================================================================
// ID MANAGEMENT
// ============================================================================

async function promptForProjectId(
    optional: boolean = false,
    message: string = "Project ID"
): Promise<string> {
    const choices: MenuChoice[] = [];
    
    // Add last used project ID if available
    if (session.lastProjectId) {
        choices.push({
            name: `Use last project ID (${session.lastProjectId.slice(0, 16)}...)`,
            value: "last",
        });
    }
    
    choices.push(
        { name: "Generate new UUID", value: "generate" },
        { name: "Enter custom ID", value: "custom" }
    );
    
    const { choice } = await inquirer.prompt([{
        type: "list",
        name: "choice",
        message: `${message}:`,
        choices,
        pageSize: MENU_PAGE_SIZE
    }]);

    if (choice === "last") {
        console.log(`   Using: ${session.lastProjectId}`);
        return session.lastProjectId!;
    }
    
    if (choice === "generate") {
        const generated = uuidv7();
        console.log(`   Generated: ${generated}`);
        return generated;
    }

    const { projectId } = await inquirer.prompt([{
        type: "input",
        name: "projectId",
        message: "Enter project ID:",
        validate: (input) => input.length > 0 || "Project ID cannot be empty",
    }]);
    
    return projectId;
}

async function promptForJobId(message: string = "Job ID"): Promise<string> {
    const choices: MenuChoice[] = [];
    
    if (session.lastJobId) {
        choices.push({
            name: `Use last job ID (${session.lastJobId.slice(0, 16)}...)`,
            value: "last",
        });
    }
    
    choices.push(
        { name: "Generate new UUID", value: "generate" },
        { name: "Enter custom ID", value: "custom" }
    );
    
    const { choice } = await inquirer.prompt([{
        type: "list",
        name: "choice",
        message: `${message}:`,
        choices,
        pageSize: MENU_PAGE_SIZE
    }]);

    if (choice === "last") {
        console.log(`   Using: ${session.lastJobId}`);
        return session.lastJobId!;
    }
    
    if (choice === "generate") {
        const generated = uuidv7();
        console.log(`   Generated: ${generated}`);
        return generated;
    }

    const { jobId } = await inquirer.prompt([{
        type: "input",
        name: "jobId",
        message: "Enter job ID:",
        validate: (input) => input.length > 0 || "Job ID cannot be empty",
    }]);
    
    return jobId;
}

// ============================================================================
// MENU ACTIONS
// ============================================================================

async function publishFullStateMinimal() {
    clearScreen();
    showHeader("Publish Full State - Minimal Project");

    const projectId = await promptForProjectId();

    console.log("\n🚀 Publishing minimal project...\n");
    const result = await pubsubTesting.givenFullState({
        scenario: "minimal",
        projectId,
    });

    addToHistory({
        timestamp: new Date(),
        type: "full-state",
        description: `Minimal project`,
        projectId,
        success: result.success,
    });

    if (result.success) {
        console.log(`\n✅ Published minimal project: ${result.projectId}`);
    } else {
        console.error(`\n❌ Failed: ${result.error}`);
    }

    await pause();
}

async function publishFullStateRich() {
    clearScreen();
    showHeader("Publish Full State - Rich Storyboard");

    const projectId = await promptForProjectId();

    console.log("\n🚀 Publishing rich storyboard...\n");
    const result = await pubsubTesting.givenFullState({
        scenario: "rich",
        projectId,
    });

    addToHistory({
        timestamp: new Date(),
        type: "full-state",
        description: `Rich storyboard (5 scenes)`,
        projectId,
        success: result.success,
    });

    if (result.success) {
        console.log(`\n✅ Published rich storyboard: ${result.projectId}`);
    } else {
        console.error(`\n❌ Failed: ${result.error}`);
    }

    await pause();
}

async function publishFullStateAudio() {
    clearScreen();
    showHeader("Publish Full State - Audio Project");

    const projectId = await promptForProjectId();

    console.log("\n🚀 Publishing audio project...\n");
    const result = await pubsubTesting.givenFullState({
        scenario: "audio",
        projectId,
    });

    addToHistory({
        timestamp: new Date(),
        type: "full-state",
        description: `Audio project`,
        projectId,
        success: result.success,
    });

    if (result.success) {
        console.log(`\n✅ Published audio project: ${result.projectId}`);
    } else {
        console.error(`\n❌ Failed: ${result.error}`);
    }

    await pause();
}

async function dispatchSingleJob() {
    clearScreen();
    showHeader("Dispatch Single Job");

    const { jobType } = await inquirer.prompt([{
        type: "list",
        name: "jobType",
        message: "Select job type:",
        choices: [
            { name: "📝 Expand Creative Prompt", value: "EXPAND_CREATIVE_PROMPT" },
            { name: "🎬 Generate Storyboard", value: "GENERATE_STORYBOARD" },
            { name: "🎵 Process Audio to Scenes", value: "PROCESS_AUDIO_TO_SCENES" },
            { name: "✨ Enhance Storyboard", value: "ENHANCE_STORYBOARD" },
            { name: "🔍 Semantic Analysis", value: "SEMANTIC_ANALYSIS" },
            { name: "👤 Generate Character Assets", value: "GENERATE_CHARACTER_ASSETS" },
            { name: "🏛️  Generate Location Assets", value: "GENERATE_LOCATION_ASSETS" },
            { name: "🖼️  Generate Scene Frames", value: "GENERATE_SCENE_FRAMES" },
            { name: "🎥 Generate Scene Video", value: "GENERATE_SCENE_VIDEO" },
            { name: "🎞️  Render Video", value: "RENDER_VIDEO" },
            new inquirer.Separator(),
            { name: "← Back", value: "back" },
        ],
        pageSize: MENU_PAGE_SIZE,
    }]);

    if (jobType === "back") return;

    const projectId = await promptForProjectId();

    console.log("\n🚀 Dispatching job...\n");
    const result = await pubsubTesting.givenJobDispatch(jobType as JobType, projectId);

    addToHistory({
        timestamp: new Date(),
        type: "dispatch-job",
        description: `${jobType}`,
        projectId,
        jobId: result.jobId,
        success: result.success,
    });

    if (result.success) {
        console.log(`\n✅ Dispatched ${jobType}`);
        console.log(`   Job ID: ${result.jobId}`);
        console.log(`   Project ID: ${result.projectId}`);
    } else {
        console.error(`\n❌ Failed: ${result.error}`);
    }

    await pause();
}

async function dispatchJobChain() {
    clearScreen();
    showHeader("Dispatch Job Chain");

    const projectId = await promptForProjectId();

    const { delayMs } = await inquirer.prompt([{
        type: "number",
        name: "delayMs",
        message: "Delay between dispatches (ms):",
        default: 500,
        validate: (input) => input >= 0 || "Delay must be non-negative",
    }]);

    console.log("\n🔗 Dispatching job chain...\n");
    const result = await pubsubTesting.givenJobChain(projectId, delayMs);

    addToHistory({
        timestamp: new Date(),
        type: "job-chain",
        description: `Job chain (${result.results.length} jobs)`,
        projectId,
        success: result.success,
    });

    if (result.success) {
        console.log(`\n✅ Dispatched all jobs in chain`);
    } else {
        console.error(`\n❌ Some jobs failed`);
    }

    await pause(3); // Longer pause for job chain
}

async function dispatchBatchStressTest() {
    clearScreen();
    showHeader("Dispatch Batch Stress Test");

    const projectId = await promptForProjectId();

    const { delayMs } = await inquirer.prompt([ {
        type: "number",
        name: "delayMs",
        message: "Delay between dispatches (ms):",
        default: 500,
        validate: (input) => input >= 0 || "Delay must be non-negative",
    } ]);

    console.log("\n🔗 Dispatching batch stress test...\n");
    const result = await pubsubTesting.dispatchBatchStressTest(projectId, delayMs);

    addToHistory({
        timestamp: new Date(),
        type: "batch-stress-test",
        description: `Batch stress test (${result.results.length} jobs)`,
        projectId,
        success: result.success,
    });

    if (result.success) {
        console.log(`\n✅ Dispatched all batch jobs`);
    } else {
        console.error(`\n❌ Some batch jobs failed`);
    }

    await pause(3);
}

async function jobDispatched() {
    clearScreen();
    showHeader("Job Dispatched Event");

    const jobId = await promptForJobId();
    const projectId = await promptForProjectId();

    console.log("\n🚀 Publishing JOB_DISPATCHED event...\n");
    const result = await pubsubTesting.givenJobDispatched(jobId, projectId);

    addToHistory({
        timestamp: new Date(),
        type: "job-event",
        description: `JOB_DISPATCHED`,
        projectId,
        jobId,
        success: result.success,
    });

    if (result.success) {
        console.log(`\n✅ Published JOB_DISPATCHED`);
    } else {
        console.error(`\n❌ Failed: ${result.error}`);
    }

    await pause();
}

async function jobStarted() {
    clearScreen();
    showHeader("Job Started Event");

    const jobId = await promptForJobId();

    console.log("\n🚀 Publishing JOB_STARTED event...\n");
    const result = await pubsubTesting.givenJobStarted(jobId);

    addToHistory({
        timestamp: new Date(),
        type: "job-event",
        description: `JOB_STARTED`,
        jobId,
        success: result.success,
    });

    if (result.success) {
        console.log(`\n✅ Published JOB_STARTED`);
    } else {
        console.error(`\n❌ Failed: ${result.error}`);
    }

    await pause();
}

async function jobCompleted() {
    clearScreen();
    showHeader("Job Completed Event");

    const jobId = await promptForJobId();
    const projectId = await promptForProjectId();

    console.log("\n🚀 Publishing JOB_COMPLETED event...\n");
    const result = await pubsubTesting.givenJobCompleted(jobId, projectId);

    addToHistory({
        timestamp: new Date(),
        type: "job-event",
        description: `JOB_COMPLETED`,
        projectId,
        jobId,
        success: result.success,
    });

    if (result.success) {
        console.log(`\n✅ Published JOB_COMPLETED`);
    } else {
        console.error(`\n❌ Failed: ${result.error}`);
    }

    await pause();
}

async function jobFailed() {
    clearScreen();
    showHeader("Job Failed Event");

    const jobId = await promptForJobId();
    const projectId = await promptForProjectId();

    const { errorMessage } = await inquirer.prompt([{
        type: "input",
        name: "errorMessage",
        message: "Error message:",
        default: "Test failure",
    }]);

    console.log("\n🚀 Publishing JOB_FAILED event...\n");
    const result = await pubsubTesting.givenJobFailed(jobId, projectId, errorMessage);

    addToHistory({
        timestamp: new Date(),
        type: "job-event",
        description: `JOB_FAILED: ${errorMessage}`,
        projectId,
        jobId,
        success: result.success,
    });

    if (result.success) {
        console.log(`\n✅ Published JOB_FAILED`);
    } else {
        console.error(`\n❌ Failed: ${result.error}`);
    }

    await pause();
}

async function jobCancelled() {
    clearScreen();
    showHeader("Job Cancelled Event");

    const jobId = await promptForJobId();

    console.log("\n🚀 Publishing JOB_CANCELLED event...\n");
    const result = await pubsubTesting.publishJobEvent("JOB_CANCELLED", jobId);

    addToHistory({
        timestamp: new Date(),
        type: "job-event",
        description: `JOB_CANCELLED`,
        jobId,
        success: result.success,
    });

    if (result.success) {
        console.log(`\n✅ Published JOB_CANCELLED`);
    } else {
        console.error(`\n❌ Failed: ${result.error}`);
    }

    await pause();
}

async function workflowStandard() {
    clearScreen();
    showHeader("Standard Workflow");

    const projectId = await promptForProjectId();

    const { sceneCount } = await inquirer.prompt([{
        type: "number",
        name: "sceneCount",
        message: "Number of scenes:",
        default: 3,
        validate: (input) => input > 0 || "Must have at least 1 scene",
    }]);

    console.log("\n🎬 Creating standard workflow...\n");
    const result = await pubsubTesting.givenWorkflow({
        projectId,
        audio: false,
        sceneCount,
    });

    addToHistory({
        timestamp: new Date(),
        type: "workflow",
        description: `Standard workflow (${sceneCount} scenes)`,
        projectId,
        success: result.success,
    });

    if (result.success) {
        console.log(`\n✅ Created standard workflow: ${result.projectId}`);
    } else {
        console.error(`\n❌ Failed: ${result.error}`);
    }

    await pause();
}

async function workflowAudio() {
    clearScreen();
    showHeader("Audio Workflow");

    const projectId = await promptForProjectId();

    const { sceneCount } = await inquirer.prompt([{
        type: "number",
        name: "sceneCount",
        message: "Number of scenes:",
        default: 3,
        validate: (input) => input > 0 || "Must have at least 1 scene",
    }]);

    console.log("\n🎬 Creating audio workflow...\n");
    const result = await pubsubTesting.givenWorkflow({
        projectId,
        audio: true,
        sceneCount,
    });

    addToHistory({
        timestamp: new Date(),
        type: "workflow",
        description: `Audio workflow (${sceneCount} scenes)`,
        projectId,
        success: result.success,
    });

    if (result.success) {
        console.log(`\n✅ Created audio workflow: ${result.projectId}`);
    } else {
        console.error(`\n❌ Failed: ${result.error}`);
    }

    await pause();
}

async function workflowBatchStressTest() {
    clearScreen();
    showHeader("Batch Stress Test Workflow");

    const projectId = await promptForProjectId();

    console.log("\n🎬 Creating batch stress test workflow...\n");
    const result = await pubsubTesting.givenBatchStressTest(projectId);

    addToHistory({
        timestamp: new Date(),
        type: "workflow-batch",
        description: `Batch stress test workflow`,
        projectId,
        success: result.success,
    });

    if (result.success) {
        console.log(`\n✅ Created batch stress test workflow: ${result.projectId}`);
    } else {
        console.error(`\n❌ Failed: ${result.error}`);
    }

    await pause();
}

async function viewSessionHistory() {
    clearScreen();
    showHeader("Session History", false);

    const stats = getSessionStats();
    const allOps = getRecentOperations(20);

    console.log("📊 Session Statistics:\n");
    console.log(`   Started: ${session.startTime.toLocaleString()}`);
    console.log(`   Duration: ${Math.floor(stats.duration / 60)}m ${stats.duration % 60}s`);
    console.log(`   Total Operations: ${stats.total}`);
    console.log(`   Successful: ${stats.successful} ✅`);
    console.log(`   Failed: ${stats.failed} ❌`);
    
    if (session.lastProjectId) {
        console.log(`   Last Project ID: ${session.lastProjectId}`);
    }
    if (session.lastJobId) {
        console.log(`   Last Job ID: ${session.lastJobId}`);
    }

    if (allOps.length > 0) {
        console.log("\n📋 Operation History:\n");
        allOps.forEach((op, i) => {
            const icon = op.success ? "✅" : "❌";
            const time = op.timestamp.toLocaleTimeString();
            console.log(`   ${i + 1}. ${icon} ${time} - ${op.type.toUpperCase()}`);
            console.log(`      ${op.description}`);
            if (op.projectId) {
                console.log(`      Project: ${op.projectId.slice(0, 16)}...`);
            }
        });
    } else {
        console.log("\n   No operations yet in this session.");
    }

    await pause(0); // Manual press to continue
}

async function viewStatus() {
    clearScreen();
    showHeader("Publisher Status", false);

    const status = pubsubTesting.status();

    console.log("📡 Configuration:\n");
    console.log(`   Project ID: ${status.projectId}`);
    console.log(`   Emulator Host: ${status.emulatorHost || "(using production)"}`);
    console.log(`   Dry Run: ${status.dryRun ? "Yes" : "No"}`);
    
    console.log("\n📬 Topics:\n");
    console.log(`   Job Events: ${status.topics.jobEvents}`);
    console.log(`   Pipeline Events: ${status.topics.pipelineEvents}`);
    console.log(`   Pipeline Commands: ${status.topics.pipelineCommands}`);
    
    console.log("\n🎯 Available Job Types:\n");
    // Ensure jobTypes exists to prevent crash if undefined
    const types = pubsubTesting.jobTypes || [];
    types.forEach((type, i) => {
        console.log(`   ${i + 1}. ${type}`);
    });

    await pause(0);
}

// ============================================================================
// SUBMENUS
// ============================================================================

async function fullStateMenu() {
    while (true) {
        clearScreen();
        showHeader("Full State Events");
        showBreadcrumb(["Main Menu", "Full State Events"]);

        const { action } = await inquirer.prompt([{
            type: "list",
            name: "action",
            message: "Select an option:",
            choices: [
                { name: "📦 Publish Minimal Project", value: "minimal" },
                { name: "🎨 Publish Rich Storyboard", value: "rich" },
                { name: "🎵 Publish Audio Project", value: "audio" },
                new inquirer.Separator(),
                { name: "← Back to Main Menu", value: "back" },
            ],
            pageSize: MENU_PAGE_SIZE,
        }]);

        if (action === "back") break;

        switch (action) {
            case "minimal":
                await publishFullStateMinimal();
                break;
            case "rich":
                await publishFullStateRich();
                break;
            case "audio":
                await publishFullStateAudio();
                break;
        }
    }
}

async function jobLifecycleMenu() {
    while (true) {
        clearScreen();
        showHeader("Job Lifecycle Events");
        showBreadcrumb(["Main Menu", "Job Events", "Job Lifecycle"]);

        const { action } = await inquirer.prompt([{
            type: "list",
            name: "action",
            message: "Select event type:",
            choices: [
                { name: "🚀 Job Dispatched", value: "dispatched" },
                { name: "▶️  Job Started", value: "started" },
                { name: "✅ Job Completed", value: "completed" },
                { name: "❌ Job Failed", value: "failed" },
                { name: "🛑 Job Cancelled", value: "cancelled" },
                new inquirer.Separator(),
                { name: "← Back", value: "back" },
            ],
            pageSize: MENU_PAGE_SIZE,
        }]);

        if (action === "back") break;

        switch (action) {
            case "dispatched":
                await jobDispatched();
                break;
            case "started":
                await jobStarted();
                break;
            case "completed":
                await jobCompleted();
                break;
            case "failed":
                await jobFailed();
                break;
            case "cancelled":
                await jobCancelled();
                break;
        }
    }
}

async function jobEventsMenu() {
    while (true) {
        clearScreen();
        showHeader("Job Events");
        showBreadcrumb(["Main Menu", "Job Events"]);

        const { action } = await inquirer.prompt([{
            type: "list",
            name: "action",
            message: "Select an option:",
            choices: [
                { name: "🎯 Dispatch Single Job", value: "single" },
                { name: "🔗 Dispatch Job Chain", value: "chain" },
                { name: "🏗️  Dispatch Batch Stress Test", value: "batch" },
                { name: "📊 Job Lifecycle Events", value: "lifecycle" },
                new inquirer.Separator(),
                { name: "← Back to Main Menu", value: "back" },
            ],
            pageSize: MENU_PAGE_SIZE,
        }]);

        if (action === "back") break;

        switch (action) {
            case "single":
                await dispatchSingleJob();
                break;
            case "chain":
                await dispatchJobChain();
                break;
            case "batch":
                await dispatchBatchStressTest();
                break;
            case "lifecycle":
                await jobLifecycleMenu();
                break;
        }
    }
}

async function workflowsMenu() {
    while (true) {
        clearScreen();
        showHeader("Workflows");
        showBreadcrumb(["Main Menu", "Workflows"]);

        const { action } = await inquirer.prompt([{
            type: "list",
            name: "action",
            message: "Select workflow type:",
            choices: [
                { name: "🎬 Standard Workflow (Text-based)", value: "standard" },
                { name: "🎵 Audio Workflow (Audio-based)", value: "audio" },
                { name: "🏗️  Batch Stress Test (Full Batch)", value: "batch" },
                new inquirer.Separator(),
                { name: "← Back to Main Menu", value: "back" },
            ],
            pageSize: MENU_PAGE_SIZE,
        }]);

        if (action === "back") break;

        switch (action) {
            case "standard":
                await workflowStandard();
                break;
            case "audio":
                await workflowAudio();
                break;
            case "batch":
                await workflowBatchStressTest();
                break;
        }
    }
}

// ============================================================================
// MAIN MENU
// ============================================================================

async function mainMenu() {
    while (true) {
        clearScreen();
        showHeader("🎬 PubSub Testing - Interactive CLI");

        const stats = getSessionStats();
        if (stats.total > 0) {
            console.log(`📊 Session: ${stats.total} ops (${stats.successful} ✅, ${stats.failed} ❌) | ${Math.floor(stats.duration / 60)}m ${stats.duration % 60}s\n`);
        }

        const { action } = await inquirer.prompt([{
            type: "list",
            name: "action",
            message: "What would you like to do?",
            choices: [
                { name: "📦 Full State Events", value: "fullstate" },
                { name: "🎯 Job Events", value: "jobs" },
                { name: "🎬 Workflows", value: "workflows" },
                new inquirer.Separator(),
                { name: "📜 View Session History", value: "history" },
                { name: "📊 View Publisher Status", value: "status" },
                new inquirer.Separator(),
                { name: "👋 Exit", value: "exit" },
            ],
            pageSize: MENU_PAGE_SIZE,
        }]);

        switch (action) {
            case "fullstate":
                await fullStateMenu();
                break;
            case "jobs":
                await jobEventsMenu();
                break;
            case "workflows":
                await workflowsMenu();
                break;
            case "history":
                await viewSessionHistory();
                break;
            case "status":
                await viewStatus();
                break;
            case "exit":
                clearScreen();
                console.log("\n👋 Session Summary:");
                const finalStats = getSessionStats();
                console.log(`   Duration: ${Math.floor(finalStats.duration / 60)}m ${finalStats.duration % 60}s`);
                console.log(`   Total Operations: ${finalStats.total}`);
                console.log(`   Successful: ${finalStats.successful} ✅`);
                console.log(`   Failed: ${finalStats.failed} ❌`);
                console.log("\nGoodbye!\n");
                
                // Ensure graceful shutdown if method exists
                if (pubsubTesting.close) {
                    await pubsubTesting.close();
                }
                process.exit(0);
        }
    }
}

// ============================================================================
// START
// ============================================================================

async function main() {
    // Only resume stdin if we are actually TTY
    if (process.stdin.isTTY) {
        process.stdin.resume();
    }
    
    try {
        await mainMenu();
    } catch (error) {
        console.error("\n❌ Error:", error instanceof Error ? error.message : error);
        
        // Attempt cleanup on crash
        try {
            if (pubsubTesting.close) await pubsubTesting.close();
        } catch (e) {
            // Ignore cleanup errors on crash
        }
        process.exit(1);
    }
}

main();