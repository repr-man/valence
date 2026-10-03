import { createSignal, Show } from 'solid-js';
import { A } from '@solidjs/router';
import { dialog } from 'electron';
import { readFile } from 'node:fs/promises';
import { getSystemSummary } from '../lib/system';

type Note = { name: string; path: string; text: string };

export default function App() {
  const [note, setNote] = createSignal<Note | null>(null);
  const [system, setSystem] = createSignal<Awaited<ReturnType<typeof getSystemSummary>> | null>(null);
  const [error, setError] = createSignal('');
  const [busy, setBusy] = createSignal(false);

  async function openNote() {
    'use main';
    const result = await dialog.showOpenDialog({
      title: 'Choose a text file',
      properties: ['openFile'],
      filters: [{ name: 'Text files', extensions: ['txt', 'md', 'json'] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const path = result.filePaths[0];
    return { path, text: await readFile(path, 'utf8') };
  }

  async function run<T>(action: () => Promise<T>, onValue: (value: T) => void) {
    setBusy(true);
    setError('');
    try {
      onValue(await action());
    } catch (cause) {
      const unavailable = cause instanceof Error && cause.name === 'MainProcessUnavailableError';
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(unavailable
        ? 'Open this page in Electron to use main-process features. Start the app with pnpm dev.'
        : message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main class="min-h-screen bg-[#f5f5f8] text-[#211f30]">
      <div class="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-7 sm:px-10">
        <header class="flex items-center justify-between border-b border-[#e1deea] pb-5">
          <A class="flex items-center gap-3" href="/" aria-label="Valence home">
            <span class="grid size-9 place-items-center rounded-xl bg-[#554281] text-lg text-white">v</span>
            <span class="font-semibold tracking-tight">valence<span class="text-[#9c90bb]">/</span>solid</span>
          </A>
          <div class="flex items-center gap-4"><A href="/guide" class="text-xs font-medium text-[#66558c] hover:underline">How it works</A><span class="rounded-full border border-[#ddd8ea] bg-white px-3 py-1.5 text-xs font-medium text-[#66558c]">Electron + Vite</span></div>
        </header>

        <section class="grid flex-1 items-center gap-12 py-14 lg:grid-cols-[1fr_1fr] lg:py-20">
          <div>
            <h1 class="max-w-xl text-5xl font-semibold leading-[1.05] tracking-[-0.045em] sm:text-6xl">Build with Solid.<br /><span class="text-[#8273a4]">Reach beyond</span><br />the browser.</h1>
            <p class="mt-6 max-w-lg text-base leading-7 text-[#777486]">Keep your routes, components, and helpers in their usual places. Add a directive to a function when it needs native access, and keep the rest of the app familiar.</p>
            <div class="mt-9 flex flex-wrap gap-3">
              <button disabled={busy()} onClick={() => void run(openNote, value => setNote(value ? { ...value, name: value.path.split(/[\\/]/).pop() ?? 'Selected file' } : null))} class="rounded-xl bg-[#554281] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#675391] disabled:opacity-60">{busy() ? 'Working…' : 'Choose a local file'}<span class="ml-3" aria-hidden="true">↗</span></button>
              <button disabled={busy()} onClick={() => void run(getSystemSummary, setSystem)} class="rounded-xl border border-[#dedbe6] bg-white px-5 py-3 text-sm font-semibold text-[#56487a] transition hover:border-[#b8adcf] disabled:opacity-60">Read system details</button>
            </div>
            <Show when={error()}><p role="alert" class="mt-5 max-w-lg rounded-xl border border-[#ead1ce] bg-[#fff8f6] px-4 py-3 text-sm leading-6 text-[#8b4d4c]">{error()}</p></Show>
            <div class="mt-12 flex items-center gap-4 text-xs text-[#8c8999]"><span class="font-mono">src/routes/index.tsx</span><span class="h-px w-8 bg-[#d7d3e1]"></span><span>Solid stays in charge of the UI</span></div>
          </div>

          <div class="relative">
            <div class="absolute -inset-5 rounded-[2rem] bg-[#e9e6f1] blur-xl"></div>
            <section class="relative overflow-hidden rounded-[1.5rem] border border-[#e2deeb] bg-white shadow-[0_24px_70px_-36px_rgba(59,46,94,0.35)]">
              <div class="flex items-center gap-2 border-b border-[#f0eef4] px-5 py-4"><span class="size-2.5 rounded-full bg-[#e8a18a]"></span><span class="size-2.5 rounded-full bg-[#eac56f]"></span><span class="size-2.5 rounded-full bg-[#83b394]"></span><span class="ml-auto text-[11px] text-[#9692a1]">native capabilities</span></div>
              <div class="p-6 sm:p-8">
                <div class="flex items-start justify-between"><div><p class="text-sm font-semibold">Private file access</p><p class="mt-1 text-xs text-[#9692a1]">Choose what this app can read</p></div><span class="rounded-lg bg-[#f1eef8] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#6a588e]">Scoped</span></div>
                <Show when={note()} fallback={<div class="mt-7 grid min-h-44 place-items-center rounded-xl border border-dashed border-[#dfdbea] bg-[#fbfafc]"><div class="text-center"><span class="mx-auto grid size-10 place-items-center rounded-xl bg-white text-[#8773b4] shadow-sm">▤</span><p class="mt-3 text-sm font-medium text-[#625a72]">Waiting for a file</p><p class="mt-1 text-xs text-[#9995a3]">The dialog runs in Electron's main process</p></div></div>}>
                  {value => <div class="mt-7 rounded-xl border border-[#e8e5ee] bg-[#fbfafc] p-4"><p class="text-xs font-medium text-[#888398]">{value().name}</p><p class="mt-2 truncate font-mono text-[10px] text-[#75668f]">{value().path}</p><p class="mt-3 max-h-36 overflow-auto whitespace-pre-wrap text-xs leading-5 text-[#716d7b]">{value().text || 'This file is empty.'}</p></div>}
                </Show>
                <div class="mt-4 rounded-xl bg-[#302846] p-4 text-white"><div class="flex items-center justify-between"><span class="text-xs font-medium text-[#e3dff0]">Machine summary</span><span class="flex items-center gap-1.5 text-[10px] text-[#c3addf]"><span class="size-1.5 rounded-full bg-[#b49bd5]"></span> {system() ? 'responding' : 'awaiting call'}</span></div><Show when={system()} fallback={<p class="mt-2 text-xs leading-5 text-[#c6c0d2]">Request system details to see a live response.</p>}>
                  {value => <div class="mt-3 grid grid-cols-2 gap-3 text-[11px]"><div><p class="text-[#b0a6c8]">Host</p><p class="mt-1 truncate">{value().hostname}</p></div><div><p class="text-[#b0a6c8]">Platform</p><p class="mt-1 truncate">{value().platform} · {value().release}</p></div></div>}
                </Show></div>
              </div>
              <div class="border-t border-[#f0eef4] px-6 py-3 text-[10px] text-[#9995a3]">Only serializable values cross the bridge</div>
            </section>
          </div>
        </section>
        <footer class="flex flex-wrap items-center justify-between gap-3 border-t border-[#e1deea] pt-5 text-xs text-[#908c9c]"><span>Built with Solid, Vite, and Valence</span><span class="font-mono">use main → Electron</span></footer>
      </div>
    </main>
  );
}
