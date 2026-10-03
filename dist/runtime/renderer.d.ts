import { MainBridge } from './protocol.js';

declare class ValenceError extends Error {
    readonly code: string;
    constructor(message: string, code: string, options?: ErrorOptions);
}
declare class MainProcessUnavailableError extends ValenceError {
    constructor(message?: string, options?: ErrorOptions);
}

declare global {
    interface Window {
        readonly __valence?: MainBridge;
    }
}
/**
 * Browser-only helper called by generated proxies; imports no Electron or Node APIs.
 * Application code should await its original `"use main"` function, not call this helper.
 */
declare function __callMain<T>(id: string, args: unknown[]): Promise<T>;

export { MainBridge, MainProcessUnavailableError, ValenceError, __callMain };
