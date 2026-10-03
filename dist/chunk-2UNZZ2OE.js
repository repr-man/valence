// packages/compiler/src/compile.ts
import { createHash } from "crypto";
import { relative, resolve } from "path";
import { parse } from "@babel/parser";
import generatorModule from "@babel/generator";
import traverseModule from "@babel/traverse";
import * as t from "@babel/types";
var generate = typeof generatorModule === "function" ? generatorModule : generatorModule.default;
var traverse = typeof traverseModule === "function" ? traverseModule : traverseModule.default;
var rendererGlobals = /* @__PURE__ */ new Set(["window", "document", "navigator", "localStorage", "sessionStorage", "location", "alert", "confirm", "prompt", "requestAnimationFrame", "cancelAnimationFrame"]);
function span(node) {
  if (!node.loc) return void 0;
  return {
    start: { line: node.loc.start.line, column: node.loc.start.column, offset: node.start ?? 0 },
    end: { line: node.loc.end.line, column: node.loc.end.column, offset: node.end ?? 0 }
  };
}
function hasDirective(node, directive) {
  return node.directives.some((entry) => entry.value.value === directive);
}
function functionName(path) {
  const parent = path.parentPath;
  if (parent.isVariableDeclarator() && t.isIdentifier(parent.node.id)) return parent.node.id.name;
  if ((path.isFunctionDeclaration() || path.isFunctionExpression()) && path.node.id) return path.node.id.name;
  return void 0;
}
function isInside(path, ancestor) {
  for (let current = path; current; current = current.parentPath) {
    if (current === ancestor) return true;
  }
  return false;
}
function isTypeReference(path) {
  for (let current = path.parentPath; current; current = current.parentPath) {
    if (current.isTSType() || current.isTSTypeAnnotation() || current.isTSInterfaceDeclaration() || current.isTSTypeAliasDeclaration()) return true;
    if (current.isTSAsExpression() || current.isTSSatisfiesExpression() || current.isTSTypeAssertion()) {
      return isInside(path, current.get("typeAnnotation"));
    }
    if (current.isExpression() || current.isStatement() || current.isFunction()) return false;
  }
  return false;
}
function getImport(binding) {
  if (!binding) return void 0;
  const node = binding.path.node;
  return t.isImportSpecifier(node) || t.isImportDefaultSpecifier(node) || t.isImportNamespaceSpecifier(node) ? node : void 0;
}
function asMap(map) {
  return map;
}
function functionParameters(parameters) {
  return parameters.map((parameter) => t.isTSParameterProperty(parameter) ? parameter.parameter : parameter);
}
function isAssignmentTarget(path) {
  for (let current = path; current.parentPath; current = current.parentPath) {
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
function compileRenderer(source, options) {
  const diagnostics = [];
  const directive = options.directive ?? "use main";
  const fail = (code, message, node, extra) => {
    const location = node ? span(node) : void 0;
    diagnostics.push({ code, severity: "error", message, filename: options.filename, ...location ? { span: location } : {}, ...extra });
  };
  const unchanged = () => ({ code: source, map: null, mainFunctions: [], diagnostics });
  let ast;
  try {
    const filename2 = options.filename.split("?")[0] ?? options.filename;
    const isTS = /\.[cm]?tsx?$/i.test(filename2);
    const isJSX = /\.[jt]sx$/i.test(filename2) || !isTS;
    ast = parse(source, {
      sourceType: "unambiguous",
      sourceFilename: options.filename,
      plugins: [...isTS ? ["typescript"] : [], ...isJSX ? ["jsx"] : []]
    });
  } catch (error) {
    const details = error;
    fail("UM000", details.message ?? "Unable to parse module.");
    const diagnostic = diagnostics[0];
    if (diagnostic && details.loc) {
      const position = { line: details.loc.line, column: details.loc.column, offset: details.loc.index ?? 0 };
      diagnostic.span = { start: position, end: position };
    }
    return unchanged();
  }
  const moduleMain = hasDirective(ast.program, directive);
  let program2;
  const functionPaths = [];
  const importPaths = [];
  const typesByName = /* @__PURE__ */ new Map();
  const typeScopes = /* @__PURE__ */ new Map();
  traverse(ast, {
    Program(path) {
      program2 = path;
    },
    Function(path) {
      functionPaths.push(path);
    },
    ImportDeclaration(path) {
      importPaths.push(path);
    },
    "TSTypeAliasDeclaration|TSInterfaceDeclaration"(path) {
      const typed = path;
      let scopeTypes = typeScopes.get(typed.scope);
      if (!scopeTypes) {
        scopeTypes = /* @__PURE__ */ new Map();
        typeScopes.set(typed.scope, scopeTypes);
      }
      scopeTypes.set(typed.node.id.name, typed);
      if (path.parentPath?.isProgram() || path.parentPath?.isExportNamedDeclaration() && path.parentPath.parentPath?.isProgram()) {
        typesByName.set(typed.node.id.name, typed);
      }
    }
  });
  if (!program2) return unchanged();
  const programPath = program2;
  const moduleFunctions = /* @__PURE__ */ new Set();
  if (moduleMain) {
    const acceptExport = (node, name) => {
      if (t.isFunctionDeclaration(node)) {
        moduleFunctions.add(node);
        return;
      }
      if (t.isVariableDeclarator(node) && (t.isArrowFunctionExpression(node.init) || t.isFunctionExpression(node.init))) {
        const declaration = programPath.scope.getBinding(name)?.path.parentPath;
        if (declaration?.isVariableDeclaration() && declaration.node.kind === "const") {
          moduleFunctions.add(node.init);
          return;
        }
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
        if (statement.source) {
          fail("UM004", "Runtime re-exports are not supported in a main module.", statement);
          continue;
        }
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
  const candidates = [];
  const identityCounts = /* @__PURE__ */ new Map();
  const generatedIds = /* @__PURE__ */ new Set();
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
    const declaration = path.isFunctionDeclaration() || path.parentPath.isVariableDeclarator() && t.isIdentifier(path.parentPath.node.id);
    if (!name || !declaration) {
      fail("UM003", "A main function needs a stable function declaration or variable name.", path.node);
      continue;
    }
    const parents = [];
    for (let parent = path.parentPath; parent; parent = parent.parentPath) {
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
    candidates.push({ path, name, lexicalName, id, hashInput, ...binding ? { binding } : {}, imports: /* @__PURE__ */ new Set(), dependencies: /* @__PURE__ */ new Set(), types: /* @__PURE__ */ new Set() });
  }
  if (!moduleMain && candidates.length === 0 || diagnostics.length > 0) return unchanged();
  const byBinding = /* @__PURE__ */ new Map();
  for (const candidate of candidates) if (candidate.binding) byBinding.set(candidate.binding, candidate);
  for (const candidate of candidates) {
    const reported = /* @__PURE__ */ new Set();
    const resolveType = (path) => {
      for (let scope = path.scope; scope; scope = scope.parent) {
        const definition = typeScopes.get(scope)?.get(path.node.name);
        if (definition) return definition;
      }
      return void 0;
    };
    const collectType = (definition) => {
      if (!definition || isInside(definition, candidate.path) || candidate.types.has(definition.node)) return;
      if ([...candidate.types].some((entry) => entry.id.name === definition.node.id.name)) {
        fail("UM006", `Main function '${candidate.name}' depends on shadowed type '${definition.node.id.name}' from multiple scopes. Give these types distinct names or import them explicitly.`, definition.node);
        return;
      }
      candidate.types.add(definition.node);
      definition.traverse({ Identifier(path) {
        collectTypeIdentifier(path);
      } });
    };
    const collectTypeIdentifier = (path) => {
      if (!isTypeReference(path)) return;
      if (path.parentPath.isTSQualifiedName() && path.key === "right") return;
      if ((path.parentPath.isTSPropertySignature() || path.parentPath.isTSMethodSignature()) && path.key === "key" && !path.parentPath.node.computed) return;
      if ((path.parentPath.isTSTypeAliasDeclaration() || path.parentPath.isTSInterfaceDeclaration()) && path.key === "id") return;
      for (let owner = path.parentPath; owner; owner = owner.parentPath) {
        const node = owner.node;
        const parameters = "typeParameters" in node ? node.typeParameters : void 0;
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
    const collectValueReference = (path, assignment = false) => {
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
        if (t.isImportSpecifier(imported) && imported.importKind === "type" || declaration?.isImportDeclaration() && declaration.node.importKind === "type") {
          fail("UM006", `Main function '${candidate.name}' uses type-only import '${name}' as a runtime value.`, path.node);
        } else candidate.imports.add(imported);
        return;
      }
      const dependency = byBinding.get(binding);
      if (dependency && !assignment) {
        candidate.dependencies.add(dependency);
        return;
      }
      if (reported.has(name)) return;
      reported.add(name);
      const moduleBinding = binding.scope.path.isProgram();
      const declarationSpan = span(binding.path.node);
      fail(moduleBinding ? "UM006" : "UM002", `Main function '${candidate.name}' captures ${moduleBinding ? "module" : "renderer"} binding '${name}'. Pass the required value as an argument or import it from a main-compatible module.`, path.node, {
        notes: [{ message: `Binding '${name}' is declared here.`, ...declarationSpan ? { span: declarationSpan } : {} }],
        suggestion: `Pass '${name}' as an explicit argument to '${candidate.name}'.`
      });
    };
    candidate.path.traverse({
      Identifier(path) {
        collectTypeIdentifier(path);
        if (isAssignmentTarget(path)) collectValueReference(path, true);
      },
      ReferencedIdentifier(path) {
        collectValueReference(path);
      },
      CallExpression(path) {
        if (t.isIdentifier(path.node.callee, { name: "eval" }) && !path.scope.getBinding("eval")) fail("UM007", "Direct eval is not supported in main functions because its lexical dependencies cannot be analyzed.", path.node);
      },
      ThisExpression(path) {
        const owner = path.findParent((entry) => entry.isFunction() && !entry.isArrowFunctionExpression());
        if (!owner || !isInside(owner, candidate.path)) fail("UM002", `Main function '${candidate.name}' captures lexical this. Pass explicit arguments instead.`, path.node);
        else if (owner === candidate.path) fail("UM007", `Main function '${candidate.name}' cannot depend on the call-site this value.`, path.node);
      },
      Super(path) {
        fail("UM007", "Main functions cannot reference super.", path.node);
      },
      MetaProperty(path) {
        if (path.node.meta.name === "new") fail("UM007", "Main functions cannot reference new.target.", path.node);
        if (path.node.meta.name === "import") fail("UM007", "Main functions cannot use import.meta because extraction changes the module identity.", path.node);
      }
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
  const mainFunctions = [];
  for (const candidate of candidates) {
    const statements = [];
    const importMetadata = [];
    for (const importPath of importPaths) {
      const specifiers = importPath.node.specifiers.filter((entry) => candidate.imports.has(entry));
      if (specifiers.length === 0) continue;
      const declaration = t.cloneNode(importPath.node, true);
      declaration.specifiers = specifiers.map((entry) => t.cloneNode(entry, true));
      statements.push(declaration);
      for (const entry of specifiers) {
        importMetadata.push({ source: declaration.source.value, imported: t.isImportDefaultSpecifier(entry) ? "default" : t.isImportNamespaceSpecifier(entry) ? "*" : t.isIdentifier(entry.imported) ? entry.imported.name : entry.imported.value, local: entry.local.name, kind: declaration.importKind === "type" || t.isImportSpecifier(entry) && entry.importKind === "type" ? "type" : "value" });
      }
    }
    for (const dependency of candidate.dependencies) {
      const local = dependency.binding?.identifier.name ?? dependency.name;
      const source2 = `virtual:valence/function/${dependency.id}`;
      statements.push(t.importDeclaration([t.importDefaultSpecifier(t.identifier(local))], t.stringLiteral(source2)));
      importMetadata.push({ source: source2, imported: "default", local, kind: "value" });
    }
    for (const declaration of [...candidate.types].sort((a, b) => (a.start ?? 0) - (b.start ?? 0))) statements.push(t.cloneNode(declaration, true));
    const original = t.cloneNode(candidate.path.node, true);
    let implementation;
    if (t.isFunctionDeclaration(original)) implementation = original;
    else {
      const body = t.isBlockStatement(original.body) ? original.body : t.blockStatement([t.returnStatement(original.body)]);
      implementation = t.functionDeclaration(t.identifier(candidate.name), functionParameters(original.params), body, false, true);
      implementation.returnType = original.returnType;
      implementation.typeParameters = original.typeParameters;
      implementation.loc = original.loc;
    }
    implementation.id ??= t.identifier(candidate.name);
    let exported;
    if (t.isFunctionExpression(original) && original.id && original.id.name !== candidate.name) {
      exported = [t.variableDeclaration("const", [t.variableDeclarator(t.identifier(candidate.name), original)]), t.exportDefaultDeclaration(t.identifier(candidate.name))];
    } else exported = [t.exportDefaultDeclaration(implementation)];
    const extracted = t.file(t.program([...statements, ...exported]));
    traverse(extracted, { BlockStatement(path) {
      path.node.directives = path.node.directives.filter((entry) => entry.value.value !== directive);
    } });
    const generated = generate(extracted, { sourceMaps: maps, sourceFileName: options.filename, comments: true }, source);
    const sourceSpan = span(candidate.path.node);
    const implementationMap = asMap(generated.map);
    mainFunctions.push({
      id: candidate.id,
      filename: options.filename,
      lexicalName: candidate.lexicalName,
      sourceSpan,
      implementationCode: generated.code,
      ...implementationMap ? { implementationMap } : {},
      imports: importMetadata,
      parameters: candidate.path.node.params.map((parameter) => ({
        name: t.isIdentifier(parameter) ? parameter.name : t.isAssignmentPattern(parameter) && t.isIdentifier(parameter.left) ? parameter.left.name : generate(parameter).code,
        source: generate(parameter).code,
        optional: t.isAssignmentPattern(parameter) || "optional" in parameter && parameter.optional === true,
        rest: t.isRestElement(parameter)
      })),
      displayName: `${filename}#${candidate.lexicalName}`,
      hashInput: candidate.hashInput
    });
  }
  const runtimeIdentifier = programPath.scope.generateUidIdentifier("callMain");
  for (const candidate of [...candidates].reverse()) {
    const node = candidate.path.node;
    const parameters = node.params.map((parameter, index) => {
      const clone = t.cloneNode(parameter, true);
      if (t.isAssignmentPattern(clone)) {
        if (!t.isLiteral(clone.right) || t.isRegExpLiteral(clone.right)) {
          clone.right = /\.[cm]?tsx?$/i.test(options.filename.split("?")[0] ?? options.filename) ? t.tsAsExpression(t.unaryExpression("void", t.numericLiteral(0)), t.tsAnyKeyword()) : t.unaryExpression("void", t.numericLiteral(0));
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
    } else {
      node.params = parameters;
      node.body = body;
    }
  }
  ast.program.directives = ast.program.directives.filter((entry) => entry.value.value !== directive);
  if (moduleMain) {
    const mainNodes = new Set(candidates.map((candidate) => candidate.path.node));
    for (const statement of programPath.get("body")) {
      if (statement.isFunctionDeclaration() && !mainNodes.has(statement.node)) statement.remove();
      else if (statement.isVariableDeclaration()) {
        statement.node.declarations = statement.node.declarations.filter((declaration) => declaration.init !== null && declaration.init !== void 0 && mainNodes.has(declaration.init));
        if (statement.node.declarations.length === 0) statement.remove();
      } else if (statement.isClassDeclaration() || statement.isTSEnumDeclaration() || statement.isTSModuleDeclaration()) statement.remove();
    }
  }
  programPath.scope.crawl();
  const usedByMain = new Set(candidates.flatMap((candidate) => [...candidate.imports]));
  for (const path of importPaths) {
    const hadMainSpecifier = path.node.specifiers.some((specifier) => usedByMain.has(specifier));
    path.node.specifiers = path.node.specifiers.filter((specifier) => !moduleMain && !usedByMain.has(specifier) || Boolean(programPath.scope.getBinding(specifier.local.name)?.referenced));
    if (path.node.specifiers.length === 0 && (hadMainSpecifier || moduleMain)) path.remove();
  }
  if (candidates.length > 0) ast.program.body.unshift(t.importDeclaration([t.importSpecifier(runtimeIdentifier, t.identifier("__callMain"))], t.stringLiteral("valence/runtime/renderer")));
  const renderer = generate(ast, { sourceMaps: maps, sourceFileName: options.filename, comments: true }, source);
  return { code: renderer.code, map: asMap(renderer.map), mainFunctions, diagnostics };
}

export {
  compileRenderer
};
//# sourceMappingURL=chunk-2UNZZ2OE.js.map