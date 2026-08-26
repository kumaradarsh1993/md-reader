// Tauri doesn't have a Node.js server to do proper SSR
// so we use adapter-static with a fallback to index.html to put the site in SPA mode
// See: https://svelte.dev/docs/kit/single-page-apps
// See: https://v2.tauri.app/start/frontend/sveltekit/ for more info
export const ssr = false;

// Development only, and only when `?devmock=1` asks for it: stand in for the
// Tauri backend so the UI can be opened, driven and screenshotted in a plain
// browser. `import.meta.env.DEV` is statically false in a production build, so
// the whole module is tree-shaken out of the shipped bundle. See devmock.ts.
if (import.meta.env.DEV) {
  const { installDevMock } = await import("$lib/devmock");
  installDevMock();
}
