import { createHash } from 'node:crypto';
import { relative } from 'node:path';
import type { MainFunctionIR } from '../../compiler/src/index.js';

export class MainManifest {
  private readonly modules = new Map<string, MainFunctionIR[]>();

  update(filename: string, functions: MainFunctionIR[]): boolean {
    const before = this.fingerprint();
    if (functions.length) this.modules.set(filename, functions);
    else this.modules.delete(filename);
    // A duplicate is a compiler/build error, never last-writer-wins registration.
    this.functions();
    return before !== this.fingerprint();
  }

  clear(): void { this.modules.clear(); }

  remove(filename: string): boolean {
    return this.modules.delete(filename);
  }

  functions(): MainFunctionIR[] {
    const ids = new Set<string>();
    const functions = [...this.modules.values()].flat().sort((a, b) => a.id.localeCompare(b.id));
    for (const fn of functions) {
      if (ids.has(fn.id)) throw new Error(`UM005: Duplicate generated function ID ${fn.id} (${fn.filename}).`);
      ids.add(fn.id);
    }
    return functions;
  }

  fingerprint(): string {
    return createHash('sha256').update(JSON.stringify(this.functions().map(fn => [fn.id, fn.implementationCode]))).digest('hex');
  }

  audit(root: string) {
    return {
      name: 'valence', protocol: 1,
      functions: this.functions().map(fn => ({
        id: fn.id, source: relative(root, fn.filename).replaceAll('\\', '/'),
        name: fn.displayName, span: fn.sourceSpan,
        imports: [...new Set(fn.imports.map(item => item.source))].sort(),
      })),
    };
  }
}
