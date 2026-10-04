import { defineConfig } from 'vite';

/**
 * Hosts Vite will answer on besides localhost. Only matters if the game is run
 * through Vite (`npm run dev` / `vite preview`) on a hosting service — the
 * normal online setup is `npm start`, which serves the built game itself.
 */
const allowedHosts = ['.onrender.com', '.ngrok-free.app', '.trycloudflare.com'];

// In development the game runs on Vite (:5173) and the room server on :8787
// (`npm run server`); /ws is proxied so the browser only ever talks to one origin.
export default defineConfig({
  server: {
    host: true,
    allowedHosts,
    proxy: {
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
  preview: {
    host: true,
    allowedHosts,
    proxy: {
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
});
