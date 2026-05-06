// src/server/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cinematic Canvas – Server Domain
//
// Supports two execution modes:
//   1. Monolith  – called via initializeServer({ eventBus, port })
//   2. Distributed – run directly; bootstraps its own PubSubEventBus
// ─────────────────────────────────────────────────────────────────────────────
import * as dotenv from "dotenv";
dotenv.config();

import express, { Express, type Request, Response, NextFunction } from "express";
import http from "node:http";

import * as trpcExpress from '@trpc/server/adapters/express';
import { IEventBus } from "#shared/messaging/event-bus.types.js";
import { createAppRouter, createContext } from "#shared/app-router/index.js";
import { contextMiddleware } from "#server/middleware/context.js";
import { initLogger } from "#shared/logger/index.js";
import { getPool, initializeDatabase } from "#shared/db/index.js";

import { serveStatic } from "#server/static.js";
import { createEventsRouter } from "#shared/app-router/sse-router.js";
import { createChatRouter } from "#shared/app-router/chat-router.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ServerDependencies {
  eventBus: IEventBus;
  port: number;
}

export interface ServerHandle {
  stop(): Promise<void>;
}

// ─── Core initialiser ─────────────────────────────────────────────────────────

export async function initializeServer(
  deps: ServerDependencies
): Promise<ServerHandle> {
  const { eventBus, port } = deps;

  const isProduction = process.env.NODE_ENV === "production";

  console.log(`[Server] Initialising server domain on port ${port}...`);

  const app: Express = express();

  const httpServer = http.createServer(app);

  // ── Global middleware ────────────────────────────────────────────────────

  app.use(express.json({
    limit: "50mb",
    verify: (req: any, _res, buf) => { req.rawBody = buf; }
  }));
  app.use(express.urlencoded({ extended: true }));
  app.use(contextMiddleware);

  app.use((req: Request, res: Response, next: NextFunction) => {
    const timeStart = Date.now();
    const originalResJson = res.json;

    // Intercept JSON responses for logging
    res.json = function (bodyJson, ...args) {
      res.locals.logBody = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      const durationMs = Date.now() - timeStart;
      if (req.path.startsWith("/api")) {
        const bodyCaptured = res.locals.logBody;
        const bodyStringified = bodyCaptured ? ` :: ${JSON.stringify(bodyCaptured)}` : "";
        console.log(`[API] ${req.method} ${req.path} ${res.statusCode} (${durationMs}ms)${bodyStringified}`);
      }
    });
    next();
  });

  // ── Route mounting ───────────────────────────────────────────────────────
  // All route handlers receive their dependencies (including the eventBus)
  // through the router factory – no global PubSub clients inside routes.

  app.use(
    '/trpc',
    trpcExpress.createExpressMiddleware({
      router: createAppRouter({ eventBus, eventsRouter: createEventsRouter({ eventBus }), chatRouter: createChatRouter({ eventBus }) }),
      createContext,
    }),
  );

  app.post('/api/upload-audio', express.json({ limit: '50mb' }), async (req, res) => {
    try {
      const { fileData, fileName, mimeType } = req.body;
      if (!fileData || !fileName || !mimeType) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const fileBuffer = Buffer.from(fileData, 'base64');
      const gcpProjectId = process.env.GOOGLE_CLOUD_PROJECT ?? 'omo-dev';
      const bucketName = process.env.GOOGLE_CLOUD_BUCKET ?? 'test-bucket';
      const { GCPStorageManager } = await import('../shared/services/storage-manager.js');
      const storageManager = new GCPStorageManager(gcpProjectId, bucketName);

      const uploadResult = await storageManager.uploadAudio(fileBuffer, { fileName, mimeType });
      res.json(uploadResult);
    } catch (err) {
      console.error('[Server] Audio upload error:', err);
      res.status(500).json({ error: 'Upload failed' });
    }
  });

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", ts: new Date().toISOString() });
  });

  // ── Development vs Production Asset Handling ─────────────────────────────
  if (isProduction) {
    serveStatic(app);
  } else {
    // Dynamic import to keep production bundles lean
    const { setupVite } = await import("./vite.js");
    await setupVite(httpServer, app);
  }

  // ── Global Error Boundary ────────────────────────────────────────────────

  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const errorStatus = err.status || err.statusCode || 500;
    const errorMessage = err.message || "Internal Server Error";

    console.error(`[Server:Error] ${req.method} ${req.path} -> ${errorMessage}`, {
      status: errorStatus,
      stack: isProduction ? undefined : err.stack,
    });

    res.status(errorStatus).json({
      error: errorMessage,
      path: req.path
    });
  });

  // ── HTTP server lifecycle ────────────────────────────────────────────────

  await new Promise<void>((resolve, reject) => {
    httpServer.listen(port, () => {
      console.log(`[Server] Listening on port ${port}.`);
      resolve();
    });
    httpServer.once("error", reject);
  });

  // ── Shutdown handle ──────────────────────────────────────────────────────

  const stop = (): Promise<void> =>
    new Promise((resolve, reject) => {
      console.log("[Server] Initiating graceful shutdown...");
      httpServer.close((errClose) => {
        if (errClose) {
          console.error("[Server] Error closing HTTP server:", errClose);
          return reject(errClose);
        }
        console.log("[Server] HTTP server closed.");
        resolve();
      });
    });

  console.log("[Server] Server domain ready.");

  return { stop };
}

// ─── Distributed mode entry-point ─────────────────────────────────────────────

async function main(): Promise<void> {
  const gcpProjectId = process.env.GOOGLE_CLOUD_PROJECT;
  if (!gcpProjectId) throw new Error("[Server:main] GOOGLE_CLOUD_PROJECT is not set.");

  const portFromEnv = parseInt(process.env.PORT ?? "8000", 10);

  // Lazy import keeps the Monolith bundle free of @google-cloud/pubsub
  const { PubSubEventBus } = await import(
    "../shared/messaging/pubsub-event-bus.js"
  );

  initLogger();
  initializeDatabase(getPool());

  const paramsGoogleProvider = { projectId: gcpProjectId };
  const eventBusInstance: IEventBus = new PubSubEventBus(
    paramsGoogleProvider.projectId
  );

  const serverHandle = await initializeServer({
    eventBus: eventBusInstance,
    port: portFromEnv,
  });

  const handleShutdown = async (): Promise<void> => {
    console.log("[Server:main] SIGINT/SIGTERM received – shutting down...");
    await serverHandle.stop();
    await eventBusInstance.close();
    console.log("[Server:main] Shutdown complete.");
    process.exit(0);
  };

  process.on("SIGINT", handleShutdown);
  process.on("SIGTERM", handleShutdown);
}

// Run directly only when this file is the process entry-point
const isEntryPoint =
  process.argv[1] &&
  (await import("url")).fileURLToPath(import.meta.url) === process.argv[1];

if (isEntryPoint) {
  main().catch((fatalError) => {
    console.error("[Server:main] FATAL:", fatalError);
    process.exit(1);
  });
}