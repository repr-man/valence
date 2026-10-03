import { AsyncLocalStorage } from 'node:async_hooks';
import type { IpcMainInvokeEvent, WebContents, WebFrameMain } from 'electron';
import { ValenceError } from './errors.js';

export interface FunctionMeta {
  source?: string;
  name?: string;
  [key: string]: unknown;
}

export interface MainContext {
  readonly event: IpcMainInvokeEvent;
  readonly sender: WebContents;
  readonly senderFrame: WebFrameMain;
  readonly functionId: string;
  readonly callId: string;
  readonly meta?: FunctionMeta;
}

export const invocationStorage = new AsyncLocalStorage<MainContext>();

/**
 * Read the calling window and invocation metadata inside a `"use main"` function
 * or its main-only helpers. Available only during the invocation's asynchronous work.
 */
export function getMainContext(): MainContext {
  const context = invocationStorage.getStore();
  if (!context) throw new ValenceError('getMainContext() must be called inside a main function invocation.', 'VALENCE_NO_CONTEXT');
  return context;
}
