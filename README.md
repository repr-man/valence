# Valence

Valence lets a Vite application call Electron main-process functions from the source files where they belong. Add a `'use main'` directive to an async function. Valence compiles its implementation for Electron main and turns the renderer call into a typed asynchronous proxy.

```ts
import { readFile } from 'node:fs/promises';
import { createMemo } from 'solid-js';

// Runs in the `main` process.
export async function readTextFile(path: string) {
  'use main';
  return readFile(path, 'utf8');
}

// Runs in the `renderer` process
export function MyComponent() {
  const text = createMemo(() => readTextFile("~/.bashrc"));
  //                            ^~~~~~~~~~~~~~~~~~~~~~~~~
  // Calls the function in the `main` process. No manual IPC wiring!

  return <Loading fallback={<LoadingSkeleton />}>
    <code>{text()}</code>
  </Loading>
}
```

Start a new app with [`valence init`](docs/initialization.md), or install Valence into an existing Vite and Electron app and add `valence()` to its Vite plugins. You do not write a preload, IPC handler, bridge, or function registry. Start development with your usual Vite command; Valence builds and launches Electron. Run your usual `vite build` for production artifacts.

**Coding agents:** start with [AGENTS.md](AGENTS.md), then follow the task-specific recipes in [docs/agents.md](docs/agents.md). New-app setup is in [Initialization](docs/initialization.md); the installed-package workflow and full Vite plugin options are in [Getting started](docs/getting-started.md).

Main functions cannot capture renderer-local values; pass data as arguments. Arguments and results must support Electron structured cloning. Main-only imports stay out of the browser bundle. See the [compiler model](docs/compiler.md), [public API](docs/api.md), and [security guide](docs/security.md) for boundaries and safe authorization.

Valence targets Vite 8, Node.js 22.12+, and Electron 35+. See [Packaging](docs/packaging.md) for generated outputs and packaging configuration.
