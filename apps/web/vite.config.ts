import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// The API reads PORT from the monorepo root .env; proxy to the same port so
// machines that move the API off 3001 (e.g. the Mac mini) just work.
const rootDir = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '');
  const apiPort = env.PORT || '3001';

  return {
    // getUserMedia needs a secure context. localhost counts as one, but
    // https://macmini:5173 only does over HTTPS, hence the self-signed cert.
    plugins: [react(), basicSsl()],
    server: {
      port: 5173,
      // Listen on the LAN so other devices can reach the dev server.
      host: true,
      allowedHosts: ['macmini'],
      proxy: {
        '/api': {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
  };
});
