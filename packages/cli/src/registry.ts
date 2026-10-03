import semver from 'semver';

export interface ResolvedPackages {
  solid: string;
  solidWeb: string;
  solidPlugin: string;
  vite: string;
  electron: string;
  typescript: string;
  nodeTypes: string;
  tailwind: string;
  tailwindPlugin: string;
}

interface Packument {
  versions: Record<string, Record<string, unknown>>;
  distTags: Record<string, string>;
}

const registry = 'https://registry.npmjs.org/';

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

async function fetchPackument(name: string): Promise<Packument> {
  let response: Response;
  try {
    response = await fetch(`${registry}${encodeURIComponent(name)}`, {
      headers: { accept: 'application/vnd.npm.install-v1+json' },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new Error(`Could not fetch npm metadata for ${name}: ${errorMessage(error)}`);
  }
  if (!response.ok) {
    throw new Error(`Could not fetch npm metadata for ${name}: registry returned HTTP ${response.status}`);
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch (error) {
    throw new Error(`Could not parse npm metadata for ${name}: ${errorMessage(error)}`);
  }
  const data = object(raw);
  const rawVersions = object(data?.versions);
  const rawTags = object(data?.['dist-tags']);
  if (!rawVersions || !rawTags) {
    throw new Error(`npm metadata for ${name} is missing versions or dist-tags`);
  }

  const versions: Record<string, Record<string, unknown>> = {};
  for (const [version, metadata] of Object.entries(rawVersions)) {
    const parsed = object(metadata);
    if (parsed) versions[version] = parsed;
  }
  const distTags: Record<string, string> = {};
  for (const [tag, version] of Object.entries(rawTags)) {
    if (typeof version === 'string') distTags[tag] = version;
  }
  return { versions, distTags };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function validVersions(packument: Packument): string[] {
  return Object.keys(packument.versions).filter((version) => semver.valid(version) !== null);
}

function newest(packument: Packument, range: string, includePrerelease = false): string | undefined {
  return semver.maxSatisfying(validVersions(packument), range, { includePrerelease }) ?? undefined;
}

function newestStable(packument: Packument, range: string, packageName: string): string {
  const version = newest(packument, range);
  if (!version) throw new Error(`No stable ${packageName} release satisfies ${range}`);
  return version;
}

function latestStableTag(packument: Packument, packageName: string): string {
  const tagged = packument.distTags.latest;
  if (!tagged || !packument.versions[tagged] || !semver.valid(tagged) || semver.prerelease(tagged)) {
    throw new Error(`npm latest tag for ${packageName} does not point to a valid stable release`);
  }
  return tagged;
}

function peerRange(metadata: Record<string, unknown>, dependency: string): string | undefined {
  const peers = object(metadata.peerDependencies);
  const range = peers?.[dependency];
  return typeof range === 'string' ? range : undefined;
}

function pluginSupports(
  packument: Packument,
  solid: string,
  solidWeb: string,
  vite: string,
): string | undefined {
  const candidates = semver.rsort(validVersions(packument).filter((version) =>
    semver.satisfies(version, '>=3.0.0-0 <4.0.0-0', { includePrerelease: true }),
  ));
  return candidates.find((version) => {
    const metadata = packument.versions[version];
    if (!metadata) return false;
    const solidRange = peerRange(metadata, 'solid-js');
    const webRange = peerRange(metadata, '@solidjs/web');
    const viteRange = peerRange(metadata, 'vite');
    return !!solidRange && !!webRange && !!viteRange
      && semver.satisfies(solid, solidRange)
      && semver.satisfies(solidWeb, webRange)
      && semver.satisfies(vite, viteRange);
  });
}

function tailwindPluginSupports(packument: Packument, tailwind: string, vite: string): string {
  const candidates = semver.rsort(validVersions(packument).filter((version) =>
    semver.satisfies(version, '>=4.0.0 <5.0.0'),
  ));
  const compatible = candidates.find((version) => {
    const metadata = packument.versions[version];
    if (!metadata) return false;
    const peer = peerRange(metadata, 'tailwindcss');
    const vitePeer = peerRange(metadata, 'vite');
    const dependencies = object(metadata.dependencies);
    const dependency = dependencies?.tailwindcss;
    return (!peer || semver.satisfies(tailwind, peer))
      && (!vitePeer || semver.satisfies(vite, vitePeer))
      && (typeof dependency !== 'string' || semver.satisfies(tailwind, dependency));
  });
  if (!compatible) throw new Error(`No stable @tailwindcss/vite release is compatible with tailwindcss ${tailwind} and vite ${vite}`);
  return compatible;
}

export async function resolvePackages(viteRange: string, electronRange: string): Promise<ResolvedPackages> {
  const names = [
    'solid-js', '@solidjs/web', '@solidjs/vite-plugin', 'vite', 'electron',
    'typescript', '@types/node', 'tailwindcss', '@tailwindcss/vite',
  ] as const;
  const results = await Promise.all(names.map(async (name) => [name, await fetchPackument(name)] as const));
  const packuments = new Map<string, Packument>(results);
  const get = (name: typeof names[number]): Packument => {
    const packument = packuments.get(name);
    if (!packument) throw new Error(`Missing npm metadata for ${name}`);
    return packument;
  };

  const solidPackument = get('solid-js');
  const solid = newest(solidPackument, '>=2.0.0-0 <3.0.0-0', true);
  if (!solid) throw new Error('No solid-js 2.x release is available from npm');

  const webPackument = get('@solidjs/web');
  if (!webPackument.versions[solid]) {
    throw new Error(`@solidjs/web ${solid} is required to match solid-js ${solid}, but that release is missing from npm`);
  }
  const vite = newestStable(get('vite'), viteRange, 'vite');
  const solidPlugin = pluginSupports(get('@solidjs/vite-plugin'), solid, solid, vite);
  if (!solidPlugin) {
    throw new Error(`No @solidjs/vite-plugin 3.x release supports solid-js ${solid}, @solidjs/web ${solid}, and the selected Vite version`);
  }

  const electron = newestStable(get('electron'), electronRange, 'electron');
  const typescript = latestStableTag(get('typescript'), 'typescript');
  const nodeTypes = latestStableTag(get('@types/node'), '@types/node');
  const tailwind = newestStable(get('tailwindcss'), '>=4.0.0 <5.0.0', 'tailwindcss');
  const tailwindPlugin = tailwindPluginSupports(get('@tailwindcss/vite'), tailwind, vite);

  for (const [name, version] of [
    ['solid-js', solid], ['@solidjs/web', solid], ['@solidjs/vite-plugin', solidPlugin],
    ['vite', vite], ['electron', electron], ['typescript', typescript], ['@types/node', nodeTypes],
    ['tailwindcss', tailwind], ['@tailwindcss/vite', tailwindPlugin],
  ] as const) {
    const engines = object(get(name).versions[version]?.engines);
    const node = engines?.node;
    if (typeof node === 'string' && !semver.satisfies(process.versions.node, node)) {
      throw new Error(`${name} ${version} requires Node ${node}; upgrade from Node ${process.versions.node} before initializing this app`);
    }
  }

  return { solid, solidWeb: solid, solidPlugin, vite, electron, typescript, nodeTypes, tailwind, tailwindPlugin };
}
