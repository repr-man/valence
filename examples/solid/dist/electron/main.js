import { BrowserWindow, app, dialog, ipcMain } from "electron";
import { fileURLToPath, pathToFileURL } from "node:url";
import { AsyncLocalStorage } from "async_hooks";
import { readFile } from "node:fs/promises";
import { hostname, platform, release } from "node:os";
//#region dist/chunk-BJL53WIL.js
var ValenceError = class extends Error {
	code;
	constructor(message, code, options) {
		super(message, options);
		this.name = "ValenceError";
		this.code = code;
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
//#endregion
//#region dist/chunk-LKPOUUD5.js
var invocationStorage = new AsyncLocalStorage();
var INVOKE_CHANNEL = "__valence_invoke__";
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
//#endregion
//#region dist/runtime/main.js
var registry = /* @__PURE__ */ new Map();
var registeredWindows = /* @__PURE__ */ new Map();
var installed = false;
function registerMain(id, fn, meta) {
	if (!isIdentifier(id) || typeof fn !== "function") throw new ValenceError("A main registration requires a valid ID and function.", "VALENCE_INVALID_REGISTRATION");
	if (registry.has(id)) throw new ValenceError(`Duplicate main function ID: ${id}`, "VALENCE_DUPLICATE_ID");
	registry.set(id, {
		fn,
		...meta === void 0 ? {} : { meta: Object.freeze({ ...meta }) }
	});
}
function localUrl(value) {
	const url = new URL(value);
	const file = url.protocol === "file:" && (url.hostname === "" || url.hostname === "localhost");
	const loopback = (url.protocol === "http:" || url.protocol === "https:") && [
		"localhost",
		"127.0.0.1",
		"[::1]"
	].includes(url.hostname);
	if (!file && !loopback || url.username || url.password) throw new ValenceError("Registered content must use a local file or a loopback HTTP(S) URL.", "VALENCE_INVALID_WINDOW_POLICY");
	url.search = "";
	url.hash = "";
	return url;
}
function registerWindow(window, policy) {
	if (window.isDestroyed() || window.webContents.isDestroyed()) throw new ValenceError("Cannot register a destroyed BrowserWindow.", "VALENCE_INVALID_WINDOW");
	if (!Array.isArray(policy.allowedUrls) || policy.allowedUrls.length === 0) throw new ValenceError("registerWindow() requires at least one allowed content URL.", "VALENCE_INVALID_WINDOW_POLICY");
	const sender = window.webContents;
	if (registeredWindows.has(sender)) throw new ValenceError("BrowserWindow is already registered.", "VALENCE_DUPLICATE_WINDOW");
	const urls = policy.allowedUrls.map(localUrl);
	let active = true;
	const registration = {
		window,
		sender,
		urls,
		allowSameOrigin: policy.allowSameOrigin === true,
		unregister() {
			if (!active) return;
			active = false;
			if (registeredWindows.get(sender) === registration) registeredWindows.delete(sender);
			window.removeListener("closed", registration.unregister);
		}
	};
	registeredWindows.set(sender, registration);
	window.once("closed", registration.unregister);
	return registration.unregister;
}
function trustedFrame(event) {
	const sender = event.sender;
	const registration = registeredWindows.get(sender);
	const frame = event.senderFrame;
	if (!registration || sender.isDestroyed() || registration.window.isDestroyed() || BrowserWindow.fromWebContents(sender) !== registration.window || !frame || frame !== sender.mainFrame || frame.parent !== null) throw new ValenceError("This sender is not authorized to invoke main functions.", "VALENCE_UNAUTHORIZED");
	let url;
	try {
		url = localUrl(frame.url);
	} catch {
		throw new ValenceError("The sender is not displaying authorized content.", "VALENCE_UNAUTHORIZED");
	}
	if (!registration.urls.some((configured) => configured.href === url.href || registration.allowSameOrigin && configured.protocol !== "file:" && configured.origin === url.origin)) throw new ValenceError("The sender is not displaying authorized content.", "VALENCE_UNAUTHORIZED");
	return frame;
}
function installMainRuntime(options = {}) {
	if (installed) throw new ValenceError("The Valence main runtime is already installed.", "VALENCE_RUNTIME_INSTALLED");
	const development = options.development === true;
	const authorizeInvocation = options.authorizeInvocation;
	if (authorizeInvocation !== void 0 && typeof authorizeInvocation !== "function") throw new ValenceError("authorizeInvocation must be a function.", "VALENCE_INVALID_AUTHORIZATION");
	ipcMain.handle(INVOKE_CHANNEL, async (event, payload, ...extra) => {
		let callId = "invalid";
		try {
			const senderFrame = trustedFrame(event);
			if (extra.length !== 0 || !isInvokeRequest(payload)) throw new ValenceError("Invalid Valence invocation request.", "VALENCE_INVALID_REQUEST");
			callId = payload.callId;
			const registered = registry.get(payload.id);
			if (!registered) throw new ValenceError(`Unknown main function ID: ${payload.id}`, "VALENCE_UNKNOWN_FUNCTION");
			const args = cloneValue(payload.args, `Arguments for ${registered.meta?.name ?? payload.id}`, "args", development);
			const context = Object.freeze({
				event,
				sender: event.sender,
				senderFrame,
				functionId: payload.id,
				callId,
				...registered.meta === void 0 ? {} : { meta: registered.meta }
			});
			if (authorizeInvocation && await authorizeInvocation(Object.freeze({
				...context,
				args
			})) !== true) throw new ValenceError("The application rejected this main invocation.", "VALENCE_UNAUTHORIZED");
			if (trustedFrame(event) !== senderFrame) throw new ValenceError("The invocation document changed during authorization.", "VALENCE_UNAUTHORIZED");
			return await invocationStorage.run(context, async () => {
				const value = await registered.fn(...args);
				return {
					protocol: 1,
					callId,
					ok: true,
					value: cloneValue(value, `Return value of ${registered.meta?.name ?? payload.id}`, "return", development)
				};
			});
		} catch (error) {
			if (callId === "invalid" && isRecord(payload) && isIdentifier(payload.callId)) callId = payload.callId;
			return {
				protocol: 1,
				callId,
				ok: false,
				error: serializeError(error, development)
			};
		}
	});
	installed = true;
	let active = true;
	return () => {
		if (!active) return;
		active = false;
		ipcMain.removeHandler(INVOKE_CHANNEL);
		installed = false;
		for (const registration of registeredWindows.values()) registration.unregister();
	};
}
//#endregion
//#region examples/solid/src/routes/index.tsx?valence-main=val_3dXSJ_yaS50R6mLK
async function openNote() {
	const result = await dialog.showOpenDialog({
		title: "Choose a text file",
		properties: ["openFile"],
		filters: [{
			name: "Text files",
			extensions: [
				"txt",
				"md",
				"json"
			]
		}]
	});
	if (result.canceled || !result.filePaths[0]) return null;
	const path = result.filePaths[0];
	return {
		path,
		text: await readFile(path, "utf8")
	};
}
//#endregion
//#region examples/solid/src/lib/system.ts?valence-main=val_BmeReQB5kBXuPxFT
async function getSystemSummary() {
	return {
		hostname: hostname(),
		platform: platform(),
		release: release()
	};
}
//#endregion
//#region \0virtual:valence/registry
registerMain("val_3dXSJ_yaS50R6mLK", openNote, {
	"source": "/home/repr/Desktop/valence/examples/solid/src/routes/index.tsx",
	"name": "src/routes/index.tsx#App/openNote"
});
registerMain("val_BmeReQB5kBXuPxFT", getSystemSummary, {
	"source": "/home/repr/Desktop/valence/examples/solid/src/lib/system.ts",
	"name": "src/lib/system.ts#getSystemSummary"
});
//#endregion
//#region \0virtual:valence/main-entry
var lifecycle = {};
var configuredWindow = {};
var preload = fileURLToPath(new URL("./preload.cjs", import.meta.url));
var renderer = fileURLToPath(new URL("../renderer/index.html", import.meta.url));
var development = false;
process.setSourceMapsEnabled?.(true);
var disposeRuntime = () => {};
async function createWindow() {
	const window = new BrowserWindow({
		width: 1e3,
		height: 760,
		...configuredWindow,
		webPreferences: {
			...configuredWindow.webPreferences,
			contextIsolation: true,
			nodeIntegration: false,
			nodeIntegrationInSubFrames: false,
			sandbox: true,
			preload
		}
	});
	const target = pathToFileURL(renderer).href;
	registerWindow(window, {
		allowedUrls: [target],
		allowSameOrigin: development
	});
	window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
	const restrictNavigation = (event, destination) => {
		try {
			const next = new URL(destination);
			if (!(next.protocol === "file:" && next.pathname === new URL(target).pathname)) event.preventDefault();
		} catch {
			event.preventDefault();
		}
	};
	window.webContents.on("will-navigate", restrictNavigation);
	window.webContents.on("will-redirect", restrictNavigation);
	window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
	await window.loadFile(renderer, void 0);
	return window;
}
app.on("activate", () => {
	if (!BrowserWindow.getAllWindows().length) createWindow().catch((error) => {
		console.error(error);
		app.exit(1);
	});
});
app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});
var quitting = false;
app.on("before-quit", (event) => {
	if (quitting || !lifecycle.beforeQuit) return;
	event.preventDefault();
	quitting = true;
	Promise.resolve().then(() => lifecycle.beforeQuit({ app })).catch((error) => console.error("[valence] beforeQuit failed", error)).finally(() => app.quit());
});
app.on("will-quit", () => disposeRuntime());
app.whenReady().then(async () => {
	disposeRuntime = installMainRuntime({
		development,
		authorizeInvocation: lifecycle.security?.authorizeInvocation
	});
	const window = await createWindow();
	await lifecycle.ready?.({
		app,
		window,
		createWindow
	});
}).catch((error) => {
	console.error("[valence] Startup failed", error);
	app.exit(1);
});
//#endregion
export {};

//# sourceMappingURL=main.js.map