#!/usr/bin/env tsx
/**
 * Cinematic Canvas PubSub Testing Interactive CLI
 * Unified Version: High-fidelity context injection + Full original feature set.
 */

import * as dotenv from "dotenv";
dotenv.config();

import inquirer from "inquirer";
import { generateId } from "#shared/utils/id.js";
import { pubsubTesting } from "./repl.js";
import type { JobType } from "../../src/shared/types/job.types.js";
import { PIPELINE_JOB_TYPES } from "./fixtures.js";

// ============================================================================\n// TYPES & STATE MANAGEMENT
// ============================================================================\n
interface TestContext {
    projectId: string;
    teamId: string;
    userId: string;
}

interface SessionOperation {
    timestamp: string;
    type: string;
    detail: string;
    projectId: string;
    success: boolean;
}

const session = {
    operations: [] as SessionOperation[],
    startTime: new Date(),
    context: null as TestContext | null,
};

function logOperation(op: Omit<SessionOperation, "timestamp">) {
    session.operations.push({
        ...op,
        timestamp: new Date().toLocaleTimeString(),
    });
}

// ============================================================================\n// CONTEXT RESOLUTION (The "Firewall")
// ============================================================================\n
async function ensureContext(): Promise<TestContext> {
    if (session.context) return session.context;

    console.log("\n--- Initialize Session Context ---");
    const questions = [];

    if (!process.env.PROJECT_ID) questions.push({ type: "input", name: "projectId", message: "Project ID:", default: generateId() });
    if (!process.env.TEAM_ID) questions.push({ type: "input", name: "teamId", message: "Team ID:", default: "team_dev_user" });
    if (!process.env.USER_ID) questions.push({ type: "input", name: "userId", message: "User ID:", default: "user_dev_primary" });

    const answers = await inquirer.prompt(questions);

    session.context = {
        projectId: process.env.PROJECT_ID || answers.projectId,
        teamId: process.env.TEAM_ID || answers.teamId,
        userId: process.env.USER_ID || answers.userId,
    };

    return session.context;
}

// ============================================================================\n// COMMAND IMPLEMENTATIONS (Refactored for Injection)
// ============================================================================\n

/**
 * RESTORED: Full Scenario Selection for State Publishing
 */
async function executePublish() {
    const ctx = await ensureContext();
    const { scenario } = await inquirer.prompt([{
        type: "list",
        name: "scenario",
        message: "Select State Scenario:",
        choices: [
            { name: "Minimal Project", value: "minimal" },
            { name: "Rich Storyboard (Full Assets)", value: "rich" },
            { name: "Audio-Enabled Project", value: "audio" }
        ]
    }]);

    console.log(`[Trace] Publishing ${scenario} for ${ctx.projectId}...`);
    try {
        await pubsubTesting.publishFullState({ scenario, projectId: ctx.projectId });
        logOperation({ type: "PUBLISH", detail: scenario, projectId: ctx.projectId, success: true });
        console.log("✅ State Published.");
    } catch (err: any) {
        console.error(`❌ Publish Error: ${err.message}`);
    }
}

/**
 * RESTORED: Full Job Type Selection
 */
async function executeDispatch() {
    const ctx = await ensureContext();
    const { jobType } = await inquirer.prompt([{
        type: "list",
        name: "jobType",
        message: "Select Job Type:",
        choices: PIPELINE_JOB_TYPES,
        pageSize: 15
    }]);

    try {
        const result = await pubsubTesting.dispatchJob(jobType, {}, ctx);
        logOperation({ type: "DISPATCH", detail: jobType, projectId: ctx.projectId, success: true });
        console.log(`🚀 Job Dispatched: ${result.payload.metadata.jobId}`);
    } catch (err: any) {
        console.error(`❌ Dispatch Error: ${err.message}`);
    }
}

/**
 * RESTORED: Workflow Chain Logic
 */
async function executeWorkflow() {
    const ctx = await ensureContext();
    const { workflow } = await inquirer.prompt([{
        type: "list",
        name: "workflow",
        message: "Select Workflow Chain:",
        choices: [
            { name: "Storyboard -> Video Generation", value: "STORYBOARD_TO_VIDEO" },
            { name: "Audio Enhancement Batch", value: "AUDIO_BATCH" },
            { name: "Stress Test (50 Parallel Jobs)", value: "STRESS" }
        ]
    }]);

    console.log(`[Trace] Executing ${workflow}...`);
    // Pass ctx to the chain helpers in repl.ts
    if (workflow === "STRESS") {
        await pubsubTesting.dispatchBatchStressTest(50, ctx);
    } else {
        await pubsubTesting.dispatchJobChain(500, ctx);
    }

    logOperation({ type: "WORKFLOW", detail: workflow, projectId: ctx.projectId, success: true });
}

// ============================================================================\n// MAIN INTERACTIVE LOOP
// ============================================================================\n
async function replLoop() {
    const ctx = await ensureContext();
    console.clear();
    console.log(`\n🎬 Cinematic Canvas Test Engine | Active: ${ctx.projectId}\n`);

    while (true) {
        const { action } = await inquirer.prompt([{
            type: "list",
            name: "action",
            message: "Menu:",
            choices: [
                { name: "🎯 Dispatch Job", value: "dispatch" },
                { name: "📦 Publish Full State", value: "publish" },
                { name: "🎬 Execute Workflow", value: "workflow" },
                { name: "📜 Session History", value: "history" },
                { name: "⚙️  Reset Context (Switch Project)", value: "reset" },
                { name: "❌ Exit", value: "exit" }
            ]
        }]);

        if (action === "exit") break;

        switch (action) {
            case "dispatch": await executeDispatch(); break;
            case "publish": await executePublish(); break;
            case "workflow": await executeWorkflow(); break;
            case "history": console.table(session.operations); break;
            case "reset":
                session.context = null;
                await ensureContext();
                console.clear();
                console.log("✅ Context Updated.");
                break;
        }
    }
}

async function main() {
    try {
        await replLoop();
    } catch (err) {
        console.error("FATAL:", err);
        process.exit(1);
    } finally {
        await pubsubTesting.close();
    }
}

main();