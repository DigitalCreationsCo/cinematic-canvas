import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@tailwindcss/vite';
import mdx from '@astrojs/mdx';

export default defineConfig({
  integrations: [react(), mdx()],
  vite: {
    plugins: [tailwind()],
  },
  prefetch: {
    defaultStrategy: 'viewport',
  },
  build: {
    inlineStylesheets: 'auto',
  },
  output: 'static',
});