interface PreloadRuntimeOptions {
    development?: boolean;
}
/**
 * Generated-preload helper used automatically by `valence/vite`.
 * Applications should declare `"use main"` functions instead of writing a preload.
 * Exposes one fixed-channel invocation method, never the Electron IPC object.
 */
declare function exposeMainBridge(options?: PreloadRuntimeOptions): void;

export { type PreloadRuntimeOptions, exposeMainBridge };
