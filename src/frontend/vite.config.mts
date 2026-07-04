import react from "@vitejs/plugin-react-swc";
import * as dotenv from "dotenv";
import path from "path";
import { defineConfig, loadEnv } from "vite";
import istanbul from "vite-plugin-istanbul";
import svgr from "vite-plugin-svgr";
import tsconfigPaths from "vite-tsconfig-paths";
import {
  API_ROUTES,
  BASENAME,
  PORT,
  PROXY_TARGET,
} from "./src/customization/config-constants";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const envPortalsResult = dotenv.config({
    path: path.resolve(__dirname, "../../.env"),
  });

  const envPortals = envPortalsResult.parsed || {};

  const apiRoutes = API_ROUTES || ["^/api/v1/", "^/api/v2/", "/health"];

  const target =
    env.VITE_PROXY_TARGET || envPortals.VITE_PROXY_TARGET || PROXY_TARGET || "http://localhost:7860";

  const port = Number(env.VITE_PORT) || PORT || 3000;

  const proxyTargets = apiRoutes.reduce((proxyObj, route) => {
    proxyObj[route] = {
      target: target,
      changeOrigin: true,
      secure: false,
      ws: true,
    };
    return proxyObj;
  }, {});

  return {
    base: BASENAME || "",
    build: {
      outDir: "build",
    },
    define: {
      "import.meta.env.BACKEND_URL": JSON.stringify(
        envPortals.BACKEND_URL ?? "http://localhost:7860",
      ),
      "import.meta.env.ACCESS_TOKEN_EXPIRE_SECONDS": JSON.stringify(
        envPortals.ACCESS_TOKEN_EXPIRE_SECONDS ?? 60,
      ),
      "import.meta.env.CI": JSON.stringify(envPortals.CI ?? false),
      "import.meta.env.PORTALS_AUTO_LOGIN": JSON.stringify(
        envPortals.PORTALS_AUTO_LOGIN ?? true,
      ),
      "import.meta.env.PORTALS_MCP_COMPOSER_ENABLED": JSON.stringify(
        envPortals.PORTALS_MCP_COMPOSER_ENABLED ?? "true",
      ),
    },
    plugins: [
      react(),
      svgr(),
      tsconfigPaths(),
      istanbul({
        include: "src/**/*",
        extension: [".ts", ".tsx", ".js", ".jsx"],
        requireEnv: false,
      }),
    ],
    server: {
      port: port,
      proxy: {
        ...proxyTargets,
      },
    },
  };
});
