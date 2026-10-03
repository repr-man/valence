# Getting started

This guide adds Valence to an existing Vite app. To create a new app, see [Initialization](initialization.md). This guide targets Vite 8, Node.js 22.12+, and Electron 35+.

## Install in your app

Install the build integration and Electron in your application:

```sh
pnpm add -D valence vite@^8 electron @types/node
```

Keep the Vite plugin for the framework already used by the app. For a Solid 2 app using Tailwind 4, configure Valence before the framework plugin:

```ts
import { defineConfig } from 'vite';
import solid from '@solidjs/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import valence from 'valence/vite';

export default defineConfig({
  plugins: [valence(), solid(), tailwindcss()],
});
```

Valence must precede the Solid plugin in the plugin array. For other frameworks, keep their existing plugin and place Valence before framework plugins where they transform the same modules. Valence supplies the Electron main and preload entries; no separate Electron entry, preload, IPC handler, bridge, or registration code is needed. The default dev behavior launches Electron when the Vite server is ready. Production uses the same Vite configuration with `vite build`.

Use application scripts like these, merging them into your existing `package.json`:

```json
{
  "main": "dist/electron/main.js",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "start": "electron ."
  }
}
```

Run `pnpm dev` for development, or `pnpm build` followed by `pnpm start` to launch production output. The installed Valence package is already built; you do not build its source first. If another Electron integration already owns your entry, preload, or development launch, migrate its custom startup into Valence's lifecycle module and remove the overlapping integration.

## Mark privileged functions

Mark an async function with `'use main'`. Invoke it from normal UI code using `await`:

```ts
// src/files.ts
import { dialog } from 'electron';
import { readFile } from 'node:fs/promises';

export async function chooseAndReadTextFile() {
  'use main';
  const result = await dialog.showOpenDialog({ properties: ['openFile'] });
  if (result.canceled || !result.filePaths[0]) return null;
  return readFile(result.filePaths[0], 'utf8');
}
```

```ts
import { chooseAndReadTextFile } from './files';

const text = await chooseAndReadTextFile();
```

The marked implementation and its main-only imports are bundled for Electron main. Renderer state and local variables are not captured: pass required values as parameters. Arguments and return values must be supported by Electron's structured clone algorithm. UI rendering and state remain ordinary client code.

A source module containing only supported async function exports can instead put `'use main'` at its top level:

```ts
'use main';

import { hostname, platform } from 'node:os';

export async function getMachineInfo() {
  return { hostname: hostname(), platform: platform() };
}
```

Module-level main files are declarative. They reject executable top-level statements, side-effect imports, runtime re-exports, and runtime exports that are not supported async functions. Put startup work and mutable state in the lifecycle module described below. See [Compiler model](compiler.md) for details.

## Main context and app lifecycle

Inside an active main function, `getMainContext()` from `valence/runtime/context` returns the invocation's Electron event, sender, sender frame, function ID, call ID, and optional function metadata. Use it only in main-process code, and never return it to the renderer.

```ts
import { getMainContext } from 'valence/runtime/context';

export async function reportInvocation() {
  'use main';
  const { functionId, senderFrame } = getMainContext();
  console.info('Invoked function:', functionId, 'from', senderFrame.url);
}
```

For app startup, cleanup, or authorization that needs imports/state, set `app.lifecycleModule` in the Vite options. Export a lifecycle object created with `defineElectronApp` from `valence/electron`:

```ts
// src/electron-lifecycle.ts
import { defineElectronApp } from 'valence/electron';

export default defineElectronApp({
  async ready({ app, window }) {
    console.info('Ready:', app.getName(), window.id);
  },
  async beforeQuit() {
    // Close application-owned resources here.
  },
});
```

Configure that module as shown in the option reference. The `ready` hook runs after Valence creates the initial window; `createWindow` can create another Valence-managed window. The optional `beforeQuit` hook runs before the app quits.

## Vite plugin options

The complete public option type is `ElectronPluginOptions`, exported from `valence/vite`. All fields are optional. Defaults below reflect the plugin implementation.

| Option | Default | Purpose |
| --- | --- | --- |
| `directive` | `'use main'` | Directive text recognized by the compiler. |
| `window` | `{}` (generated window starts at 1000×760) | Serializable Electron `BrowserWindowConstructorOptions`; Valence enforces `contextIsolation: true`, `nodeIntegration: false`, `nodeIntegrationInSubFrames: false`, `sandbox: true`, and its generated preload. |
| `app.entryRoute` | `''` | Client route loaded in development and applied as the production file URL hash. |
| `app.lifecycleModule` | unset | Module path, relative to Vite root, whose default export is the lifecycle object. |
| `build.outDir` | `'dist'` | Valence output base. Renderer defaults to `<outDir>/renderer`; Electron files go to `<outDir>/electron`; audit manifest to `<outDir>/manifests/valence.json`. Vite's own explicit `build.outDir` overrides only the renderer location. |
| `build.mainFile` | `'main.js'` | Main entry name inside the Electron output directory; must end in `.js` or `.mjs`. |
| `build.preloadFile` | `'preload.cjs'` | Preload name inside the Electron output directory; must end in `.cjs`. |
| `build.sourcemap` | `true` | Maps for extracted functions and Electron output. Vite's own `build.sourcemap` controls the renderer bundle's maps. |
| `build.external` | `[]` | Package names (including subpaths) left external from the main build for the application packager to include. Node and Electron built-ins are always external. |
| `security.authorizeInvocation` | lifecycle module's `security.authorizeInvocation`, if supplied | Additional per-call authorization hook or `{ module, export? }` reference. Hook must return `true`. |
| `dev.inspectGenerated` | `false` | Write generated renderer/main function/manifest inspection files under `.valence/inspect`. |
| `dev.restartMainOnChange` | `true` | Rebuild and restart Electron when main functions, lifecycle, or main dependencies change. |
| `dev.launch` | `true` | Launch Electron after each successful dev build. |
| `dev.electronPath` | Electron executable resolved from the app | Explicit Electron executable path. |
| `dev.args` | `[]` | Arguments passed to Electron before the generated main file. |

Example with lifecycle and a custom output location:

```ts
import { defineConfig } from 'vite';
import solid from '@solidjs/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import valence from 'valence/vite';

export default defineConfig({
  plugins: [valence({
    app: { lifecycleModule: './src/electron-lifecycle.ts' },
    build: { outDir: 'build', external: ['better-sqlite3'] },
    dev: { args: ['--trace-warnings'] },
  }), solid(), tailwindcss()],
});
```

`window` must be JSON-serializable: no functions, native objects, or cycles. Use a lifecycle hook for runtime customization. Authorization callbacks written inline must be self-contained; they cannot capture Vite config variables. Use a module reference or lifecycle module when the policy needs imports or state.

For authorization, the module-reference form is `{ module: './src/security/policy.ts', export: 'authorizeInvocation' }` (the default export is used when `export` is omitted). The policy receives `AuthorizationContext`, including the main context plus cloned `args`; it must return `true` to authorize. See the [Security guide](security.md).

## Output and development behavior

The dev server transforms the ordinary client module graph. Valence separately builds the generated main and preload artifacts without applying the renderer framework plugins. By default it starts Electron and restarts it after relevant main code changes. Set `dev.launch: false` for browser-only UI work; calls to main functions then reject with `MainProcessUnavailableError` because the browser has no Electron preload bridge.

A production `vite build` creates:

| Artifact | Default path |
| --- | --- |
| Renderer | `dist/renderer` |
| Electron main entry | `dist/electron/main.js` |
| Preload | `dist/electron/preload.cjs` |
| Function audit manifest | `dist/manifests/valence.json` |

Use these files in the app package and configure the Electron builder to start at the generated main entry. See [Packaging](packaging.md). If Electron has no executable installed, install Electron's binary using your package manager's Electron installer. On Linux, the host needs a working Chromium sandbox.
