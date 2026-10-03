import {
  ValenceError
} from "./chunk-BJL53WIL.js";

// packages/runtime/src/serialization.ts
function childPath(path, key) {
  return /^[a-zA-Z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}
function unsupportedPath(value, path, seen) {
  if (typeof value === "function" || typeof value === "symbol") return path;
  if (typeof value !== "object" || value === null || seen.has(value)) return void 0;
  seen.add(value);
  if (value instanceof Promise || value instanceof WeakMap || value instanceof WeakSet) return path;
  if (value instanceof Map) {
    let index = 0;
    for (const [key, item] of value) {
      const failure = unsupportedPath(key, `${path}.mapKey[${index}]`, seen) ?? unsupportedPath(item, `${path}.mapValue[${index}]`, seen);
      if (failure) return failure;
      index++;
    }
  } else if (value instanceof Set) {
    let index = 0;
    for (const item of value) {
      const failure = unsupportedPath(item, `${path}.setValue[${index++}]`, seen);
      if (failure) return failure;
    }
  } else {
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) continue;
      const failure = unsupportedPath(descriptor.value, Array.isArray(value) ? `${path}[${key}]` : childPath(path, key), seen);
      if (failure) return failure;
    }
  }
  try {
    structuredClone(value);
  } catch {
    return path;
  }
  return void 0;
}
function cloneValue(value, label, path, development) {
  try {
    return structuredClone(value);
  } catch (cause) {
    let failurePath = path;
    if (development) {
      try {
        failurePath = unsupportedPath(value, path, /* @__PURE__ */ new WeakSet()) ?? path;
      } catch {
      }
    }
    throw new ValenceError(
      `${label} contains a value that cannot cross Electron IPC at ${failurePath}.`,
      "VALENCE_SERIALIZATION",
      { cause }
    );
  }
}

export {
  cloneValue
};
//# sourceMappingURL=chunk-6R3S4TEQ.js.map