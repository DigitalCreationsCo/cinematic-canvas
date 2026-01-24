import { type Express } from "express";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "./vite.config.js";
import fs from "fs";
import path from "path";



const viteLogger = createLogger();

export async function setupVite(server: Server, app: Express) {

  const root = process.cwd();
  const clientSrcPath = path.resolve(root, "src", "client");
  const serverOptions = {
    middlewareMode: true,
    hmr: { server, path: "/vite-hmr" },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    root: clientSrcPath,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        if (!msg.includes('hmr')) process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);

  app.use("*", async (req, res, next) => {
    if (req.originalUrl.startsWith('/api')) {
      return next();
    }

    const url = req.originalUrl;
    try {

      const templatePath = path.resolve(clientSrcPath, "index.html");
      let template = await fs.promises.readFile(templatePath, "utf-8");
      const html = await vite.transformIndexHtml(url, template);
      
      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
