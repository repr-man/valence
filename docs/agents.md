# Guide for coding agents

Use the installed Valence package as the integration layer between ordinary Vite modules and Electron main. Start from the application's existing Vite config and add `valence()` alongside its current frontend plugins. Mark only privileged async functions with `'use main'`, then call them with normal `await`. Valence compiles their main implementations and generates the Electron main entry, preload, function registry, and invocation bridge.

For a new project, use the [initializer guide](initialization.md). The scaffold targets Solid 2; its JSX runtime is `@solidjs/web`, and its Vite plugin order is `valence()`, Solid, then Tailwind. Existing Solid 1 applications and examples should retain their current framework setup.

Do not manually write or wire `preload.ts`, `ipcMain.handle`, `ipcRenderer.invoke`, `contextBridge`, a registry, or a second bridge. Do not import generated virtual modules. Runtime helpers other than `getMainContext()` are implementation/advanced APIs and are not part of ordinary application setup. A type-only `AuthorizationContext` import from `valence/runtime/main` can type a policy module. Work with the app's existing framework through Vite.

## Recipes

**Add one privileged operation:** declare an async function with `'use main'` in its body, import Node/Electron APIs used by that operation, and call it from UI code with `await`. Use the function's arguments for renderer-provided data.

**Mark a dedicated module:** put a top-level `'use main'` in a module that exports only supported async functions. Keep the module declarative; put startup, mutable state, and executable setup in the lifecycle module.

**Share an invocation identity or sender details:** import `getMainContext` from `valence/runtime/context` and call it only inside the main function's invocation.

**Add startup, cleanup, or stateful authorization:** set `app.lifecycleModule` in `valence/vite` options. In that main-only module, export `defineElectronApp({...})` from `valence/electron`. Use its `ready`, `beforeQuit`, or `security.authorizeInvocation` hooks.

**Change window defaults:** use `window` plugin options for serializable `BrowserWindowConstructorOptions`. Valence forces context isolation and sandboxing on, Node integration off, and its own preload path. Use `ready` or `createWindow()` from the lifecycle context for app-owned window behavior.

**Change authorization:** use `security.authorizeInvocation` for a small self-contained hook, a `{ module, export? }` reference for policy with imports, or lifecycle `security.authorizeInvocation` for stateful policy. Return exactly `true` to allow a call. Policy gets `AuthorizationContext` (main context plus `args`). The default sender checks remain active in all cases.

**Find these docs in an installed app:** resolve `import.meta.resolve('valence/package.json')` and read `AGENTS.md`, `llms.txt`, or `docs/` relative to the package directory.

**Package an app:** run `vite build`, set the Electron package entry to `<build.outDir>/electron/<build.mainFile>`, and include the renderer, electron, and manifests output directories. Keep dependencies externalized by `build.external` available in the packaged application.

## Compiler constraints

- Marked functions must be async. Renderer calls return promises.
- Functions cannot close over UI state, component props, local variables, or surrounding application values. Pass values through function parameters.
- Arguments and results use Electron structured clone. Electron objects, functions, symbols, promises, and weak collections cannot cross the boundary.
- Imported helper modules in the main dependency graph are supported. Keep them free of renderer globals.
- Module-level main files may contain imports and supported async function exports. Side-effect imports, runtime re-exports, other runtime exports, and executable top-level statements are rejected.
- Directives must appear in a function body's directive prologue or at the module top level.
- Synchronous calls, closure capture, streams, event subscriptions, and server-side rendering are outside the current compiler scope.

See [Compiler model](compiler.md) for the fuller boundary and [Security](security.md) for sender trust and authorization.

## Output and configuration

The public plugin is imported from `valence/vite`. Every option is optional. Use the [complete option reference](getting-started.md#vite-plugin-options) for types, defaults, and configuration examples.

By default, production output is `dist/renderer`, `dist/electron/main.js`, `dist/electron/preload.cjs`, and `dist/manifests/valence.json`. Valence's `build.outDir` changes the output base; Vite's own explicit `build.outDir` overrides only the renderer directory. Match the packager to the actual paths. Generated files are build artifacts: change source directives, plugin options, or lifecycle hooks instead of editing generated output.

Node and Electron built-ins remain external regardless of `build.external`. Keep any package externalized from the main bundle available to the Electron application package. Main output is ESM; preload is one CommonJS-compatible file for Electron's sandboxed preload environment.

## Troubleshooting

- **A marked function has an unresolved name:** imported value helpers are allowed, but local lexical captures are not. Pass data as arguments or move shared main logic into an imported helper module.
- **Module-level directive produces a diagnostic:** remove executable top-level statements, side-effect imports, runtime re-exports, or unsupported runtime exports. Move initialization into `app.lifecycleModule`.
- **Browser-only calls fail:** expected when opening the Vite URL in an ordinary browser, including when `dev.launch` is false. The browser cannot emulate Electron's generated preload bridge; start the app through Valence's Electron dev launch to exercise main calls.
- **Authorization hook is rejected:** inline callbacks cannot reference names outside the function. Move policy to a module and pass `{ module, export }`, or use lifecycle `security`.
- **Electron executable is missing:** install the Electron binary for the app. If your package manager blocked Electron installation, enable/run the installer provided by your Electron release. Releases exposing the `install-electron` command support `pnpm exec install-electron`.
- **Packaged app cannot find its main file or renderer:** match the package entry to `<build.outDir>/electron/<build.mainFile>` and include the renderer output plus the complete Electron and manifests directories. For custom filenames, use the configured `build.mainFile` and `build.preloadFile`.
- **External dependency is missing in production:** include each `build.external` dependency and its runtime dependencies in the application package.
- **Linux Electron will not start:** check that the host/container has a working Chromium sandbox; Valence does not disable it.
