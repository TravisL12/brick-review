import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
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
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
