import { defineConfig } from 'vite';

// In development the game runs on Vite (:5173) and the room server on :8787
// (`npm run server`); /ws is proxied so the browser only ever talks to one origin.
export default defineConfig({
  server: {
    host: true,
    proxy: {
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
});
