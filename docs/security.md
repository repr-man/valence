# Security

Every marked function has the authority of Electron's main process. Treat each one as a privileged entry point and keep its job narrow. Prefer a function that opens a dialog and reads a user-selected file over a general file-read function that accepts any path.

Valence creates windows with context isolation and renderer sandboxing enabled and Node integration disabled. Its generated preload exposes one constrained invocation method; it does not expose `ipcRenderer` or general Electron APIs. Keep that generated boundary in place and do not add a second bridge.

The default runtime accepts invocations only from registered Valence windows displaying their explicitly trusted local content and from the main frame. It rejects unauthorized senders before dispatch. Add `security.authorizeInvocation` for application-specific policy; the hook must return `true` to authorize. Use a self-contained function for simple policy, `{ module: './src/security/policy.ts', export: 'authorizeInvocation' }` when policy needs imports, or lifecycle `security.authorizeInvocation` when it needs application state.

```ts
// src/security/policy.ts
import type { AuthorizationContext } from 'valence/runtime/main';

export async function authorizeInvocation(context: AuthorizationContext) {
  return context.meta?.name === 'src/files.ts#chooseAndReadTextFile';
}
```

Enable this example with `valence({ security: { authorizeInvocation: { module: './src/security/policy.ts', export: 'authorizeInvocation' } } })`. It permits the file-picker function from Getting started in both development and production, after Valence's mandatory sender checks. It denies other functions; adapt the allowlist to your app using the display names in `dist/manifests/valence.json`.

The module reference is main-process-only. The `AuthorizationContext` import above is type-only; it does not install the runtime. Inline callbacks are serialized into the generated main entry and cannot capture values from the Vite config's surrounding scope. Function metadata includes the source and display name; use metadata rather than generated function IDs for policy decisions.

If the app loads remote or user-controlled content, do not grant it access to the preload capability. Restrict navigation and new windows, use trusted local content, and validate the invoking frame for each privileged request. IPC arguments and results must be structured-cloneable. Avoid returning secrets or broad capabilities to the renderer.

Review Electron's [security checklist](https://www.electronjs.org/docs/latest/tutorial/security) and [context isolation guide](https://www.electronjs.org/docs/latest/tutorial/context-isolation) alongside the app's threat model.
