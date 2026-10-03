import { createSignal } from 'solid-js';
import { getDesktopInfo } from './lib/desktop';

type DesktopInfo = Awaited<ReturnType<typeof getDesktopInfo>>;

export default function App() {
  const [count, setCount] = createSignal(0);
  const [desktop, setDesktop] = createSignal<DesktopInfo | null>(null);
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal('');

  async function readDesktop() {
    setPending(true);
    setError('');
    try {
      setDesktop(await getDesktopInfo());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <main class="flex min-h-screen items-center bg-slate-50 px-6 py-12 text-slate-900 sm:px-12">
      <div class="mx-auto w-full max-w-3xl">
        <h1 class="text-4xl font-semibold tracking-tight sm:text-6xl">Your desktop app is ready.</h1>
        <p class="mt-6 max-w-xl text-lg leading-8 text-slate-600">
          Build with Solid, reach the desktop with Valence. Edit this screen and see your changes live.
        </p>
        <div class="mt-10 grid gap-5 sm:grid-cols-2">
          <section class="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 class="text-lg font-semibold">Make it yours</h2>
            <p class="mt-3 text-sm leading-6 text-slate-600">Start in <code>src/App.tsx</code>. Solid keeps the screen up to date as you work.</p>
            <button class="mt-6 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-900" onClick={() => setCount(value => value + 1)}>
              Clicks: {count()}
            </button>
          </section>
          <section class="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 class="text-lg font-semibold">Meet your desktop</h2>
            <p class="mt-3 text-sm leading-6 text-slate-600">Call an async main function as easily as any other function.</p>
            <button class="mt-6 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600 disabled:cursor-wait disabled:opacity-60" disabled={pending()} onClick={() => { void readDesktop(); }}>
              {pending() ? 'Reading…' : 'Read desktop info'}
            </button>
            <p class="mt-4 text-sm text-slate-600" aria-live="polite">
              {desktop() ? `${desktop()?.hostname} · ${desktop()?.platform}` : 'Run in Electron to access desktop features.'}
            </p>
            <p class="mt-2 break-words text-sm text-red-700" role="alert">{error()}</p>
          </section>
        </div>
        <p class="mt-8 text-sm leading-6 text-slate-500">SolidJS 2 · Vite · Electron · Valence</p>
      </div>
    </main>
  );
}
