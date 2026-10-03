import { builtinModules } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { build, type ResolvedConfig } from 'vite';
import { MainManifest } from './manifest.js';
import { MAIN_ENTRY, PRELOAD_ENTRY, virtualModules } from './virtual-modules.js';
import type { BuildArtifact, ElectronPluginOptions } from './types.js';

export interface BuildAdapter {
  build(manifest: MainManifest, development: boolean, devUrl?: string): Promise<BuildArtifact>;
}

/** Isolated builds provide a stable boundary around Vite's evolving environment API. */
export class IsolatedBuildAdapter implements BuildAdapter {
  constructor(private readonly config: ResolvedConfig, private readonly options: ElectronPluginOptions, private readonly lifecycle?: string) {}

  async build(manifest: MainManifest, development: boolean, devUrl?: string): Promise<BuildArtifact> {
    const root = this.config.root;
    const base = resolve(root, this.options.build?.outDir ?? 'dist');
    const outDir = resolve(base, 'electron');
    const mainFile = this.options.build?.mainFile ?? 'main.js';
    const preloadFile = this.options.build?.preloadFile ?? 'preload.cjs';
    const renderer = resolve(root, this.config.build.outDir, 'index.html');
    const functions = manifest.functions();
    const virtualOptions = {
      root, mainFunctions: functions, options: this.options, development, devUrl,
      preloadFile: relative(dirname(resolve(outDir, mainFile)), resolve(outDir, preloadFile)).replaceAll('\\', '/'),
      rendererRelative: relative(dirname(resolve(outDir, mainFile)), renderer).replaceAll('\\', '/'),
      lifecycle: this.lifecycle,
    };
    const externalDependencies = this.options.build?.external ?? [];
    const external = (id: string) => id === 'electron' || id.startsWith('node:') || builtinModules.includes(id) ||
      externalDependencies.some(dependency => id === dependency || id.startsWith(dependency + '/'));
    const dependencies = new Set<string>();
    // No framework/router plugins are copied into either privileged graph.
    for (const [entry, file, format] of [[MAIN_ENTRY, mainFile, 'es'], [PRELOAD_ENTRY, preloadFile, 'cjs']] as const) {
      const result = await build({
        configFile: false, root, logLevel: 'warn',
        ssr: { noExternal: true },
        resolve: { alias: this.config.resolve.alias, conditions: ['node'], mainFields: ['module', 'main'] },
        plugins: [virtualModules(virtualOptions)],
        build: {
          outDir, emptyOutDir: false, copyPublicDir: false,
          ssr: true, target: 'node22', minify: false,
          sourcemap: this.options.build?.sourcemap ?? true,
          rolldownOptions: {
            input: entry, external,
            output: {
              format, entryFileNames: file, chunkFileNames: 'chunks/[name]-[hash].js', codeSplitting: false,
              sourcemapPathTransform: source => source.replace(/\?valence-main=[^?]*$/, ''),
            },
          },
        },
      });
      if ('on' in result) throw new Error('valence generated builds cannot use watch mode.');
      for (const output of Array.isArray(result) ? result : [result]) {
        for (const chunk of output.output) {
          if (chunk.type === 'chunk') {
            for (const id of Object.keys(chunk.modules)) if (!id.startsWith('\0') && !id.includes('?valence-main=')) dependencies.add(id.split('?')[0]!);
          }
        }
      }
    }
    await mkdir(outDir, { recursive: true });
    await writeFile(resolve(outDir, 'package.json'), JSON.stringify({ type: 'module', main: mainFile }, null, 2) + '\n');
    const manifestDir = resolve(base, 'manifests');
    await mkdir(manifestDir, { recursive: true });
    await writeFile(resolve(manifestDir, 'valence.json'), JSON.stringify(manifest.audit(root), null, 2) + '\n');
    return { main: resolve(outDir, mainFile), preload: resolve(outDir, preloadFile), dependencies };
  }
}
