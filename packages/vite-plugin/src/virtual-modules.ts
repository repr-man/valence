import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformWithOxc, type Plugin } from 'vite';
import { compileRenderer, type MainFunctionIR } from '../../compiler/src/index.js';
import type { ElectronPluginOptions } from './types.js';
import { assertSelfContained, callableSource } from './security.js';
import { serializeWindowOptions } from './config-values.js';

export const MAIN_ENTRY = 'virtual:valence/main-entry';
export const PRELOAD_ENTRY = 'virtual:valence/preload-entry';
export const REGISTRY = 'virtual:valence/registry';
export const RUNTIME_CONFIG = 'virtual:valence/runtime-config';
export const FUNCTION_PREFIX = 'virtual:valence/function/';
const PREFIX = '\0';
const quote = JSON.stringify;

export interface VirtualModuleOptions {
  root: string;
  mainFunctions: MainFunctionIR[];
  options: ElectronPluginOptions;
  development: boolean;
  devUrl?: string;
  preloadFile: string;
  rendererRelative: string;
  lifecycle?: string;
}

export function virtualModules(config: VirtualModuleOptions): Plugin {
  const functions = new Map(config.mainFunctions.map(fn => [fn.id, fn]));
  // Tie extracted code to its author file so source maps survive Vite's
  // virtual-module handling. Bootstrap modules still use null-prefixed IDs.
  const sourceId = (fn: MainFunctionIR) => `${fn.filename}?valence-main=${fn.id}`;
  const sourceModules = new Map(config.mainFunctions.map(fn => [sourceId(fn), fn]));
  const entries = new Map<string, string>([
    [MAIN_ENTRY, mainEntry(config)],
    [PRELOAD_ENTRY, `import { exposeMainBridge } from 'valence/runtime/preload';\nexposeMainBridge({ development: ${config.development} });`],
    [REGISTRY, registry(config.mainFunctions)],
    [RUNTIME_CONFIG, `export default ${quote({ development: config.development, protocol: 1 })};`],
  ]);
  return {
    name: 'valence:generated',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (entries.has(source)) return PREFIX + source;
      if (source.startsWith(FUNCTION_PREFIX)) {
        const fn = functions.get(source.slice(FUNCTION_PREFIX.length));
        if (!fn) this.error(`Unknown generated valence function: ${source}`);
        return sourceId(fn);
      }
      if (source.startsWith('valence/runtime/') || source === 'valence/electron') {
        return fileURLToPath(import.meta.resolve(source));
      }
      const parentFunction = importer ? sourceModules.get(importer) : undefined;
      if (parentFunction) {
        const fn = parentFunction;
        // Resolve original relative imports from the author's module, never a virtual directory.
        const resolved = await this.resolve(source, fn.filename, { skipSelf: true });
        if (resolved) return resolved;
        if (source.startsWith('.')) return resolve(dirname(fn.filename), source);
      }
      return null;
    },
    async transform(code, id) {
      const fn = sourceModules.get(id);
      if (!fn) return null;
      return transformWithOxc(code, fn.filename + '.ts', {
        lang: 'ts', sourcemap: config.options.build?.sourcemap ?? true,
      }, fn.implementationMap);
    },
    load(id) {
      const fn = sourceModules.get(id);
      if (fn) return { code: fn.implementationCode, map: null };
      if (!id.startsWith(PREFIX)) return null;
      const publicId = id.slice(1);
      if (entries.has(publicId)) return entries.get(publicId);
      return null;
    },
  };
}

function registry(functions: MainFunctionIR[]): string {
  return [
    `import { registerMain } from 'valence/runtime/main';`,
    ...functions.map((fn, i) => `import fn${i} from ${quote(FUNCTION_PREFIX + fn.id)};`),
    ...functions.map((fn, i) => `registerMain(${quote(fn.id)}, fn${i}, ${quote({ source: fn.filename, name: fn.displayName })});`),
  ].join('\n');
}

function authorization(config: VirtualModuleOptions): { imports: string; expression: string } {
  const hook = config.options.security?.authorizeInvocation;
  if (!hook) return { imports: '', expression: 'lifecycle.security?.authorizeInvocation' };
  if (typeof hook !== 'function') {
    const path = isAbsolute(hook.module) ? hook.module : resolve(config.root, hook.module);
    return { imports: `import { ${hook.export ?? 'default'} as authorizeInvocation } from ${quote(path)};`, expression: 'authorizeInvocation' };
  }
  const source = callableSource(hook);
  assertSelfContained(source);
  const result = compileRenderer(`export async function authorizeInvocation(context) { ${quote(config.options.directive ?? 'use main')}; return (${source})(context); }`, {
    filename: resolve(config.root, '.valence/authorization.ts'), root: config.root,
    directive: config.options.directive, sourceMap: false,
  });
  if (result.diagnostics.some(diagnostic => diagnostic.severity === 'error')) {
    throw new Error(`valence: Authorization callbacks must be self-contained. Use security.authorizeInvocation: { module: './src/policy.ts' } or a lifecycle module.\n${result.diagnostics.map(d => d.message).join('\n')}`);
  }
  return { imports: '', expression: `(${source})` };
}

function mainEntry(config: VirtualModuleOptions): string {
  const auth = authorization(config);
  const route = config.options.app?.entryRoute ?? '';
  const windowOptions = serializeWindowOptions(config.options.window);
  return `
import { app, BrowserWindow } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installMainRuntime, registerWindow } from 'valence/runtime/main';
import '${REGISTRY}';
${config.lifecycle ? `import lifecycle from ${quote(config.lifecycle)};` : 'const lifecycle = {};'}
${auth.imports}
const configuredWindow = ${windowOptions};
const preload = fileURLToPath(new URL(${quote('./' + config.preloadFile)}, import.meta.url));
const renderer = fileURLToPath(new URL(${quote(config.rendererRelative)}, import.meta.url));
const development = ${config.development};
const url = ${quote(config.devUrl ?? '')};
const route = ${quote(route)};
process.setSourceMapsEnabled?.(${config.options.build?.sourcemap ?? true});
let disposeRuntime = () => {};
async function createWindow() {
  const window = new BrowserWindow({
    width: 1000, height: 760, ...configuredWindow,
    webPreferences: { ...configuredWindow.webPreferences, contextIsolation: true, nodeIntegration: false, nodeIntegrationInSubFrames: false, sandbox: true, preload },
  });
  const target = development ? new URL(route.replace(/^\\//, ''), url).href : pathToFileURL(renderer).href;
  registerWindow(window, { allowedUrls: [target], allowSameOrigin: development });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const restrictNavigation = (event, destination) => {
    try {
      const next = new URL(destination);
      const allowed = development ? next.origin === new URL(target).origin : next.protocol === 'file:' && next.pathname === new URL(target).pathname;
      if (!allowed) event.preventDefault();
    } catch { event.preventDefault(); }
  };
  window.webContents.on('will-navigate', restrictNavigation);
  window.webContents.on('will-redirect', restrictNavigation);
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  if (development) await window.loadURL(target);
  else await window.loadFile(renderer, route ? { hash: route.replace(/^#/, '') } : undefined);
  return window;
}
app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) void createWindow().catch(error => { console.error(error); app.exit(1); }); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
let quitting = false;
app.on('before-quit', event => {
  if (quitting || !lifecycle.beforeQuit) return;
  event.preventDefault(); quitting = true;
  Promise.resolve().then(() => lifecycle.beforeQuit({ app })).catch(error => console.error('[valence] beforeQuit failed', error)).finally(() => app.quit());
});
app.on('will-quit', () => disposeRuntime());
// Do not await whenReady at module scope: Electron waits for ESM evaluation
// before emitting ready. Schedule window creation after the module resolves.
void app.whenReady().then(async () => {
  disposeRuntime = installMainRuntime({ development, authorizeInvocation: ${auth.expression} });
  const window = await createWindow();
  await lifecycle.ready?.({ app, window, createWindow });
}).catch(error => { console.error('[valence] Startup failed', error); app.exit(1); });
`;
}
