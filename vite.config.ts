import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    tsconfigPaths({
      // website/tsconfig.json extends "astro/tsconfigs/strict" which is
      // unavailable outside the website build context – skip that subtree.
      projects: [
        'tsconfig.json',
        'src/shared',
        'src/worker',
        'src/client',
        'src/pipeline',
        'src/server',
        'src/tsconfig.monolith.json',
      ],
      ignoreConfigErrors: true,
    }),
  ],
  ssr: {
    noExternal: [
      // Force-transform @opentelemetry packages so Vite resolves their
      // extensionless ESM imports (e.g. './execAsync' → './execAsync.js').
      /@opentelemetry\/.*/,
    ],
  },
});
