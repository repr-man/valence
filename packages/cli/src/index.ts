#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';
import { resolvePackages, type ResolvedPackages } from './registry.js';

type PackageManager = 'npm' | 'pnpm';
interface InitOptions {
  directory: string;
  manager: PackageManager;
  install: boolean;
  valence?: string;
}
interface PackageMetadata {
  version: string;
  nodeRange: string;
  viteRange: string;
  electronRange: string;
}

const help = `Usage: valence init [directory] [options]

Create a SolidJS 2 + Vite + Electron application using Valence.
The default directory is valence-app. Existing directories must be empty.

Options:
  --package-manager <npm|pnpm>  Installer (detected from invocation; otherwise npm)
  --no-install                  Generate files without installing dependencies
  --valence <spec>               Valence version or local file: path to install
  -h, --help                     Show this help

Renderer edits use Solid HMR; main edits rebuild and restart Electron.
Versions are resolved online, including Solid 2 prereleases.`;

function parseArguments(args: string[]): InitOptions | undefined {
  if (!args.length || args.includes('--help') || args.includes('-h')) {
    console.log(help);
    return;
  }
  if (args[0] !== 'init') throw new Error(`Unknown command: ${args[0]}. Use valence init [directory].`);
  const options: InitOptions = {
    directory: 'valence-app',
    manager: process.env.npm_config_user_agent?.startsWith('pnpm/') ? 'pnpm' : 'npm',
    install: true,
  };
  let hasDirectory = false;
  for (let index = 1; index < args.length; index++) {
    const argument = args[index]!;
    if (argument === '--no-install') options.install = false;
    else if (argument === '--package-manager' || argument === '--valence') {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`);
      if (argument === '--package-manager') {
        if (value !== 'npm' && value !== 'pnpm') throw new Error('Package manager must be npm or pnpm.');
        options.manager = value;
      } else options.valence = value;
    } else if (argument.startsWith('-')) throw new Error(`Unknown option: ${argument}. Use --help for options.`);
    else if (hasDirectory) throw new Error('Pass only one project directory.');
    else { options.directory = argument; hasDirectory = true; }
  }
  return options;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

async function metadata(packageUrl: string): Promise<PackageMetadata> {
  const value = record(JSON.parse(await readFile(fileURLToPath(packageUrl), 'utf8')) as unknown);
  const peers = record(value?.peerDependencies);
  const engines = record(value?.engines);
  if (value?.name !== 'valence' || typeof value.version !== 'string' || !semver.valid(value.version) ||
      typeof peers?.vite !== 'string' || typeof peers.electron !== 'string' || typeof engines?.node !== 'string') {
    throw new Error('This Valence installation has invalid package metadata. Reinstall the package.');
  }
  return { version: value.version, nodeRange: engines.node, viteRange: peers.vite, electronRange: peers.electron };
}

async function requireEmptyDirectory(directory: string): Promise<void> {
  let entry;
  try { entry = await lstat(directory); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  if (!entry.isDirectory()) throw new Error(`Project destination is not a directory: ${directory}`);
  if ((await readdir(directory)).length) throw new Error(`Project destination is not empty: ${directory}. Choose a new directory.`);
}

/** Resolve local package specs before changing to the generated application's directory. */
function valenceSpec(spec: string | undefined, version: string): string {
  if (!spec) return version;
  if (spec.startsWith('file:')) return `file:${resolve(spec.slice(5))}`;
  if (isAbsolute(spec) || spec.startsWith('.') || spec.endsWith('.tgz')) return `file:${resolve(spec)}`;
  return spec;
}

async function templateFiles(directory: string, prefix = ''): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const source = join(directory, entry.name);
    const target = join(prefix, entry.name === 'gitignore' ? '.gitignore' : entry.name);
    if (entry.isDirectory()) {
      for (const [path, content] of await templateFiles(source, target)) files.set(path, content);
    } else if (entry.isFile()) files.set(target, await readFile(source));
    else throw new Error(`Unsupported starter template entry: ${source}`);
  }
  return files;
}

function projectPackage(directory: string, versions: ResolvedPackages, spec: string): string {
  const name = basename(directory).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[._-]+/, '').slice(0, 214) || 'valence-app';
  return JSON.stringify({
    name, version: '0.0.0', private: true, type: 'module', main: 'dist/electron/main.js',
    engines: { node: '>=22.12' },
    scripts: {
      dev: 'vite', 'dev:web': 'vite --mode web', build: 'vite build', start: 'electron .',
      typecheck: 'tsc --noEmit', 'setup:electron': 'node node_modules/electron/install.js',
    },
    dependencies: { 'solid-js': versions.solid, '@solidjs/web': versions.solidWeb },
    devDependencies: {
      valence: spec, vite: versions.vite, electron: versions.electron,
      '@solidjs/vite-plugin': versions.solidPlugin, typescript: versions.typescript,
      '@types/node': versions.nodeTypes, tailwindcss: versions.tailwind, '@tailwindcss/vite': versions.tailwindPlugin,
    },
  }, null, 2) + '\n';
}

function projectReadme(manager: PackageManager, solid: string): string {
  return [
    '# Valence desktop app', '',
    `This app uses SolidJS ${solid}, Vite, Electron, and Valence.`, '',
    '## Run', '', '```sh', `${manager} install`, `${manager} run setup:electron`, `${manager} run dev`, '```', '',
    'The initializer already installs dependencies and the Electron binary unless you used `--no-install`.',
    'Renderer edits use Solid hot module replacement; edits to main functions restart Electron.', '',
    `Run \`${manager} run dev:web\` for browser-only UI work. Desktop calls require Electron.`, '',
    `For production, run \`${manager} run build\` then \`${manager} run start\`.`, '',
    '## Add desktop features', '',
    "Add `'use main'` to async functions, as in `src/lib/desktop.ts`, then call them with normal `await`.",
    'Valence generates the main entry, preload, and IPC transport. Keep those generated files out of source.',
    'Read `AGENTS.md` and the installed `node_modules/valence/docs/` guides before adding privileged code.', '',
    'Solid 2 uses `@solidjs/web` for rendering and JSX types, and `@solidjs/vite-plugin` for Vite.',
    'The initializer pins the newest compatible releases at creation time, including Solid 2 prereleases.', '',
  ].join('\n');
}

async function run(manager: PackageManager, args: string[], directory: string): Promise<void> {
  await new Promise<void>((resolveRun, reject) => {
    // On Windows the package-manager launchers are .cmd files. The command and
    // arguments are fixed values, never project names or user-supplied specs.
    const child = spawn(manager, args, { cwd: directory, stdio: 'inherit', shell: process.platform === 'win32' });
    child.once('error', error => reject(new Error(`Could not run ${manager}: ${error.message}`)));
    child.once('close', (code, signal) => code === 0 ? resolveRun() : reject(new Error(`${manager} ${args.join(' ')} failed (${signal ?? `exit ${code}`}).`)));
  });
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  if (!options) return;
  const packageUrl = import.meta.resolve('valence/package.json');
  const ownPackage = await metadata(packageUrl);
  if (!semver.satisfies(process.versions.node, ownPackage.nodeRange)) throw new Error(`Valence requires Node ${ownPackage.nodeRange}; you are using ${process.versions.node}.`);
  const directory = resolve(options.directory);
  await requireEmptyDirectory(directory);
  console.log('Resolving the latest SolidJS 2 and compatible development tools...');
  const versions = await resolvePackages(ownPackage.viteRange, ownPackage.electronRange);
  const files = await templateFiles(fileURLToPath(new URL('./templates/solid/', packageUrl)));
  files.set('package.json', Buffer.from(projectPackage(directory, versions, valenceSpec(options.valence, ownPackage.version))));
  files.set('README.md', Buffer.from(projectReadme(options.manager, versions.solid)));
  // Recheck after network resolution; exclusive writes never overwrite files
  // another process might have created in the meantime.
  await requireEmptyDirectory(directory);
  await mkdir(directory, { recursive: true });
  for (const [path, content] of files) {
    const destination = join(directory, path);
    await mkdir(resolve(destination, '..'), { recursive: true });
    await writeFile(destination, content, { flag: 'wx' });
  }
  console.log(`Created ${directory} with SolidJS ${versions.solid}.`);
  if (options.install) {
    try {
      await run(options.manager, ['install'], directory);
      await run(options.manager, ['run', 'setup:electron'], directory);
    } catch (error) {
      throw new Error(`${error instanceof Error ? error.message : String(error)}\nYour project files are preserved in ${directory}. Run ${options.manager} install, then ${options.manager} run setup:electron there to finish setup.`);
    }
  }
  console.log(`\nOpen ${relative(process.cwd(), directory) || '.'} and run:`);
  if (!options.install) console.log(`  ${options.manager} install\n  ${options.manager} run setup:electron`);
  console.log(`  ${options.manager} run dev`);
}

void main().catch((error: unknown) => {
  console.error(`[valence] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
