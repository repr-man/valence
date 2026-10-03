import { C as CompileOptions, a as CompileResult } from './ir-V3Ia5qX9.js';
export { D as Diagnostic, E as ExtractedImport, M as MainFunctionIR, P as ParameterMeta, R as RawSourceMap, S as SourcePosition, b as SourceSpan } from './ir-V3Ia5qX9.js';

/** Compile one author module without importing Vite or Electron. Errors are
 * atomic: callers receive the original source and no executable extraction. */
declare function compileRenderer(source: string, options: CompileOptions): CompileResult;

export { CompileOptions, CompileResult, compileRenderer };
