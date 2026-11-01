import { defineConfig } from 'vite';
import previewDebugging from './vite-plugin-preview-debug.mjs';

// Static multi-file app (plain script tags). Serve as-is.
export default defineConfig({
  plugins: [previewDebugging()],
  server: {
    host: true,
    port: 3000,
    strictPort: true,
    allowedHosts: true
  }
});
