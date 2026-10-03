import { Plugin } from 'vite';
import { BrowserWindowConstructorOptions } from 'electron';
import { AuthorizationHook } from './runtime/main.js';
import { M as MainFunctionIR, b as SourceSpan } from './ir-V3Ia5qX9.js';
import './runtime/context.js';
import 'node:async_hooks';

interface ModuleReference {
    /** Resolved relative to the application root; evaluated only in Electron main. */
    module: string;
    export?: string;
}
interface ElectronPluginOptions {
    directive?: string;
    window?: BrowserWindowConstructorOptions;
    app?: {
        entryRoute?: string;
        lifecycleModule?: string;
    };
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
interface BuildArtifact {
    main: string;
    preload: string;
    dependencies: Set<string>;
}

declare class MainManifest {
    private readonly modules;
    update(filename: string, functions: MainFunctionIR[]): boolean;
    clear(): void;
    remove(filename: string): boolean;
    functions(): MainFunctionIR[];
    fingerprint(): string;
    audit(root: string): {
        name: string;
        protocol: number;
        functions: {
            id: string;
            source: string;
            name: string;
            span: SourceSpan;
            imports: string[];
        }[];
    };
}

/**
 * Add Valence to an application's Vite plugins to compile async `"use main"`
 * functions and generate Electron main, preload, and invocation transport.
 * Keep calling the original functions with `await`; no manual IPC setup is needed.
 *
 * @example
 * import { defineConfig } from 'vite';
 * import valence from 'valence/vite';
 * export default defineConfig({ plugins: [valence()] });
 *
 * @see ../docs/getting-started.md
 * @see ../docs/agents.md
 */
declare function valence(options?: ElectronPluginOptions): Plugin;

export { type BuildArtifact, type ElectronPluginOptions, MainManifest, type ModuleReference, valence as default };
