import { A } from '@solidjs/router';
import { For } from 'solid-js';

const steps = [
  ['01', 'Keep the UI', 'Solid and Vite still own browser rendering.'],
  ['02', 'Mark a function', 'The directive moves one async function to main.'],
  ['03', 'Pass data', 'Arguments and results cross a narrow bridge.'],
];

export default function Guide() {
  return <main class="min-h-screen bg-[#f5f5f8] px-6 py-10 text-[#211f30] sm:px-10">
    <div class="mx-auto max-w-3xl">
      <A href="/" class="text-sm font-medium text-[#7c6aa4] hover:underline">← Back to the example</A>
      <h1 class="mt-12 text-4xl font-semibold tracking-tight sm:text-5xl">Your routes stay yours.</h1>
      <p class="mt-5 max-w-2xl text-base leading-7 text-[#777486]">This route is an ordinary Solid component discovered from <code class="rounded bg-white px-1.5 py-1 font-mono text-sm">src/routes</code>. Its main-process code lives beside the UI or in a helper module, without asking the route to move into an Electron-specific folder.</p>
      <div class="mt-10 grid gap-4 sm:grid-cols-3">
        <For each={steps}>{([n, title, body]) => <article class="rounded-2xl border border-[#e1deea] bg-white p-5"><span class="font-mono text-xs text-[#998abe]">{n}</span><h2 class="mt-4 font-semibold">{title}</h2><p class="mt-2 text-sm leading-6 text-[#817d8d]">{body}</p></article>}</For>
      </div>
      <A href="/" class="mt-9 inline-flex rounded-xl bg-[#554281] px-4 py-2.5 text-sm font-semibold text-white">Try the Electron actions</A>
    </div>
  </main>;
}
