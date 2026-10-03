import { App, BrowserWindow } from 'electron';
import { RuntimeSecurityOptions } from './runtime/main.js';
import './runtime/context.js';
import 'node:async_hooks';

interface ElectronReadyContext {
    app: App;
    window: BrowserWindow;
    createWindow(): Promise<BrowserWindow>;
}
interface ElectronBeforeQuitContext {
    app: App;
}
interface ElectronAppLifecycle {
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
declare function defineElectronApp<T extends ElectronAppLifecycle>(lifecycle: T): T;

export { type ElectronAppLifecycle, type ElectronBeforeQuitContext, type ElectronReadyContext, defineElectronApp };
