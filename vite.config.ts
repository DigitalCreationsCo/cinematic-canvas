import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  ssr: {
    // Transform opentelemetry to fix its missing .js extensions in ESM imports
    noExternal: [/@opentelemetry\/.*/]
  }
});
