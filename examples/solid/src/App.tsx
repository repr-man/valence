import type { Component } from 'solid-js';
import { HashRouter, Route } from '@solidjs/router';

const routes = Object.entries(import.meta.glob<{ default: Component }>('./routes/**/*.tsx', { eager: true }))
  .map(([file, module]) => ({
    path: file.replace('./routes', '').replace(/\/index\.tsx$/, '').replace(/\.tsx$/, '') || '/',
    component: module.default,
  }));

export default function App() {
  return <HashRouter>{routes.map(({ path, component }) => <Route path={path} component={component} />)}
    <Route path="*" component={() => <main class="min-h-screen bg-[#f5f5f8] p-10 text-[#211f30]"><a class="text-[#7c6aa4] underline" href="#/">Back to the example</a><h1 class="mt-6 text-3xl font-semibold">Page not found</h1></main>} />
  </HashRouter>;
}
