// src/server/vite.config.ts
import { defineConfig } from "file:///Users/andresb/Projects/cinematic-canvas/node_modules/vite/dist/node/index.js";
import react from "file:///Users/andresb/Projects/cinematic-canvas/node_modules/@vitejs/plugin-react/dist/index.js";
import tailwindcss from "file:///Users/andresb/Projects/cinematic-canvas/node_modules/@tailwindcss/vite/dist/index.mjs";
import path from "path";
import runtimeErrorOverlay from "file:///Users/andresb/Projects/cinematic-canvas/node_modules/@replit/vite-plugin-runtime-error-modal/dist/index.mjs";
var __vite_injected_original_dirname = "/Users/andresb/Projects/cinematic-canvas/src/server";
var vite_config_default = defineConfig({
  root: path.resolve(__vite_injected_original_dirname, "../client"),
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...process.env.NODE_ENV !== "production" && process.env.REPL_ID !== void 0 ? [
      await import("file:///Users/andresb/Projects/cinematic-canvas/node_modules/@replit/vite-plugin-cartographer/dist/index.mjs").then(
        (m) => m.cartographer()
      ),
      await import("file:///Users/andresb/Projects/cinematic-canvas/node_modules/@replit/vite-plugin-dev-banner/dist/index.mjs").then(
        (m) => m.devBanner()
      )
    ] : []
  ],
  build: {
    outDir: path.resolve(__vite_injected_original_dirname, "../../dist/server/public"),
    emptyOutDir: false,
    sourcemap: true,
    target: "esnext",
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "wouter"],
          ui: ["@radix-ui/react-slot", "lucide-react", "clsx", "tailwind-merge"]
        }
      }
    }
  },
  server: {
    watch: {
      ignored: ["**/dist/**"]
    },
    fs: {
      allow: [
        path.resolve(__vite_injected_original_dirname, "..", "client"),
        path.resolve(__vite_injected_original_dirname, "..", "shared")
      ],
      strict: true,
      deny: ["**/.*"]
    },
    sourcemapIgnoreList: false
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL3NlcnZlci92aXRlLmNvbmZpZy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIi9Vc2Vycy9hbmRyZXNiL1Byb2plY3RzL2NpbmVtYXRpYy1jYW52YXMvc3JjL3NlcnZlclwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL1VzZXJzL2FuZHJlc2IvUHJvamVjdHMvY2luZW1hdGljLWNhbnZhcy9zcmMvc2VydmVyL3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9Vc2Vycy9hbmRyZXNiL1Byb2plY3RzL2NpbmVtYXRpYy1jYW52YXMvc3JjL3NlcnZlci92aXRlLmNvbmZpZy50c1wiO2ltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gXCJ2aXRlXCI7XG5pbXBvcnQgcmVhY3QgZnJvbSBcIkB2aXRlanMvcGx1Z2luLXJlYWN0XCI7XG5pbXBvcnQgdGFpbHdpbmRjc3MgZnJvbSBcIkB0YWlsd2luZGNzcy92aXRlXCI7XG5pbXBvcnQgcGF0aCBmcm9tIFwicGF0aFwiO1xuaW1wb3J0IHJ1bnRpbWVFcnJvck92ZXJsYXkgZnJvbSBcIkByZXBsaXQvdml0ZS1wbHVnaW4tcnVudGltZS1lcnJvci1tb2RhbFwiO1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICByb290OiBwYXRoLnJlc29sdmUoaW1wb3J0Lm1ldGEuZGlybmFtZSwgXCIuLi9jbGllbnRcIiksXG4gIHBsdWdpbnM6IFtcbiAgICByZWFjdCgpLFxuICAgIHRhaWx3aW5kY3NzKCksXG4gICAgcnVudGltZUVycm9yT3ZlcmxheSgpLFxuICAgIC4uLihwcm9jZXNzLmVudi5OT0RFX0VOViAhPT0gXCJwcm9kdWN0aW9uXCIgJiZcbiAgICAgIHByb2Nlc3MuZW52LlJFUExfSUQgIT09IHVuZGVmaW5lZFxuICAgICAgPyBbXG4gICAgICAgIGF3YWl0IGltcG9ydChcIkByZXBsaXQvdml0ZS1wbHVnaW4tY2FydG9ncmFwaGVyXCIpLnRoZW4oKG0pID0+XG4gICAgICAgICAgbS5jYXJ0b2dyYXBoZXIoKSxcbiAgICAgICAgKSxcbiAgICAgICAgYXdhaXQgaW1wb3J0KFwiQHJlcGxpdC92aXRlLXBsdWdpbi1kZXYtYmFubmVyXCIpLnRoZW4oKG0pID0+XG4gICAgICAgICAgbS5kZXZCYW5uZXIoKSxcbiAgICAgICAgKSxcbiAgICAgIF1cbiAgICAgIDogW10pLFxuICBdLFxuXG4gIGJ1aWxkOiB7XG4gICAgb3V0RGlyOiBwYXRoLnJlc29sdmUoaW1wb3J0Lm1ldGEuZGlybmFtZSwgXCIuLi8uLi9kaXN0L3NlcnZlci9wdWJsaWNcIiksXG4gICAgZW1wdHlPdXREaXI6IGZhbHNlLFxuICAgIHNvdXJjZW1hcDogdHJ1ZSxcbiAgICB0YXJnZXQ6IFwiZXNuZXh0XCIsXG4gICAgcm9sbHVwT3B0aW9uczoge1xuICAgICAgb3V0cHV0OiB7XG4gICAgICAgIG1hbnVhbENodW5rczoge1xuICAgICAgICAgIHZlbmRvcjogWyBcInJlYWN0XCIsIFwicmVhY3QtZG9tXCIsIFwid291dGVyXCIgXSxcbiAgICAgICAgICB1aTogWyBcIkByYWRpeC11aS9yZWFjdC1zbG90XCIsIFwibHVjaWRlLXJlYWN0XCIsIFwiY2xzeFwiLCBcInRhaWx3aW5kLW1lcmdlXCIgXSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgfSxcblxuICBzZXJ2ZXI6IHtcbiAgICB3YXRjaDoge1xuICAgICAgaWdub3JlZDogWyBcIioqL2Rpc3QvKipcIiBdLFxuICAgIH0sXG4gICAgZnM6IHtcbiAgICAgIGFsbG93OiBbXG4gICAgICAgIHBhdGgucmVzb2x2ZShpbXBvcnQubWV0YS5kaXJuYW1lLCBcIi4uXCIsIFwiY2xpZW50XCIpLFxuICAgICAgICBwYXRoLnJlc29sdmUoaW1wb3J0Lm1ldGEuZGlybmFtZSwgXCIuLlwiLCBcInNoYXJlZFwiKVxuICAgICAgXSxcbiAgICAgIHN0cmljdDogdHJ1ZSxcbiAgICAgIGRlbnk6IFsgXCIqKi8uKlwiIF0sXG4gICAgfSxcbiAgICBzb3VyY2VtYXBJZ25vcmVMaXN0OiBmYWxzZSwgXG4gIH0sXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBMlUsU0FBUyxvQkFBb0I7QUFDeFcsT0FBTyxXQUFXO0FBQ2xCLE9BQU8saUJBQWlCO0FBQ3hCLE9BQU8sVUFBVTtBQUNqQixPQUFPLHlCQUF5QjtBQUpoQyxJQUFNLG1DQUFtQztBQU16QyxJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixNQUFNLEtBQUssUUFBUSxrQ0FBcUIsV0FBVztBQUFBLEVBQ25ELFNBQVM7QUFBQSxJQUNQLE1BQU07QUFBQSxJQUNOLFlBQVk7QUFBQSxJQUNaLG9CQUFvQjtBQUFBLElBQ3BCLEdBQUksUUFBUSxJQUFJLGFBQWEsZ0JBQzNCLFFBQVEsSUFBSSxZQUFZLFNBQ3RCO0FBQUEsTUFDQSxNQUFNLE9BQU8sOEdBQWtDLEVBQUU7QUFBQSxRQUFLLENBQUMsTUFDckQsRUFBRSxhQUFhO0FBQUEsTUFDakI7QUFBQSxNQUNBLE1BQU0sT0FBTyw0R0FBZ0MsRUFBRTtBQUFBLFFBQUssQ0FBQyxNQUNuRCxFQUFFLFVBQVU7QUFBQSxNQUNkO0FBQUEsSUFDRixJQUNFLENBQUM7QUFBQSxFQUNQO0FBQUEsRUFFQSxPQUFPO0FBQUEsSUFDTCxRQUFRLEtBQUssUUFBUSxrQ0FBcUIsMEJBQTBCO0FBQUEsSUFDcEUsYUFBYTtBQUFBLElBQ2IsV0FBVztBQUFBLElBQ1gsUUFBUTtBQUFBLElBQ1IsZUFBZTtBQUFBLE1BQ2IsUUFBUTtBQUFBLFFBQ04sY0FBYztBQUFBLFVBQ1osUUFBUSxDQUFFLFNBQVMsYUFBYSxRQUFTO0FBQUEsVUFDekMsSUFBSSxDQUFFLHdCQUF3QixnQkFBZ0IsUUFBUSxnQkFBaUI7QUFBQSxRQUN6RTtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUFBLEVBRUEsUUFBUTtBQUFBLElBQ04sT0FBTztBQUFBLE1BQ0wsU0FBUyxDQUFFLFlBQWE7QUFBQSxJQUMxQjtBQUFBLElBQ0EsSUFBSTtBQUFBLE1BQ0YsT0FBTztBQUFBLFFBQ0wsS0FBSyxRQUFRLGtDQUFxQixNQUFNLFFBQVE7QUFBQSxRQUNoRCxLQUFLLFFBQVEsa0NBQXFCLE1BQU0sUUFBUTtBQUFBLE1BQ2xEO0FBQUEsTUFDQSxRQUFRO0FBQUEsTUFDUixNQUFNLENBQUUsT0FBUTtBQUFBLElBQ2xCO0FBQUEsSUFDQSxxQkFBcUI7QUFBQSxFQUN2QjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
