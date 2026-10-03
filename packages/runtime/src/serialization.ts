import { ValenceError } from './errors.js';

function childPath(path: string, key: string): string {
  return /^[a-zA-Z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}

function unsupportedPath(value: unknown, path: string, seen: WeakSet<object>): string | undefined {
  if (typeof value === 'function' || typeof value === 'symbol') return path;
  if (typeof value !== 'object' || value === null || seen.has(value)) return undefined;
  seen.add(value);
  if (value instanceof Promise || value instanceof WeakMap || value instanceof WeakSet) return path;
  if (value instanceof Map) {
    let index = 0;
    for (const [key, item] of value) {
      const failure = unsupportedPath(key, `${path}.mapKey[${index}]`, seen) ??
        unsupportedPath(item, `${path}.mapValue[${index}]`, seen);
      if (failure) return failure;
      index++;
    }
  } else if (value instanceof Set) {
    let index = 0;
    for (const item of value) {
      const failure = unsupportedPath(item, `${path}.setValue[${index++}]`, seen);
      if (failure) return failure;
    }
  } else {
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      // Do not execute user accessors again while diagnosing a serialization failure.
      if (!descriptor || !('value' in descriptor)) continue;
      const failure = unsupportedPath(descriptor.value, Array.isArray(value)
        ? `${path}[${key}]` : childPath(path, key), seen);
      if (failure) return failure;
    }
  }
  try { structuredClone(value); } catch { return path; }
  return undefined;
}

/** Clone before dispatch/reply so transport failures become ordinary error envelopes. */
export function cloneValue<T>(value: T, label: string, path: string, development: boolean): T {
  try { return structuredClone(value); }
  catch (cause) {
    let failurePath = path;
    if (development) {
      try { failurePath = unsupportedPath(value, path, new WeakSet()) ?? path; }
      catch { /* Proxies or unusually deep values still get a useful root path. */ }
    }
    throw new ValenceError(`${label} contains a value that cannot cross Electron IPC at ${failurePath}.`,
      'VALENCE_SERIALIZATION', { cause });
  }
}
