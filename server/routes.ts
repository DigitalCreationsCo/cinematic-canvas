import type { Express, Request, Response } from "express";
import { type Server } from "http";
import { PubSub, Subscription } from "@google-cloud/pubsub";
import { PipelineCommand, PipelineEvent } from "../shared/pubsub-types";
import { v4 as uuidv4 } from "uuid";
import { Bucket } from "@google-cloud/storage";

export async function registerRoutes(
  httpServer: Server,
  app: Express,
  bucket: Bucket,
): Promise<Server> {

  const pubsub = new PubSub({
    projectId: process.env.GCP_PROJECT_ID,
    apiEndpoint: process.env.PUBSUB_EMULATOR_HOST,
  });

  const VIDEO_COMMANDS_TOPIC_NAME = "video-commands";
  const VIDEO_EVENTS_TOPIC_NAME = "video-events";
  const videoCommandsTopicPublisher = pubsub.topic(VIDEO_COMMANDS_TOPIC_NAME);

  let sharedEventsSubscription: any = null;
  const clientConnections = new Map<string, Set<Response>>();
  
  async function ensureSharedSubscription() {
    if (!sharedEventsSubscription) {
      const VIDEO_EVENTS_SUBSCRIPTION = "server-events-subscription";

      try {
        [ sharedEventsSubscription ] = await pubsub
          .topic(VIDEO_EVENTS_TOPIC_NAME)
          .subscription(VIDEO_EVENTS_SUBSCRIPTION)
          .get({ autoCreate: true });

        console.log(`✓ Using shared subscription: ${VIDEO_EVENTS_SUBSCRIPTION}`);

        sharedEventsSubscription.on("message", (message: any) => {
          try {
            const event = JSON.parse(message.data.toString()) as PipelineEvent;
            const projectId = event.projectId;

            const clients = clientConnections.get(projectId);
            if (clients) {
              const eventString = `data: ${JSON.stringify(event)}\n\n`;
              clients.forEach(res => {
                try {
                  res.write(eventString);
                } catch (err) {
                  console.error(`Failed to write to client:`, err);
                  clients.delete(res);
                }
              });
            }

            message.ack();
          } catch (error) {
            console.error(`Failed to process message:`, error);
            message.nack();
          }
        });

        sharedEventsSubscription.on("error", (error: any) => {
          console.error(`Shared subscription error:`, error);
        });
      } catch (error) {
        console.error(`Failed to create shared subscription:`, error);
        throw error;
      }
    }

    return sharedEventsSubscription;
  }


  async function publishCommand(command: Omit<PipelineCommand, 'timestamp' | 'payload'> & { payload?: any; }) {
    const fullCommand: PipelineCommand = {
      ...command,
      payload: command.payload || {},
      timestamp: new Date().toISOString(),
    };
    const dataBuffer = Buffer.from(JSON.stringify(fullCommand));
    await videoCommandsTopicPublisher.publishMessage({ data: dataBuffer });
  }


  // ============================================================================
  // API Routes
  // ============================================================================

  app.post("/api/video/start", async (req: Request, res: Response) => {
    try {
      const { projectId, audioUrl, creativePrompt } = req.body;
      console.log(`Received START_PIPELINE command for projectId: ${projectId}`);
      if (!projectId || !creativePrompt) {
        console.error("Validation error: projectId or creativePrompt missing.", { projectId, creativePrompt });
        return res.status(400).json({ error: "projectId and creativePrompt are required." });
      }
      await publishCommand({ type: "START_PIPELINE", projectId, payload: { audioUrl, creativePrompt } });
      console.log(`Published START_PIPELINE command for projectId: ${projectId} to PubSub.`);
      res.status(202).json({ message: "Pipeline start command issued.", projectId });
    } catch (error) {
      console.error("Error publishing START_PIPELINE command:", error);
      res.status(500).json({ error: "Failed to issue start command." });
    }
  });

  app.post("/api/video/stop", async (req: Request, res: Response) => {
    try {
      const { projectId } = req.body;
      if (!projectId) return res.status(400).json({ error: "projectId is required." });
      await publishCommand({ type: "STOP_PIPELINE", projectId });
      res.status(202).json({ message: "Pipeline stop command issued.", projectId });
    } catch (error) {
      console.error("Error publishing stop command:", error);
      res.status(500).json({ error: "Failed to issue stop command." });
    }
  });

  app.post("/api/video/:projectId/resume", async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      await publishCommand({ type: "RESUME_PIPELINE", projectId });
      res.status(202).json({ message: "Pipeline resume command issued.", projectId });
    } catch (error) {
      console.error("Error publishing resume command:", error);
      res.status(500).json({ error: "Failed to issue resume command." });
    }
  });

  app.post("/api/video/:projectId/regenerate-scene", async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const { sceneId, forceRegenerate, promptModification } = req.body;
      if (!sceneId) return res.status(400).json({ error: "sceneId is required." });
      await publishCommand({ type: "REGENERATE_SCENE", projectId, payload: { sceneId, forceRegenerate, promptModification } });
      res.status(202).json({ message: "Scene regeneration command issued.", projectId });
    } catch (error) {
      console.error("Error publishing regenerate scene command:", error);
      res.status(500).json({ error: "Failed to issue regenerate scene command." });
    }
  });

  app.post("/api/video/:projectId/request-state", async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      await publishCommand({ type: "REQUEST_FULL_STATE", projectId });
      res.status(202).json({ message: "Full state request command issued.", projectId });
    } catch (error) {
      console.error("Error publishing request state command:", error);
      res.status(500).json({ error: "Failed to issue request state command." });
    }
  });

  // SSE endpoint for a specific project
  app.get("/api/events/:projectId", async (req: Request, res: Response) => {
    const { projectId } = req.params;
    const clientSseSubscriptionId = `server-sse-${projectId}-${uuidv4()}`;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();


    try {
      await ensureSharedSubscription();

      if (!clientConnections.has(projectId)) {
        clientConnections.set(projectId, new Set());
      }
      clientConnections.get(projectId)!.add(res);

      console.log(`✓ Client connected for ${projectId} (${clientConnections.get(projectId)!.size} total)`);

      await publishCommand({ type: "REQUEST_FULL_STATE", projectId });

      req.on("close", async () => {
        const clients = clientConnections.get(projectId);

        if (clients) {
          clients.delete(res);
          console.log(`Client disconnected from ${projectId} (${clients.size} remaining)`);

          if (clients.size === 0) {
            clientConnections.delete(projectId);
          }
        }
        res.end();
      });

    } catch (error) {
      console.error(`Failed to establish SSE for ${projectId}:`, error);
      res.status(500).send({ error: "Failed to establish event stream." });
    }
  });

  app.get("/api/projects", async (req, res) => {
    const [ , , apiResponse ]: any = await bucket.getFiles({
      delimiter: "/",
    });

    const excludeDirs = [ "audio" ];
    const projects: string[] = ((apiResponse.prefixes ?? []) as string[]).map(prefix => prefix.replace(/\/$/, "")).filter(prefix => !excludeDirs.includes(prefix));

    res.json({ projects });
  });

  return httpServer;
}
