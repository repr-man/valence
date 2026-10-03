import { contextBridge, ipcRenderer } from 'electron';
import { BRIDGE_NAME, INVOKE_CHANNEL, isInvokeRequest, isInvokeResponse } from './protocol.js';
import type { MainBridge, InvokeRequest } from './protocol.js';
import { MainProcessUnavailableError, ValenceError, serializeError } from './errors.js';
import { cloneValue } from './serialization.js';

export interface PreloadRuntimeOptions { development?: boolean }

/**
 * Generated-preload helper used automatically by `valence/vite`.
 * Applications should declare `"use main"` functions instead of writing a preload.
 * Exposes one fixed-channel invocation method, never the Electron IPC object.
 */
export function exposeMainBridge(options: PreloadRuntimeOptions = {}): void {
  const development = options.development === true;
  const bridge: MainBridge = {
    development,
    async invoke(request: InvokeRequest) {
      if (!isInvokeRequest(request)) throw new ValenceError('Invalid main invocation request.', 'VALENCE_INVALID_REQUEST');
      try {
        const args = cloneValue(request.args, `Arguments for main function ${request.id}`, 'args', development);
        let response: unknown;
        try { response = await ipcRenderer.invoke(INVOKE_CHANNEL, { ...request, args }); }
        catch (cause) {
          throw new MainProcessUnavailableError('The main process could not complete the invocation.', { cause });
        }
        if (!isInvokeResponse(response) || response.callId !== request.callId) {
          throw new ValenceError('Invalid response from the main process.', 'VALENCE_INVALID_RESPONSE');
        }
        return response;
      } catch (error) {
        // Returning an envelope avoids Electron stripping custom Error properties in contextBridge.
        return { protocol: request.protocol, callId: request.callId, ok: false as const,
          error: serializeError(error, development) };
      }
    },
  };
  contextBridge.exposeInMainWorld(BRIDGE_NAME, Object.freeze(bridge));
}
