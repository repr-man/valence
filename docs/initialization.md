# Create a new app

The `valence init` command creates a new Valence application in a new or empty directory. It does not overwrite files in a non-empty directory. The default directory is `valence-app`.

## Use the published package

After this Valence release is published, run the initializer without installing it first:

```sh
pnpm dlx valence init my-app
```

If this package is already installed in your current project, use its binary:

```sh
pnpm exec valence init my-app
```

or:

```sh
npx valence init my-app
```

The CLI uses the package manager associated with the invocation when it can detect one, and otherwise uses npm. Select one explicitly with `--package-manager`:

```sh
valence init my-app --package-manager pnpm
```

The CLI installs dependencies by default. To create the project files without installing packages, use `--no-install`:

```sh
valence init my-app --no-install
```

Even with `--no-install`, the CLI contacts the package registry to resolve current versions. Use `--valence <version-or-spec>` to pin the generated app to a particular Valence version, tag, or package file spec:

```sh
valence init my-app --valence 1.2.3
```

## Run from this repository before publication

The package name may already refer to an unrelated registry package before Valence is published. Do not use `pnpm dlx valence` or `npx valence` for this repository version. Build the repository and invoke its CLI directly instead:

```sh
pnpm build
node dist/cli.js init ../my-app --package-manager pnpm --valence file:.
```

The `file:.` spec is resolved from the directory where the command is run and points the generated app at this local package. The generated app can then install the local Valence build as part of its dependency installation.

## Generated project

The scaffold uses Solid 2 with `@solidjs/web`, TypeScript, Tailwind 4, Vite 8, and Electron. Versions are resolved online and written as exact pins. Solid uses the latest 2.x release, including a prerelease when that is the newest 2.x version; `@solidjs/web` is pinned to the same version. The Solid Vite plugin uses the newest compatible 3.x release, also allowing prereleases. Vite and Electron use the newest stable versions supported by the selected Solid plugin and scaffold.

The Solid 2 package imports and JSX settings matter: use `@solidjs/web` (not `solid-js/web`) and set `jsxImportSource` to `@solidjs/web`. The Vite config orders plugins as `valence()`, Solid, then Tailwind. Solid's plugin runs before other transform plugins internally, so Valence must appear before it in the config. The Solid plugin enables renderer HMR; Valence rebuilds and restarts Electron when main-process code changes.

The generated package includes these scripts:

| Script | Action |
| --- | --- |
| `dev` | Run Vite with Valence's Electron development launch. |
| `dev:web` | Run Vite in web mode without launching Electron. |
| `build` | Build the renderer and generated Electron files with Vite. |
| `start` | Launch the built app with `electron .`. |
| `typecheck` | Run `tsc --noEmit`. |
| `setup:electron` | Run Electron's binary installer with `node node_modules/electron/install.js`. |

Installation runs by default, then the CLI explicitly runs `setup:electron` to install the Electron binary. If installation is skipped, run the setup script after installing dependencies yourself.

For existing applications, follow [Getting started](getting-started.md) to add Valence to the app's current Vite configuration.
