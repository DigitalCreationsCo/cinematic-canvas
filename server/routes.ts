import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const clients = new Set<Response>();

  app.get("/api/sse", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const keepAlive = setInterval(() => {
      res.write(": keep-alive\n\n");
    }, 15000);

    clients.add(res);

    // Send initial connected event
    res.write(`event: connected\ndata: ${JSON.stringify({ connected: true })}\n\n`);

    req.on("close", () => {
      clearInterval(keepAlive);
      clients.delete(res);
    });
  });

  function broadcast(type: string, data: any) {
    const message = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    clients.forEach((client) => client.write(message));
  }

  // Simulate pipeline activity
  setInterval(() => {
    if (clients.size > 0) {
      const msg = {
        id: Date.now().toString(),
        type: "info",
        message: `System update: ${new Date().toLocaleTimeString()}`,
        timestamp: new Date(),
      };
      broadcast("message", msg);
    }
  }, 10000);

  // Add an endpoint to trigger status updates (for testing/demo)
  app.post("/api/trigger-update", (req, res) => {
    const { type, data } = req.body;
    broadcast(type || "message", data);
    res.json({ success: true });
  });

  app.get("/api/state", async (req, res) => {
    const [
      metadata,
      scenes,
      characters,
      locations,
      metrics,
      sceneStatuses,
      messages,
      projects,
    ] = await Promise.all([
      storage.getMetadata(),
      storage.getScenes(),
      storage.getCharacters(),
      storage.getLocations(),
      storage.getMetrics(),
      storage.getSceneStatuses(),
      storage.getMessages(),
      storage.getProjects(),
    ]);
    res.json({
      storyboardState: {
        scenes,
        characters,
        locations,
        metadata,
      },
      metrics,
      sceneStatuses,
      messages,
      projects,
    });
  });

  app.get("/api/projects", async (req, res) => {
    const projects = await storage.getProjects();
    res.json({ projects });
  });

  return httpServer;
}