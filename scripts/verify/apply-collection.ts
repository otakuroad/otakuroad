/**
 * Apply collection results: validate each proposed record with the zod schema and the cross-checks,
 * require verified evidence for the risk fields, write it to data/stores and drop the lead from
 * data/backlog.json.
 *
 * usage: tsx scripts/verify/apply-collection.ts <results-dir> [--dry] [--approve leadId:path,...]
 * Reads <results-dir>/../evidence-report.json written by check-evidence.mjs (which treats a result's
 * `evidence` array like `changes`).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AKIBA_BBOX, Building, Store } from '../../src/data/schema'
import { crossCheck } from '../validate'
import { loadDataset } from '../lib/data'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const [resultsDir, ...rest] = process.argv.slice(2)
const dry = rest.includes('--dry')
const approveArg = rest.indexOf('--approve')
const approve = new Set(approveArg >= 0 ? rest[approveArg + 1].split(',') : [])

/** Fields whose evidence must verify before the record is written. Others may stay at their defaults. */
const RISK_FIELDS = ['hours', 'floors', 'address_ja'] as const

interface EvidenceCheck {
  kind: string
  i: number
  path: string
  ok: boolean
  status: string
}
interface Report {
  id: string
  checks?: EvidenceCheck[]
}
const reportFile = join(resolve(resultsDir), '..', 'evidence-report.json')
const report = new Map<string, Report>(
  existsSync(reportFile) ? (JSON.parse(readFileSync(reportFile, 'utf8')) as Report[]).map((r) => [r.id, r]) : [],
)

const dataset = loadDataset()
const stores = dataset.stores.map((s) => s.value)
const buildings = dataset.buildings.map((b) => b.value)
const backlogFile = join(ROOT, 'data/backlog.json')
const backlog = JSON.parse(readFileSync(backlogFile, 'utf8')) as { remaining: { id: string }[] }

/** Normalise a name for duplicate detection. */
const normName = (t: string) => t.normalize('NFKC').replace(/[\s　・･（）()]/g, '').toLowerCase()
const existingNames = new Set(stores.map((s) => normName(s.name.ja)))

/**
 * Block-level geocode from the Geospatial Information Authority of Japan, the same source the
 * first collection used for standalone pins. Returns null when the address is outside the map box.
 */
async function geocode(addressJa: string): Promise<{ lat: number; lng: number; url: string } | null> {
  const q = addressJa.normalize('NFKC').replace(/〒\d{3}-\d{4}\s*/, '').replace(/\s+/g, '')
  const url = `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q)}`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const hits = (await res.json()) as { geometry?: { coordinates?: [number, number] }; properties?: { title?: string } }[]
    const first = hits[0]?.geometry?.coordinates
    if (!first) return null
    const [lng, lat] = first
    if (lat < AKIBA_BBOX.south || lat > AKIBA_BBOX.north || lng < AKIBA_BBOX.west || lng > AKIBA_BBOX.east) return null
    return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), url }
  } catch {
    return null
  }
}

const written: string[] = []
const held: string[] = []
const skipped: string[] = []

for (const file of readdirSync(resultsDir).filter((f) => f.endsWith('.json')).sort()) await (async () => {
  const leadId = file.replace(/\.json$/, '')
  const r = JSON.parse(readFileSync(join(resultsDir, file), 'utf8')) as {
    lead_id?: string
    publish?: boolean
    record?: unknown
    evidence?: { path: string; evidence_url: string; quote: string }[]
    notes?: string
  }
  if (!r.publish) {
    skipped.push(`${leadId}: publish=false — ${(r.notes ?? '').slice(0, 140)}`)
    return
  }
  // Standalone shops arrive without coordinates by design; geocode the official address first.
  const raw = r.record as Record<string, unknown> | undefined
  if (raw && raw.building_id == null && raw.location == null && typeof raw.address_ja === 'string') {
    const fix = await geocode(raw.address_ja)
    if (fix === null) {
      held.push(`${leadId}: could not geocode "${raw.address_ja}" inside the map box`)
      return
    }
    raw.location = { lat: fix.lat, lng: fix.lng }
    if (Array.isArray(raw.source_urls) && !raw.source_urls.includes(fix.url)) raw.source_urls.push(fix.url)
  }
  const parsed = Store.safeParse(r.record)
  if (!parsed.success) {
    held.push(`${leadId}: schema — ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
    return
  }
  const record = parsed.data
  if (stores.some((s) => s.id === record.id) || existsSync(join(ROOT, 'data/stores', `${record.id}.json`))) {
    held.push(`${leadId}: id "${record.id}" already exists`)
    return
  }
  if (existingNames.has(normName(record.name.ja))) {
    held.push(`${leadId}: a record named "${record.name.ja}" already exists`)
    return
  }
  const building: Building | undefined = buildings.find((b) => b.id === record.building_id)
  if (record.building_id !== null && !building) {
    held.push(`${leadId}: building ${record.building_id} not found`)
    return
  }
  // Evidence gate for the risk fields that are actually set.
  const ev = report.get(leadId)
  const evidence = r.evidence ?? []
  const problems: string[] = []
  for (const field of RISK_FIELDS) {
    const value = (record as Record<string, unknown>)[field]
    if (value === null || value === undefined) continue
    const idx = evidence.findIndex((e) => e.path === field || e.path.startsWith(`${field}.`))
    const key = `${leadId}:${field}`
    if (idx < 0) {
      if (!approve.has(key)) problems.push(`${field}: no evidence entry`)
      continue
    }
    const check = ev?.checks?.find((c) => c.kind === 'change' && c.i === idx)
    if (!(check?.ok || approve.has(key))) problems.push(`${field}: ${check?.status ?? 'no evidence check'}`)
  }
  if (problems.length > 0) {
    held.push(`${leadId}: ${problems.join('; ')}`)
    return
  }
  // Cross-checks with the record added.
  const { errors } = crossCheck([...stores, record], buildings, dataset.excluded)
  const mine = errors.filter((e) => e.subject === `store ${record.id}`)
  if (mine.length > 0) {
    held.push(`${leadId}: ${mine.map((e) => e.message).join('; ')}`)
    return
  }
  if (!dry) {
    writeFileSync(join(ROOT, 'data/stores', `${record.id}.json`), JSON.stringify(record, null, 1) + '\n')
    backlog.remaining = backlog.remaining.filter((e) => e.id !== leadId)
  }
  stores.push(record)
  existingNames.add(normName(record.name.ja))
  written.push(`${leadId} → ${record.id} (${record.confidence}${record.hours ? ', hours' : ', hours null'}${record.building_id ? '' : ', geocoded'})`)
})()
if (!dry && written.length > 0) writeFileSync(backlogFile, JSON.stringify(backlog, null, 1) + '\n')

const print = (title: string, list: string[]) => {
  if (list.length === 0) return
  console.log(`\n${title} (${list.length})`)
  for (const line of list) console.log(`  ${line}`)
}
print('written', written)
print('held', held)
print('skipped', skipped)
if (dry) console.log('\n(dry run — nothing written)')
