/**
 * `npm run build` runs this after `astro build`: fills dist/sw.js with the app-shell precache list
 * (every hashed asset under /_astro/, the map pages, manifest, icons, 404) and a build id derived
 * from that list, so a deploy that changes any shell file installs a fresh service worker.
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const DIST = join(ROOT, 'dist')

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const file = join(dir, name)
    if (statSync(file).isDirectory()) out.push(...walk(file))
    else out.push(file)
  }
  return out
}

const assets = walk(join(DIST, '_astro'))
  .map((f) => '/' + relative(DIST, f).split('\\').join('/'))
  .filter((p) => /\.(js|css|woff2?)$/.test(p))
  .sort()
const shell = ['/ko/', '/en/', '/404.html', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/apple-touch-icon.png']
const precache = [...shell, ...assets]

const build = createHash('sha256').update(precache.join('\n')).digest('hex').slice(0, 12)
const swPath = join(DIST, 'sw.js')
const source = readFileSync(swPath, 'utf8')
if (!source.includes('__BUILD__') || !source.includes('/* __PRECACHE__ */')) {
  throw new Error('dist/sw.js does not carry the __BUILD__ / __PRECACHE__ placeholders')
}
const output = source.replace('__BUILD__', build).replace('/* __PRECACHE__ */ []', JSON.stringify(precache))
writeFileSync(swPath, output)
console.log(`sw.js: build ${build}, ${precache.length} precached files (${assets.length} under /_astro/)`)
