import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import type { Node } from '@babel/types';
import type { TraverseOptions } from '@babel/traverse';

// Stringified config hooks cannot carry their lexical environment into Electron.
// Reject free names instead of accidentally binding them to bootstrap locals.
const mainGlobals = new Set([
  'undefined', 'NaN', 'Infinity', 'globalThis', 'console', 'process', 'Buffer',
  'Object', 'Function', 'Boolean', 'Symbol', 'Number', 'BigInt', 'Math', 'Date',
  'String', 'RegExp', 'Array', 'Map', 'Set', 'WeakMap', 'WeakSet', 'WeakRef',
  'Promise', 'Reflect', 'Proxy', 'JSON', 'Intl', 'URL', 'URLSearchParams',
  'ArrayBuffer', 'SharedArrayBuffer', 'DataView', 'Uint8Array', 'Uint8ClampedArray',
  'Int8Array', 'Uint16Array', 'Int16Array', 'Uint32Array', 'Int32Array',
  'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array',
  'TextEncoder', 'TextDecoder', 'Error', 'TypeError', 'RangeError', 'SyntaxError',
  'ReferenceError', 'URIError', 'EvalError', 'AggregateError', 'AbortController',
  'AbortSignal', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'setImmediate', 'clearImmediate', 'queueMicrotask', 'structuredClone',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURI', 'decodeURI',
  'encodeURIComponent', 'decodeURIComponent',
]);
const traverse = (typeof traverseModule === 'function' ? traverseModule :
  (traverseModule as unknown as { default: (node: Node, options: TraverseOptions) => void }).default);

export function assertSelfContained(source: string): void {
  const ast = parse(`const authorization = (${source});`, { sourceType: 'module' });
  traverse(ast, {
    ReferencedIdentifier(path) {
      if (!path.scope.getBinding(path.node.name) && !mainGlobals.has(path.node.name)) {
        throw new Error(`valence: Authorization callback references '${path.node.name}', which cannot cross the config boundary. Use security.authorizeInvocation: { module: './src/policy.ts' } or a lifecycle module.`);
      }
    },
    ThisExpression() {
      throw new Error('valence: Authorization callbacks cannot capture this. Use a module reference or lifecycle module.');
    },
  });
}

export function callableSource(fn: Function): string {
  const source = Function.prototype.toString.call(fn);
  try { parse(`(${source})`, { sourceType: 'module' }); return source; }
  catch {
    // Config methods stringify without the function keyword. Try that syntax
    // only after parsing as an expression, so async arrows are never rewritten.
    const normalized = source.startsWith('async ')
      ? `async function ${source.slice(6)}` : `function ${source}`;
    try { parse(`(${normalized})`, { sourceType: 'module' }); return normalized; }
    catch { throw new Error('valence: Authorization callbacks must be ordinary serializable functions. Use a module reference for native or bound functions.'); }
  }
}
