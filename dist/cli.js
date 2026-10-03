#!/usr/bin/env node

// packages/cli/src/index.ts
import { spawn } from "child_process";
import { lstat, mkdir, readFile, readdir, writeFile } from "fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "path";
import { fileURLToPath } from "url";
import semver2 from "semver";

// packages/cli/src/registry.ts
import semver from "semver";
var registry = "https://registry.npmjs.org/";
function object(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
async function fetchPackument(name) {
  let response;
  try {
    response = await fetch(`${registry}${encodeURIComponent(name)}`, {
      headers: { accept: "application/vnd.npm.install-v1+json" },
      signal: AbortSignal.timeout(2e4)
    });
  } catch (error) {
    throw new Error(`Could not fetch npm metadata for ${name}: ${errorMessage(error)}`);
  }
  if (!response.ok) {
    throw new Error(`Could not fetch npm metadata for ${name}: registry returned HTTP ${response.status}`);
  }
  let raw;
  try {
    raw = await response.json();
  } catch (error) {
    throw new Error(`Could not parse npm metadata for ${name}: ${errorMessage(error)}`);
  }
  const data = object(raw);
  const rawVersions = object(data?.versions);
  const rawTags = object(data?.["dist-tags"]);
  if (!rawVersions || !rawTags) {
    throw new Error(`npm metadata for ${name} is missing versions or dist-tags`);
  }
  const versions = {};
  for (const [version, metadata2] of Object.entries(rawVersions)) {
    const parsed = object(metadata2);
    if (parsed) versions[version] = parsed;
  }
  const distTags = {};
  for (const [tag, version] of Object.entries(rawTags)) {
    if (typeof version === "string") distTags[tag] = version;
  }
  return { versions, distTags };
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function validVersions(packument) {
  return Object.keys(packument.versions).filter((version) => semver.valid(version) !== null);
}
function newest(packument, range, includePrerelease = false) {
  return semver.maxSatisfying(validVersions(packument), range, { includePrerelease }) ?? void 0;
}
function newestStable(packument, range, packageName) {
  const version = newest(packument, range);
  if (!version) throw new Error(`No stable ${packageName} release satisfies ${range}`);
  return version;
}
function latestStableTag(packument, packageName) {
  const tagged = packument.distTags.latest;
  if (!tagged || !packument.versions[tagged] || !semver.valid(tagged) || semver.prerelease(tagged)) {
    throw new Error(`npm latest tag for ${packageName} does not point to a valid stable release`);
  }
  return tagged;
}
function peerRange(metadata2, dependency) {
  const peers = object(metadata2.peerDependencies);
  const range = peers?.[dependency];
  return typeof range === "string" ? range : void 0;
}
function pluginSupports(packument, solid, solidWeb, vite) {
  const candidates = semver.rsort(validVersions(packument).filter(
    (version) => semver.satisfies(version, ">=3.0.0-0 <4.0.0-0", { includePrerelease: true })
  ));
  return candidates.find((version) => {
    const metadata2 = packument.versions[version];
    if (!metadata2) return false;
    const solidRange = peerRange(metadata2, "solid-js");
    const webRange = peerRange(metadata2, "@solidjs/web");
    const viteRange = peerRange(metadata2, "vite");
    return !!solidRange && !!webRange && !!viteRange && semver.satisfies(solid, solidRange) && semver.satisfies(solidWeb, webRange) && semver.satisfies(vite, viteRange);
  });
}
function tailwindPluginSupports(packument, tailwind, vite) {
  const candidates = semver.rsort(validVersions(packument).filter(
    (version) => semver.satisfies(version, ">=4.0.0 <5.0.0")
  ));
  const compatible = candidates.find((version) => {
    const metadata2 = packument.versions[version];
    if (!metadata2) return false;
    const peer = peerRange(metadata2, "tailwindcss");
    const vitePeer = peerRange(metadata2, "vite");
    const dependencies = object(metadata2.dependencies);
    const dependency = dependencies?.tailwindcss;
    return (!peer || semver.satisfies(tailwind, peer)) && (!vitePeer || semver.satisfies(vite, vitePeer)) && (typeof dependency !== "string" || semver.satisfies(tailwind, dependency));
  });
  if (!compatible) throw new Error(`No stable @tailwindcss/vite release is compatible with tailwindcss ${tailwind} and vite ${vite}`);
  return compatible;
}
async function resolvePackages(viteRange, electronRange) {
  const names = [
    "solid-js",
    "@solidjs/web",
    "@solidjs/vite-plugin",
    "vite",
    "electron",
    "typescript",
    "@types/node",
    "tailwindcss",
    "@tailwindcss/vite"
  ];
  const results = await Promise.all(names.map(async (name) => [name, await fetchPackument(name)]));
  const packuments = new Map(results);
  const get = (name) => {
    const packument = packuments.get(name);
    if (!packument) throw new Error(`Missing npm metadata for ${name}`);
    return packument;
  };
  const solidPackument = get("solid-js");
  const solid = newest(solidPackument, ">=2.0.0-0 <3.0.0-0", true);
  if (!solid) throw new Error("No solid-js 2.x release is available from npm");
  const webPackument = get("@solidjs/web");
  if (!webPackument.versions[solid]) {
    throw new Error(`@solidjs/web ${solid} is required to match solid-js ${solid}, but that release is missing from npm`);
  }
  const vite = newestStable(get("vite"), viteRange, "vite");
  const solidPlugin = pluginSupports(get("@solidjs/vite-plugin"), solid, solid, vite);
  if (!solidPlugin) {
    throw new Error(`No @solidjs/vite-plugin 3.x release supports solid-js ${solid}, @solidjs/web ${solid}, and the selected Vite version`);
  }
  const electron = newestStable(get("electron"), electronRange, "electron");
  const typescript = latestStableTag(get("typescript"), "typescript");
  const nodeTypes = latestStableTag(get("@types/node"), "@types/node");
  const tailwind = newestStable(get("tailwindcss"), ">=4.0.0 <5.0.0", "tailwindcss");
  const tailwindPlugin = tailwindPluginSupports(get("@tailwindcss/vite"), tailwind, vite);
  for (const [name, version] of [
    ["solid-js", solid],
    ["@solidjs/web", solid],
    ["@solidjs/vite-plugin", solidPlugin],
    ["vite", vite],
    ["electron", electron],
    ["typescript", typescript],
    ["@types/node", nodeTypes],
    ["tailwindcss", tailwind],
    ["@tailwindcss/vite", tailwindPlugin]
  ]) {
    const engines = object(get(name).versions[version]?.engines);
    const node = engines?.node;
    if (typeof node === "string" && !semver.satisfies(process.versions.node, node)) {
      throw new Error(`${name} ${version} requires Node ${node}; upgrade from Node ${process.versions.node} before initializing this app`);
    }
  }
  return { solid, solidWeb: solid, solidPlugin, vite, electron, typescript, nodeTypes, tailwind, tailwindPlugin };
}

// packages/cli/src/index.ts
var help = `Usage: valence init [directory] [options]

Create a SolidJS 2 + Vite + Electron application using Valence.
The default directory is valence-app. Existing directories must be empty.

Options:
  --package-manager <npm|pnpm>  Installer (detected from invocation; otherwise npm)
  --no-install                  Generate files without installing dependencies
  --valence <spec>               Valence version or local file: path to install
  -h, --help                     Show this help

Renderer edits use Solid HMR; main edits rebuild and restart Electron.
Versions are resolved online, including Solid 2 prereleases.`;
function parseArguments(args) {
  if (!args.length || args.includes("--help") || args.includes("-h")) {
    console.log(help);
    return;
  }
  if (args[0] !== "init") throw new Error(`Unknown command: ${args[0]}. Use valence init [directory].`);
  const options = {
    directory: "valence-app",
    manager: process.env.npm_config_user_agent?.startsWith("pnpm/") ? "pnpm" : "npm",
    install: true
  };
  let hasDirectory = false;
  for (let index = 1; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--no-install") options.install = false;
    else if (argument === "--package-manager" || argument === "--valence") {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
      if (argument === "--package-manager") {
        if (value !== "npm" && value !== "pnpm") throw new Error("Package manager must be npm or pnpm.");
        options.manager = value;
      } else options.valence = value;
    } else if (argument.startsWith("-")) throw new Error(`Unknown option: ${argument}. Use --help for options.`);
    else if (hasDirectory) throw new Error("Pass only one project directory.");
    else {
      options.directory = argument;
      hasDirectory = true;
    }
  }
  return options;
}
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
async function metadata(packageUrl) {
  const value = record(JSON.parse(await readFile(fileURLToPath(packageUrl), "utf8")));
  const peers = record(value?.peerDependencies);
  const engines = record(value?.engines);
  if (value?.name !== "valence" || typeof value.version !== "string" || !semver2.valid(value.version) || typeof peers?.vite !== "string" || typeof peers.electron !== "string" || typeof engines?.node !== "string") {
    throw new Error("This Valence installation has invalid package metadata. Reinstall the package.");
  }
  return { version: value.version, nodeRange: engines.node, viteRange: peers.vite, electronRange: peers.electron };
}
async function requireEmptyDirectory(directory) {
  let entry;
  try {
    entry = await lstat(directory);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  if (!entry.isDirectory()) throw new Error(`Project destination is not a directory: ${directory}`);
  if ((await readdir(directory)).length) throw new Error(`Project destination is not empty: ${directory}. Choose a new directory.`);
}
function valenceSpec(spec, version) {
  if (!spec) return version;
  if (spec.startsWith("file:")) return `file:${resolve(spec.slice(5))}`;
  if (isAbsolute(spec) || spec.startsWith(".") || spec.endsWith(".tgz")) return `file:${resolve(spec)}`;
  return spec;
}
async function templateFiles(directory, prefix = "") {
  const files = /* @__PURE__ */ new Map();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const source = join(directory, entry.name);
    const target = join(prefix, entry.name === "gitignore" ? ".gitignore" : entry.name);
    if (entry.isDirectory()) {
      for (const [path, content] of await templateFiles(source, target)) files.set(path, content);
    } else if (entry.isFile()) files.set(target, await readFile(source));
    else throw new Error(`Unsupported starter template entry: ${source}`);
  }
  return files;
}
function projectPackage(directory, versions, spec) {
  const name = basename(directory).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[._-]+/, "").slice(0, 214) || "valence-app";
  return JSON.stringify({
    name,
    version: "0.0.0",
    private: true,
    type: "module",
    main: "dist/electron/main.js",
    engines: { node: ">=22.12" },
    scripts: {
      dev: "vite",
      "dev:web": "vite --mode web",
      build: "vite build",
      start: "electron .",
      typecheck: "tsc --noEmit",
      "setup:electron": "node node_modules/electron/install.js"
    },
    dependencies: { "solid-js": versions.solid, "@solidjs/web": versions.solidWeb },
    devDependencies: {
      valence: spec,
      vite: versions.vite,
      electron: versions.electron,
      "@solidjs/vite-plugin": versions.solidPlugin,
      typescript: versions.typescript,
      "@types/node": versions.nodeTypes,
      tailwindcss: versions.tailwind,
      "@tailwindcss/vite": versions.tailwindPlugin
    }
  }, null, 2) + "\n";
}
function projectReadme(manager, solid) {
  return [
    "# Valence desktop app",
    "",
    `This app uses SolidJS ${solid}, Vite, Electron, and Valence.`,
    "",
    "## Run",
    "",
    "```sh",
    `${manager} install`,
    `${manager} run setup:electron`,
    `${manager} run dev`,
    "```",
    "",
    "The initializer already installs dependencies and the Electron binary unless you used `--no-install`.",
    "Renderer edits use Solid hot module replacement; edits to main functions restart Electron.",
    "",
    `Run \`${manager} run dev:web\` for browser-only UI work. Desktop calls require Electron.`,
    "",
    `For production, run \`${manager} run build\` then \`${manager} run start\`.`,
    "",
    "## Add desktop features",
    "",
    "Add `'use main'` to async functions, as in `src/lib/desktop.ts`, then call them with normal `await`.",
    "Valence generates the main entry, preload, and IPC transport. Keep those generated files out of source.",
    "Read `AGENTS.md` and the installed `node_modules/valence/docs/` guides before adding privileged code.",
    "",
    "Solid 2 uses `@solidjs/web` for rendering and JSX types, and `@solidjs/vite-plugin` for Vite.",
    "The initializer pins the newest compatible releases at creation time, including Solid 2 prereleases.",
    ""
  ].join("\n");
}
async function run(manager, args, directory) {
  await new Promise((resolveRun, reject) => {
    const child = spawn(manager, args, { cwd: directory, stdio: "inherit", shell: process.platform === "win32" });
    child.once("error", (error) => reject(new Error(`Could not run ${manager}: ${error.message}`)));
    child.once("close", (code, signal) => code === 0 ? resolveRun() : reject(new Error(`${manager} ${args.join(" ")} failed (${signal ?? `exit ${code}`}).`)));
  });
}
async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!options) return;
  const packageUrl = import.meta.resolve("valence/package.json");
  const ownPackage = await metadata(packageUrl);
  if (!semver2.satisfies(process.versions.node, ownPackage.nodeRange)) throw new Error(`Valence requires Node ${ownPackage.nodeRange}; you are using ${process.versions.node}.`);
  const directory = resolve(options.directory);
  await requireEmptyDirectory(directory);
  console.log("Resolving the latest SolidJS 2 and compatible development tools...");
  const versions = await resolvePackages(ownPackage.viteRange, ownPackage.electronRange);
  const files = await templateFiles(fileURLToPath(new URL("./templates/solid/", packageUrl)));
  files.set("package.json", Buffer.from(projectPackage(directory, versions, valenceSpec(options.valence, ownPackage.version))));
  files.set("README.md", Buffer.from(projectReadme(options.manager, versions.solid)));
  await requireEmptyDirectory(directory);
  await mkdir(directory, { recursive: true });
  for (const [path, content] of files) {
    const destination = join(directory, path);
    await mkdir(resolve(destination, ".."), { recursive: true });
    await writeFile(destination, content, { flag: "wx" });
  }
  console.log(`Created ${directory} with SolidJS ${versions.solid}.`);
  if (options.install) {
    try {
      await run(options.manager, ["install"], directory);
      await run(options.manager, ["run", "setup:electron"], directory);
    } catch (error) {
      throw new Error(`${error instanceof Error ? error.message : String(error)}
Your project files are preserved in ${directory}. Run ${options.manager} install, then ${options.manager} run setup:electron there to finish setup.`);
    }
  }
  console.log(`
Open ${relative(process.cwd(), directory) || "."} and run:`);
  if (!options.install) console.log(`  ${options.manager} install
  ${options.manager} run setup:electron`);
  console.log(`  ${options.manager} run dev`);
}
void main().catch((error) => {
  console.error(`[valence] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
//# sourceMappingURL=cli.js.map