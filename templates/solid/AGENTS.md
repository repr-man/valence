# Building this Valence app

Read `node_modules/valence/AGENTS.md` and `node_modules/valence/docs/agents.md` before adding desktop features. If the package is linked elsewhere, locate its directory with `import.meta.resolve('valence/package.json')`.

Keep Valence before the Solid plugin in `vite.config.ts`. Declare privileged async functions with `'use main'` and call them with normal `await`, as shown in `src/lib/desktop.ts`. Valence generates main, preload, registry, and IPC; do not wire those manually or edit generated `dist/` files. Use Valence lifecycle hooks for custom startup.

This project uses SolidJS 2. Import rendering from `@solidjs/web`, use that package as the JSX type source, and use `@solidjs/vite-plugin` for Vite. Keep `solid-js` and `@solidjs/web` versions aligned. Read signals in JSX or other tracked computations, rather than caching their values in the component body.

The `dev` script runs Vite and Electron with renderer HMR and Electron restarts for main changes. `dev:web` renders in an ordinary browser; main calls require Electron. The `build` script generates production artifacts and `start` launches them. `setup:electron` installs the Electron binary.
