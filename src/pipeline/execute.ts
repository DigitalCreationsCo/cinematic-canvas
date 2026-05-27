import * as dotenv from "dotenv";
dotenv.config();

import { Project } from "#shared/types/schema.types.js";
import { ProjectMetadata } from "#shared/types/metadata.types.js";
import { Storyboard } from "#shared/types/storyboard.types.js";
import { GCPStorageManager } from "#shared/services/storage-manager.js";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { ProjectRepository } from "#shared/services/project-repository.js";
import { IEventBus } from "#shared/messaging/event-bus.types.js";
import { PipelineEvent } from "#shared/types/pipeline.types.js";
import { generateId } from "#shared/utils/id.js";
import { z } from "zod";
import { fileURLToPath } from "node:url";
import { db, getPool, initializeDatabase } from "#shared/db/index.js";
import * as schema from "#shared/db/schema.js";
import { eq, and } from "drizzle-orm";

// ============================================================================
// AUTH VALIDATION
// ============================================================================
// Validates that the given userId and teamId correspond to real records
// in the database and that the user is a member of the team.
// This enforces referential integrity — IDs must NOT be generated arbitrarily
// since they serve as foreign keys across users, teams, users_to_teams,
// projects, and jobs tables.
// ============================================================================

interface AuthContext {
  userId: string; // Must exist in auth.users (Supabase) and portals users table
  teamId: string; // Must exist in teams table with user membership
}

async function validateAuth(userId: string, teamId: string): Promise<AuthContext> {
  // 1. Verify user exists in the users table
  const [userRecord] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (!userRecord) {
    throw new Error(
      `Auth validation failed: User ${userId} not found in the database. ` +
      `The user must first authenticate via the application (Supabase auth) ` +
      `before being used in pipeline execution.`
    );
  }

  // 2. Verify team exists
  const [teamRecord] = await db
    .select({ id: schema.teams.id })
    .from(schema.teams)
    .where(eq(schema.teams.id, teamId))
    .limit(1);

  if (!teamRecord) {
    throw new Error(
      `Auth validation failed: Team ${teamId} not found. ` +
      `The team must be created via the application's team setup flow before ` +
      `it can be used in pipeline execution.`
    );
  }

  // 3. Verify user is a member of the team
  const [membership] = await db
    .select()
    .from(schema.usersToTeams)
    .where(
      and(
        eq(schema.usersToTeams.userId, userId),
        eq(schema.usersToTeams.teamId, teamId),
      ),
    )
    .limit(1);

  if (!membership) {
    throw new Error(
      `Auth validation failed: User ${userId} is not a member of team ${teamId}. ` +
      `The user must be added to the team before they can execute pipelines for it.`
    );
  }

  console.log(` ✅ Auth validated: user=${userId} team=${teamId} role=${membership.role}`);

  return { userId, teamId };
}

async function validateAuthOrExit(userId: string, teamId: string): Promise<AuthContext> {
  try {
    return await validateAuth(userId, teamId);
  } catch (error) {
    console.error(`\n❌ ${(error as Error).message}`);
    process.exit(1);
  }
}

async function main() {
  const gcpProjectId = process.env.GOOGLE_CLOUD_PROJECT!;
  const bucketName = process.env.GOOGLE_CLOUD_BUCKET!;
  const postgresUrl = process.env.POSTGRES_URL;
  if (!postgresUrl) {
    throw new Error("Postgres URL is required for database initialization");
  }

  initializeDatabase(getPool());

  const LOCAL_AUDIO_PATH = process.env.LOCAL_AUDIO_PATH;
  const SUBSCRIPTION_TIMEOUT_MS = parseInt(process.env.EXECUTE_TIMEOUT_MS || "1800000", 10); // default 30 min

  // Parse CLI args
  const argv = await yargs(hideBin(process.argv))
    .option("id", {
      alias: ["resume", "projectId"],
      type: "string",
      description: "Project ID to resume an existing project (optional)",
    })
    .option("audio", {
      alias: ["file", "audioPath"],
      type: "string",
      description: "Path to local audio file (optional)",
    })
    .option("prompt", {
      alias: "enhancedPrompt",
      type: "string",
      description: "Creative prompt for the video",
      demandOption: true,
    })
    .option("title", {
      alias: "name",
      type: "string",
      description: "Video title (optional)",
    })
    .option("userId", {
      alias: ["user"],
      type: "string",
      description: "User ID (UUID from Supabase Auth) — REQUIRED",
      demandOption: true,
    })
    .option("teamId", {
      alias: ["team"],
      type: "string",
      description: "Team ID (UUID) — REQUIRED",
      demandOption: true,
    })
    .check((argv) => {
      if (!argv.userId) {
        throw new Error("--userId is required. This must be a valid user UUID from Supabase Auth.");
      }
      if (!argv.teamId) {
        throw new Error("--teamId is required. This must be a valid team UUID the user belongs to.");
      }
      return true;
    })
    .help()
    .argv;

  const projectId = argv.id || generateId();
  const audioPath = argv.audio || LOCAL_AUDIO_PATH || undefined;
  const prompt = argv.prompt;
  const userId = argv.userId;
  const teamId = argv.teamId;
  const videoTitle = argv.title || argv.id || "";
  if (!prompt) {
    throw new Error("A prompt is required to create videos");
  }

  // Validate auth before proceeding
  const auth = await validateAuthOrExit(userId, teamId);

  // ── Create PubSubEventBus ─────────────────────────────────────────────────
  // Use PubSubEventBus instead of raw PubSub so that all published messages
  // include the required `attributes` (type, projectId, userId). Both the
  // pipeline and worker subscriptions filter on these attributes; without them
  // GCP PubSub silently drops the messages and the services never see them.
  const { PubSubEventBus } = await import("#shared/messaging/pubsub-event-bus.js");
  const eventBus: IEventBus = new PubSubEventBus(gcpProjectId);

  // ── Set up services ───────────────────────────────────────────────────────
  // We need storageManager for audio upload, projectRepository for project
  // creation, and the event bus for dispatching commands + awaiting events.
  // We do NOT create PoolManager, DistributedLockManager, JobControlPlane,
  // CheckpointerManager, or CinematicVideoWorkflow — those are the pipeline
  // service's responsibility in pubsub mode.

  const projectRepository = new ProjectRepository();
  const storageManager = new GCPStorageManager(gcpProjectId, bucketName);

  // ── Prepare project and dispatch command ──────────────────────────────────
  let audioGcsUri: string | undefined;
  let audioPublicUri: string | undefined;

  const isResume = !!argv.id;

  if (isResume) {
    console.log(`\n--- Resuming Pipeline for Project: ${projectId} ---`);
    console.log("   Project already exists in database. Skipping creation.");
  } else {
    console.log(`\n--- Starting Pipeline for Project: ${projectId} ---`);

    // Upload audio if provided
    if (audioPath) {
      console.log("   Uploading audio file...");
      ({ audioGcsUri, audioPublicUri } = await storageManager.uploadAudio(audioPath));
    } else {
      console.log("   No audio file was provided. Videos will be generated in prompt-only mode.");
    }
    const hasAudio = !!audioGcsUri;

    // Create project in database (pipeline service will load it from DB)
    try {
      const metadata: z.input<typeof ProjectMetadata> = {
        projectId,
        title: videoTitle,
        audioPublicUri,
        audioGcsUri,
        initialPrompt: prompt,
        hasAudio,
      };
      ProjectMetadata.parse(metadata);

      const storyboard: z.input<typeof Storyboard> = { metadata };
      Storyboard.parse(storyboard);

      const newProject: z.input<typeof Project> = {
        id: projectId,
        metadata,
        storyboard,
        teamId,
        sacForkRepoId: generateId(),
        sacForkRepoUrl: "",
      };
      Project.parse(newProject);

      await projectRepository.createProject(newProject);
      console.log("   Project created in database.");
    } catch (error) {
      console.error("   ! Error creating project in database.", error);
      throw error;
    }
  }

  // ── Dispatch command via PubSub ───────────────────────────────────────────
  // In pubsub mode the pipeline service (pipeline/index.ts) subscribes to
  // PIPELINE_COMMANDS and will pick up this command, run the graph, and
  // manage worker job dispatch internally. This script acts as a client
  // that triggers the pipeline and waits for the result.
  try {
    const commandId = generateId();
    const timestamp = new Date().toISOString();

    if (isResume) {
      await eventBus.publishCommand({
        type: "RESUME_PIPELINE",
        projectId,
        worldId: undefined,
        teamId,
        userId,
        commandId,
        timestamp,
        payload: {},
      });
    } else {
      await eventBus.publishCommand({
        type: "START_PIPELINE",
        projectId,
        worldId: undefined,
        teamId,
        userId,
        commandId,
        timestamp,
        payload: {
          teamId,
          audioGcsUri,
          audioPublicUri,
          initialPrompt: prompt,
          title: videoTitle,
        },
      });
    }

    console.log(`   ✅ ${isResume ? "RESUME_PIPELINE" : "START_PIPELINE"} command dispatched (commandId=${commandId})`);
  } catch (error) {
    console.error("   ! Error dispatching command via PubSub.", error);
    throw error;
  }

  // ── Subscribe to events and await completion ──────────────────────────────
  // The pipeline service publishes WORKFLOW_COMPLETED or WORKFLOW_FAILED
  // when the graph finishes. We subscribe to those events and wait.
  const watchSubscriptionName = `execute-watch-${projectId}-${generateId()}`;
  let unsubscribed = false;

  const completionPromise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (!unsubscribed) {
        console.error(`\n❌ Timed out after ${SUBSCRIPTION_TIMEOUT_MS / 1000}s waiting for workflow completion.`);
        reject(new Error(`Timed out waiting for workflow ${projectId} to complete`));
      }
    }, SUBSCRIPTION_TIMEOUT_MS);

    eventBus
      .subscribeToPipelineEvents(watchSubscriptionName, async (event: PipelineEvent) => {
        // Only handle events for our project
        if (event.projectId !== projectId) return;

        if (event.type === "WORKFLOW_COMPLETED") {
          clearTimeout(timeout);
          if (unsubscribed) return;
          unsubscribed = true;
          await eventBus.unsubscribe(watchSubscriptionName).catch(() => {});
          console.log("\n" + "=".repeat(60));
          console.log("✅ Workflow completed successfully!");
          resolve();
        } else if (event.type === "WORKFLOW_FAILED") {
          clearTimeout(timeout);
          if (unsubscribed) return;
          unsubscribed = true;
          await eventBus.unsubscribe(watchSubscriptionName).catch(() => {});
          const payload = (event as any).payload;
          const errorMsg = payload?.error || "Unknown workflow error";
          console.log("\n" + "=".repeat(60));
          console.log(`❌ Workflow failed: ${errorMsg}`);
          reject(new Error(errorMsg));
        }
      }, {
        temporary: true,
        filter: `attributes.type = "WORKFLOW_COMPLETED" OR attributes.type = "WORKFLOW_FAILED"`,
      })
      .catch((err: unknown) => {
        clearTimeout(timeout);
        console.error("   ! Error subscribing to pipeline events.", err);
        reject(err);
      });
  });

  // ── SIGINT handler ────────────────────────────────────────────────────────
  // Unlike the old monolithic mode, we do NOT abort an in-flight graph here.
  // The graph runs in the pipeline service process — not in this script.
  // SIGINT only stops this script from watching; the pipeline continues.
  let shuttingDown = false;
  process.on("SIGINT", async () => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log("\n\n⏹️  Stop watching. Pipeline continues running in the background.");
    console.log(`   Re-attach later with: --id ${projectId}\n`);

    if (!unsubscribed) {
      unsubscribed = true;
      await eventBus.unsubscribe(watchSubscriptionName).catch(() => {});
    }
    await eventBus.close().catch(() => {});
    process.exit(0);
  });

  // ── Wait for completion ──────────────────────────────────────────────────
  console.log(`\n   Dispatched. Watching for workflow completion (timeout: ${SUBSCRIPTION_TIMEOUT_MS / 1000}s)...`);
  console.log("   Press Ctrl+C to stop watching (pipeline continues in background)\n");

  try {
    await completionPromise;
  } catch (error) {
    console.error("\n❌ Workflow failed:", error);
    await eventBus.close().catch(() => {});
    process.exit(1);
  }

  // Clean exit
  await eventBus.close().catch(() => {});
  process.exit(0);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
