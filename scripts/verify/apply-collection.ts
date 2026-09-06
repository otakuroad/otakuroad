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
import { Building, Store } from '../../src/data/schema'
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

const written: string[] = []
const held: string[] = []
const skipped: string[] = []

for (const file of readdirSync(resultsDir).filter((f) => f.endsWith('.json')).sort()) {
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
    continue
  }
  const parsed = Store.safeParse(r.record)
  if (!parsed.success) {
    held.push(`${leadId}: schema — ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
    continue
  }
  const record = parsed.data
  if (stores.some((s) => s.id === record.id) || existsSync(join(ROOT, 'data/stores', `${record.id}.json`))) {
    held.push(`${leadId}: id "${record.id}" already exists`)
    continue
  }
  const building: Building | undefined = buildings.find((b) => b.id === record.building_id)
  if (record.building_id !== null && !building) {
    held.push(`${leadId}: building ${record.building_id} not found`)
    continue
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
    continue
  }
  // Cross-checks with the record added.
  const { errors } = crossCheck([...stores, record], buildings, dataset.excluded)
  const mine = errors.filter((e) => e.subject === `store ${record.id}`)
  if (mine.length > 0) {
    held.push(`${leadId}: ${mine.map((e) => e.message).join('; ')}`)
    continue
  }
  if (!dry) {
    writeFileSync(join(ROOT, 'data/stores', `${record.id}.json`), JSON.stringify(record, null, 1) + '\n')
    backlog.remaining = backlog.remaining.filter((e) => e.id !== leadId)
  }
  stores.push(record)
  written.push(`${leadId} → ${record.id} (${record.confidence}${record.hours ? ', hours' : ', hours null'})`)
}
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
