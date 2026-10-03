import {
  cloneValue
} from "../chunk-6R3S4TEQ.js";
import {
  BRIDGE_NAME,
  PROTOCOL_VERSION,
  isIdentifier,
  isInvokeResponse
} from "../chunk-WLD7LUEZ.js";
import {
  MainProcessUnavailableError,
  ValenceError,
  restoreError
} from "../chunk-BJL53WIL.js";

// packages/runtime/src/renderer.ts
var callSequence = 0;
function nextCallId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  callSequence = (callSequence + 1) % Number.MAX_SAFE_INTEGER;
  return `call_${Date.now().toString(36)}_${callSequence.toString(36)}`;
}
async function __callMain(id, args) {
  if (!isIdentifier(id) || !Array.isArray(args)) {
    throw new ValenceError("Invalid main function invocation.", "VALENCE_INVALID_REQUEST");
  }
  const bridge = typeof window === "undefined" ? void 0 : window[BRIDGE_NAME];
  if (!bridge || typeof bridge.invoke !== "function") {
    throw new MainProcessUnavailableError("The Valence preload bridge is missing. Run this application in Electron.");
  }
  const callId = nextCallId();
  const request = {
    protocol: PROTOCOL_VERSION,
    id,
    callId,
    args: cloneValue(args, `Arguments for main function ${id}`, "args", bridge.development)
  };
  let response;
  try {
    response = await bridge.invoke(request);
  } catch (cause) {
    throw new MainProcessUnavailableError("The main process could not complete the invocation.", { cause });
  }
  if (!isInvokeResponse(response) || response.callId !== callId) {
    throw new ValenceError("Invalid response from the Valence main process.", "VALENCE_INVALID_RESPONSE");
  }
  if (!response.ok) throw restoreError(response.error, bridge.development);
  return response.value;
}
export {
  MainProcessUnavailableError,
  ValenceError,
  __callMain
};
//# sourceMappingURL=renderer.js.map