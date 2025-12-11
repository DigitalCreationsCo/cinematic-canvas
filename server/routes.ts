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

  return httpServer;
}
