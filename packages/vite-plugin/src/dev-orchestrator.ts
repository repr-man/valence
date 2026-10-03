import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import type { ViteDevServer } from 'vite';
import type { BuildAdapter } from './build-orchestrator.js';
import { MainManifest } from './manifest.js';
import type { ElectronPluginOptions } from './types.js';

/** Coalesces rebuilds; never launches overlapping Electron processes. */
export class DevOrchestrator {
  private child?: ChildProcess;
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  private pending = false;
  private disposed = false;
  dependencies = new Set<string>();

  constructor(private readonly server: ViteDevServer, private readonly adapter: BuildAdapter,
    private readonly manifest: MainManifest, private readonly options: ElectronPluginOptions,
    private readonly url: string) {}

  async start(): Promise<void> { this.pending = true; await this.drain(); }

  invalidate(): void {
    if (this.disposed || this.options.dev?.restartMainOnChange === false) return;
    this.pending = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.drain().catch(error => this.report(error));
    }, 80);
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = (async () => {
      while (this.pending && !this.disposed) {
        this.pending = false;
        await this.rebuild();
      }
    })();
    try { await this.running; }
    finally { this.running = undefined; if (this.pending && !this.disposed) this.invalidate(); }
  }

  private async rebuild(): Promise<void> {
    const artifact = await this.adapter.build(this.manifest, true, this.url);
    if (this.disposed) return;
    this.dependencies = artifact.dependencies;
    this.server.watcher.add([...this.dependencies]);
    await this.stopChild();
    if (this.disposed || this.options.dev?.launch === false) return;
    const require = createRequire(this.server.config.configFile ?? this.server.config.root + '/package.json');
    const executable: unknown = this.options.dev?.electronPath ?? require('electron');
    if (typeof executable !== 'string') throw new Error('valence: Electron did not resolve to an executable. Install electron or set dev.electronPath.');
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(executable, [...(this.options.dev?.args ?? []), artifact.main], {
      cwd: this.server.config.root, env, stdio: 'inherit',
    });
    this.child = child;
    child.once('error', error => { if (this.child === child) this.child = undefined; this.report(error); });
    child.once('exit', code => {
      if (this.child === child) this.child = undefined;
      if (code && !this.disposed) this.server.config.logger.warn(`[valence] Electron exited with code ${code}.`);
    });
  }

  private report(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.server.config.logger.error(`[valence] ${message}`);
    this.server.ws.send({ type: 'error', err: { message, stack: error instanceof Error ? error.stack ?? '' : '' } });
  }

  private async stopChild(): Promise<void> {
    const child = this.child;
    this.child = undefined;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    await new Promise<void>(resolve => {
      const force = setTimeout(() => child.kill('SIGKILL'), 2500);
      child.once('close', () => { clearTimeout(force); resolve(); });
      child.kill('SIGTERM');
    });
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    // Wait for a build to finish before cleanup, so it cannot launch a new child afterward.
    await this.running?.catch(() => {});
    await this.stopChild();
  }
}
