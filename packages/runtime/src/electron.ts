import type { App, BrowserWindow } from 'electron';
import type { RuntimeSecurityOptions } from './main.js';

export interface ElectronReadyContext {
  app: App;
  window: BrowserWindow;
  createWindow(): Promise<BrowserWindow>;
}

export interface ElectronBeforeQuitContext { app: App }

export interface ElectronAppLifecycle {
  ready?(context: ElectronReadyContext): void | Promise<void>;
  beforeQuit?(context: ElectronBeforeQuitContext): void | Promise<void>;
  /** Define authorization here when it depends on imports or application state. */
  security?: RuntimeSecurityOptions;
}

/**
 * Define the default export of the module configured as `valence({ app: { lifecycleModule } })`.
 * Hooks execute exclusively in Electron main; Valence still generates the entry and preload.
 * @see ../docs/api.md
 */
export function defineElectronApp<T extends ElectronAppLifecycle>(lifecycle: T): T {
  return lifecycle;
}
