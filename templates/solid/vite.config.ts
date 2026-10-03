import tailwindcss from '@tailwindcss/vite';
import solid from '@solidjs/vite-plugin';
import { defineConfig } from 'vite';
import valence from 'valence/vite';

export default defineConfig(({ mode }) => ({
  cacheDir: '.valence/vite',
  // Extract main functions before Solid transforms the source. Solid enables
  // renderer HMR; Valence rebuilds and restarts Electron for main changes.
  plugins: [valence({ dev: { launch: mode !== 'web' } }), solid(), tailwindcss()],
}));
