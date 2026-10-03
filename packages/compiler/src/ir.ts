export interface SourcePosition {
  line: number;
  column: number;
  offset: number;
}

export interface SourceSpan {
  start: SourcePosition;
  end: SourcePosition;
}

export interface RawSourceMap {
  version: number;
  sources: string[];
  names: string[];
  mappings: string;
  file?: string;
  sourceRoot?: string;
  sourcesContent?: (string | null)[];
}

export interface Diagnostic {
  code: string;
  severity: "error" | "warning";
  message: string;
  filename: string;
  span?: SourceSpan;
  notes?: { message: string; span?: SourceSpan }[];
  suggestion?: string;
}

export interface CompileOptions {
  filename: string;
  root: string;
  directive?: string;
  sourceMap?: boolean;
}

export interface ExtractedImport {
  source: string;
  imported: string;
  local: string;
  kind: "value" | "type";
}

export interface ParameterMeta {
  name: string;
  source: string;
  optional: boolean;
  rest: boolean;
}

export interface MainFunctionIR {
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

export interface CompileResult {
  code: string;
  map: RawSourceMap | null;
  mainFunctions: MainFunctionIR[];
  diagnostics: Diagnostic[];
}
