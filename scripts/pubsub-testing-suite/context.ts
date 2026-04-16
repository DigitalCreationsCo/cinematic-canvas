// pubsub-testing/context.ts
import * as readline from "node:readline/promises";
import { generateId } from "#shared/utils/id.js";

export interface TestContext {
    projectId: string;
    teamId: string;
    userId: string;
}

/**
 * Resolves context for the current session.
 * Priority: Environment Variables > Interactive Prompt > Defaults
 */
export async function getContext(defaults: Partial<TestContext> = {}): Promise<TestContext> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    console.log("\n--- Session Context Configuration ---");

    const projectId = process.env.TEST_PROJECT_ID ||
        defaults.projectId ||
        (await rl.question(`Project ID (current: ${defaults.projectId || 'new'}): `)) ||
        generateId();

    const teamId = process.env.TEAM_ID ||
        defaults.teamId ||
        (await rl.question("Team ID (default: 'test-team'): ")) ||
        "test-team";

    const userId = process.env.USER_ID ||
        defaults.userId ||
        (await rl.question("User ID (default: 'test-user'): ")) ||
        "test-user";

    rl.close();

    const context = { projectId, teamId, userId };
    console.log(`✅ Session Context: Project(${context.projectId}) | Team(${context.teamId}) | User(${context.userId})\n`);

    return context;
}