import { defineConfig } from 'vite';

// Studio serves a WebApp below /app/<project-key>/.
// Relative asset URLs are required for that gateway path to resolve correctly.
export default defineConfig({
  base: './',
});
