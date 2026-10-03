# Public API

Valence's package entry points are declared in `package.json`. For application integration, use `valence/vite` and, when needed, `valence/electron` or `valence/runtime/context`.

## `valence init`

The `valence` executable can create a new application with `valence init [directory]`. It writes a Vite, Solid 2, Tailwind 4, TypeScript, and Electron scaffold, and installs dependencies by default. Use `--no-install` to skip installation. See [Initialization](initialization.md) for package manager selection, version overrides, and the local repository workflow.

## `valence/vite`

The default export is `valence(options?: ElectronPluginOptions)`, a Vite plugin. `ElectronPluginOptions` is also a named type export. Its full option list and defaults are in [Getting started](getting-started.md#vite-plugin-options). The plugin owns compilation, generated renderer calls, main/preload outputs, dev Electron launch, and the function audit manifest.

## `valence/electron`

`defineElectronApp(lifecycle)` returns the lifecycle object unchanged while preserving its type. Use it in the module configured by `app.lifecycleModule`. The lifecycle may define:

- `ready({ app, window, createWindow })`, called after Valence creates the initial window.
- `beforeQuit({ app })`, called before Electron exits.
- `security.authorizeInvocation(context)`, an optional authorization policy.

The module runs only in Electron main. See [Getting started](getting-started.md#main-context-and-app-lifecycle).

## `valence/runtime/context`

`getMainContext()` returns the active invocation context only while executing a marked main function. It throws if called outside an invocation. Context fields include the Electron IPC event, sender, sender frame, generated function ID, call ID, and optional metadata. Use it in main code only and never return Electron objects to the renderer.

## Other entry points

`valence/compiler` and `valence/runtime/*` entry points support Valence's own compiler and generated runtime. They are advanced implementation APIs, not ordinary application integration points. In particular, app code should not call runtime registration functions, IPC handlers, or bridge exposure functions. Mark source functions and let the plugin generate those connections.
