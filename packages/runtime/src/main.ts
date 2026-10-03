import { BrowserWindow, ipcMain } from 'electron';
import type { IpcMainInvokeEvent, WebContents, WebFrameMain } from 'electron';
import { INVOKE_CHANNEL, PROTOCOL_VERSION, isIdentifier, isInvokeRequest, isRecord } from './protocol.js';
import type { InvokeResponse } from './protocol.js';
import { ValenceError, serializeError } from './errors.js';
import { cloneValue } from './serialization.js';
import { invocationStorage } from './context.js';
import type { FunctionMeta, MainContext } from './context.js';

export { getMainContext } from './context.js';
export type { MainContext, FunctionMeta } from './context.js';

// Callable parameter types vary with each extracted function; the boundary validates
// the transported array, while the source function remains the type authority.
export type MainFunction = (...args: any[]) => unknown;

export interface AuthorizationContext extends MainContext {
  readonly args: readonly unknown[];
}

export type AuthorizationHook = (context: AuthorizationContext) => boolean | Promise<boolean>;

export interface RuntimeSecurityOptions { authorizeInvocation?: AuthorizationHook }
export interface MainRuntimeOptions extends RuntimeSecurityOptions { development?: boolean }

export interface WindowPolicy {
  /** Explicit local file URLs or loopback HTTP(S) URLs. An empty list is rejected. */
  allowedUrls: readonly string[];
  /** Permit client routes on a configured loopback origin. Never expands file access. */
  allowSameOrigin?: boolean;
}

interface RegisteredFunction { fn: MainFunction; meta?: FunctionMeta }
interface RegisteredWindow {
  window: BrowserWindow;
  sender: WebContents;
  urls: readonly URL[];
  allowSameOrigin: boolean;
  unregister(): void;
}

const registry = new Map<string, RegisteredFunction>();
const registeredWindows = new Map<WebContents, RegisteredWindow>();
let installed = false;

/** Generated-registry helper. `valence/vite` registers extracted functions automatically. */
export function registerMain(id: string, fn: MainFunction, meta?: FunctionMeta): void {
  if (!isIdentifier(id) || typeof fn !== 'function') {
    throw new ValenceError('A main registration requires a valid ID and function.', 'VALENCE_INVALID_REGISTRATION');
  }
  if (registry.has(id)) throw new ValenceError(`Duplicate main function ID: ${id}`, 'VALENCE_DUPLICATE_ID');
  registry.set(id, { fn, ...(meta === undefined ? {} : { meta: Object.freeze({ ...meta }) }) });
}

function localUrl(value: string): URL {
  const url = new URL(value);
  const file = url.protocol === 'file:' && (url.hostname === '' || url.hostname === 'localhost');
  const loopback = (url.protocol === 'http:' || url.protocol === 'https:') &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((!file && !loopback) || url.username || url.password) {
    throw new ValenceError('Registered content must use a local file or a loopback HTTP(S) URL.', 'VALENCE_INVALID_WINDOW_POLICY');
  }
  url.search = '';
  url.hash = '';
  return url;
}

/**
 * Generated-main helper; lifecycle hooks should use their supplied `createWindow()`.
 * Registration grants this window access only while it displays explicitly trusted local content.
 */
export function registerWindow(window: BrowserWindow, policy: WindowPolicy): () => void {
  if (window.isDestroyed() || window.webContents.isDestroyed()) {
    throw new ValenceError('Cannot register a destroyed BrowserWindow.', 'VALENCE_INVALID_WINDOW');
  }
  if (!Array.isArray(policy.allowedUrls) || policy.allowedUrls.length === 0) {
    throw new ValenceError('registerWindow() requires at least one allowed content URL.', 'VALENCE_INVALID_WINDOW_POLICY');
  }
  const sender = window.webContents;
  if (registeredWindows.has(sender)) throw new ValenceError('BrowserWindow is already registered.', 'VALENCE_DUPLICATE_WINDOW');
  const urls = policy.allowedUrls.map(localUrl);
  let active = true;
  const registration: RegisteredWindow = {
    window, sender, urls, allowSameOrigin: policy.allowSameOrigin === true,
    unregister() {
      if (!active) return;
      active = false;
      if (registeredWindows.get(sender) === registration) registeredWindows.delete(sender);
      window.removeListener('closed', registration.unregister);
    },
  };
  registeredWindows.set(sender, registration);
  window.once('closed', registration.unregister);
  return registration.unregister;
}

function trustedFrame(event: IpcMainInvokeEvent): WebFrameMain {
  const sender = event.sender;
  const registration = registeredWindows.get(sender);
  const frame = event.senderFrame;
  if (!registration || sender.isDestroyed() || registration.window.isDestroyed() ||
      BrowserWindow.fromWebContents(sender) !== registration.window || !frame ||
      frame !== sender.mainFrame || frame.parent !== null) {
    throw new ValenceError('This sender is not authorized to invoke main functions.', 'VALENCE_UNAUTHORIZED');
  }
  let url: URL;
  try { url = localUrl(frame.url); }
  catch { throw new ValenceError('The sender is not displaying authorized content.', 'VALENCE_UNAUTHORIZED'); }
  const allowed = registration.urls.some((configured) => configured.href === url.href ||
    (registration.allowSameOrigin && configured.protocol !== 'file:' && configured.origin === url.origin));
  if (!allowed) throw new ValenceError('The sender is not displaying authorized content.', 'VALENCE_UNAUTHORIZED');
  return frame;
}

/**
 * Generated-main helper installed automatically by `valence/vite`; do not install it again.
 * Disposal revokes all registered window capabilities.
 */
export function installMainRuntime(options: MainRuntimeOptions = {}): () => void {
  if (installed) throw new ValenceError('The Valence main runtime is already installed.', 'VALENCE_RUNTIME_INSTALLED');
  const development = options.development === true;
  const authorizeInvocation = options.authorizeInvocation;
  if (authorizeInvocation !== undefined && typeof authorizeInvocation !== 'function') {
    throw new ValenceError('authorizeInvocation must be a function.', 'VALENCE_INVALID_AUTHORIZATION');
  }
  ipcMain.handle(INVOKE_CHANNEL, async (event: IpcMainInvokeEvent, payload: unknown, ...extra: unknown[]): Promise<InvokeResponse> => {
    let callId = 'invalid';
    try {
      // Validate the sender first, including for malformed messages, to fail closed.
      const senderFrame = trustedFrame(event);
      if (extra.length !== 0 || !isInvokeRequest(payload)) {
        throw new ValenceError('Invalid Valence invocation request.', 'VALENCE_INVALID_REQUEST');
      }
      callId = payload.callId;
      const registered = registry.get(payload.id);
      if (!registered) throw new ValenceError(`Unknown main function ID: ${payload.id}`, 'VALENCE_UNKNOWN_FUNCTION');
      const args = cloneValue(payload.args, `Arguments for ${registered.meta?.name ?? payload.id}`, 'args', development);
      const context: MainContext = Object.freeze({ event, sender: event.sender, senderFrame,
        functionId: payload.id, callId,
        ...(registered.meta === undefined ? {} : { meta: registered.meta }) });
      if (authorizeInvocation && await authorizeInvocation(Object.freeze({ ...context, args })) !== true) {
        throw new ValenceError('The application rejected this main invocation.', 'VALENCE_UNAUTHORIZED');
      }
      // An asynchronous policy must not authorize a document that navigated while it waited.
      if (trustedFrame(event) !== senderFrame) {
        throw new ValenceError('The invocation document changed during authorization.', 'VALENCE_UNAUTHORIZED');
      }
      return await invocationStorage.run(context, async () => {
        const value = await registered.fn(...args);
        return { protocol: PROTOCOL_VERSION, callId, ok: true,
          value: cloneValue(value, `Return value of ${registered.meta?.name ?? payload.id}`, 'return', development) };
      });
    } catch (error) {
      // Echo a syntactically valid correlation ID even when another field was malformed.
      if (callId === 'invalid' && isRecord(payload) && isIdentifier(payload.callId)) callId = payload.callId;
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
