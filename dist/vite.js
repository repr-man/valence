import {
  compileRenderer
} from "./chunk-2UNZZ2OE.js";

// packages/vite-plugin/src/index.ts
import { mkdir as mkdir2, readFile, readdir, stat, writeFile as writeFile2 } from "fs/promises";
import { isAbsolute as isAbsolute2, relative as relative3, resolve as resolve3 } from "path";
import { transformWithOxc as transformWithOxc2 } from "vite";

// packages/vite-plugin/src/build-orchestrator.ts
import { builtinModules } from "module";
import { mkdir, writeFile } from "fs/promises";
import { dirname as dirname2, relative, resolve as resolve2 } from "path";
import { build } from "vite";

// packages/vite-plugin/src/virtual-modules.ts
import { dirname, isAbsolute, resolve } from "path";
import { fileURLToPath } from "url";
import { transformWithOxc } from "vite";

// packages/vite-plugin/src/security.ts
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
var mainGlobals = /* @__PURE__ */ new Set([
  "undefined",
  "NaN",
  "Infinity",
  "globalThis",
  "console",
  "process",
  "Buffer",
  "Object",
  "Function",
  "Boolean",
  "Symbol",
  "Number",
  "BigInt",
  "Math",
  "Date",
  "String",
  "RegExp",
  "Array",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "WeakRef",
  "Promise",
  "Reflect",
  "Proxy",
  "JSON",
  "Intl",
  "URL",
  "URLSearchParams",
  "ArrayBuffer",
  "SharedArrayBuffer",
  "DataView",
  "Uint8Array",
  "Uint8ClampedArray",
  "Int8Array",
  "Uint16Array",
  "Int16Array",
  "Uint32Array",
  "Int32Array",
  "Float32Array",
  "Float64Array",
  "BigInt64Array",
  "BigUint64Array",
  "TextEncoder",
  "TextDecoder",
  "Error",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "ReferenceError",
  "URIError",
  "EvalError",
  "AggregateError",
  "AbortController",
  "AbortSignal",
  "setTimeout",
  "clearTimeout",
  "setInterval",
  "clearInterval",
  "setImmediate",
  "clearImmediate",
  "queueMicrotask",
  "structuredClone",
  "parseInt",
  "parseFloat",
  "isNaN",
  "isFinite",
  "encodeURI",
  "decodeURI",
  "encodeURIComponent",
  "decodeURIComponent"
]);
var traverse = typeof traverseModule === "function" ? traverseModule : traverseModule.default;
function assertSelfContained(source) {
  const ast = parse(`const authorization = (${source});`, { sourceType: "module" });
  traverse(ast, {
    ReferencedIdentifier(path) {
      if (!path.scope.getBinding(path.node.name) && !mainGlobals.has(path.node.name)) {
        throw new Error(`valence: Authorization callback references '${path.node.name}', which cannot cross the config boundary. Use security.authorizeInvocation: { module: './src/policy.ts' } or a lifecycle module.`);
      }
    },
    ThisExpression() {
      throw new Error("valence: Authorization callbacks cannot capture this. Use a module reference or lifecycle module.");
    }
  });
}
function callableSource(fn) {
  const source = Function.prototype.toString.call(fn);
  try {
    parse(`(${source})`, { sourceType: "module" });
    return source;
  } catch {
    const normalized = source.startsWith("async ") ? `async function ${source.slice(6)}` : `function ${source}`;
    try {
      parse(`(${normalized})`, { sourceType: "module" });
      return normalized;
    } catch {
      throw new Error("valence: Authorization callbacks must be ordinary serializable functions. Use a module reference for native or bound functions.");
    }
  }
}

// packages/vite-plugin/src/config-values.ts
function serializeWindowOptions(value) {
  const ancestors = /* @__PURE__ */ new Set();
  function validate(item, path) {
    if (item === void 0 || item === null || typeof item === "string" || typeof item === "boolean") return;
    if (typeof item === "number" && Number.isFinite(item)) return;
    if (typeof item !== "object" || ancestors.has(item)) {
      throw new Error(`valence: ${path} must be a serializable window option (no functions, native objects, or cycles).`);
    }
    const prototype = Object.getPrototypeOf(item);
    if (!Array.isArray(item) && prototype !== Object.prototype && prototype !== null) {
      throw new Error(`valence: ${path} cannot embed an Electron object in the build. Use a file path for icons and a lifecycle hook for runtime customization.`);
    }
    ancestors.add(item);
    for (const [key, child] of Object.entries(item)) validate(child, `${path}.${key}`);
    ancestors.delete(item);
  }
  validate(value, "window");
  return JSON.stringify(value ?? {});
}

// packages/vite-plugin/src/virtual-modules.ts
var MAIN_ENTRY = "virtual:valence/main-entry";
var PRELOAD_ENTRY = "virtual:valence/preload-entry";
var REGISTRY = "virtual:valence/registry";
var RUNTIME_CONFIG = "virtual:valence/runtime-config";
var FUNCTION_PREFIX = "virtual:valence/function/";
var PREFIX = "\0";
var quote = JSON.stringify;
function virtualModules(config) {
  const functions = new Map(config.mainFunctions.map((fn) => [fn.id, fn]));
  const sourceId = (fn) => `${fn.filename}?valence-main=${fn.id}`;
  const sourceModules = new Map(config.mainFunctions.map((fn) => [sourceId(fn), fn]));
  const entries = /* @__PURE__ */ new Map([
    [MAIN_ENTRY, mainEntry(config)],
    [PRELOAD_ENTRY, `import { exposeMainBridge } from 'valence/runtime/preload';
exposeMainBridge({ development: ${config.development} });`],
    [REGISTRY, registry(config.mainFunctions)],
    [RUNTIME_CONFIG, `export default ${quote({ development: config.development, protocol: 1 })};`]
  ]);
  return {
    name: "valence:generated",
    enforce: "pre",
    async resolveId(source, importer) {
      if (entries.has(source)) return PREFIX + source;
      if (source.startsWith(FUNCTION_PREFIX)) {
        const fn = functions.get(source.slice(FUNCTION_PREFIX.length));
        if (!fn) this.error(`Unknown generated valence function: ${source}`);
        return sourceId(fn);
      }
      if (source.startsWith("valence/runtime/") || source === "valence/electron") {
        return fileURLToPath(import.meta.resolve(source));
      }
      const parentFunction = importer ? sourceModules.get(importer) : void 0;
      if (parentFunction) {
        const fn = parentFunction;
        const resolved = await this.resolve(source, fn.filename, { skipSelf: true });
        if (resolved) return resolved;
        if (source.startsWith(".")) return resolve(dirname(fn.filename), source);
      }
      return null;
    },
    async transform(code, id) {
      const fn = sourceModules.get(id);
      if (!fn) return null;
      return transformWithOxc(code, fn.filename + ".ts", {
        lang: "ts",
        sourcemap: config.options.build?.sourcemap ?? true
      }, fn.implementationMap);
    },
    load(id) {
      const fn = sourceModules.get(id);
      if (fn) return { code: fn.implementationCode, map: null };
      if (!id.startsWith(PREFIX)) return null;
      const publicId = id.slice(1);
      if (entries.has(publicId)) return entries.get(publicId);
      return null;
    }
  };
}
function registry(functions) {
  return [
    `import { registerMain } from 'valence/runtime/main';`,
    ...functions.map((fn, i) => `import fn${i} from ${quote(FUNCTION_PREFIX + fn.id)};`),
    ...functions.map((fn, i) => `registerMain(${quote(fn.id)}, fn${i}, ${quote({ source: fn.filename, name: fn.displayName })});`)
  ].join("\n");
}
function authorization(config) {
  const hook = config.options.security?.authorizeInvocation;
  if (!hook) return { imports: "", expression: "lifecycle.security?.authorizeInvocation" };
  if (typeof hook !== "function") {
    const path = isAbsolute(hook.module) ? hook.module : resolve(config.root, hook.module);
    return { imports: `import { ${hook.export ?? "default"} as authorizeInvocation } from ${quote(path)};`, expression: "authorizeInvocation" };
  }
  const source = callableSource(hook);
  assertSelfContained(source);
  const result = compileRenderer(`export async function authorizeInvocation(context) { ${quote(config.options.directive ?? "use main")}; return (${source})(context); }`, {
    filename: resolve(config.root, ".valence/authorization.ts"),
    root: config.root,
    directive: config.options.directive,
    sourceMap: false
  });
  if (result.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    throw new Error(`valence: Authorization callbacks must be self-contained. Use security.authorizeInvocation: { module: './src/policy.ts' } or a lifecycle module.
${result.diagnostics.map((d) => d.message).join("\n")}`);
  }
  return { imports: "", expression: `(${source})` };
}
function mainEntry(config) {
  const auth = authorization(config);
  const route = config.options.app?.entryRoute ?? "";
  const windowOptions = serializeWindowOptions(config.options.window);
  return `
import { app, BrowserWindow } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installMainRuntime, registerWindow } from 'valence/runtime/main';
import '${REGISTRY}';
${config.lifecycle ? `import lifecycle from ${quote(config.lifecycle)};` : "const lifecycle = {};"}
${auth.imports}
const configuredWindow = ${windowOptions};
const preload = fileURLToPath(new URL(${quote("./" + config.preloadFile)}, import.meta.url));
const renderer = fileURLToPath(new URL(${quote(config.rendererRelative)}, import.meta.url));
const development = ${config.development};
const url = ${quote(config.devUrl ?? "")};
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

// packages/vite-plugin/src/build-orchestrator.ts
var IsolatedBuildAdapter = class {
  constructor(config, options, lifecycle) {
    this.config = config;
    this.options = options;
    this.lifecycle = lifecycle;
  }
  config;
  options;
  lifecycle;
  async build(manifest, development, devUrl) {
    const root = this.config.root;
    const base = resolve2(root, this.options.build?.outDir ?? "dist");
    const outDir = resolve2(base, "electron");
    const mainFile = this.options.build?.mainFile ?? "main.js";
    const preloadFile = this.options.build?.preloadFile ?? "preload.cjs";
    const renderer = resolve2(root, this.config.build.outDir, "index.html");
    const functions = manifest.functions();
    const virtualOptions = {
      root,
      mainFunctions: functions,
      options: this.options,
      development,
      devUrl,
      preloadFile: relative(dirname2(resolve2(outDir, mainFile)), resolve2(outDir, preloadFile)).replaceAll("\\", "/"),
      rendererRelative: relative(dirname2(resolve2(outDir, mainFile)), renderer).replaceAll("\\", "/"),
      lifecycle: this.lifecycle
    };
    const externalDependencies = this.options.build?.external ?? [];
    const external = (id) => id === "electron" || id.startsWith("node:") || builtinModules.includes(id) || externalDependencies.some((dependency) => id === dependency || id.startsWith(dependency + "/"));
    const dependencies = /* @__PURE__ */ new Set();
    for (const [entry, file, format] of [[MAIN_ENTRY, mainFile, "es"], [PRELOAD_ENTRY, preloadFile, "cjs"]]) {
      const result = await build({
        configFile: false,
        root,
        logLevel: "warn",
        ssr: { noExternal: true },
        resolve: { alias: this.config.resolve.alias, conditions: ["node"], mainFields: ["module", "main"] },
        plugins: [virtualModules(virtualOptions)],
        build: {
          outDir,
          emptyOutDir: false,
          copyPublicDir: false,
          ssr: true,
          target: "node22",
          minify: false,
          sourcemap: this.options.build?.sourcemap ?? true,
          rolldownOptions: {
            input: entry,
            external,
            output: {
              format,
              entryFileNames: file,
              chunkFileNames: "chunks/[name]-[hash].js",
              codeSplitting: false,
              sourcemapPathTransform: (source) => source.replace(/\?valence-main=[^?]*$/, "")
            }
          }
        }
      });
      if ("on" in result) throw new Error("valence generated builds cannot use watch mode.");
      for (const output of Array.isArray(result) ? result : [result]) {
        for (const chunk of output.output) {
          if (chunk.type === "chunk") {
            for (const id of Object.keys(chunk.modules)) if (!id.startsWith("\0") && !id.includes("?valence-main=")) dependencies.add(id.split("?")[0]);
          }
        }
      }
    }
    await mkdir(outDir, { recursive: true });
    await writeFile(resolve2(outDir, "package.json"), JSON.stringify({ type: "module", main: mainFile }, null, 2) + "\n");
    const manifestDir = resolve2(base, "manifests");
    await mkdir(manifestDir, { recursive: true });
    await writeFile(resolve2(manifestDir, "valence.json"), JSON.stringify(manifest.audit(root), null, 2) + "\n");
    return { main: resolve2(outDir, mainFile), preload: resolve2(outDir, preloadFile), dependencies };
  }
};

// packages/vite-plugin/src/dev-orchestrator.ts
import { spawn } from "child_process";
import { createRequire } from "module";
var DevOrchestrator = class {
  constructor(server, adapter, manifest, options, url) {
    this.server = server;
    this.adapter = adapter;
    this.manifest = manifest;
    this.options = options;
    this.url = url;
  }
  server;
  adapter;
  manifest;
  options;
  url;
  child;
  timer;
  running;
  pending = false;
  disposed = false;
  dependencies = /* @__PURE__ */ new Set();
  async start() {
    this.pending = true;
    await this.drain();
  }
  invalidate() {
    if (this.disposed || this.options.dev?.restartMainOnChange === false) return;
    this.pending = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = void 0;
      void this.drain().catch((error) => this.report(error));
    }, 80);
  }
  async drain() {
    if (this.running) return;
    this.running = (async () => {
      while (this.pending && !this.disposed) {
        this.pending = false;
        await this.rebuild();
      }
    })();
    try {
      await this.running;
    } finally {
      this.running = void 0;
      if (this.pending && !this.disposed) this.invalidate();
    }
  }
  async rebuild() {
    const artifact = await this.adapter.build(this.manifest, true, this.url);
    if (this.disposed) return;
    this.dependencies = artifact.dependencies;
    this.server.watcher.add([...this.dependencies]);
    await this.stopChild();
    if (this.disposed || this.options.dev?.launch === false) return;
    const require2 = createRequire(this.server.config.configFile ?? this.server.config.root + "/package.json");
    const executable = this.options.dev?.electronPath ?? require2("electron");
    if (typeof executable !== "string") throw new Error("valence: Electron did not resolve to an executable. Install electron or set dev.electronPath.");
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(executable, [...this.options.dev?.args ?? [], artifact.main], {
      cwd: this.server.config.root,
      env,
      stdio: "inherit"
    });
    this.child = child;
    child.once("error", (error) => {
      if (this.child === child) this.child = void 0;
      this.report(error);
    });
    child.once("exit", (code) => {
      if (this.child === child) this.child = void 0;
      if (code && !this.disposed) this.server.config.logger.warn(`[valence] Electron exited with code ${code}.`);
    });
  }
  report(error) {
    const message = error instanceof Error ? error.message : String(error);
    this.server.config.logger.error(`[valence] ${message}`);
    this.server.ws.send({ type: "error", err: { message, stack: error instanceof Error ? error.stack ?? "" : "" } });
  }
  async stopChild() {
    const child = this.child;
    this.child = void 0;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    await new Promise((resolve4) => {
      const force = setTimeout(() => child.kill("SIGKILL"), 2500);
      child.once("close", () => {
        clearTimeout(force);
        resolve4();
      });
      child.kill("SIGTERM");
    });
  }
  async dispose() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    await this.running?.catch(() => {
    });
    await this.stopChild();
  }
};

// packages/vite-plugin/src/manifest.ts
import { createHash } from "crypto";
import { relative as relative2 } from "path";
var MainManifest = class {
  modules = /* @__PURE__ */ new Map();
  update(filename, functions) {
    const before = this.fingerprint();
    if (functions.length) this.modules.set(filename, functions);
    else this.modules.delete(filename);
    this.functions();
    return before !== this.fingerprint();
  }
  clear() {
    this.modules.clear();
  }
  remove(filename) {
    return this.modules.delete(filename);
  }
  functions() {
    const ids = /* @__PURE__ */ new Set();
    const functions = [...this.modules.values()].flat().sort((a, b) => a.id.localeCompare(b.id));
    for (const fn of functions) {
      if (ids.has(fn.id)) throw new Error(`UM005: Duplicate generated function ID ${fn.id} (${fn.filename}).`);
      ids.add(fn.id);
    }
    return functions;
  }
  fingerprint() {
    return createHash("sha256").update(JSON.stringify(this.functions().map((fn) => [fn.id, fn.implementationCode]))).digest("hex");
  }
  audit(root) {
    return {
      name: "valence",
      protocol: 1,
      functions: this.functions().map((fn) => ({
        id: fn.id,
        source: relative2(root, fn.filename).replaceAll("\\", "/"),
        name: fn.displayName,
        span: fn.sourceSpan,
        imports: [...new Set(fn.imports.map((item) => item.source))].sort()
      }))
    };
  }
};

// packages/vite-plugin/src/index.ts
var sourceExtension = /\.[cm]?[jt]sx?$/;
function valence(options = {}) {
  validateOptions(options);
  let config;
  let lifecycle;
  let orchestrator;
  let initialized = false;
  let disposed = false;
  let productionBuilt = false;
  const manifests = /* @__PURE__ */ new WeakMap();
  let clientManifest = new MainManifest();
  const manifestFor = (environment) => {
    let manifest = manifests.get(environment);
    if (!manifest) {
      manifest = environment.name === "client" ? clientManifest : new MainManifest();
      manifests.set(environment, manifest);
    }
    return manifest;
  };
  const eligible = (filename) => isAbsolute2(filename) && sourceExtension.test(filename) && !filename.includes("/node_modules/") && filename !== lifecycle && !filename.startsWith(resolve3(config.root, options.build?.outDir ?? "dist") + "/") && !filename.startsWith(resolve3(config.root, ".valence") + "/");
  const compile = (code, filename) => {
    const result = compileRenderer(code, { filename, root: config.root, directive: options.directive, sourceMap: options.build?.sourcemap ?? true });
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    if (errors.length) {
      throw new Error(errors.map((d) => `${d.filename}${d.span ? `:${d.span.start.line}:${d.span.start.column + 1}` : ""} ${d.code}: ${d.message}${d.suggestion ? `
${d.suggestion}` : ""}`).join("\n"));
    }
    return result;
  };
  const inspect = async (filename, result) => {
    if (!options.dev?.inspectGenerated || !result.mainFunctions.length) return;
    const safe = relative3(config.root, filename).replaceAll("..", "_").replaceAll("\\", "/");
    const directory = resolve3(config.root, ".valence", "inspect", safe);
    await mkdir2(directory, { recursive: true });
    await writeFile2(resolve3(directory, "renderer.ts"), result.code);
    for (const fn of result.mainFunctions) await writeFile2(resolve3(directory, `${fn.id}.ts`), fn.implementationCode);
    await writeFile2(resolve3(directory, "manifest.json"), JSON.stringify(result.mainFunctions, null, 2));
  };
  return {
    name: "valence",
    enforce: "pre",
    config(user) {
      const root = resolve3(user.root ?? process.cwd());
      const base = options.build?.outDir ?? "dist";
      return {
        base: user.base ?? "./",
        build: { outDir: user.build?.outDir ?? resolve3(root, base, "renderer") },
        // The dependency scanner has its own transform pipeline. Extract there
        // too, while preserving normal discovery and CommonJS optimization.
        optimizeDeps: {
          entries: user.optimizeDeps?.entries ?? (user.build?.rolldownOptions?.input ? void 0 : [
            "**/*.html",
            "!node_modules/**",
            "!.valence/**",
            `!${relative3(root, resolve3(root, base)).replaceAll("\\", "/")}/**`,
            `!${relative3(root, resolve3(root, user.build?.outDir ?? resolve3(root, base, "renderer"))).replaceAll("\\", "/")}/**`
          ]),
          rolldownOptions: {
            plugins: [{
              name: "valence:dependency-scan",
              transform: {
                order: "pre",
                filter: { id: /\.[cm]?[jt]sx?$/ },
                async handler(code, id) {
                  if (!eligible(id)) return null;
                  const result = compile(code, id);
                  return transformWithOxc2(result.code, id, {
                    lang: id.endsWith("tsx") ? "tsx" : id.endsWith("jsx") ? "jsx" : /\.[cm]?ts$/.test(id) ? "ts" : "js",
                    jsx: { runtime: "classic", pragma: "__valenceScanJSX", pragmaFrag: "__valenceScanFragment" },
                    sourcemap: false
                  });
                }
              }
            }]
          }
        }
      };
    },
    async configResolved(resolved) {
      config = resolved;
      if (options.app?.lifecycleModule) {
        lifecycle = resolve3(config.root, options.app.lifecycleModule);
        await stat(lifecycle);
      }
    },
    buildStart() {
      if (this.environment.name !== "client") return;
      if (config.command === "build") {
        clientManifest = new MainManifest();
        manifests.set(this.environment, clientManifest);
        productionBuilt = false;
      }
    },
    async transform(code, id) {
      if (this.environment.name !== "client") return null;
      const filename = id.split("?")[0];
      if (!eligible(filename) || /[?&](raw|url|worker)(?:&|$)/.test(id)) return null;
      const result = compile(code, filename);
      const changed = manifestFor(this.environment).update(filename, result.mainFunctions);
      await inspect(filename, result);
      if (changed && initialized) orchestrator?.invalidate();
      return { code: result.code, map: result.map };
    },
    configureServer(viteServer) {
      disposed = false;
      let retryStart;
      let startupDirty = false;
      const onChange = async (filename) => {
        if (disposed) return;
        if (!initialized) {
          startupDirty = true;
          retryStart?.();
          return;
        }
        try {
          let changed = false;
          if (eligible(filename)) {
            try {
              const result = compile(await readFile(filename, "utf8"), filename);
              changed = clientManifest.update(filename, result.mainFunctions);
              await inspect(filename, result);
            } catch (error) {
              if (error.code === "ENOENT") changed = clientManifest.remove(filename);
              else throw error;
            }
          }
          if (changed || filename === lifecycle || orchestrator?.dependencies.has(filename)) orchestrator?.invalidate();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          config.logger.error(`[valence] ${message}`);
          viteServer.ws.send({ type: "error", err: { message, stack: error instanceof Error ? error.stack ?? "" : "" } });
        }
      };
      viteServer.watcher.on("add", onChange).on("change", onChange).on("unlink", onChange);
      const start = async () => {
        if (initialized || disposed) return;
        clientManifest.clear();
        const sourceRoot = resolve3(config.root, "src");
        const hasSrc = await stat(sourceRoot).then((s) => s.isDirectory(), () => false);
        for (const filename of await sourceFiles(hasSrc ? sourceRoot : config.root, resolve3(config.root, options.build?.outDir ?? "dist"))) {
          if (!eligible(filename)) continue;
          const result = compile(await readFile(filename, "utf8"), filename);
          clientManifest.update(filename, result.mainFunctions);
          await inspect(filename, result);
        }
        const local = viteServer.resolvedUrls?.local[0];
        const address = viteServer.httpServer?.address();
        const fallback = typeof address === "object" && address ? `http://localhost:${address.port}/` : void 0;
        const url = local ?? fallback;
        if (!url) throw new Error("valence requires a listening Vite dev server (middleware mode must supply a server).");
        if (disposed) return;
        initialized = true;
        orchestrator = new DevOrchestrator(viteServer, new IsolatedBuildAdapter(config, options, lifecycle), clientManifest, options, url);
        await orchestrator.start();
      };
      let startup;
      const startWithErrors = () => {
        if (startup || disposed) return;
        startupDirty = false;
        startup = start().catch(async (error) => {
          initialized = false;
          await orchestrator?.dispose();
          orchestrator = void 0;
          config.logger.error(`[valence] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
        }).finally(() => {
          startup = void 0;
          if (startupDirty && !initialized && !disposed) startWithErrors();
        });
      };
      retryStart = startWithErrors;
      if (viteServer.httpServer?.listening) startWithErrors();
      else viteServer.httpServer?.once("listening", startWithErrors);
      return () => {
      };
    },
    async closeBundle() {
      if (config.command === "serve") {
        disposed = true;
        await orchestrator?.dispose();
        return;
      }
      if (this.environment.name !== "client" || productionBuilt) return;
      productionBuilt = true;
      await new IsolatedBuildAdapter(config, options, lifecycle).build(clientManifest, false);
    }
  };
}
function validateOptions(options) {
  serializeWindowOptions(options.window);
  const authorization2 = options.security?.authorizeInvocation;
  if (authorization2 && typeof authorization2 !== "function") {
    if (!authorization2.module || !/^[A-Za-z_$][\w$]*$/.test(authorization2.export ?? "default")) {
      throw new Error("valence: authorization module references need a module path and a valid export name.");
    }
  }
  if (options.directive !== void 0 && !options.directive.trim()) throw new Error("valence: directive cannot be empty.");
  const main = options.build?.mainFile ?? "main.js";
  const preload = options.build?.preloadFile ?? "preload.cjs";
  for (const file of [main, preload]) {
    if (isAbsolute2(file) || file.split(/[\\/]/).includes("..")) throw new Error("valence: generated filenames must stay inside the electron output directory.");
  }
  if (!main.endsWith(".js") && !main.endsWith(".mjs")) throw new Error("valence: mainFile must end in .js or .mjs (ES modules).");
  if (!preload.endsWith(".cjs")) throw new Error("valence: preloadFile must end in .cjs for Electron sandbox compatibility.");
  if (main === preload || main === "package.json") throw new Error("valence: generated output filenames must be distinct.");
}
async function sourceFiles(directory, outDir) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = resolve3(directory, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".git", ".valence", "dist"].includes(entry.name) || filename === outDir) continue;
      files.push(...await sourceFiles(filename, outDir));
    } else if (entry.isFile() && sourceExtension.test(entry.name) && !entry.name.endsWith(".d.ts")) files.push(filename);
  }
  return files.sort();
}
export {
  MainManifest,
  valence as default
};
//# sourceMappingURL=vite.js.map