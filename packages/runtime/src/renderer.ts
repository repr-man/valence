import { BRIDGE_NAME, PROTOCOL_VERSION, isIdentifier, isInvokeResponse } from './protocol.js';
import type { MainBridge } from './protocol.js';
import { MainProcessUnavailableError, ValenceError, restoreError } from './errors.js';
import { cloneValue } from './serialization.js';

export { MainProcessUnavailableError, ValenceError } from './errors.js';
export type { MainBridge } from './protocol.js';

declare global {
  interface Window { readonly __valence?: MainBridge }
}

let callSequence = 0;

function nextCallId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  callSequence = (callSequence + 1) % Number.MAX_SAFE_INTEGER;
  return `call_${Date.now().toString(36)}_${callSequence.toString(36)}`;
}

/**
 * Browser-only helper called by generated proxies; imports no Electron or Node APIs.
 * Application code should await its original `"use main"` function, not call this helper.
 */
export async function __callMain<T>(id: string, args: unknown[]): Promise<T> {
  if (!isIdentifier(id) || !Array.isArray(args)) {
    throw new ValenceError('Invalid main function invocation.', 'VALENCE_INVALID_REQUEST');
  }
  const bridge = typeof window === 'undefined' ? undefined : window[BRIDGE_NAME];
  if (!bridge || typeof bridge.invoke !== 'function') {
    throw new MainProcessUnavailableError('The Valence preload bridge is missing. Run this application in Electron.');
  }
  const callId = nextCallId();
  const request = { protocol: PROTOCOL_VERSION, id, callId,
    args: cloneValue(args, `Arguments for main function ${id}`, 'args', bridge.development) };
  let response: unknown;
  try { response = await bridge.invoke(request); }
  catch (cause) { throw new MainProcessUnavailableError('The main process could not complete the invocation.', { cause }); }
  if (!isInvokeResponse(response) || response.callId !== callId) {
    throw new ValenceError('Invalid response from the Valence main process.', 'VALENCE_INVALID_RESPONSE');
  }
  if (!response.ok) throw restoreError(response.error, bridge.development);
  return response.value as T;
}
