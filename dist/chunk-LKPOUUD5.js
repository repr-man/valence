import {
  ValenceError
} from "./chunk-BJL53WIL.js";

// packages/runtime/src/context.ts
import { AsyncLocalStorage } from "async_hooks";
var invocationStorage = new AsyncLocalStorage();
function getMainContext() {
  const context = invocationStorage.getStore();
  if (!context) throw new ValenceError("getMainContext() must be called inside a main function invocation.", "VALENCE_NO_CONTEXT");
  return context;
}

export {
  invocationStorage,
  getMainContext
};
//# sourceMappingURL=chunk-LKPOUUD5.js.map