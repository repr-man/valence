import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { compileRenderer, type CompileResult } from '../../compiler/src/index.js';
import { transformWithOxc, type Plugin, type ResolvedConfig } from 'vite';
import { IsolatedBuildAdapter } from './build-orchestrator.js';
import { DevOrchestrator } from './dev-orchestrator.js';
import { MainManifest } from './manifest.js';
import { serializeWindowOptions } from './config-values.js';
import type { ElectronPluginOptions } from './types.js';

export type { ElectronPluginOptions, ModuleReference, BuildArtifact } from './types.js';
export { MainManifest } from './manifest.js';

const sourceExtension = /\.[cm]?[jt]sx?$/;

/**
 * Add Valence to an application's Vite plugins to compile async `"use main"`
 * functions and generate Electron main, preload, and invocation transport.
 * Keep calling the original functions with `await`; no manual IPC setup is needed.
 *
 * @example
 * import { defineConfig } from 'vite';
 * import valence from 'valence/vite';
 * export default defineConfig({ plugins: [valence()] });
 *
 * @see ../docs/getting-started.md
 * @see ../docs/agents.md
 */
export default function valence(options: ElectronPluginOptions = {}): Plugin {
  validateOptions(options);
  let config: ResolvedConfig;
  let lifecycle: string | undefined;
  let orchestrator: DevOrchestrator | undefined;
  let initialized = false;
  let disposed = false;
  let productionBuilt = false;
  const manifests = new WeakMap<object, MainManifest>();
  // Dev discovery and transforms share only the client environment's manifest.
  let clientManifest = new MainManifest();
  const manifestFor = (environment: { name: string }): MainManifest => {
    let manifest = manifests.get(environment);
    if (!manifest) {
      manifest = environment.name === 'client' ? clientManifest : new MainManifest();
      manifests.set(environment, manifest);
    }
    return manifest;
  };
  const eligible = (filename: string) => isAbsolute(filename) && sourceExtension.test(filename) &&
    !filename.includes('/node_modules/') && filename !== lifecycle &&
    !filename.startsWith(resolve(config.root, options.build?.outDir ?? 'dist') + '/') &&
    !filename.startsWith(resolve(config.root, '.valence') + '/');

  const compile = (code: string, filename: string): CompileResult => {
    const result = compileRenderer(code, { filename, root: config.root, directive: options.directive, sourceMap: options.build?.sourcemap ?? true });
    const errors = result.diagnostics.filter(d => d.severity === 'error');
    if (errors.length) {
      throw new Error(errors.map(d => `${d.filename}${d.span ? `:${d.span.start.line}:${d.span.start.column + 1}` : ''} ${d.code}: ${d.message}${d.suggestion ? `\n${d.suggestion}` : ''}`).join('\n'));
    }
    return result;
  };

  const inspect = async (filename: string, result: CompileResult) => {
    if (!options.dev?.inspectGenerated || !result.mainFunctions.length) return;
    const safe = relative(config.root, filename).replaceAll('..', '_').replaceAll('\\', '/');
    const directory = resolve(config.root, '.valence', 'inspect', safe);
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, 'renderer.ts'), result.code);
    for (const fn of result.mainFunctions) await writeFile(resolve(directory, `${fn.id}.ts`), fn.implementationCode);
    await writeFile(resolve(directory, 'manifest.json'), JSON.stringify(result.mainFunctions, null, 2));
  };

  return {
    name: 'valence', enforce: 'pre',
    config(user) {
      const root = resolve(user.root ?? process.cwd());
      const base = options.build?.outDir ?? 'dist';
      return {
        base: user.base ?? './',
        build: { outDir: user.build?.outDir ?? resolve(root, base, 'renderer') },
        // The dependency scanner has its own transform pipeline. Extract there
        // too, while preserving normal discovery and CommonJS optimization.
        optimizeDeps: {
          entries: user.optimizeDeps?.entries ?? (user.build?.rolldownOptions?.input ? undefined : [
            '**/*.html', '!node_modules/**', '!.valence/**',
            `!${relative(root, resolve(root, base)).replaceAll('\\', '/')}/**`,
            `!${relative(root, resolve(root, user.build?.outDir ?? resolve(root, base, 'renderer'))).replaceAll('\\', '/')}/**`,
          ]),
          rolldownOptions: {
            plugins: [{
              name: 'valence:dependency-scan',
              transform: {
                order: 'pre',
                filter: { id: /\.[cm]?[jt]sx?$/ },
                async handler(code: string, id: string) {
                  if (!eligible(id)) return null;
                  const result = compile(code, id);
                  // Scanning needs imports, not framework JSX semantics. Lower
                  // JSX without importing a framework runtime into the scanner.
                  return transformWithOxc(result.code, id, {
                    lang: id.endsWith('tsx') ? 'tsx' : id.endsWith('jsx') ? 'jsx' : /\.[cm]?ts$/.test(id) ? 'ts' : 'js',
                    jsx: { runtime: 'classic', pragma: '__valenceScanJSX', pragmaFrag: '__valenceScanFragment' },
                    sourcemap: false,
                  });
                },
              },
            }],
          },
        },
      };
    },
    async configResolved(resolved) {
      config = resolved;
      if (options.app?.lifecycleModule) {
        lifecycle = resolve(config.root, options.app.lifecycleModule);
        await stat(lifecycle);
      }
    },
    buildStart() {
      if (this.environment.name !== 'client') return;
      if (config.command === 'build') {
        clientManifest = new MainManifest();
        manifests.set(this.environment, clientManifest);
        productionBuilt = false;
      }
    },
    async transform(code, id) {
      if (this.environment.name !== 'client') return null;
      const filename = id.split('?')[0]!;
      if (!eligible(filename) || /[?&](raw|url|worker)(?:&|$)/.test(id)) return null;
      const result = compile(code, filename);
      const changed = manifestFor(this.environment).update(filename, result.mainFunctions);
      await inspect(filename, result);
      if (changed && initialized) orchestrator?.invalidate();
      return { code: result.code, map: result.map };
    },
    configureServer(viteServer) {
      disposed = false;
      let retryStart: (() => void) | undefined;
      let startupDirty = false;
      const onChange = async (filename: string) => {
        if (disposed) return;
        if (!initialized) { startupDirty = true; retryStart?.(); return; }
        try {
          let changed = false;
          if (eligible(filename)) {
            try {
              const result = compile(await readFile(filename, 'utf8'), filename);
              changed = clientManifest.update(filename, result.mainFunctions);
              await inspect(filename, result);
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code === 'ENOENT') changed = clientManifest.remove(filename);
              else throw error;
            }
          }
          if (changed || filename === lifecycle || orchestrator?.dependencies.has(filename)) orchestrator?.invalidate();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          config.logger.error(`[valence] ${message}`);
          viteServer.ws.send({ type: 'error', err: { message, stack: error instanceof Error ? error.stack ?? '' : '' } });
        }
      };
      viteServer.watcher.on('add', onChange).on('change', onChange).on('unlink', onChange);
      const start = async () => {
        if (initialized || disposed) return;
        // Discover before opening the BrowserWindow; browser module requests are too late.
        clientManifest.clear();
        const sourceRoot = resolve(config.root, 'src');
        const hasSrc = await stat(sourceRoot).then(s => s.isDirectory(), () => false);
        for (const filename of await sourceFiles(hasSrc ? sourceRoot : config.root, resolve(config.root, options.build?.outDir ?? 'dist'))) {
          if (!eligible(filename)) continue;
          const result = compile(await readFile(filename, 'utf8'), filename);
          clientManifest.update(filename, result.mainFunctions);
          await inspect(filename, result);
        }
        const local = viteServer.resolvedUrls?.local[0];
        const address = viteServer.httpServer?.address();
        const fallback = typeof address === 'object' && address ? `http://localhost:${address.port}/` : undefined;
        const url = local ?? fallback;
        if (!url) throw new Error('valence requires a listening Vite dev server (middleware mode must supply a server).');
        if (disposed) return;
        initialized = true;
        orchestrator = new DevOrchestrator(viteServer, new IsolatedBuildAdapter(config, options, lifecycle), clientManifest, options, url);
        await orchestrator.start();
      };
      let startup: Promise<void> | undefined;
      const startWithErrors = () => {
        if (startup || disposed) return;
        startupDirty = false;
        startup = start().catch(async error => {
          initialized = false;
          await orchestrator?.dispose();
          orchestrator = undefined;
          config.logger.error(`[valence] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
        }).finally(() => {
          startup = undefined;
          if (startupDirty && !initialized && !disposed) startWithErrors();
        });
      };
      retryStart = startWithErrors;
      if (viteServer.httpServer?.listening) startWithErrors();
      else viteServer.httpServer?.once('listening', startWithErrors);
      return () => {};
    },
    async closeBundle() {
      if (config.command === 'serve') {
        disposed = true;
        await orchestrator?.dispose();
        return;
      }
      if (this.environment.name !== 'client' || productionBuilt) return;
      productionBuilt = true;
      await new IsolatedBuildAdapter(config, options, lifecycle).build(clientManifest, false);
    },
  };
}

function validateOptions(options: ElectronPluginOptions): void {
  serializeWindowOptions(options.window);
  const authorization = options.security?.authorizeInvocation;
  if (authorization && typeof authorization !== 'function') {
    if (!authorization.module || !/^[A-Za-z_$][\w$]*$/.test(authorization.export ?? 'default')) {
      throw new Error('valence: authorization module references need a module path and a valid export name.');
    }
  }
  if (options.directive !== undefined && !options.directive.trim()) throw new Error('valence: directive cannot be empty.');
  const main = options.build?.mainFile ?? 'main.js';
  const preload = options.build?.preloadFile ?? 'preload.cjs';
  for (const file of [main, preload]) {
    if (isAbsolute(file) || file.split(/[\\/]/).includes('..')) throw new Error('valence: generated filenames must stay inside the electron output directory.');
  }
  if (!main.endsWith('.js') && !main.endsWith('.mjs')) throw new Error('valence: mainFile must end in .js or .mjs (ES modules).');
  if (!preload.endsWith('.cjs')) throw new Error('valence: preloadFile must end in .cjs for Electron sandbox compatibility.');
  if (main === preload || main === 'package.json') throw new Error('valence: generated output filenames must be distinct.');
}

async function sourceFiles(directory: string, outDir: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git', '.valence', 'dist'].includes(entry.name) || filename === outDir) continue;
      files.push(...await sourceFiles(filename, outDir));
    } else if (entry.isFile() && sourceExtension.test(entry.name) && !entry.name.endsWith('.d.ts')) files.push(filename);
  }
  return files.sort();
}
