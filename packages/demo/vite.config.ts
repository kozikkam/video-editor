import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      // Alias @video-editor/core to its source for development
      '@video-editor/core': resolve(__dirname, '../core/src/index.ts'),
    },
  },
  server: {
    port: 3000,
    // Required headers for SharedArrayBuffer (future FFmpeg support)
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
