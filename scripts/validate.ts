/**
 * `npm run validate` — data contract gate (PLAN §7.3).
 * Per-file zod parsing lives in ./lib/data.ts; cross-record checks are the pure `crossCheck` below
 * (unit-tested in tests/validate.test.ts and reused by build-data.ts).
 */
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Building, Store } from '../src/data/schema'
import { loadDataset, type Excluded } from './lib/data'

export interface Finding {
  /** Stable machine-readable code, e.g. `building_missing`. */
  code: string
  /** What the finding is about, e.g. `store k-books`. */
  subject: string
  message: string
}

export interface CrossCheckResult {
  errors: Finding[]
  warnings: Finding[]
}

export interface CrossCheckOptions {
  /** `YYYY-MM-DD` used for date checks; defaults to today in Asia/Tokyo. */
  today?: string
  /** Records verified longer ago than this get a staleness warning (PLAN §8: 6 months). */
  staleAfterDays?: number
}

export function tokyoToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000)
}

/** Normalise a Japanese venue name for collision checks: NFKC, no whitespace, lower-case. */
function normalizeName(name: string): string {
  return name.normalize('NFKC').replace(/\s+/g, '').toLowerCase()
}

function groupBy<T>(items: readonly T[], key: (item: T) => string | null): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    if (k === null) continue
    const list = map.get(k)
    if (list) list.push(item)
    else map.set(k, [item])
  }
  return map
}

export function crossCheck(
  stores: readonly Store[],
  buildings: readonly Building[],
  excluded: readonly Excluded[] = [],
  options: CrossCheckOptions = {},
): CrossCheckResult {
  const today = options.today ?? tokyoToday()
  const staleAfterDays = options.staleAfterDays ?? 180
  const errors: Finding[] = []
  const warnings: Finding[] = []
  const error = (code: string, subject: string, message: string) => errors.push({ code, subject, message })
  const warn = (code: string, subject: string, message: string) => warnings.push({ code, subject, message })

  // --- id uniqueness -------------------------------------------------------
  const storesById = groupBy(stores, (s) => s.id)
  const buildingsById = groupBy(buildings, (b) => b.id)
  for (const [id, list] of storesById) {
    if (list.length > 1) error('duplicate_store_id', `store ${id}`, `id "${id}" is used by ${list.length} store records`)
  }
  for (const [id, list] of buildingsById) {
    if (list.length > 1) error('duplicate_building_id', `building ${id}`, `id "${id}" is used by ${list.length} building records`)
  }
  for (const id of storesById.keys()) {
    if (buildingsById.has(id)) warn('id_shared_with_building', `store ${id}`, `a building also uses id "${id}"`)
  }

  // --- per-store checks ----------------------------------------------------
  const chainMembers = groupBy(stores, (s) => s.chain)

  for (const s of stores) {
    const subject = `store ${s.id}`

    if (s.building_id !== null) {
      const building = buildingsById.get(s.building_id)?.[0]
      if (!building) {
        error('building_missing', subject, `building_id "${s.building_id}" does not exist in data/buildings`)
      } else {
        const missing = s.floors.filter((f) => !building.floors.includes(f))
        if (missing.length > 0) {
          error(
            'floor_not_in_building',
            subject,
            `floors [${missing.join(', ')}] are not in building "${building.id}" (${building.floors.join(', ')})`,
          )
        }
      }
      const adultOutside = s.adult_content.floors.filter((f) => !s.floors.includes(f))
      if (adultOutside.length > 0) {
        error('adult_floor_not_in_store', subject, `adult_content.floors [${adultOutside.join(', ')}] are not among the store's floors`)
      }
      if (s.location !== null) {
        warn('tenant_has_location', subject, 'tenant stores inherit the building pin; location is ignored (data/README.md)')
      }
    }

    const successor = s.status.successor_id
    if (successor !== undefined) {
      if (successor === s.id) error('successor_self', subject, 'status.successor_id points at itself')
      else if (!storesById.has(successor)) error('successor_missing', subject, `status.successor_id "${successor}" does not exist`)
    }
    if (s.status.state === 'relocating' || s.status.state === 'moved') {
      if (!s.status.effective_date) warn('status_date_missing', subject, `status.state=${s.status.state} without effective_date — the banner cannot show a date`)
      if (!successor) warn('status_successor_missing', subject, `status.state=${s.status.state} without successor_id — no link to the new record`)
    }
    if (s.status.state === 'relocating' && s.status.effective_date && s.status.effective_date < s.verified_at) {
      warn('status_date_stale', subject, `relocating with effective_date ${s.status.effective_date} before verified_at ${s.verified_at} — should this be "moved"?`)
    }

    if (s.verified_at > today) error('verified_in_future', subject, `verified_at ${s.verified_at} is after today (${today})`)
    else if (daysBetween(s.verified_at, today) > staleAfterDays) warn('stale', subject, `verified_at ${s.verified_at} is older than ${staleAfterDays} days`)

    if (s.hours) {
      const seenDays = new Set<string>()
      for (const rule of s.hours.rules) {
        const label = `${rule.days.join('/')} ${rule.open}-${rule.close}`
        if (rule.close <= rule.open) warn('hours_rule_order', subject, `hours rule "${label}" closes at or before it opens`)
        for (const day of rule.days) {
          if (seenDays.has(day)) warn('hours_day_overlap', subject, `day "${day}" appears in more than one hours rule`)
          seenDays.add(day)
        }
      }
    }

    if (s.confidence === 'low') warn('confidence_low', subject, 'confidence=low — excluded from the build')
  }

  // --- per-building checks -------------------------------------------------
  for (const b of buildings) {
    const subject = `building ${b.id}`
    const dupFloors = b.floors.filter((f, i) => b.floors.indexOf(f) !== i)
    if (dupFloors.length > 0) error('duplicate_floor', subject, `floors list repeats [${[...new Set(dupFloors)].join(', ')}]`)
    if (b.verified_at > today) error('verified_in_future', subject, `verified_at ${b.verified_at} is after today (${today})`)
    else if (daysBetween(b.verified_at, today) > staleAfterDays) warn('stale', subject, `verified_at ${b.verified_at} is older than ${staleAfterDays} days`)
  }

  // --- chains --------------------------------------------------------------
  // A chain with one member is normal while the dataset is small (other branches
  // are not curated yet), so this is one summary line rather than a warning per store.
  const lonelyChains = [...chainMembers].filter(([, members]) => members.length === 1).map(([chain]) => chain)
  if (lonelyChains.length > 0) {
    warn(
      'chain_single_member',
      'chains',
      `${lonelyChains.length} chain(s) have only one store so far — check for typos: ${lonelyChains.sort().join(', ')}`,
    )
  }

  // --- excluded.json must not resurrect ------------------------------------
  const excludedNames = new Map(excluded.map((e) => [normalizeName(e.name_ja), e.name_ja]))
  for (const s of stores) {
    const hit = excludedNames.get(normalizeName(s.name.ja))
    if (hit !== undefined) error('excluded_name_collision', `store ${s.id}`, `name.ja "${s.name.ja}" is listed in data/excluded.json ("${hit}")`)
  }

  return { errors, warnings }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const ESC = String.fromCharCode(27)
const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR
const paint = (code: number, text: string) => (useColor ? `${ESC}[${code}m${text}${ESC}[0m` : text)
const green = (t: string) => paint(32, t)
const red = (t: string) => paint(31, t)
const yellow = (t: string) => paint(33, t)
const dim = (t: string) => paint(2, t)

function printFinding(kind: 'error' | 'warning', f: Finding): void {
  const mark = kind === 'error' ? red('✗') : yellow('⚠')
  console.log(`${mark} ${f.subject}: ${f.message} ${dim(`[${f.code}]`)}`)
}

export function runValidate(dataDir?: string): number {
  const ds = loadDataset(dataDir)

  console.log('otakuroad validate')
  console.log(dim('  files'))
  for (const r of ds.reports) {
    if (r.issues.length === 0) console.log(`${green('✓')} ${r.file}`)
    else {
      console.log(`${red('✗')} ${r.file}`)
      for (const issue of r.issues) console.log(`    ${issue}`)
    }
  }
  if (ds.reports.length === 0) console.log(dim('  (no data files yet)'))

  const stores = ds.stores.map((s) => s.value)
  const buildings = ds.buildings.map((b) => b.value)
  const { errors, warnings } = crossCheck(stores, buildings, ds.excluded)

  if (errors.length > 0 || warnings.length > 0) {
    console.log(dim('  cross-checks'))
    for (const f of errors) printFinding('error', f)
    for (const f of warnings) printFinding('warning', f)
  }

  const fileErrors = ds.reports.reduce((n, r) => n + r.issues.length, 0)
  const errorCount = fileErrors + errors.length
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
  const summary = `${plural(stores.length, 'store')}, ${plural(buildings.length, 'building')}, ${ds.excluded.length} excluded · ${plural(errorCount, 'error')} · ${plural(warnings.length, 'warning')}`
  console.log('')
  console.log(errorCount > 0 ? red(summary) : green(summary))
  return errorCount > 0 ? 1 : 0
}

const isEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isEntrypoint) process.exitCode = runValidate()
