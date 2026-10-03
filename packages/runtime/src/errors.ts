import type { SerializedError } from './protocol.js';

export class ValenceError extends Error {
  readonly code: string;

  constructor(message: string, code: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ValenceError';
    this.code = code;
  }
}

export class MainProcessUnavailableError extends ValenceError {
  constructor(message = 'The Valence main process is unavailable.', options?: ErrorOptions) {
    super(message, 'VALENCE_MAIN_UNAVAILABLE', options);
    this.name = 'MainProcessUnavailableError';
  }
}

function property(value: unknown, key: string): unknown {
  try {
    if ((typeof value === 'object' && value !== null) || typeof value === 'function') {
      return Reflect.get(value, key);
    }
  } catch { /* A thrown object may have an accessor that itself throws. */ }
  return undefined;
}

function describe(value: unknown): string {
  try { return String(value); } catch { return 'An unknown error was thrown.'; }
}

/** Error envelopes contain only cloneable primitives, even for arbitrary thrown values. */
export function serializeError(value: unknown, development: boolean, seen = new Set<unknown>()): SerializedError {
  if (seen.has(value) || seen.size >= 8) return { name: 'Error', message: 'Circular or deeply nested error cause.' };
  seen.add(value);
  const name = property(value, 'name');
  const message = property(value, 'message');
  const stack = property(value, 'stack');
  const code = property(value, 'code');
  const cause = property(value, 'cause');
  const result: SerializedError = {
    name: typeof name === 'string' ? name : 'Error',
    message: typeof message === 'string' ? message : describe(value),
  };
  if (development && typeof stack === 'string') result.stack = stack;
  if (typeof code === 'string' || (typeof code === 'number' && Number.isFinite(code))) result.code = code;
  if (cause !== undefined) result.cause = serializeError(cause, development, seen);
  return result;
}

export function restoreError(value: SerializedError, development: boolean): Error {
  const options = value.cause === undefined ? undefined : { cause: restoreError(value.cause, development) };
  const error = value.code === 'VALENCE_MAIN_UNAVAILABLE'
    ? new MainProcessUnavailableError(value.message, options)
    : new Error(value.message, options);
  error.name = value.name;
  if (value.code !== undefined && !Object.prototype.hasOwnProperty.call(error, 'code')) {
    Object.defineProperty(error, 'code', { value: value.code, enumerable: true });
  }
  if (development && value.stack) error.stack = `${error.stack ?? `${value.name}: ${value.message}`}\n\nMain process:\n${value.stack}`;
  return error;
}
