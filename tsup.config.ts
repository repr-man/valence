import { defineConfig } from 'tsup';
export default defineConfig({
  entry: {
    cli: 'packages/cli/src/index.ts',
    vite: 'packages/vite-plugin/src/index.ts',
    compiler: 'packages/compiler/src/index.ts',
    electron: 'packages/runtime/src/electron.ts',
    'runtime/renderer': 'packages/runtime/src/renderer.ts',
    'runtime/preload': 'packages/runtime/src/preload.ts',
    'runtime/main': 'packages/runtime/src/main.ts',
    'runtime/context': 'packages/runtime/src/context.ts',
    'runtime/protocol': 'packages/runtime/src/protocol.ts',
  },
  format: ['esm'], target: 'node22', dts: true, sourcemap: true,
  splitting: true, clean: true, external: ['vite', 'electron'],
});
