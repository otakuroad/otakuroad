// Apply agent verification results to data/stores.
// usage: node apply-results.mjs <results-dir> [--approve id:path,id:path] [--skip id:path,...] [--dry]
// Uses <results-dir>/../evidence-report.json: a change is applied only when its evidence was verified,
// or when it is listed in --approve. Closures remove the record and append to data/excluded.json.
import { existsSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const [resultsDir, ...rest] = process.argv.slice(2)
const flag = (name) => {
  const i = rest.indexOf(name)
  return i >= 0 ? new Set(rest[i + 1].split(',')) : new Set()
}
const approve = flag('--approve')
const skip = flag('--skip')
const dry = rest.includes('--dry')

const FORBIDDEN = new Set(['id', 'verified_at', 'source_urls', 'photo', 'photos', 'osm_id', 'location'])
const report = new Map(JSON.parse(readFileSync(join(resultsDir, '..', 'evidence-report.json'), 'utf8')).map((r) => [r.id, r]))

function setPath(obj, path, value) {
  const keys = path.split('.')
  let cur = obj
  for (const k of keys.slice(0, -1)) {
    if (cur[k] === null || typeof cur[k] !== 'object') cur[k] = {}
    cur = cur[k]
  }
  cur[keys.at(-1)] = value
}

const summary = { confirmed: [], corrected: [], closed: [], unverifiable: [], skipped: [], pending: [] }
const excludedFile = join(ROOT, 'data/excluded.json')
const excluded = JSON.parse(readFileSync(excludedFile, 'utf8'))
let excludedAdded = 0

for (const f of readdirSync(resultsDir).filter((x) => x.endsWith('.json')).sort()) {
  const r = JSON.parse(readFileSync(join(resultsDir, f), 'utf8'))
  const id = r.id ?? f.replace(/\.json$/, '')
  const file = join(ROOT, 'data/stores', `${id}.json`)
  if (!existsSync(file)) {
    summary.skipped.push(`${id}: no such record`)
    continue
  }
  const ev = report.get(id)
  const evidenceOk = (kind, i) => ev?.checks?.find((c) => c.kind === kind && c.i === i)?.ok === true
  const store = JSON.parse(readFileSync(file, 'utf8'))
  const applied = []
  const pending = []

  // closure
  if (r.closure && (r.verdict === 'closed' || r.verdict === 'moved')) {
    const key = `${id}:closure`
    if (skip.has(key)) summary.skipped.push(key)
    else if (evidenceOk('closure', 0) || approve.has(key)) {
      const entry = {
        name_ja: store.name.ja,
        name_en: store.name.en,
        reason: ['merged', 'moved_out_of_akiba', 'adult_only'].includes(r.closure.state) ? r.closure.state : 'closed',
        ...(r.closure.date ? { date: r.closure.date } : {}),
        note: [r.notes, r.closure.successor_note].filter(Boolean).join(' ').slice(0, 600),
        source_url: r.closure.evidence_url,
      }
      if (!dry) {
        excluded.entries.push(entry)
        unlinkSync(file)
      }
      excludedAdded++
      summary.closed.push(`${id} (${entry.reason}${entry.date ? ' ' + entry.date : ''})`)
      continue
    } else pending.push(`${key} → ${ev?.checks?.find((c) => c.kind === 'closure')?.status ?? 'no evidence check'}`)
  }

  // field changes
  ;(r.changes ?? []).forEach((c, i) => {
    const key = `${id}:${c.path}`
    const root = c.path.split('.')[0]
    if (FORBIDDEN.has(root)) {
      summary.skipped.push(`${key} (forbidden field)`)
      return
    }
    if (skip.has(key)) {
      summary.skipped.push(key)
      return
    }
    if (evidenceOk('change', i) || approve.has(key)) {
      setPath(store, c.path, c.to)
      applied.push(c.path)
    } else pending.push(`${key} → ${ev?.checks?.find((c2) => c2.kind === 'change' && c2.i === i)?.status ?? 'no evidence check'}`)
  })

  // sources, confidence, date
  const newSources = (r.add_source_urls ?? []).filter((u) => typeof u === 'string' && /^https?:\/\//.test(u) && !store.source_urls.includes(u))
  if (r.verdict !== 'unverifiable' || applied.length > 0) {
    store.source_urls = [...store.source_urls, ...newSources]
    if (store.hours && !store.source_urls.includes(store.hours.source_url)) store.source_urls.push(store.hours.source_url)
    if (['high', 'medium', 'low'].includes(r.confidence)) store.confidence = r.confidence
    store.verified_at = TODAY
  } else if (r.confidence === 'low') {
    store.confidence = 'low'
  }
  if (!dry) writeFileSync(file, JSON.stringify(store, null, 1) + '\n')

  const line = `${id}: ${applied.length ? applied.join(', ') : '-'}${newSources.length ? ` +${newSources.length} src` : ''}${pending.length ? ` | PENDING ${pending.join('; ')}` : ''}`
  if (pending.length) summary.pending.push(line)
  if (r.verdict === 'confirmed') summary.confirmed.push(line)
  else if (r.verdict === 'unverifiable') summary.unverifiable.push(line)
  else summary.corrected.push(line)
}
if (!dry && excludedAdded > 0) writeFileSync(excludedFile, JSON.stringify(excluded, null, 1) + '\n')

for (const [k, v] of Object.entries(summary)) {
  if (v.length === 0) continue
  console.log(`\n${k} (${v.length})`)
  for (const line of v) console.log(`  ${line}`)
}
if (dry) console.log('\n(dry run — nothing written)')
