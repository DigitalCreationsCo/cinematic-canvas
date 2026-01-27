// src/middleware/context-handler.ts
import { LogContext, logContextStore } from "../../shared/logger/index.js";
import { serverId } from "../routes.js";

export function contextMiddleware(req: any, res: any, next: () => void) {
    const context: LogContext = {
        correlationId: req.headers[ "x-correlation-id" ],
        projectId: req.headers[ "x-project-id" ],
        w_id: `${process.env.HOSTNAME || 'express'}-${process.pid}`,
        serverId,
        shouldPublish: false,
        method: req.method,
        url: req.path
    };

    logContextStore.run(context, () => {
        // res.setHeader("X-Correlation-ID", context.correlationId);
        next();
    });
}