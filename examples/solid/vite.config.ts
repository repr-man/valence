import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import valence from 'valence/vite';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root,
  cacheDir: ".valence/vite",
  plugins: [solid(), tailwindcss(), valence({
    dev: { launch: process.env.VALENCE_NO_LAUNCH !== '1', args: ['--no-sandbox'] },

  })],
});
