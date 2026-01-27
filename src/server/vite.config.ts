import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  root: path.resolve(import.meta.dirname, "../client"),
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
      process.env.REPL_ID !== undefined
      ? [
        await import("@replit/vite-plugin-cartographer").then((m) =>
          m.cartographer(),
        ),
        await import("@replit/vite-plugin-dev-banner").then((m) =>
          m.devBanner(),
        ),
      ]
      : []),
  ],

  build: {
    outDir: path.resolve(import.meta.dirname, "../../dist/server/public"),
    emptyOutDir: false,
    sourcemap: true,
    target: "esnext",
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: [ "react", "react-dom", "wouter" ],
          ui: [ "@radix-ui/react-slot", "lucide-react", "clsx", "tailwind-merge" ],
        },
      },
    },
  },

  server: {
    watch: {
      ignored: [ "**/dist/**" ],
    },
    fs: {
      allow: [
        path.resolve(import.meta.dirname, "..", "client"),
        path.resolve(import.meta.dirname, "..", "shared")
      ],
      strict: true,
      deny: [ "**/.*" ],
    },
    sourcemapIgnoreList: false, 
  },
});
