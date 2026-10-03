let electron = require("electron");
//#region dist/chunk-BJL53WIL.js
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
		if (typeof value === "object" && value !== null || typeof value === "function") return Reflect.get(value, key);
	} catch {}
}
function describe(value) {
	try {
		return String(value);
	} catch {
		return "An unknown error was thrown.";
	}
}
function serializeError(value, development, seen = /* @__PURE__ */ new Set()) {
	if (seen.has(value) || seen.size >= 8) return {
		name: "Error",
		message: "Circular or deeply nested error cause."
	};
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
//#endregion
//#region dist/chunk-6R3S4TEQ.js
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
	} else for (const key of Object.keys(value)) {
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (!descriptor || !("value" in descriptor)) continue;
		const failure = unsupportedPath(descriptor.value, Array.isArray(value) ? `${path}[${key}]` : childPath(path, key), seen);
		if (failure) return failure;
	}
	try {
		structuredClone(value);
	} catch {
		return path;
	}
}
function cloneValue(value, label, path, development) {
	try {
		return structuredClone(value);
	} catch (cause) {
		let failurePath = path;
		if (development) try {
			failurePath = unsupportedPath(value, path, /* @__PURE__ */ new WeakSet()) ?? path;
		} catch {}
		throw new ValenceError(`${label} contains a value that cannot cross Electron IPC at ${failurePath}.`, "VALENCE_SERIALIZATION", { cause });
	}
}
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
	return Object.keys(value).length === 4 && [
		"protocol",
		"id",
		"callId",
		"args"
	].every((key) => Object.prototype.hasOwnProperty.call(value, key)) && value.protocol === 1 && isIdentifier(value.id) && isIdentifier(value.callId) && Array.isArray(value.args);
}
function isSerializedError(value, depth = 0) {
	if (!isRecord(value) || depth > 8) return false;
	return typeof value.name === "string" && typeof value.message === "string" && (value.stack === void 0 || typeof value.stack === "string") && (value.code === void 0 || typeof value.code === "string" || typeof value.code === "number" && Number.isFinite(value.code)) && (value.cause === void 0 || isSerializedError(value.cause, depth + 1));
}
function isInvokeResponse(value) {
	if (!isRecord(value) || value.protocol !== 1 || !isIdentifier(value.callId)) return false;
	if (Object.keys(value).length !== 4 || ![
		"protocol",
		"callId",
		"ok"
	].every((key) => Object.prototype.hasOwnProperty.call(value, key))) return false;
	return value.ok === true ? Object.prototype.hasOwnProperty.call(value, "value") : value.ok === false && Object.prototype.hasOwnProperty.call(value, "error") && isSerializedError(value.error);
}
//#endregion
//#region dist/runtime/preload.js
function exposeMainBridge(options = {}) {
	const development = options.development === true;
	const bridge = {
		development,
		async invoke(request) {
			if (!isInvokeRequest(request)) throw new ValenceError("Invalid main invocation request.", "VALENCE_INVALID_REQUEST");
			try {
				const args = cloneValue(request.args, `Arguments for main function ${request.id}`, "args", development);
				let response;
				try {
					response = await electron.ipcRenderer.invoke(INVOKE_CHANNEL, {
						...request,
						args
					});
				} catch (cause) {
					throw new MainProcessUnavailableError("The main process could not complete the invocation.", { cause });
				}
				if (!isInvokeResponse(response) || response.callId !== request.callId) throw new ValenceError("Invalid response from the main process.", "VALENCE_INVALID_RESPONSE");
				return response;
			} catch (error) {
				return {
					protocol: request.protocol,
					callId: request.callId,
					ok: false,
					error: serializeError(error, development)
				};
			}
		}
	};
	electron.contextBridge.exposeInMainWorld(BRIDGE_NAME, Object.freeze(bridge));
}
//#endregion
//#region \0virtual:valence/preload-entry
exposeMainBridge({ development: false });
//#endregion

//# sourceMappingURL=preload.cjs.map