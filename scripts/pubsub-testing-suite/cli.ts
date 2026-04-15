#!/usr/bin/env tsx
/**
 * Cinematic Canvas PubSub Testing Interactive CLI
 * Hybrid REPL / Menu interface for rapid event testing.
 */

import * as dotenv from "dotenv";
dotenv.config();

import inquirer from "inquirer";
import { generateId } from "#shared/utils/id.js";
import { pubsubTesting } from "./repl.js";
import type { JobType } from "../../src/shared/types/job.types.js";

// ============================================================================
// CONFIGURATION & TYPES
// ============================================================================

const MENU_PAGE_SIZE = 20;

interface MenuChoice {
    name: string;
    value: string;
    type?: string;
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

// session: Global singleton maintaining the state of the current CLI session.
const session: SessionState = {
    operations: [],
    startTime: new Date(),
};

// ============================================================================
// STATE & DISPLAY UTILITIES
// ============================================================================

function addToHistory(operation: SessionOperation) {
    session.operations.push(operation);
    if (operation.projectId) session.lastProjectId = operation.projectId;
    if (operation.jobId) session.lastJobId = operation.jobId;
    if (session.operations.length > 20) session.operations.shift();
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

function clearScreen() {
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
                const desc = op.description.length > 50 ? op.description.slice(0, 47) + "..." : op.description;
                console.log(`   ${icon} ${time} - ${desc}`);
            });
        }
    }
    console.log();
}

async function pause(autoReturnSeconds: number = 2) {
    if (autoReturnSeconds > 0) {
        console.log(`\n⏎  Returning in ${autoReturnSeconds}s...`);
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

async function promptForProjectId(providedId?: string): Promise<string> {
    if (providedId) return providedId;

    const choices: MenuChoice[] = [];
    if (session.lastProjectId) {
        choices.push({ name: `Use last project ID (${session.lastProjectId.slice(0, 16)}...)`, value: "last" });
    }
    choices.push(
        { name: "Generate new UUID", value: "generate" },
        { name: "Enter custom ID", value: "custom" }
    );

    const { choice } = await inquirer.prompt([{
        type: "list", name: "choice", message: "Project ID:", choices, pageSize: MENU_PAGE_SIZE
    }]);

    if (choice === "last") return session.lastProjectId!;
    if (choice === "generate") return generateId();

    const { projectId } = await inquirer.prompt([{
        type: "input", name: "projectId", message: "Enter project ID:",
        validate: (input) => input.length > 0 || "Project ID cannot be empty",
    }]);
    return projectId;
}

async function promptForJobId(providedId?: string): Promise<string> {
    if (providedId) return providedId;

    const choices: MenuChoice[] = [];
    if (session.lastJobId) {
        choices.push({ name: `Use last job ID (${session.lastJobId.slice(0, 16)}...)`, value: "last" });
    }
    choices.push(
        { name: "Generate new UUID", value: "generate" },
        { name: "Enter custom ID", value: "custom" }
    );

    const { choice } = await inquirer.prompt([{
        type: "list", name: "choice", message: "Job ID:", choices, pageSize: MENU_PAGE_SIZE
    }]);

    if (choice === "last") return session.lastJobId!;
    if (choice === "generate") return generateId();

    const { jobId } = await inquirer.prompt([{
        type: "input", name: "jobId", message: "Enter job ID:",
        validate: (input) => input.length > 0 || "Job ID cannot be empty",
    }]);
    return jobId;
}

// ============================================================================
// CORE ACTIONS
// ============================================================================

async function executePublish(scenario: "minimal" | "rich" | "audio", projectIdParam?: string) {
    clearScreen();
    showHeader(`Publish Full State - ${scenario.toUpperCase()}`);
    const projectId = await promptForProjectId(projectIdParam);

    console.log(`\n🚀 Publishing ${scenario} project...\n`);
    const result = await pubsubTesting.publishFullState({ scenario, projectId });

    addToHistory({
        timestamp: new Date(), type: "full-state", description: `${scenario} project`, projectId, success: result.success,
    });

    result.success ? console.log(`\n✅ Published ${scenario}: ${result.projectId}`) : console.error(`\n❌ Failed: ${result.error}`);
    await pause();
}

async function executeDispatch(jobAlias?: string, projectIdParam?: string) {
    clearScreen();
    showHeader("Dispatch Single Job");

    const jobMap: Record<string, string> = {
        prompt: "EXPAND_CREATIVE_PROMPT",
        storyboard: "GENERATE_STORYBOARD",
        audio: "PROCESS_AUDIO_TO_SCENES",
        enhance: "ENHANCE_STORYBOARD",
        semantic: "SEMANTIC_ANALYSIS",
        character: "GENERATE_CHARACTER_ASSETS",
        location: "GENERATE_LOCATION_ASSETS",
        frames: "GENERATE_SCENE_FRAMES",
        video: "GENERATE_SCENE_VIDEO",
        render: "RENDER_VIDEO"
    };

    let mappedType = jobAlias ? jobMap[jobAlias.toLowerCase()] : undefined;

    if (!mappedType) {
        const { selection } = await inquirer.prompt([{
            type: "list", name: "selection", message: "Select Cinematic Canvas job type:",
            choices: Object.entries(jobMap).map(([key, val]) => ({ name: `${key} (${val})`, value: val })),
            pageSize: MENU_PAGE_SIZE,
        }]);
        mappedType = selection;
    }

    const projectId = await promptForProjectId(projectIdParam);
    console.log(`\n🚀 Dispatching ${mappedType}...\n`);

    const result = await pubsubTesting.dispatchJob(mappedType as JobType, projectId);

    addToHistory({
        timestamp: new Date(), type: "dispatch-job", description: `${mappedType}`, projectId, jobId: result.jobId, success: result.success,
    });

    if (result.success) {
        console.log(`\n✅ Dispatched Job ID: ${result.jobId}`);
    } else {
        console.error(`\n❌ Failed: ${result.error}`);
    }
    await pause();
}

async function executeEvent(eventType?: string, jobIdParam?: string, projectIdParam?: string) {
    clearScreen();
    showHeader("Publish Job Event");

    const eventMap: Record<string, string> = {
        dispatched: "JOB_DISPATCHED",
        started: "JOB_STARTED",
        completed: "JOB_COMPLETED",
        failed: "JOB_FAILED",
        cancelled: "JOB_CANCELLED"
    };

    let mappedEvent = eventType ? eventMap[eventType.toLowerCase()] : undefined;

    if (!mappedEvent) {
        const { selection } = await inquirer.prompt([{
            type: "list", name: "selection", message: "Select event:",
            choices: Object.entries(eventMap).map(([k, v]) => ({ name: v, value: v })),
            pageSize: MENU_PAGE_SIZE
        }]);
        mappedEvent = selection;
    }

    const jobId = await promptForJobId(jobIdParam);

    // Project ID is only required for some events. We'll attempt to use the param if provided.
    let projectId: string | undefined = projectIdParam;
    if (["JOB_DISPATCHED", "JOB_COMPLETED", "JOB_FAILED"].includes(mappedEvent) && !projectId) {
        projectId = await promptForProjectId();
    }

    let errorMessage = "Test failure";
    if (mappedEvent === "JOB_FAILED") {
        const { msg } = await inquirer.prompt([{ type: "input", name: "msg", message: "Error message:", default: "Test failure" }]);
        errorMessage = msg;
    }

    console.log(`\n🚀 Publishing ${mappedEvent}...\n`);
    const result = mappedEvent === "JOB_FAILED"
        ? await pubsubTesting.publishJobEvent(mappedEvent, jobId, projectId, errorMessage)
        : await pubsubTesting.publishJobEvent(mappedEvent as any, jobId, projectId);

    addToHistory({
        timestamp: new Date(), type: "job-event", description: mappedEvent, projectId, jobId, success: result.success,
    });

    result.success ? console.log(`\n✅ Published ${mappedEvent}`) : console.error(`\n❌ Failed: ${result.error}`);
    await pause();
}

async function executeWorkflow(type?: string, projectIdParam?: string) {
    clearScreen();
    showHeader("Workflow Generation");

    if (!type || !["standard", "audio", "batch"].includes(type)) {
        const { selection } = await inquirer.prompt([{
            type: "list", name: "selection", message: "Select workflow type:",
            choices: ["standard", "audio", "batch"],
        }]);
        type = selection;
    }

    const projectId = await promptForProjectId(projectIdParam);
    let result;

    if (type === "batch") {
        console.log("\n🎬 Creating batch stress test workflow...\n");
        result = await pubsubTesting.givenBatchStressTest(projectId);
    } else {
        const { sceneCount } = await inquirer.prompt([{
            type: "number", name: "sceneCount", message: "Number of scenes:", default: 3, validate: (i) => i > 0 || "Min 1 scene"
        }]);
        const audio = type === "audio";
        console.log(`\n🎬 Creating ${type} workflow...\n`);
        result = await pubsubTesting.givenWorkflow({ projectId, audio, sceneCount });
    }

    addToHistory({
        timestamp: new Date(), type: "workflow", description: `${type} workflow`, projectId, success: result.success,
    });

    result.success ? console.log(`\n✅ Workflow created: ${result.projectId}`) : console.error(`\n❌ Failed: ${result.error}`);
    await pause();
}

async function viewStatus() {
    clearScreen();
    showHeader("Publisher Status", false);
    const status = pubsubTesting.status();

    console.log("📡 Configuration:\n");
    console.log(`   Project ID: ${status.projectId}`);
    console.log(`   Emulator Host: ${status.emulatorHost || "(using production)"}`);
    console.log(`   Dry Run: ${status.dryRun ? "Yes" : "No"}`);
    await pause(0);
}

function printHelp() {
    clearScreen();
    console.log("🎬 Cinematic Canvas CLI - Help Menu");
    console.log("═".repeat(50));
    console.log("Commands can be typed directly. Omitted arguments will be prompted.\n");
    console.log("  help                      - Show this menu");
    console.log("  menu                      - Open legacy interactive UI");
    console.log("  publish <type> [projId]   - Types: minimal, rich, audio");
    console.log("  dispatch <job> [projId]   - Jobs: prompt, storyboard, audio, enhance,");
    console.log("                              semantic, character, location, frames, video, render");
    console.log("  event <type> [job] [proj] - Types: dispatched, started, completed, failed, cancelled");
    console.log("  workflow <type> [projId]  - Types: standard, audio, batch");
    console.log("  status                    - View publisher configuration");
    console.log("  exit / quit               - Terminate session\n");
}

// ============================================================================
// MAIN REPL LOOP
// ============================================================================

async function replLoop() {
    clearScreen();
    console.log("🎬 Cinematic Canvas - PubSub Testing CLI");
    console.log("Type 'help' for commands or 'menu' for the interactive wizard.\n");

    while (true) {
        // cmdInput: The raw string captured from the user before semantic parsing
        const { cmdInput } = await inquirer.prompt([{
            type: "input",
            name: "cmdInput",
            message: "cinematic-canvas>",
            prefix: "⚡"
        }]);

        const args = cmdInput.trim().split(/\s+/);
        const command = args[0].toLowerCase();

        try {
            switch (command) {
                case "": break;
                case "help": printHelp(); break;
                case "publish": await executePublish(args[1] as any, args[2]); break;
                case "dispatch": await executeDispatch(args[1], args[2]); break;
                case "event": await executeEvent(args[1], args[2], args[3]); break;
                case "workflow": await executeWorkflow(args[1], args[2]); break;
                case "status": await viewStatus(); break;
                case "menu": await mainMenu(); break; // Retained legacy entry point
                case "exit":
                case "quit":
                    console.log("\n👋 Exiting session...");
                    if (pubsubTesting.close) await pubsubTesting.close();
                    process.exit(0);
                default:
                    console.log(`❌ Unknown command: '${command}'. Type 'help' for available commands.`);
            }
        } catch (error) {
            // Tight error handling: Ensure execution logic doesn't crash the REPL session
            console.error("\n❌ Command Execution Error:");
            console.trace(error);
        }
    }
}

// Legacy main menu wrapper
async function mainMenu() {
    const { action } = await inquirer.prompt([{
        type: "list", name: "action", message: "Interactive Menu:",
        choices: [
            { name: "📦 Publish Full State", value: "publish" },
            { name: "🎯 Dispatch Job", value: "dispatch" },
            { name: "🎬 Workflows", value: "workflow" },
            { name: "← Back to CLI", value: "back" }
        ]
    }]);

    if (action === "publish") await executePublish("minimal"); // Defaults
    if (action === "dispatch") await executeDispatch();
    if (action === "workflow") await executeWorkflow();
}

// ============================================================================
// START
// ============================================================================

async function main() {
    if (process.stdin.isTTY) process.stdin.resume();

    try {
        await replLoop();
    } catch (error) {
        console.error("\n❌ Fatal CLI Error:");
        console.trace(error);
        try { if (pubsubTesting.close) await pubsubTesting.close(); } catch (e) { }
        process.exit(1);
    }
}

main();