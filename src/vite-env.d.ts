/**
 * Vite's `?inline` CSS import. The map island uses it for `maplibre-gl.css`: imported normally,
 * Astro hoists that 83 kB stylesheet into a render-blocking `<link>` in the page head, which is
 * exactly the "map island blocks first paint" problem PLAN §11 says to avoid. Imported inline it
 * travels with the lazy MapLibre chunk and is injected only once the map is actually starting.
 */
declare module '*.css?inline' {
  const css: string
  export default css
}

/**
 * Vite's `?worker&url` import: bundles the referenced worker together with its own dependency
 * graph and hands back the emitted URL. MapLibre GL 6 ships its worker as a separate ES module and
 * finds it at runtime with `new URL('./maplibre-gl-worker.mjs', import.meta.url)` — a computed
 * specifier no bundler can follow, so the file is never emitted and every vector tile silently
 * fails to parse (the basemap renders as a flat background colour with no roads or labels). The map
 * island therefore emits the worker itself and points MapLibre at it with `setWorkerUrl`.
 */
declare module '*?worker&url' {
  const url: string
  export default url
}
