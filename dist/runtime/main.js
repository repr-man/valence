import {
  cloneValue
} from "../chunk-6R3S4TEQ.js";
import {
  INVOKE_CHANNEL,
  PROTOCOL_VERSION,
  isIdentifier,
  isInvokeRequest,
  isRecord
} from "../chunk-WLD7LUEZ.js";
import {
  getMainContext,
  invocationStorage
} from "../chunk-LKPOUUD5.js";
import {
  ValenceError,
  serializeError
} from "../chunk-BJL53WIL.js";

// packages/runtime/src/main.ts
import { BrowserWindow, ipcMain } from "electron";
var registry = /* @__PURE__ */ new Map();
var registeredWindows = /* @__PURE__ */ new Map();
var installed = false;
function registerMain(id, fn, meta) {
  if (!isIdentifier(id) || typeof fn !== "function") {
    throw new ValenceError("A main registration requires a valid ID and function.", "VALENCE_INVALID_REGISTRATION");
  }
  if (registry.has(id)) throw new ValenceError(`Duplicate main function ID: ${id}`, "VALENCE_DUPLICATE_ID");
  registry.set(id, { fn, ...meta === void 0 ? {} : { meta: Object.freeze({ ...meta }) } });
}
function localUrl(value) {
  const url = new URL(value);
  const file = url.protocol === "file:" && (url.hostname === "" || url.hostname === "localhost");
  const loopback = (url.protocol === "http:" || url.protocol === "https:") && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!file && !loopback || url.username || url.password) {
    throw new ValenceError("Registered content must use a local file or a loopback HTTP(S) URL.", "VALENCE_INVALID_WINDOW_POLICY");
  }
  url.search = "";
  url.hash = "";
  return url;
}
function registerWindow(window, policy) {
  if (window.isDestroyed() || window.webContents.isDestroyed()) {
    throw new ValenceError("Cannot register a destroyed BrowserWindow.", "VALENCE_INVALID_WINDOW");
  }
  if (!Array.isArray(policy.allowedUrls) || policy.allowedUrls.length === 0) {
    throw new ValenceError("registerWindow() requires at least one allowed content URL.", "VALENCE_INVALID_WINDOW_POLICY");
  }
  const sender = window.webContents;
  if (registeredWindows.has(sender)) throw new ValenceError("BrowserWindow is already registered.", "VALENCE_DUPLICATE_WINDOW");
  const urls = policy.allowedUrls.map(localUrl);
  let active = true;
  const registration = {
    window,
    sender,
    urls,
    allowSameOrigin: policy.allowSameOrigin === true,
    unregister() {
      if (!active) return;
      active = false;
      if (registeredWindows.get(sender) === registration) registeredWindows.delete(sender);
      window.removeListener("closed", registration.unregister);
    }
  };
  registeredWindows.set(sender, registration);
  window.once("closed", registration.unregister);
  return registration.unregister;
}
function trustedFrame(event) {
  const sender = event.sender;
  const registration = registeredWindows.get(sender);
  const frame = event.senderFrame;
  if (!registration || sender.isDestroyed() || registration.window.isDestroyed() || BrowserWindow.fromWebContents(sender) !== registration.window || !frame || frame !== sender.mainFrame || frame.parent !== null) {
    throw new ValenceError("This sender is not authorized to invoke main functions.", "VALENCE_UNAUTHORIZED");
  }
  let url;
  try {
    url = localUrl(frame.url);
  } catch {
    throw new ValenceError("The sender is not displaying authorized content.", "VALENCE_UNAUTHORIZED");
  }
  const allowed = registration.urls.some((configured) => configured.href === url.href || registration.allowSameOrigin && configured.protocol !== "file:" && configured.origin === url.origin);
  if (!allowed) throw new ValenceError("The sender is not displaying authorized content.", "VALENCE_UNAUTHORIZED");
  return frame;
}
function installMainRuntime(options = {}) {
  if (installed) throw new ValenceError("The Valence main runtime is already installed.", "VALENCE_RUNTIME_INSTALLED");
  const development = options.development === true;
  const authorizeInvocation = options.authorizeInvocation;
  if (authorizeInvocation !== void 0 && typeof authorizeInvocation !== "function") {
    throw new ValenceError("authorizeInvocation must be a function.", "VALENCE_INVALID_AUTHORIZATION");
  }
  ipcMain.handle(INVOKE_CHANNEL, async (event, payload, ...extra) => {
    let callId = "invalid";
    try {
      const senderFrame = trustedFrame(event);
      if (extra.length !== 0 || !isInvokeRequest(payload)) {
        throw new ValenceError("Invalid Valence invocation request.", "VALENCE_INVALID_REQUEST");
      }
      callId = payload.callId;
      const registered = registry.get(payload.id);
      if (!registered) throw new ValenceError(`Unknown main function ID: ${payload.id}`, "VALENCE_UNKNOWN_FUNCTION");
      const args = cloneValue(payload.args, `Arguments for ${registered.meta?.name ?? payload.id}`, "args", development);
      const context = Object.freeze({
        event,
        sender: event.sender,
        senderFrame,
        functionId: payload.id,
        callId,
        ...registered.meta === void 0 ? {} : { meta: registered.meta }
      });
      if (authorizeInvocation && await authorizeInvocation(Object.freeze({ ...context, args })) !== true) {
        throw new ValenceError("The application rejected this main invocation.", "VALENCE_UNAUTHORIZED");
      }
      if (trustedFrame(event) !== senderFrame) {
        throw new ValenceError("The invocation document changed during authorization.", "VALENCE_UNAUTHORIZED");
      }
      return await invocationStorage.run(context, async () => {
        const value = await registered.fn(...args);
        return {
          protocol: PROTOCOL_VERSION,
          callId,
          ok: true,
          value: cloneValue(value, `Return value of ${registered.meta?.name ?? payload.id}`, "return", development)
        };
      });
    } catch (error) {
      if (callId === "invalid" && isRecord(payload) && isIdentifier(payload.callId)) callId = payload.callId;
      return { protocol: PROTOCOL_VERSION, callId, ok: false, error: serializeError(error, development) };
    }
  });
  installed = true;
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    ipcMain.removeHandler(INVOKE_CHANNEL);
    installed = false;
    for (const registration of registeredWindows.values()) registration.unregister();
  };
}
export {
  getMainContext,
  installMainRuntime,
  registerMain,
  registerWindow
};
//# sourceMappingURL=main.js.map