/* otakuroad service worker — offline map for a tourist without roaming (PLAN §9 M6).
 *
 * Three caches:
 *  - shell-<build>: the app shell precached at install (every hashed asset under /_astro/, the two
 *    map pages, the manifest, icons, the 404 page). The list is filled in by scripts/build-sw.mjs
 *    after `astro build`; a new build gets a new cache and the old one is dropped on activate.
 *  - ofm: everything from tiles.openfreemap.org — style, TileJSON, sprites, glyphs and vector
 *    tiles. Tile paths carry the build date, so they are immutable and served cache-first; the
 *    style and TileJSON are served from cache but refreshed in the background.
 *  - pages: same-origin HTML and photos seen while online, so a store page opened once reads
 *    again offline. HTML is network-first (a correction merged today must win), photos cache-first.
 *
 * Store data itself is bundled into the map island, so the map and every card work from the shell
 * alone; the tiles for all of Akihabara are warmed by the page (src/lib/tiles.ts) on the first
 * online visit.
 */
const BUILD = '__BUILD__'
const SHELL = `shell-${BUILD}`
const OFM = 'ofm-v1'
const PAGES = 'pages-v1'
const PRECACHE = /* __PRECACHE__ */ []
const MAX_PAGES = 300

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

const isTileHost = (url) => url.hostname === 'tiles.openfreemap.org'
const isImmutableTile = (url) => /\/\d{8}_\d{6}_[a-z]+\/\d+\/\d+\/\d+\.pbf$/.test(url.pathname) || url.pathname.startsWith('/fonts/') || url.pathname.startsWith('/sprites/')

async function cacheFirst(cacheName, request) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  if (response.ok) cache.put(request, response.clone())
  return response
}

async function staleWhileRevalidate(cacheName, request) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(request)
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone())
      return response
    })
    .catch(() => hit)
  return hit || refresh
}

async function networkFirst(cacheName, request, fallbackUrl) {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(request)
    if (response.ok) {
      cache.put(request, response.clone())
      trimCache(cache)
    }
    return response
  } catch {
    const hit = await cache.match(request)
    if (hit) return hit
    if (fallbackUrl) {
      const shell = await caches.open(SHELL)
      const fallback = await shell.match(fallbackUrl)
      if (fallback) return fallback
    }
    return new Response('offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
  }
}

async function trimCache(cache) {
  const keys = await cache.keys()
  if (keys.length <= MAX_PAGES) return
  for (const key of keys.slice(0, keys.length - MAX_PAGES)) await cache.delete(key)
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  if (isTileHost(url)) {
    event.respondWith(isImmutableTile(url) ? cacheFirst(OFM, request) : staleWhileRevalidate(OFM, request))
    return
  }
  if (url.origin !== self.location.origin) return

  if (url.pathname.startsWith('/_astro/')) {
    event.respondWith(cacheFirst(SHELL, request))
    return
  }
  if (url.pathname.startsWith('/photos/') || /\.(png|svg|webmanifest|ico)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(PAGES, request))
    return
  }
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    const lang = url.pathname.startsWith('/en/') ? 'en' : 'ko'
    event.respondWith(networkFirst(PAGES, request, `/${lang}/`))
  }
})
