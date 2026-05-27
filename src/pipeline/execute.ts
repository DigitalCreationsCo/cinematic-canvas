import * as dotenv from "dotenv";
dotenv.config();

import { JobControlPlane } from "#shared/services/job-control-plane.js";
import { PoolManager } from "#shared/services/pool-manager.js";
import { DistributedLockManager } from "#shared/services/lock-manager.js";
import { JobEvent } from "#shared/types/job.types.js";
import { Project } from "#shared/types/schema.types.js";
import { ProjectMetadata } from "#shared/types/metadata.types.js";
import { Storyboard } from "#shared/types/storyboard.types.js";
import { WorkflowState } from "#shared/types/workflow.types.js";
import { GCPStorageManager } from "#shared/services/storage-manager.js";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { CheckpointerManager } from "#pipeline/checkpointer-manager.js";
import { RunnableConfig } from "@langchain/core/runnables";

import { ProjectRepository } from "#shared/services/project-repository.js";
import { PubSub } from "@google-cloud/pubsub";
import { TOPIC_NAMES } from "#shared/config.js";
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from "node:url";
import { db, getPool, initializeDatabase } from "#shared/db/index.js";
import * as schema from "#shared/db/schema.js";
import { eq, and } from "drizzle-orm";
import { CinematicVideoWorkflow } from "#pipeline/graph.js";
import { generateId } from "#shared/utils/id.js";
import { z } from "zod";



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

  console.log(` Auth validated: user=${userId} team=${teamId} role=${membership.role}`);

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

async function execute(graph: CinematicVideoWorkflow['graph'], controller: any, projectId: string, audioPath: string | undefined, videoTitle: string, creativePrompt: string, postgresUrl: string, lockManager: DistributedLockManager, storageManager: GCPStorageManager, projectRepository: ProjectRepository, userId: string, teamId: string): Promise<WorkflowState> {

  console.log(`\n--- Starting Workflow for Project: ${projectId} ---`);

  const lockAcquired = await lockManager.acquireLock(projectId, {
    lockTTL: 60000, // 1 minute
    heartbeatInterval: 20000, // 20 seconds
  });
  if (!lockAcquired) {
    console.error(`[Cinematic-Canvas]: ❌ Execution Aborted: Project ${projectId} is already locked by another process.`);
    throw new Error(`Project ${projectId} is locked`);
  }

  let result: WorkflowState;
  try {
    const checkpointerManager = new CheckpointerManager({ pool: getPool() });
    await checkpointerManager.init();
    const checkpointer = checkpointerManager.getCheckpointer();

    let audioGcsUri: string | undefined;
    let audioPublicUri: string | undefined;

    if (audioPath) {
      console.log(" Uploading audio file...");
      ({ audioGcsUri, audioPublicUri } = await storageManager.uploadAudio(audioPath));
    } else {
      console.log(" No audio file was provided. Videos will be generated in prompt-only mode.");
    }
    const hasAudio = !!audioGcsUri;
    const config: RunnableConfig = {
      configurable: { thread_id: projectId },
    };
    console.log("   Checkpointer enabled");
    const existingCheckpoint = await checkpointer.get(config);

    let initialState: z.input<typeof WorkflowState>;
    if (existingCheckpoint) {
      console.log(" Resuming from existing checkpoint...");
      const stateValues = existingCheckpoint.channel_values as WorkflowState;

      // Validate checkpoint IDs match the authenticated user/team
      if (stateValues.userId !== userId) {
        throw new Error(
          `Auth mismatch: Checkpoint userId (${stateValues.userId}) does not match ` +
          `the provided --userId (${userId}). You can only resume projects you own.`
        );
      }
      if (stateValues.teamId !== teamId) {
        throw new Error(
          `Auth mismatch: Checkpoint teamId (${stateValues.teamId}) does not match ` +
          `the provided --teamId (${teamId}). The project belongs to a different team.`
        );
      }

      initialState = {
        ...stateValues,
        localAudioPath: audioPath,
        hasAudio,
      };

      WorkflowState.parse(initialState);

      console.log("   Checkpoint found previous project.");
    } else {
      console.log(" No existing checkpoint found. Starting new workflow.");
      try {

        const sacForkRepoId = generateId();
        const sacForkRepoUrl = "";

        initialState = {
          id: projectId,
          projectId: projectId,
          localAudioPath: audioPath,
          teamId,
          userId,
          hasAudio,
        };

        WorkflowState.parse(initialState);

        const metadata:z.input<typeof ProjectMetadata> = {
          projectId: projectId,
          title: videoTitle,
          audioPublicUri,
          audioGcsUri,
          initialPrompt: creativePrompt,
          hasAudio,
        };

        ProjectMetadata.parse(metadata);

        const storyboard:z.input<typeof Storyboard> = { metadata };

        Storyboard.parse(storyboard);

        const newProject: z.input<typeof Project> = {
          id: projectId,
          metadata,
          storyboard,
          teamId,
          sacForkRepoId,
          sacForkRepoUrl
        };

        Project.parse(newProject);

        await projectRepository.createProject(newProject);
      } catch (error) {
        console.error(" ! Error creating project in database.", error);
        throw error;
      }
    }

    const compiled = graph.compile({ checkpointer });

    if (process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development') {
      const graphData = await compiled.getGraphAsync();

      const mermaidText = graphData.drawMermaid();
      const textPath = path.resolve('./website/contents/docs/graph_structure.mmd');
      await fs.writeFile(textPath, mermaidText);
      console.debug(`[Debug]: Graph definition saved: file://${textPath}`);

      try {
        const pngBlob = await graphData.drawMermaidPng();
        const pngBuffer = Buffer.from(await pngBlob.arrayBuffer());
        const pngPath = path.resolve('./website/contents/docs/graph_diagram.png');
        await fs.writeFile(pngPath, pngBuffer);
        console.debug(`[Debug]: Graph image saved: file://${pngPath}`);
      } catch (e) {
        console.warn("[Debug]: Failed to generate PNG. (Ensure 'canvas' or 'playwright' is available if required by your environment).");
      }
    }


    // INTERRUPTS ARE NOT HANDLED WHEN USING CLI EXECUTION!!
    result = await compiled.invoke(initialState, {
      configurable: { thread_id: projectId },
      recursionLimit: 100,
      signal: controller?.signal,
    }) as WorkflowState;

    return result;
  } finally {
    await lockManager.releaseLock(projectId);
  }
}


async function main() {

  const gcpProjectId = process.env.GOOGLE_CLOUD_PROJECT!;
  const bucketName = process.env.GOOGLE_CLOUD_BUCKET!;
  const postgresUrl = process.env.POSTGRES_URL;
  if (!postgresUrl) {
    throw new Error("Postgres URL is required for CheckpointerManager initialization");
  }

  initializeDatabase(getPool());

  const LOCAL_AUDIO_PATH = process.env.LOCAL_AUDIO_PATH;
  const controller = new AbortController();



  process.on("SIGINT", async () => {
    console.log("Shutting down workflow...");
    controller.abort();
    try {
      console.log("Aborted controller. Waiting for cleanup...");
    } catch (e) {
      console.error("Error during abort sequence", e);
    }
    console.log("Exiting...");
    setTimeout(() => {
      process.exit(1);
    }, 5000);
  });

  let pubsub: PubSub;
  let jobEventsTopicPublisher: ReturnType<PubSub['topic']>;
  let poolManager: PoolManager;
  let jobControlPlane: JobControlPlane;
  let lockManager: DistributedLockManager;
  let storageManager: GCPStorageManager;
  let projectRepository: ProjectRepository;

  // parse command line args
  const argv = await yargs(hideBin(process.argv))
    .option("id", {
      alias: ["resume", "projectId"],
      type: "string",
      description: "Video ID to resume a project (optional)",
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
      description: "User ID (UUID from Supabase Auth) — REQUIRED. Must be a valid user in the database.",
      demandOption: true,
    })
    .option("teamId", {
      alias: ["team"],
      type: "string",
      description: "Team ID (UUID) — REQUIRED. Must be a valid team the user belongs to.",
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
  const projectTitle = argv.id || "";
  const projectId = argv.id || generateId();
  const audioPath = argv.audio || LOCAL_AUDIO_PATH || undefined;
  const prompt = argv.prompt;
  const userId = argv.userId;
  const teamId = argv.teamId;
  if (!prompt) { throw new Error("A prompt is required to create videos"); }


  try {
    pubsub = new PubSub({
      projectId: gcpProjectId,
      apiEndpoint: process.env.PUBSUB_EMULATOR_HOST,
    });
    jobEventsTopicPublisher = pubsub.topic(TOPIC_NAMES.JOB_EVENTS_TOPIC_NAME);
    console.debug(`Initialized topic ${TOPIC_NAMES.JOB_EVENTS_TOPIC_NAME}`);

    const publishJobEvent = async (event: JobEvent) => {
      console.log({ event }, `Workflow publishing job event to ${TOPIC_NAMES.JOB_EVENTS_TOPIC_NAME}`);
      const dataBuffer = Buffer.from(JSON.stringify(event));
      await jobEventsTopicPublisher.publishMessage({ data: dataBuffer });
    };

    poolManager = new PoolManager();

    projectRepository = new ProjectRepository();

    storageManager = new GCPStorageManager(gcpProjectId, bucketName);

    lockManager = new DistributedLockManager(poolManager, `workflow-cli-${projectId}`);
    await lockManager.init();
    jobControlPlane = new JobControlPlane(poolManager, publishJobEvent);
  } catch (error) {
    console.error(`[Workflow] FATAL: PubSub initialization failed:`, error);
    console.error(`[Workflow] Service cannot start without PubSub. Shutting down...`);
    process.exit(1);
  }

  // Validate auth before proceeding
  const auth = await validateAuthOrExit(userId, teamId);

  const workflow = new CinematicVideoWorkflow({
    gcpProjectId,
    projectId,
    bucketName,
    jobControlPlane,
    storageManager,
    lockManager,
    projectRepository,
    controller
  });
  try {

    const result = await execute(
      workflow['graph'],
      controller,
      projectId,
      audioPath,
      projectTitle,
      prompt,
      postgresUrl,
      lockManager,
      storageManager,
      projectRepository,
      auth.userId,
      auth.teamId,
    );

    console.log("\n" + "=".repeat(60));
    console.log("✅ Workflow completed successfully!");

  } catch (error) {
    if (controller.signal.aborted) {
      console.log("\n🛑 Workflow aborted by user.");
      process.exit(0);
    }
    console.error("\n❌ Workflow failed:", error);
    process.exit(1);
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch(console.error);
}
