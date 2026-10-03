// packages/runtime/src/protocol.ts
var PROTOCOL_VERSION = 1;
var INVOKE_CHANNEL = "__valence_invoke__";
var BRIDGE_NAME = "__valence";
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isIdentifier(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
}
function isInvokeRequest(value) {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 4 && ["protocol", "id", "callId", "args"].every((key) => Object.prototype.hasOwnProperty.call(value, key)) && value.protocol === PROTOCOL_VERSION && isIdentifier(value.id) && isIdentifier(value.callId) && Array.isArray(value.args);
}
function isSerializedError(value, depth = 0) {
  if (!isRecord(value) || depth > 8) return false;
  return typeof value.name === "string" && typeof value.message === "string" && (value.stack === void 0 || typeof value.stack === "string") && (value.code === void 0 || typeof value.code === "string" || typeof value.code === "number" && Number.isFinite(value.code)) && (value.cause === void 0 || isSerializedError(value.cause, depth + 1));
}
function isInvokeResponse(value) {
  if (!isRecord(value) || value.protocol !== PROTOCOL_VERSION || !isIdentifier(value.callId)) return false;
  const keys = Object.keys(value);
  if (keys.length !== 4 || !["protocol", "callId", "ok"].every((key) => Object.prototype.hasOwnProperty.call(value, key))) return false;
  return value.ok === true ? Object.prototype.hasOwnProperty.call(value, "value") : value.ok === false && Object.prototype.hasOwnProperty.call(value, "error") && isSerializedError(value.error);
}

export {
  PROTOCOL_VERSION,
  INVOKE_CHANNEL,
  BRIDGE_NAME,
  isRecord,
  isIdentifier,
  isInvokeRequest,
  isInvokeResponse
};
//# sourceMappingURL=chunk-WLD7LUEZ.js.map