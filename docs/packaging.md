# Packaging

Run `vite build` with the Vite config that includes `valence/vite`. Valence emits the renderer and Electron artifacts as part of that build:

```text
dist/
  renderer/                 # BrowserWindow content
  electron/
    main.js                 # generated Electron main entry
    preload.cjs             # generated sandbox-compatible preload
    package.json            # marks the generated main directory as ESM
  manifests/
    valence.json            # function audit manifest
```

The default Electron package entry is `dist/electron/main.js`. Point Electron Forge or electron-builder at that path and include the renderer, electron, and manifests directories. Include runtime dependencies used by extracted main functions; keep Electron itself provided by the packaged Electron runtime.

An electron-builder project can map the generated output like this:

```json
{
  "main": "dist/electron/main.js",
  "build": {
    "files": [
      "dist/renderer/**/*",
      "dist/electron/**/*",
      "dist/manifests/**/*"
    ]
  }
}
```

Electron Forge's packager should likewise include those generated files and use `dist/electron/main.js` as its package `main`. These snippets describe Valence output mapping; platform signing, native dependencies, and installer configuration remain app-specific.

Set Valence's `build.outDir` to change the output base. If the Vite config explicitly sets its own `build.outDir`, that remains the renderer location; include that directory instead of assuming `dist/renderer`. Set `build.mainFile` and `build.preloadFile` to change names within the `electron` directory; main names must end in `.js` or `.mjs`, and the preload must end in `.cjs`. Valence's `build.sourcemap` controls extraction/Electron maps; Vite's own setting controls renderer bundle maps. `build.external` adds package names and subpaths to the main bundle's external dependencies; make those packages available beside the application. Node and Electron built-ins are always external.

The generated preload is a single CommonJS-compatible file for Electron's sandboxed preload environment. Do not replace it with a handwritten bridge. For application startup, cleanup, and authorization that needs imports or state, configure `app.lifecycleModule` and export a lifecycle object created with `defineElectronApp` from `valence/electron`. See [Getting started](getting-started.md) for plugin options and [Security](security.md) before allowing additional windows or remote content.
