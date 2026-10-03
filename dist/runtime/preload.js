import {
  cloneValue
} from "../chunk-6R3S4TEQ.js";
import {
  BRIDGE_NAME,
  INVOKE_CHANNEL,
  isInvokeRequest,
  isInvokeResponse
} from "../chunk-WLD7LUEZ.js";
import {
  MainProcessUnavailableError,
  ValenceError,
  serializeError
} from "../chunk-BJL53WIL.js";

// packages/runtime/src/preload.ts
import { contextBridge, ipcRenderer } from "electron";
function exposeMainBridge(options = {}) {
  const development = options.development === true;
  const bridge = {
    development,
    async invoke(request) {
      if (!isInvokeRequest(request)) throw new ValenceError("Invalid main invocation request.", "VALENCE_INVALID_REQUEST");
      try {
        const args = cloneValue(request.args, `Arguments for main function ${request.id}`, "args", development);
        let response;
        try {
          response = await ipcRenderer.invoke(INVOKE_CHANNEL, { ...request, args });
        } catch (cause) {
          throw new MainProcessUnavailableError("The main process could not complete the invocation.", { cause });
        }
        if (!isInvokeResponse(response) || response.callId !== request.callId) {
          throw new ValenceError("Invalid response from the main process.", "VALENCE_INVALID_RESPONSE");
        }
        return response;
      } catch (error) {
        return {
          protocol: request.protocol,
          callId: request.callId,
          ok: false,
          error: serializeError(error, development)
        };
      }
    }
  };
  contextBridge.exposeInMainWorld(BRIDGE_NAME, Object.freeze(bridge));
}
export {
  exposeMainBridge
};
//# sourceMappingURL=preload.js.map