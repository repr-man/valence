// packages/runtime/src/errors.ts
var ValenceError = class extends Error {
  code;
  constructor(message, code, options) {
    super(message, options);
    this.name = "ValenceError";
    this.code = code;
  }
};
var MainProcessUnavailableError = class extends ValenceError {
  constructor(message = "The Valence main process is unavailable.", options) {
    super(message, "VALENCE_MAIN_UNAVAILABLE", options);
    this.name = "MainProcessUnavailableError";
  }
};
function property(value, key) {
  try {
    if (typeof value === "object" && value !== null || typeof value === "function") {
      return Reflect.get(value, key);
    }
  } catch {
  }
  return void 0;
}
function describe(value) {
  try {
    return String(value);
  } catch {
    return "An unknown error was thrown.";
  }
}
function serializeError(value, development, seen = /* @__PURE__ */ new Set()) {
  if (seen.has(value) || seen.size >= 8) return { name: "Error", message: "Circular or deeply nested error cause." };
  seen.add(value);
  const name = property(value, "name");
  const message = property(value, "message");
  const stack = property(value, "stack");
  const code = property(value, "code");
  const cause = property(value, "cause");
  const result = {
    name: typeof name === "string" ? name : "Error",
    message: typeof message === "string" ? message : describe(value)
  };
  if (development && typeof stack === "string") result.stack = stack;
  if (typeof code === "string" || typeof code === "number" && Number.isFinite(code)) result.code = code;
  if (cause !== void 0) result.cause = serializeError(cause, development, seen);
  return result;
}
function restoreError(value, development) {
  const options = value.cause === void 0 ? void 0 : { cause: restoreError(value.cause, development) };
  const error = value.code === "VALENCE_MAIN_UNAVAILABLE" ? new MainProcessUnavailableError(value.message, options) : new Error(value.message, options);
  error.name = value.name;
  if (value.code !== void 0 && !Object.prototype.hasOwnProperty.call(error, "code")) {
    Object.defineProperty(error, "code", { value: value.code, enumerable: true });
  }
  if (development && value.stack) error.stack = `${error.stack ?? `${value.name}: ${value.message}`}

Main process:
${value.stack}`;
  return error;
}

export {
  ValenceError,
  MainProcessUnavailableError,
  serializeError,
  restoreError
};
//# sourceMappingURL=chunk-BJL53WIL.js.map