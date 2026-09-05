// Re-fetch each change's evidence_url and confirm the quoted text is really on the page.
// usage: node check-evidence.mjs <results-dir> [--only id,id]
// Writes <results-dir>/../evidence-report.json and prints a summary.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const [resultsDir, ...rest] = process.argv.slice(2)
const onlyArg = rest.indexOf('--only')
const only = onlyArg >= 0 ? new Set(rest[onlyArg + 1].split(',')) : null

// The social sites themselves need a login; X's syndication endpoints do not, so only match the exact hosts.
const UNFETCHABLE = /^(?:x\.com|mobile\.x\.com|twitter\.com|mobile\.twitter\.com|instagram\.com|facebook\.com|m\.facebook\.com)$/

function normalize(t) {
  return t
    .normalize('NFKC')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;|&emsp;|&ensp;|&thinsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[\s　]+/g, '')
    .replace(/[〜~～]/g, '~')
    .replace(/[－‐‑–—ー]/g, '-')
    .replace(/[：]/g, ':')
    .toLowerCase()
}

function stripHtml(html) {
  // Attribute values carry evidence too: meta descriptions, image alt text, link targets.
  const attrs = []
  for (const m of html.matchAll(/\s(?:content|alt|title|href|aria-label|data-title)=["']([^"']{3,2000})["']/gi)) attrs.push(m[1])
  return `${attrs.join('\n')}\n${html}`
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
}

function shingles(s, k = 8) {
  const out = new Set()
  for (let i = 0; i + k <= s.length; i++) out.add(s.slice(i, i + k))
  return out
}

function match(pageNorm, quote) {
  const q = normalize(quote)
  if (q.length === 0) return { ok: false, score: 0, how: 'empty quote' }
  if (pageNorm.includes(q)) return { ok: true, score: 1, how: 'exact' }
  const sh = shingles(q)
  if (sh.size === 0) return { ok: pageNorm.includes(q), score: 0, how: 'short' }
  let hit = 0
  for (const s of sh) if (pageNorm.includes(s)) hit++
  const score = hit / sh.size
  return { ok: score >= 0.6, score: Number(score.toFixed(2)), how: 'shingles' }
}

/** If the body is JSON, return every string value on its own line (decodes \n and \uXXXX escapes); else null. */
function flattenJson(text) {
  const t = text.trim()
  if (!(t.startsWith('{') || t.startsWith('['))) return null
  try {
    const out = []
    const walk = (v) => {
      if (typeof v === 'string') out.push(v)
      else if (Array.isArray(v)) v.forEach(walk)
      else if (v && typeof v === 'object') Object.values(v).forEach(walk)
    }
    walk(JSON.parse(t))
    return out.join('\n')
  } catch {
    return null
  }
}

/** Decode with the declared charset, but fall back to Shift_JIS / EUC-JP when the result is full of replacement characters. */
function decodeBest(buf, charset) {
  const tryDecode = (cs) => {
    try {
      return new TextDecoder(cs, { fatal: false }).decode(buf)
    } catch {
      return null
    }
  }
  const bad = (t) => (t.match(/\uFFFD/g) ?? []).length
  let best = tryDecode(charset) ?? buf.toString('utf8')
  if (bad(best) > 20) {
    for (const cs of ['shift_jis', 'euc-jp', 'utf-8']) {
      const t = tryDecode(cs)
      if (t && bad(t) < bad(best)) best = t
    }
  }
  return best
}

const cache = new Map()
async function fetchText(url) {
  if (cache.has(url)) return cache.get(url)
  let result
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    if (UNFETCHABLE.test(host)) result = { status: 'unfetchable', text: '' }
    else {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 20000)
      const get = (ua) =>
        fetch(url, {
          signal: ctrl.signal,
          redirect: 'follow',
          headers: { 'user-agent': ua, accept: 'text/html,application/xhtml+xml,*/*;q=0.8', 'accept-language': 'ja,en;q=0.8' },
        })
      let res = await get('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 otakuroad-verify/1.0')
      // Some shop sites block ordinary browsers from abroad but serve crawlers; a 403 is worth one retry.
      if (res.status === 403) res = await get('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')
      clearTimeout(timer)
      const buf = Buffer.from(await res.arrayBuffer())
      const ct = res.headers.get('content-type') ?? ''
      let text
      const m = ct.match(/charset=([^;]+)/i)
      const headCharset = buf.slice(0, 4096).toString('latin1').match(/charset=["']?([\w-]+)/i)
      const charset = (m?.[1] ?? headCharset?.[1] ?? 'utf-8').toLowerCase()
      text = decodeBest(buf, charset)
      result = { status: res.ok ? 'ok' : `http ${res.status}`, text: res.ok ? normalize(flattenJson(text) ?? stripHtml(text)) : '' }
      // X's syndication feed rate-limits per IP; the fxtwitter mirror serves the same profile bio as JSON.
      if (res.status === 429) {
        const m = url.match(/syndication\.twitter\.com\/srv\/timeline-profile\/screen-name\/([A-Za-z0-9_]+)/)
        if (m) {
          const alt = await fetchText(`https://api.fxtwitter.com/${m[1]}`)
          if (alt.status === 'ok') result = { status: 'ok (via fxtwitter bio)', text: alt.text }
        }
      }
    }
  } catch (e) {
    // Node's fetch rejects incomplete certificate chains that browsers and curl (system trust store) accept.
    try {
      const out = execFileSync('curl', ['-sL', '-m', '25', '-A', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36', '-w', '\n__HTTP__%{http_code}', url], { maxBuffer: 20_000_000 })
      const raw = out.toString('latin1')
      const codeMatch = raw.match(/__HTTP__(\d{3})\s*$/)
      const code = codeMatch ? Number(codeMatch[1]) : 0
      const body = out.subarray(0, out.length - (codeMatch ? codeMatch[0].length : 0))
      const headCharset = body.subarray(0, 4096).toString('latin1').match(/charset=["']?([\w-]+)/i)
      const text = decodeBest(body, (headCharset?.[1] ?? 'utf-8').toLowerCase())
      result = code >= 200 && code < 300 ? { status: 'ok', text: normalize(stripHtml(text)) } : { status: `curl http ${code}`, text: '' }
    } catch {
      result = { status: `error ${e.name === 'AbortError' ? 'timeout' : e.message}`, text: '' }
    }
  }
  cache.set(url, result)
  return result
}

const files = readdirSync(resultsDir).filter((f) => f.endsWith('.json'))
const report = []
for (const f of files) {
  const id = f.replace(/\.json$/, '')
  if (only && !only.has(id)) continue
  let r
  try {
    r = JSON.parse(readFileSync(join(resultsDir, f), 'utf8'))
  } catch (e) {
    report.push({ id, error: `invalid JSON: ${e.message}` })
    continue
  }
  const items = [...(r.changes ?? []).map((c, i) => ({ kind: 'change', i, path: c.path, url: c.evidence_url, quote: c.quote })), ...(r.closure ? [{ kind: 'closure', i: 0, path: 'closure', url: r.closure.evidence_url, quote: r.closure.quote }] : [])]
  const checks = []
  for (const it of items) {
    if (!it.url || !it.quote) {
      checks.push({ ...it, status: 'missing', ok: false })
      continue
    }
    if (/^no primary source/i.test(it.quote)) {
      checks.push({ ...it, status: 'null-hours', ok: true })
      continue
    }
    const page = await fetchText(it.url)
    if (!page.status.startsWith('ok')) {
      checks.push({ ...it, status: page.status, ok: false })
      continue
    }
    const m = match(page.text, it.quote)
    checks.push({ ...it, status: m.ok ? `verified (${m.how} ${m.score})` : `NOT FOUND (${m.score})`, ok: m.ok })
  }
  report.push({ id, verdict: r.verdict, checks })
}
writeFileSync(join(resultsDir, '..', 'evidence-report.json'), JSON.stringify(report, null, 1))

let total = 0
let ok = 0
for (const r of report) {
  if (r.error) {
    console.log(`✗ ${r.id}: ${r.error}`)
    continue
  }
  for (const c of r.checks) {
    total++
    if (c.ok) ok++
    else console.log(`? ${r.id} ${c.kind}:${c.path} → ${c.status} ${c.url ?? ''}`)
  }
}
console.log(`\n${ok}/${total} evidence quotes verified on their pages (${report.length} results)`)
