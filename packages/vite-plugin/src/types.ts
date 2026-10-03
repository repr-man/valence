import type { BrowserWindowConstructorOptions } from 'electron';
import type { AuthorizationHook } from '../../runtime/src/main.js';

export interface ModuleReference {
  /** Resolved relative to the application root; evaluated only in Electron main. */
  module: string;
  export?: string;
}

export interface ElectronPluginOptions {
  directive?: string;
  window?: BrowserWindowConstructorOptions;
  app?: { entryRoute?: string; lifecycleModule?: string };
  build?: {
    /** Base for generated renderer, electron, and manifests directories. */
    outDir?: string;
    mainFile?: string;
    preloadFile?: string;
    sourcemap?: boolean;
    /** Dependencies to leave for the packager to include beside the application. */
    external?: string[];
  };
  security?: {
    /** Functions must be self-contained; use a module reference for imports or captures. */
    authorizeInvocation?: AuthorizationHook | ModuleReference;
  };
  dev?: {
    inspectGenerated?: boolean;
    restartMainOnChange?: boolean;
    launch?: boolean;
    electronPath?: string;
    args?: string[];
  };
}

export interface BuildArtifact {
  main: string;
  preload: string;
  dependencies: Set<string>;
}
