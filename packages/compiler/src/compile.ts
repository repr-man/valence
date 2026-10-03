import { createHash } from "node:crypto";
import { relative, resolve } from "node:path";
import { parse } from "@babel/parser";
import generatorModule, { type GeneratorOptions, type GeneratorResult } from "@babel/generator";
import traverseModule, { type Binding, type NodePath, type TraverseOptions } from "@babel/traverse";
import * as t from "@babel/types";
import type { CompileOptions, CompileResult, Diagnostic, ExtractedImport, MainFunctionIR, RawSourceMap, SourceSpan } from "./ir.js";

// Babel publishes CommonJS entry points. These work with native ESM and bundled ESM.
type Generator = (node: t.Node, options?: GeneratorOptions, source?: string) => GeneratorResult;
const generate: Generator = typeof generatorModule === "function" ? generatorModule : (generatorModule as unknown as { default: Generator }).default;
type Traverser = (node: t.Node, options: TraverseOptions) => void;
const traverse: Traverser = typeof traverseModule === "function" ? traverseModule : (traverseModule as unknown as { default: Traverser }).default;
const rendererGlobals = new Set(["window", "document", "navigator", "localStorage", "sessionStorage", "location", "alert", "confirm", "prompt", "requestAnimationFrame", "cancelAnimationFrame"]);

interface Candidate {
  path: NodePath<t.Function>;
  name: string;
  lexicalName: string;
  id: string;
  hashInput: string;
  binding?: Binding;
  imports: Set<t.ImportSpecifier | t.ImportDefaultSpecifier | t.ImportNamespaceSpecifier>;
  dependencies: Set<Candidate>;
  types: Set<t.TSTypeAliasDeclaration | t.TSInterfaceDeclaration>;
}

function span(node: t.Node): SourceSpan | undefined {
  if (!node.loc) return undefined;
  return {
    start: { line: node.loc.start.line, column: node.loc.start.column, offset: node.start ?? 0 },
    end: { line: node.loc.end.line, column: node.loc.end.column, offset: node.end ?? 0 },
  };
}

function hasDirective(node: t.Program | t.BlockStatement, directive: string): boolean {
  return node.directives.some((entry) => entry.value.value === directive);
}

function functionName(path: NodePath<t.Function>): string | undefined {
  const parent = path.parentPath;
  if (parent.isVariableDeclarator() && t.isIdentifier(parent.node.id)) return parent.node.id.name;
  if ((path.isFunctionDeclaration() || path.isFunctionExpression()) && path.node.id) return path.node.id.name;
  return undefined;
}

function isInside(path: NodePath, ancestor: NodePath): boolean {
  for (let current: NodePath | null = path; current; current = current.parentPath) {
    if (current === ancestor) return true;
  }
  return false;
}

// TS identifiers do not all participate in Babel's value binding graph. Keep
// type dependencies separate so they cannot accidentally become captures.
function isTypeReference(path: NodePath): boolean {
  for (let current: NodePath | null = path.parentPath; current; current = current.parentPath) {
    if (current.isTSType() || current.isTSTypeAnnotation() || current.isTSInterfaceDeclaration() || current.isTSTypeAliasDeclaration()) return true;
    if (current.isTSAsExpression() || current.isTSSatisfiesExpression() || current.isTSTypeAssertion()) {
      return isInside(path, current.get("typeAnnotation") as NodePath);
    }
    if (current.isExpression() || current.isStatement() || current.isFunction()) return false;
  }
  return false;
}

function getImport(binding: Binding | undefined): t.ImportSpecifier | t.ImportDefaultSpecifier | t.ImportNamespaceSpecifier | undefined {
  if (!binding) return undefined;
  const node = binding.path.node;
  return t.isImportSpecifier(node) || t.isImportDefaultSpecifier(node) || t.isImportNamespaceSpecifier(node) ? node : undefined;
}

function asMap(map: GeneratorResult["map"]): RawSourceMap | null {
  return map as RawSourceMap | null;
}

function functionParameters(parameters: readonly (t.FunctionParameter | t.TSParameterProperty)[]): t.FunctionParameter[] {
  return parameters.map((parameter) => t.isTSParameterProperty(parameter) ? parameter.parameter : parameter);
}

function isAssignmentTarget(path: NodePath<t.Identifier>): boolean {
  for (let current: NodePath = path; current.parentPath; current = current.parentPath) {
    const parent = current.parentPath;
    if (parent.isMemberExpression() || parent.isOptionalMemberExpression()) return false;
    if (parent.isObjectProperty() && current.key === "key") return false;
    if (parent.isAssignmentPattern() && current.key === "right") return false;
    if (parent.isAssignmentExpression()) return current.key === "left";
    if (parent.isForInStatement() || parent.isForOfStatement()) return current.key === "left";
    if (!parent.isObjectProperty() && !parent.isObjectPattern() && !parent.isArrayPattern() && !parent.isRestElement() && !parent.isAssignmentPattern()) return false;
  }
  return false;
}

/** Compile one author module without importing Vite or Electron. Errors are
 * atomic: callers receive the original source and no executable extraction. */
export function compileRenderer(source: string, options: CompileOptions): CompileResult {
  const diagnostics: Diagnostic[] = [];
  const directive = options.directive ?? "use main";
  const fail = (code: string, message: string, node?: t.Node, extra?: Pick<Diagnostic, "notes" | "suggestion">): void => {
    const location = node ? span(node) : undefined;
    diagnostics.push({ code, severity: "error", message, filename: options.filename, ...(location ? { span: location } : {}), ...extra });
  };
  const unchanged = (): CompileResult => ({ code: source, map: null, mainFunctions: [], diagnostics });
  let ast: t.File;
  try {
    const filename = options.filename.split("?")[0] ?? options.filename;
    const isTS = /\.[cm]?tsx?$/i.test(filename);
    const isJSX = /\.[jt]sx$/i.test(filename) || !isTS;
    ast = parse(source, {
      sourceType: "unambiguous",
      sourceFilename: options.filename,
      plugins: [...(isTS ? ["typescript" as const] : []), ...(isJSX ? ["jsx" as const] : [])],
    });
  } catch (error) {
    const details = error as { message?: string; loc?: { line: number; column: number; index?: number } };
    fail("UM000", details.message ?? "Unable to parse module.");
    const diagnostic = diagnostics[0];
    if (diagnostic && details.loc) {
      const position = { line: details.loc.line, column: details.loc.column, offset: details.loc.index ?? 0 };
      diagnostic.span = { start: position, end: position };
    }
    return unchanged();
  }

  const moduleMain = hasDirective(ast.program, directive);
  let program: NodePath<t.Program> | undefined;
  const functionPaths: NodePath<t.Function>[] = [];
  const importPaths: NodePath<t.ImportDeclaration>[] = [];
  const typesByName = new Map<string, NodePath<t.TSTypeAliasDeclaration | t.TSInterfaceDeclaration>>();
  const typeScopes = new Map<NodePath["scope"], Map<string, NodePath<t.TSTypeAliasDeclaration | t.TSInterfaceDeclaration>>>();
  traverse(ast, {
    Program(path) { program = path; },
    Function(path) { functionPaths.push(path); },
    ImportDeclaration(path) { importPaths.push(path); },
    "TSTypeAliasDeclaration|TSInterfaceDeclaration"(path) {
      const typed = path as NodePath<t.TSTypeAliasDeclaration | t.TSInterfaceDeclaration>;
      let scopeTypes = typeScopes.get(typed.scope);
      if (!scopeTypes) { scopeTypes = new Map(); typeScopes.set(typed.scope, scopeTypes); }
      scopeTypes.set(typed.node.id.name, typed);
      if (path.parentPath?.isProgram() || (path.parentPath?.isExportNamedDeclaration() && path.parentPath.parentPath?.isProgram())) {
        typesByName.set(typed.node.id.name, typed);
      }
    },
  });
  if (!program) return unchanged();
  const programPath = program;
  const moduleFunctions = new Set<t.Function>();
  if (moduleMain) {
    const acceptExport = (node: t.Node, name: string): void => {
      if (t.isFunctionDeclaration(node)) { moduleFunctions.add(node); return; }
      if (t.isVariableDeclarator(node) && (t.isArrowFunctionExpression(node.init) || t.isFunctionExpression(node.init))) {
        const declaration = programPath.scope.getBinding(name)?.path.parentPath;
        if (declaration?.isVariableDeclaration() && declaration.node.kind === "const") { moduleFunctions.add(node.init); return; }
      }
      fail("UM004", `Main module export '${name}' must be an async function declaration or a function-valued const.`, node);
    };
    for (const statement of ast.program.body) {
      if (t.isImportDeclaration(statement) && statement.specifiers.length === 0 && statement.importKind !== "type") {
        fail("UM007", "Side-effect-only imports are not supported in a main module. Import the bindings used by its exported functions explicitly.", statement);
      } else if (!t.isImportDeclaration(statement) && !t.isDeclaration(statement) && !t.isExportDeclaration(statement)) {
        fail("UM007", "Executable top-level statements are not supported in a main module. Move initialization into an exported async main function.", statement);
      }
      if (t.isExportAllDeclaration(statement)) {
        if (statement.exportKind !== "type") fail("UM004", "Runtime re-exports are not supported in a main module.", statement);
      } else if (t.isExportDefaultDeclaration(statement)) {
        if (t.isFunctionDeclaration(statement.declaration) && statement.declaration.id) acceptExport(statement.declaration, statement.declaration.id.name);
        else if (t.isIdentifier(statement.declaration)) {
          const binding = programPath.scope.getBinding(statement.declaration.name);
          if (binding) acceptExport(binding.path.node, statement.declaration.name);
          else fail("UM004", "Default main export must refer to a locally declared async function.", statement);
        } else fail("UM004", "Default main export requires a stable named async function.", statement);
      } else if (t.isExportNamedDeclaration(statement) && statement.exportKind !== "type") {
        if (statement.source) { fail("UM004", "Runtime re-exports are not supported in a main module.", statement); continue; }
        const declaration = statement.declaration;
        if (t.isFunctionDeclaration(declaration)) acceptExport(declaration, declaration.id?.name ?? "<anonymous>");
        else if (t.isVariableDeclaration(declaration)) {
          for (const entry of declaration.declarations) acceptExport(entry, t.isIdentifier(entry.id) ? entry.id.name : "<destructured>");
        } else if (declaration && !t.isTSTypeAliasDeclaration(declaration) && !t.isTSInterfaceDeclaration(declaration)) {
          fail("UM004", "Non-function runtime exports are not supported in a main module.", declaration);
        }
        for (const specifier of statement.specifiers) {
          if (!t.isExportSpecifier(specifier) || specifier.exportKind === "type") continue;
          const localName = specifier.local.name;
          if (typesByName.has(localName)) continue;
          const binding = programPath.scope.getBinding(localName);
          if (binding) acceptExport(binding.path.node, localName);
          else fail("UM004", `Cannot extract export '${localName}'.`, specifier);
        }
      }
    }
  }

  const candidates: Candidate[] = [];
  const identityCounts = new Map<string, number>();
  const generatedIds = new Set<string>();
  const filename = relative(resolve(options.root), resolve(options.filename.split("?")[0] ?? options.filename)).replaceAll("\\", "/");
  for (const path of functionPaths) {
    if (!moduleFunctions.has(path.node) && !(t.isBlockStatement(path.node.body) && hasDirective(path.node.body, directive))) continue;
    if (!path.node.async) fail("UM001", "A main function must be async.", path.node);
    if (path.node.generator) fail("UM007", "Main generator functions are not supported.", path.node);
    if (path.isObjectMethod() || path.isClassMethod() || path.isClassPrivateMethod()) {
      fail("UM007", "Main directives are not supported on object or class methods. Use a named async function.", path.node);
      continue;
    }
    const name = functionName(path);
    const declaration = path.isFunctionDeclaration() || (path.parentPath.isVariableDeclarator() && t.isIdentifier(path.parentPath.node.id));
    if (!name || !declaration) { fail("UM003", "A main function needs a stable function declaration or variable name.", path.node); continue; }
    const parents: string[] = [];
    for (let parent: NodePath | null = path.parentPath; parent; parent = parent.parentPath) {
      if (parent.isFunction()) parents.unshift(functionName(parent) ?? "<anonymous>");
      else if (parent.isClass() && parent.node.id) parents.unshift(parent.node.id.name);
    }
    const base = [...parents, name].join("/");
    const count = identityCounts.get(base) ?? 0;
    identityCounts.set(base, count + 1);
    const lexicalName = count === 0 ? base : `${base}#${count + 1}`;
    const hashInput = `${filename}#${lexicalName}`;
    const id = `val_${createHash("sha256").update(hashInput).digest("base64url").slice(0, 16)}`;
    if (generatedIds.has(id)) fail("UM005", `Duplicate generated main function identity '${lexicalName}'.`, path.node);
    generatedIds.add(id);
    const binding = path.parentPath.scope.getBinding(name);
    if (binding && !binding.constant) fail("UM007", `Main function binding '${name}' cannot be reassigned.`, binding.path.node);
    candidates.push({ path, name, lexicalName, id, hashInput, ...(binding ? { binding } : {}), imports: new Set(), dependencies: new Set(), types: new Set() });
  }
  if ((!moduleMain && candidates.length === 0) || diagnostics.length > 0) return unchanged();
  const byBinding = new Map<Binding, Candidate>();
  for (const candidate of candidates) if (candidate.binding) byBinding.set(candidate.binding, candidate);

  for (const candidate of candidates) {
    const reported = new Set<string>();
    const resolveType = (path: NodePath<t.Identifier>): NodePath<t.TSTypeAliasDeclaration | t.TSInterfaceDeclaration> | undefined => {
      for (let scope: NodePath["scope"] | null = path.scope; scope; scope = scope.parent) {
        const definition = typeScopes.get(scope)?.get(path.node.name);
        if (definition) return definition;
      }
      return undefined;
    };
    const collectType = (definition: NodePath<t.TSTypeAliasDeclaration | t.TSInterfaceDeclaration> | undefined): void => {
      if (!definition || isInside(definition, candidate.path) || candidate.types.has(definition.node)) return;
      if ([...candidate.types].some((entry) => entry.id.name === definition.node.id.name)) {
        fail("UM006", `Main function '${candidate.name}' depends on shadowed type '${definition.node.id.name}' from multiple scopes. Give these types distinct names or import them explicitly.`, definition.node);
        return;
      }
      candidate.types.add(definition.node);
      definition.traverse({ Identifier(path) { collectTypeIdentifier(path); } });
    };
    const collectTypeIdentifier = (path: NodePath<t.Identifier>): void => {
      if (!isTypeReference(path)) return;
      if (path.parentPath.isTSQualifiedName() && path.key === "right") return;
      if ((path.parentPath.isTSPropertySignature() || path.parentPath.isTSMethodSignature()) && path.key === "key" && !path.parentPath.node.computed) return;
      if ((path.parentPath.isTSTypeAliasDeclaration() || path.parentPath.isTSInterfaceDeclaration()) && path.key === "id") return;
      for (let owner: NodePath | null = path.parentPath; owner; owner = owner.parentPath) {
        const node = owner.node;
        const parameters = "typeParameters" in node ? node.typeParameters : undefined;
        if (!t.isTSTypeParameterDeclaration(parameters) || !parameters.params.some((parameter) => parameter.name === path.node.name)) continue;
        if (!isInside(owner, candidate.path) && !((t.isTSTypeAliasDeclaration(node) || t.isTSInterfaceDeclaration(node)) && candidate.types.has(node))) {
          fail("UM002", `Main function '${candidate.name}' captures outer type parameter '${path.node.name}'. Declare its type parameter on the main function itself.`, path.node);
        }
        return;
      }
      const binding = path.scope.getBinding(path.node.name);
      const imported = getImport(binding);
      const definition = resolveType(path);
      if (imported) candidate.imports.add(imported);
      else {
        if (binding && !isInside(binding.path, candidate.path) && binding !== candidate.binding) {
          const dependency = byBinding.get(binding);
          if (dependency) candidate.dependencies.add(dependency);
          else if (!definition) {
            fail("UM006", `Type '${path.node.name}' depends on an outer runtime binding that cannot be extracted. Import its type explicitly.`, path.node);
          }
        }
        collectType(definition);
      }
    };
    const collectValueReference = (path: NodePath<t.Identifier | t.JSXIdentifier>, assignment = false): void => {
        if (isTypeReference(path)) return;
        const name = path.node.name;
        const binding = path.scope.getBinding(name);
        if (!binding) {
          if (rendererGlobals.has(name)) {
            fail("UM002", `Main function '${candidate.name}' references renderer global '${name}', which is unavailable in the main process. Pass the required data explicitly.`, path.node);
          }
          if (name === "arguments") {
            const owner = path.findParent((entry) => entry.isFunction() && !entry.isArrowFunctionExpression());
            if (!owner || !isInside(owner, candidate.path)) fail("UM002", `Main function '${candidate.name}' captures lexical arguments. Use explicit parameters.`, path.node);
          }
          return;
        }
        if (isInside(binding.path, candidate.path) || binding === candidate.binding) return;
        const imported = getImport(binding);
        if (imported) {
          const declaration = binding.path.parentPath;
          if ((t.isImportSpecifier(imported) && imported.importKind === "type") || (declaration?.isImportDeclaration() && declaration.node.importKind === "type")) {
            fail("UM006", `Main function '${candidate.name}' uses type-only import '${name}' as a runtime value.`, path.node);
          } else candidate.imports.add(imported);
          return;
        }
        const dependency = byBinding.get(binding);
        if (dependency && !assignment) { candidate.dependencies.add(dependency); return; }
        if (reported.has(name)) return;
        reported.add(name);
        const moduleBinding = binding.scope.path.isProgram();
        const declarationSpan = span(binding.path.node);
        fail(moduleBinding ? "UM006" : "UM002", `Main function '${candidate.name}' captures ${moduleBinding ? "module" : "renderer"} binding '${name}'. Pass the required value as an argument or import it from a main-compatible module.`, path.node, {
          notes: [{ message: `Binding '${name}' is declared here.`, ...(declarationSpan ? { span: declarationSpan } : {}) }],
          suggestion: `Pass '${name}' as an explicit argument to '${candidate.name}'.`,
        });
    };
    candidate.path.traverse({
      Identifier(path) {
        collectTypeIdentifier(path);
        if (isAssignmentTarget(path)) collectValueReference(path, true);
      },
      ReferencedIdentifier(path) { collectValueReference(path); },
      CallExpression(path) {
        if (t.isIdentifier(path.node.callee, { name: "eval" }) && !path.scope.getBinding("eval")) fail("UM007", "Direct eval is not supported in main functions because its lexical dependencies cannot be analyzed.", path.node);
      },
      ThisExpression(path) {
        const owner = path.findParent((entry) => entry.isFunction() && !entry.isArrowFunctionExpression());
        if (!owner || !isInside(owner, candidate.path)) fail("UM002", `Main function '${candidate.name}' captures lexical this. Pass explicit arguments instead.`, path.node);
        else if (owner === candidate.path) fail("UM007", `Main function '${candidate.name}' cannot depend on the call-site this value.`, path.node);
      },
      Super(path) { fail("UM007", "Main functions cannot reference super.", path.node); },
      MetaProperty(path) {
        if (path.node.meta.name === "new") fail("UM007", "Main functions cannot reference new.target.", path.node);
        if (path.node.meta.name === "import") fail("UM007", "Main functions cannot use import.meta because extraction changes the module identity.", path.node);
      },
    });
  }
  for (const candidate of candidates) {
    for (const imported of candidate.imports) {
      if ([...candidate.types].some((definition) => definition.id.name === imported.local.name)) {
        fail("UM006", `Main function '${candidate.name}' depends on both an import and an outer type named '${imported.local.name}'. Rename one binding to make extraction unambiguous.`, imported);
      }
    }
  }
  if (diagnostics.length > 0) return unchanged();

  const maps = options.sourceMap ?? false;
  const mainFunctions: MainFunctionIR[] = [];
  for (const candidate of candidates) {
    const statements: t.Statement[] = [];
    const importMetadata: ExtractedImport[] = [];
    for (const importPath of importPaths) {
      const specifiers = importPath.node.specifiers.filter((entry) => candidate.imports.has(entry));
      if (specifiers.length === 0) continue;
      const declaration = t.cloneNode(importPath.node, true);
      declaration.specifiers = specifiers.map((entry) => t.cloneNode(entry, true));
      statements.push(declaration);
      for (const entry of specifiers) {
        importMetadata.push({ source: declaration.source.value, imported: t.isImportDefaultSpecifier(entry) ? "default" : t.isImportNamespaceSpecifier(entry) ? "*" : t.isIdentifier(entry.imported) ? entry.imported.name : entry.imported.value, local: entry.local.name, kind: declaration.importKind === "type" || (t.isImportSpecifier(entry) && entry.importKind === "type") ? "type" : "value" });
      }
    }
    for (const dependency of candidate.dependencies) {
      const local = dependency.binding?.identifier.name ?? dependency.name;
      const source = `virtual:valence/function/${dependency.id}`;
      statements.push(t.importDeclaration([t.importDefaultSpecifier(t.identifier(local))], t.stringLiteral(source)));
      importMetadata.push({ source, imported: "default", local, kind: "value" });
    }
    // Outer local types are safe to copy too; their value queries still pass
    // through the same capture validation as module types.
    for (const declaration of [...candidate.types].sort((a, b) => (a.start ?? 0) - (b.start ?? 0))) statements.push(t.cloneNode(declaration, true));
    const original = t.cloneNode(candidate.path.node, true);
    let implementation: t.FunctionDeclaration;
    if (t.isFunctionDeclaration(original)) implementation = original;
    else {
      const body = t.isBlockStatement(original.body) ? original.body : t.blockStatement([t.returnStatement(original.body)]);
      implementation = t.functionDeclaration(t.identifier(candidate.name), functionParameters(original.params), body, false, true);
      implementation.returnType = original.returnType;
      implementation.typeParameters = original.typeParameters;
      implementation.loc = original.loc;
    }
    implementation.id ??= t.identifier(candidate.name);
    let exported: t.Statement[];
    if (t.isFunctionExpression(original) && original.id && original.id.name !== candidate.name) {
      // A named expression may refer both to its private name and to the outer
      // const name. Retaining the declarator preserves both recursive forms.
      exported = [t.variableDeclaration("const", [t.variableDeclarator(t.identifier(candidate.name), original)]), t.exportDefaultDeclaration(t.identifier(candidate.name))];
    } else exported = [t.exportDefaultDeclaration(implementation)];
    const extracted = t.file(t.program([...statements, ...exported]));
    traverse(extracted, { BlockStatement(path) { path.node.directives = path.node.directives.filter((entry) => entry.value.value !== directive); } });
    const generated = generate(extracted, { sourceMaps: maps, sourceFileName: options.filename, comments: true }, source);
    const sourceSpan = span(candidate.path.node)!;
    const implementationMap = asMap(generated.map);
    mainFunctions.push({
      id: candidate.id, filename: options.filename, lexicalName: candidate.lexicalName, sourceSpan,
      implementationCode: generated.code, ...(implementationMap ? { implementationMap } : {}), imports: importMetadata,
      parameters: candidate.path.node.params.map((parameter) => ({
        name: t.isIdentifier(parameter) ? parameter.name : t.isAssignmentPattern(parameter) && t.isIdentifier(parameter.left) ? parameter.left.name : generate(parameter).code,
        source: generate(parameter).code, optional: t.isAssignmentPattern(parameter) || ("optional" in parameter && parameter.optional === true), rest: t.isRestElement(parameter),
      })),
      displayName: `${filename}#${candidate.lexicalName}`, hashInput: candidate.hashInput,
    });
  }

  const runtimeIdentifier = programPath.scope.generateUidIdentifier("callMain");
  // Replace deepest functions first. A parent main proxy intentionally discards
  // its nested declarations; their independent implementations remain in IR.
  for (const candidate of [...candidates].reverse()) {
    const node = candidate.path.node;
    const parameters = node.params.map((parameter, index) => {
      const clone = t.cloneNode(parameter, true);
      if (t.isAssignmentPattern(clone)) {
        // Keep inert literal defaults for their useful inferred TS parameter
        // types. All other defaults run only in the extracted implementation.
        if (!t.isLiteral(clone.right) || t.isRegExpLiteral(clone.right)) {
          clone.right = /\.[cm]?tsx?$/i.test(options.filename.split("?")[0] ?? options.filename)
            ? t.tsAsExpression(t.unaryExpression("void", t.numericLiteral(0)), t.tsAnyKeyword())
            : t.unaryExpression("void", t.numericLiteral(0));
        }
        if (t.isObjectPattern(clone.left) || t.isArrayPattern(clone.left)) {
          const placeholder = t.identifier(`__main_parameter_${index}`);
          placeholder.typeAnnotation = clone.left.typeAnnotation;
          clone.left = placeholder;
        }
      } else if (t.isObjectPattern(clone) || t.isArrayPattern(clone)) {
        const placeholder = t.identifier(`__main_parameter_${index}`);
        placeholder.typeAnnotation = clone.typeAnnotation;
        placeholder.optional = clone.optional;
        return placeholder;
      }
      return clone;
    });
    const body = t.blockStatement([t.returnStatement(t.callExpression(t.cloneNode(runtimeIdentifier), [t.stringLiteral(candidate.id), t.arrayExpression([t.spreadElement(t.identifier("arguments"))])]))]);
    body.loc = node.body.loc;
    if (candidate.path.isArrowFunctionExpression()) {
      const replacement = t.functionExpression(t.identifier(candidate.name), functionParameters(parameters), body, false, true);
      replacement.returnType = node.returnType;
      replacement.typeParameters = node.typeParameters;
      replacement.loc = node.loc;
      candidate.path.replaceWith(replacement);
    } else { node.params = parameters; node.body = body; }
  }
  ast.program.directives = ast.program.directives.filter((entry) => entry.value.value !== directive);
  if (moduleMain) {
    const mainNodes = new Set(candidates.map((candidate) => candidate.path.node));
    for (const statement of programPath.get("body")) {
      if (statement.isFunctionDeclaration() && !mainNodes.has(statement.node)) statement.remove();
      else if (statement.isVariableDeclaration()) {
        statement.node.declarations = statement.node.declarations.filter((declaration) => declaration.init !== null && declaration.init !== undefined && mainNodes.has(declaration.init as t.Function));
        if (statement.node.declarations.length === 0) statement.remove();
      } else if (statement.isClassDeclaration() || statement.isTSEnumDeclaration() || statement.isTSModuleDeclaration()) statement.remove();
    }
  }
  programPath.scope.crawl();
  const usedByMain = new Set(candidates.flatMap((candidate) => [...candidate.imports]));
  for (const path of importPaths) {
    // Preserve unrelated imports and all intentional side-effect imports.
    const hadMainSpecifier = path.node.specifiers.some((specifier) => usedByMain.has(specifier));
    path.node.specifiers = path.node.specifiers.filter((specifier) => (!moduleMain && !usedByMain.has(specifier)) || Boolean(programPath.scope.getBinding(specifier.local.name)?.referenced));
    if (path.node.specifiers.length === 0 && (hadMainSpecifier || moduleMain)) path.remove();
  }
  if (candidates.length > 0) ast.program.body.unshift(t.importDeclaration([t.importSpecifier(runtimeIdentifier, t.identifier("__callMain"))], t.stringLiteral("valence/runtime/renderer")));
  const renderer = generate(ast, { sourceMaps: maps, sourceFileName: options.filename, comments: true }, source);
  return { code: renderer.code, map: asMap(renderer.map), mainFunctions, diagnostics };
}
