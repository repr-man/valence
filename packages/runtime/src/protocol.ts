/** The protocol is shared by all three processes and contains no Electron imports. */
export const PROTOCOL_VERSION = 1 as const;
export const INVOKE_CHANNEL = '__valence_invoke__';
export const BRIDGE_NAME = '__valence';

export interface InvokeRequest {
  protocol: typeof PROTOCOL_VERSION;
  id: string;
  callId: string;
  args: unknown[];
}

export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
  code?: string | number;
  cause?: SerializedError;
}

export type InvokeResponse =
  | { protocol: typeof PROTOCOL_VERSION; callId: string; ok: true; value: unknown }
  | { protocol: typeof PROTOCOL_VERSION; callId: string; ok: false; error: SerializedError };

export interface MainBridge {
  readonly development: boolean;
  invoke(request: InvokeRequest): Promise<InvokeResponse>;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
}

export function isInvokeRequest(value: unknown): value is InvokeRequest {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 4 && ['protocol', 'id', 'callId', 'args'].every((key) =>
    Object.prototype.hasOwnProperty.call(value, key)) &&
    value.protocol === PROTOCOL_VERSION && isIdentifier(value.id) &&
    isIdentifier(value.callId) && Array.isArray(value.args);
}

function isSerializedError(value: unknown, depth = 0): value is SerializedError {
  if (!isRecord(value) || depth > 8) return false;
  return typeof value.name === 'string' && typeof value.message === 'string' &&
    (value.stack === undefined || typeof value.stack === 'string') &&
    (value.code === undefined || typeof value.code === 'string' ||
      (typeof value.code === 'number' && Number.isFinite(value.code))) &&
    (value.cause === undefined || isSerializedError(value.cause, depth + 1));
}

export function isInvokeResponse(value: unknown): value is InvokeResponse {
  if (!isRecord(value) || value.protocol !== PROTOCOL_VERSION || !isIdentifier(value.callId)) return false;
  const keys = Object.keys(value);
  if (keys.length !== 4 || !['protocol', 'callId', 'ok'].every((key) =>
    Object.prototype.hasOwnProperty.call(value, key))) return false;
  return value.ok === true
    ? Object.prototype.hasOwnProperty.call(value, 'value')
    : value.ok === false && Object.prototype.hasOwnProperty.call(value, 'error') && isSerializedError(value.error);
}
