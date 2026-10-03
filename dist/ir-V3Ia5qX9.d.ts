interface SourcePosition {
    line: number;
    column: number;
    offset: number;
}
interface SourceSpan {
    start: SourcePosition;
    end: SourcePosition;
}
interface RawSourceMap {
    version: number;
    sources: string[];
    names: string[];
    mappings: string;
    file?: string;
    sourceRoot?: string;
    sourcesContent?: (string | null)[];
}
interface Diagnostic {
    code: string;
    severity: "error" | "warning";
    message: string;
    filename: string;
    span?: SourceSpan;
    notes?: {
        message: string;
        span?: SourceSpan;
    }[];
    suggestion?: string;
}
interface CompileOptions {
    filename: string;
    root: string;
    directive?: string;
    sourceMap?: boolean;
}
interface ExtractedImport {
    source: string;
    imported: string;
    local: string;
    kind: "value" | "type";
}
interface ParameterMeta {
    name: string;
    source: string;
    optional: boolean;
    rest: boolean;
}
interface MainFunctionIR {
    id: string;
    filename: string;
    lexicalName: string;
    sourceSpan: SourceSpan;
    implementationCode: string;
    implementationMap?: RawSourceMap;
    imports: ExtractedImport[];
    parameters: ParameterMeta[];
    displayName: string;
    hashInput: string;
}
interface CompileResult {
    code: string;
    map: RawSourceMap | null;
    mainFunctions: MainFunctionIR[];
    diagnostics: Diagnostic[];
}

export type { CompileOptions as C, Diagnostic as D, ExtractedImport as E, MainFunctionIR as M, ParameterMeta as P, RawSourceMap as R, SourcePosition as S, CompileResult as a, SourceSpan as b };
