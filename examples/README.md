# Solid example application

This repository example is a complete Solid 2 Vite app that demonstrates Valence from a frontend source tree. It discovers route components from `src/routes` and mounts them with Solid Router 2's `createRouter` and `hashHistory`, using plain anchors for navigation. It shows function-level and module-level `'use main'` declarations, and handles browser-only mode with a message explaining that Electron is needed for main-process calls.

From the repository root, build Valence and start the app:

```sh
pnpm install
pnpm setup:electron
pnpm build
pnpm dev
```

The dev command starts the Solid app and launches Electron. Set `VALENCE_NO_LAUNCH=1` to work on the renderer in a browser. Build production artifacts with `pnpm example:build`.

This is a repository development example, not a prerequisite for using the installed package. For consumer setup, see [Getting started](../docs/getting-started.md) and [Agent guide](../docs/agents.md).
