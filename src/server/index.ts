import * as dotenv from "dotenv";
dotenv.config();
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes, serverId } from "./routes/index.routes.js";
import { serveStatic } from "./static.js";
import http, { createServer } from "http";
import { Storage } from "@google-cloud/storage";
import { PubSub } from "@google-cloud/pubsub";
import { initLogger } from "../shared/logger/index.js";
import { contextMiddleware } from "./middle/context-handler.js";
import { getPool, initializeDatabase } from "../shared/db/index.js";
import {
  PIPELINE_COMMANDS_TOPIC_NAME,
  PIPELINE_EVENTS_TOPIC_NAME,
  SERVER_PIPELINE_EVENTS_SUBSCRIPTION
} from "../shared/config.js";

if (process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test") {
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  console.log('🔍 RESOLUTION CHECK:', {
    dbPath: require.resolve('../shared/db/index.js'),
    env: process.env.NODE_ENV
  });
}


// Initialize Logger first to ensure we can log any startup errors
initLogger();

export async function initializeServer() {
  try {
    console.log("[Server] Starting initialization...");

    // 1. Environment and Configuration Check
    console.log("[Server] Checking environment configuration...");
    const gcpProjectId = process.env.GOOGLE_CLOUD_PROJECT;
    const bucketName = process.env.GOOGLE_CLOUD_BUCKET;

    if (!gcpProjectId) throw Error("FATAL: GOOGLE_CLOUD_PROJECT was not provided");
    if (!bucketName) throw Error("FATAL: GOOGLE_CLOUD_BUCKET was not provided");

    // 2. Database Initialization
    console.log("[Server] Initializing database connection...");
    const pool = getPool();
    await initializeDatabase(pool);
    console.log("[Server] Database initialized successfully");

    // 3. Storage Initialization
    console.log("[Server] Initializing GCS bucket access...");
    const bucket = new Storage({ projectId: gcpProjectId }).bucket(bucketName);
    const [bucketExists] = await bucket.exists();
    if (!bucketExists) {
      throw Error(`FATAL: GCS Bucket "${bucketName}" does not exist`);
    }
    console.log("[Server] GCS bucket access verified");

    // 4. PubSub Resource Verification (Mandatory)
    console.log("[Server] Verifying PubSub resources...");
    const pubsub = new PubSub({
      projectId: gcpProjectId,
      ...(process.env.PUBSUB_EMULATOR_HOST ? { apiEndpoint: process.env.PUBSUB_EMULATOR_HOST } : {}),
    });

    const topicNames = [
      PIPELINE_COMMANDS_TOPIC_NAME,
      PIPELINE_EVENTS_TOPIC_NAME
    ];

    for (const name of topicNames) {
      const topic = pubsub.topic(name);
      const [exists] = await topic.exists();
      if (!exists) {
        console.warn(`[Server] Topic "${name}" missing, attempting to create...`);
        try {
          await topic.create();
        } catch (e: any) {
          if (e.code !== 6) throw e; // 6 = ALREADY_EXISTS
        }
      }
    }

    const subName = `${SERVER_PIPELINE_EVENTS_SUBSCRIPTION}-${serverId}`;
    const sub = pubsub.subscription(subName);
    const [subExists] = await sub.exists();
    if (!subExists) {
      console.log(`[Server] Subscription "${subName}" missing, it will be created during route registration`);
    } else {
      console.log(`[Server] Subscription "${subName}" already exists`);
    }

    // 5. Express App Setup
    const app = express();
    const httpServer = createServer(app);

    app.use(express.json({
      verify: (req, _res, buf) => {
        (req as any).rawBody = buf;
      },
    }));
    app.use(express.urlencoded({ extended: false }));
    app.use(contextMiddleware);

    // Request Logging Middleware
    app.use((req, res, next) => {
      const start = Date.now();
      const originalResJson = res.json;
      res.json = function (bodyJson, ...args) {
        (res as any).locals.logBody = bodyJson;
        return originalResJson.apply(res, [bodyJson, ...args]);
      };

      res.on("finish", () => {
        const duration = Date.now() - start;
        if (req.path.startsWith("/api")) {
          const body = (res as any).locals.logBody;
          const bodyStr = body ? ` :: ${JSON.stringify(body)}` : "";
          console.log(`${req.method} ${req.path} ${res.statusCode} in ${duration}ms${bodyStr}`);
        }
      });
      next();
    });

    // 6. Route Registration and Static Files
    console.log("[Server] Registering routes...");
    await registerRoutes(httpServer, app, bucket);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      console.error(`API Error: ${message}`, {
        status,
        stack: err.stack,
        path: _req.path
      });
      res.status(status).json({ message });
    });

    if (process.env.NODE_ENV === "production") {
      serveStatic(app);
    } else {
      const { setupVite } = await import("./vite.js");
      await setupVite(httpServer, app);
    }

    // 7. Start Server
    const port = parseInt(process.env.PORT || "8000", 10);
    const host: string = "0.0.0.0";

    return new Promise<http.Server>((resolve) => {
      httpServer.listen(
        {
          port,
          host,
        },
        () => {
          const isProduction: boolean = process.env.NODE_ENV === "production";
          const logHost: string = (!isProduction && host === "0.0.0.0")
            ? "localhost"
            : host;
          console.log(`[Server] PID ${process.pid} - LISTENING at http://${logHost}:${port}`);
          console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
          resolve(httpServer);
        },
      );

      // 8. HMR and Cleanup
      if ((import.meta as any).hot) {
        (import.meta as any).hot.on("vite:beforeFullReload", () => {
          console.log("[Server] HMR: Full reload triggered");
          httpServer.close();
        });

        (import.meta as any).hot.dispose(() => {
          console.log("[Server] HMR: Disposing...");
          httpServer.close();
        });
      }
    });

  } catch (error) {
    console.error("[Server] FATAL: Failed to initialize server.");
    console.error("[Server] Error details:", error);
    throw error;
  }
}

// Auto-start if not being tested
if (process.env.NODE_ENV !== 'test') {
  initializeServer().catch(() => {
    process.exit(1);
  });
}
