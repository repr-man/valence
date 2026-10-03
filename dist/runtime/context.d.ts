import { AsyncLocalStorage } from 'node:async_hooks';
import { IpcMainInvokeEvent, WebContents, WebFrameMain } from 'electron';

interface FunctionMeta {
    source?: string;
    name?: string;
    [key: string]: unknown;
}
interface MainContext {
    readonly event: IpcMainInvokeEvent;
    readonly sender: WebContents;
    readonly senderFrame: WebFrameMain;
    readonly functionId: string;
    readonly callId: string;
    readonly meta?: FunctionMeta;
}
declare const invocationStorage: AsyncLocalStorage<MainContext>;
/**
 * Read the calling window and invocation metadata inside a `"use main"` function
 * or its main-only helpers. Available only during the invocation's asynchronous work.
 */
declare function getMainContext(): MainContext;

export { type FunctionMeta, type MainContext, getMainContext, invocationStorage };
