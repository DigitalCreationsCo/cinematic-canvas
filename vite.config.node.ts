import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src", "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "src", "shared"),
      "@assets": path.resolve(import.meta.dirname, "src", "attached_assets"),
    },
  },
  build: {
    target: 'node22',
  },
});
