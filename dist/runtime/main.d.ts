import { BrowserWindow } from 'electron';
import { MainContext, FunctionMeta } from './context.js';
export { getMainContext } from './context.js';
import 'node:async_hooks';

type MainFunction = (...args: any[]) => unknown;
interface AuthorizationContext extends MainContext {
    readonly args: readonly unknown[];
}
type AuthorizationHook = (context: AuthorizationContext) => boolean | Promise<boolean>;
interface RuntimeSecurityOptions {
    authorizeInvocation?: AuthorizationHook;
}
interface MainRuntimeOptions extends RuntimeSecurityOptions {
    development?: boolean;
}
interface WindowPolicy {
    /** Explicit local file URLs or loopback HTTP(S) URLs. An empty list is rejected. */
    allowedUrls: readonly string[];
    /** Permit client routes on a configured loopback origin. Never expands file access. */
    allowSameOrigin?: boolean;
}
/** Generated-registry helper. `valence/vite` registers extracted functions automatically. */
declare function registerMain(id: string, fn: MainFunction, meta?: FunctionMeta): void;
/**
 * Generated-main helper; lifecycle hooks should use their supplied `createWindow()`.
 * Registration grants this window access only while it displays explicitly trusted local content.
 */
declare function registerWindow(window: BrowserWindow, policy: WindowPolicy): () => void;
/**
 * Generated-main helper installed automatically by `valence/vite`; do not install it again.
 * Disposal revokes all registered window capabilities.
 */
declare function installMainRuntime(options?: MainRuntimeOptions): () => void;

export { type AuthorizationContext, type AuthorizationHook, FunctionMeta, MainContext, type MainFunction, type MainRuntimeOptions, type RuntimeSecurityOptions, type WindowPolicy, installMainRuntime, registerMain, registerWindow };
