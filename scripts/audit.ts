/**
 * `npm run audit` — suspicion audit, not a gate.
 *
 * `validate` enforces the data contract; this script looks for the patterns that in practice preceded a
 * wrong record: coordinates copied between shops, an OSM id that belongs to a different venue, a
 * tenant filed at the wrong address, hours whose prose disagrees with the rules, a record whose only
 * evidence is a directory listing or an archived page. Every finding is a lead for re-verification,
 * never proof. Nothing here fails CI.
 *
 * Usage: tsx scripts/audit.ts [--json] [--code <code>] [--min <low|mid|high>]
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Building, Store } from '../src/data/schema'
import { DATA_DIR, loadDataset, type Excluded } from './lib/data'

export type Severity = 'high' | 'mid' | 'low'

export interface AuditFinding {
  code: string
  severity: Severity
  /** `store <id>` or `building <id>`. */
  subject: string
  message: string
}

interface OsmElement {
  osm_id: string
  lat: number
  lng: number
  name: string
  [tag: string]: string | number | undefined
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SEVERITY_RANK: Record<Severity, number> = { low: 0, mid: 1, high: 2 }

/** Metres between two points (equirectangular is fine for a 1.5 km box). */
export function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const midLat = (((a.lat + b.lat) / 2) * Math.PI) / 180
  return R * Math.sqrt(dLat * dLat + Math.pow(dLng * Math.cos(midLat), 2))
}

export function normalizeName(name: string): string {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s　・·\-–—_'’"“”「」『』()（）\[\]【】.,。、!！?？&＆+/:：]/g, '')
}

/** `東京都千代田区外神田1-15-16 秋葉原ラジオ会館3F` → `外神田1-15-16` (or `外神田1-15` when the 号 is missing). */
export function addressBlock(addressJa: string): string | null {
  const s = addressJa.normalize('NFKC')
  const m = s.match(
    /(外神田|神田佐久間町|神田花岡町|神田相生町|神田練塀町|神田松永町|神田平河町|神田和泉町|神田佐久間河岸|神田須田町|神田淡路町|神田錦町|神田岩本町|岩本町|東上野|上野|台東|湯島|秋葉原)(\d+)(?:丁目)?\s*[-−–ー]?\s*(\d+)?(?:番地?|番)?\s*[-−–ー]?\s*(\d+)?(?:号)?/,
  )
  if (!m) return null
  const [, area, chome, ban, go] = m
  if (!ban) return `${area}${chome}`
  return go ? `${area}${chome}-${ban}-${go}` : `${area}${chome}-${ban}`
}

/** The address with its 丁目-番-号 removed, so digits of the block are never mistaken for floors. */
function afterBlock(addressJa: string): string {
  const s = addressJa.normalize('NFKC')
  const m = s.match(/(?:外神田|神田[一-龥]+|岩本町|東上野|上野|台東|湯島|秋葉原)\d+(?:丁目)?\s*[-−–ー]?\s*\d*(?:番地?|番)?\s*[-−–ー]?\s*\d*(?:号)?/)
  return m ? s.slice((m.index ?? 0) + m[0].length) : s
}

const FLOOR_IN_ADDRESS = /(B|地下|地階)?(\d{1,2})(?:F|階)(?![A-Za-z])/gi

/** Floor labels named in an address string, e.g. `…ビル3F` → [`3F`], `地下1階` → [`B1F`]. */
export function floorsInAddress(addressJa: string): string[] {
  const s = afterBlock(addressJa).replace(/\s*(?:F|階)/g, (m) => m.trim())
  const out = new Set<string>()
  for (const m of s.matchAll(FLOOR_IN_ADDRESS)) {
    const basement = m[1] !== undefined
    const n = Number(m[2])
    if (!Number.isFinite(n) || n === 0 || n > 20) continue
    out.add(basement ? `B${n}F` : `${n}F`)
  }
  // `1F~3F`, `2・3F`, `B1F・1F`: expand ranges and lists between two floor tokens.
  for (const m of s.matchAll(/(B?\d{1,2})F?\s*([~〜～\-–])\s*(B?\d{1,2})F/g)) {
    if (m[1].startsWith('B') || m[3].startsWith('B')) continue
    const a = Number(m[1])
    const b = Number(m[3])
    if (a > 0 && b > 0 && a < b && b <= 20) for (let n = a; n <= b; n++) out.add(`${n}F`)
  }
  for (const m of s.matchAll(/((?:\d{1,2}[・･,、])+\d{1,2})F/g)) {
    for (const part of m[1].split(/[・･,、]/)) {
      const n = Number(part)
      if (n > 0 && n <= 20) out.add(`${n}F`)
    }
  }
  return [...out]
}

const TIME_RANGE = /(\d{1,2}):(\d{2})\s*(?:~|〜|～|-|–|—|to|부터|から)\s*(\d{1,2}):(\d{2})/g

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** Time ranges written in prose, normalised to `HH:MM-HH:MM`. */
export function timeRangesInText(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(TIME_RANGE)) {
    const open = `${pad(Number(m[1]))}:${m[2]}`
    const close = `${pad(Number(m[3]))}:${m[4]}`
    out.push(`${open}-${close}`)
  }
  return out
}

const DIRECTORY_HOSTS = [
  'akihabara-cardmap.com',
  'torecamap.co.jp',
  'akibatoreka.com',
  'akihabara-cardshop.com',
  'con-cafe.jp',
  'tabelog.com',
  'map.yahoo.co.jp',
  'msearch.gsi.go.jp',
  'homes.co.jp',
  'openstreetmap.org',
  'wikipedia.org',
  'wikimedia.org',
  'prtimes.jp',
  'akiba-pc.watch.impress.co.jp',
  'akiba-souken.com',
  'akiba.or.jp',
  'akiba-asterisk.blog.jp',
  'hotpepper.jp',
  'gnavi.co.jp',
  'retty.me',
  'ekiten.jp',
  'navitime.co.jp',
  'mapion.co.jp',
  'itp.ne.jp',
  'jalan.net',
  'tripadvisor.com',
  'tripadvisor.jp',
  'web.archive.org',
  'archive.org',
  'youtube.com',
  'tiktok.com',
  'note.com',
  'ameblo.jp',
  'hatenablog.com',
  'google.com',
  'goo.gl',
]

/** A shop's own social account counts as first-party evidence, but posts go stale and X cannot be read anonymously. */
const SNS_HOSTS = ['x.com', 'twitter.com', 'instagram.com', 'facebook.com']

/** Addresses that are several buildings or a long structure under the tracks (decision 2026-09-05: not modelled as buildings). */
const MULTI_BUILDING_BLOCKS = new Set(['外神田4-4-3', '外神田4-3-1', '神田佐久間町1-6-1', '外神田1-17-6'])

const GOOGLE_MAPS = /(?:google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google)/i

function host(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

function isDirectoryHost(h: string): boolean {
  return DIRECTORY_HOSTS.some((d) => h === d || h.endsWith(`.${d}`))
}

function isSnsHost(h: string): boolean {
  return SNS_HOSTS.some((d) => h === d || h.endsWith(`.${d}`))
}

/** `https://web.archive.org/web/20190402…/…` → `2019-04-02`. */
function archiveDate(url: string): string | null {
  const m = url.match(/web\.archive\.org\/web\/(\d{4})(\d{2})(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

/** An announced closure or move, or a shop that is currently shut — not "閉店 30 minutes before" (closing time). */
const ANNOUNCED_CHANGE = /閉店(?:予定|します|いたします|することに)|移転(?:予定|します|いたします|することに)|will (?:close|move|relocate)|is (?:closing|moving|relocating)|scheduled to (?:close|move)|closes (?:on \\d|on (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)|at the end of)|moves (?:on \\d|on (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)|at the end of)|permanently closed|closed permanently|폐점(?:할 예정|할 계획| 예정|한다)|이전(?:할 예정|할 계획| 예정|한다고|합니다)|영업을 종료/i
const CURRENTLY_SHUT = /休業中|臨時休業中|当面の間(?:休業|休止)|temporarily closed|closed until|closed for renovation|휴업 중|휴업중|당분간 (?:휴업|휴점|휴무)|임시 ?휴업 중|영업 중단/i
/** Prose about a previous tenant or a past move to this site is not a signal about this shop. */
const ABOUT_SOMEONE_ELSE = /(?:폐점한|閉店した|移転した|이전한|이전해 온|moved here|moved to this|moved in|former|previously|자리|跡地|이전 전|before (?:the|its) move)/i

const GENERIC_TOKENS = new Set(['아키하바라', '아키하바라점', '아키바', '점', '본점', '秋葉原', '秋葉原店', 'akihabara', 'akiba', 'store', 'shop', 'the', 'and', '라디오회관', '라디오회관점', 'ラジオ会館', 'ラジオ会館店', 'radio', 'kaikan', '컬처즈존', '컬처즈존점', 'cultures', 'zone', 'カルチャーズゾーン', '카페', 'cafe', 'カフェ', '매장', '本店', '2号店', '2호점', 'honten', 'tokyo', '도쿄', '東京'])

const R18_TAGS = new Set(['r18', 'adult', '18plus', 'r_18', 'adult_only', 'adult_floor'])

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export interface AuditInput {
  stores: readonly Store[]
  buildings: readonly Building[]
  excluded: readonly Excluded[]
  osm: readonly OsmElement[]
}

export function audit({ stores, buildings, excluded, osm }: AuditInput): AuditFinding[] {
  const findings: AuditFinding[] = []
  const add = (code: string, severity: Severity, subject: string, message: string) =>
    findings.push({ code, severity, subject, message })

  const buildingsById = new Map(buildings.map((b) => [b.id, b]))
  const storesById = new Map(stores.map((s) => [s.id, s]))
  const osmById = new Map(osm.map((e) => [e.osm_id, e]))

  const tenantsByBuilding = new Map<string, Store[]>()
  for (const s of stores) {
    if (s.building_id === null) continue
    const list = tenantsByBuilding.get(s.building_id) ?? []
    list.push(s)
    tenantsByBuilding.set(s.building_id, list)
  }

  // --- 1. copied coordinates ----------------------------------------------
  const standalone = stores.filter((s) => s.location !== null)
  for (let i = 0; i < standalone.length; i++) {
    for (let j = i + 1; j < standalone.length; j++) {
      const a = standalone[i]
      const b = standalone[j]
      const d = metres(a.location!, b.location!)
      if (d > 2) continue
      const blockA = addressBlock(a.address_ja)
      const blockB = addressBlock(b.address_ja)
      const sameBlock = blockA !== null && blockA === blockB
      const sameBan = !sameBlock && blockA !== null && blockB !== null && blockA.split('-').slice(0, 2).join('-') === blockB.split('-').slice(0, 2).join('-')
      if (sameBlock) {
        add('coords_shared_same_address', 'low', `store ${a.id}`, `same pin as ${b.id} at ${blockA} — two standalone records in one building`)
      } else {
        add(
          'coords_shared',
          sameBan ? 'mid' : 'high',
          `store ${a.id}`,
          `identical pin as ${b.id} (${d.toFixed(1)} m) but the addresses differ (${blockA ?? '?'} vs ${blockB ?? '?'})${sameBan ? ' — neighbouring buildings, one pin was copied' : ' — one of them is copied'}`,
        )
      }
    }
  }
  for (const s of standalone) {
    for (const b of buildings) {
      const d = metres(s.location!, b.location)
      if (d <= 2) add('coords_shared_with_building', 'mid', `store ${s.id}`, `sits exactly on building ${b.id}'s pin (${d.toFixed(1)} m) but is not a tenant`)
    }
  }

  // --- 2. OSM id reuse / mismatch -----------------------------------------
  const osmUsers = new Map<string, string[]>()
  for (const s of stores) if (s.osm_id) osmUsers.set(s.osm_id, [...(osmUsers.get(s.osm_id) ?? []), `store ${s.id}`])
  for (const b of buildings) if (b.osm_id) osmUsers.set(b.osm_id, [...(osmUsers.get(b.osm_id) ?? []), `building ${b.id}`])
  for (const [id, users] of osmUsers) {
    if (users.length < 2) continue
    const storeUsers = users.filter((u) => u.startsWith('store '))
    const buildingUsers = users.filter((u) => u.startsWith('building '))
    if (storeUsers.length > 1 && id.startsWith('node/')) add('osm_id_reused', 'high', storeUsers[0], `osm node ${id} is also used by ${storeUsers.slice(1).join(', ')} — a node is one shop`)
    else if (buildingUsers.length === 0 && storeUsers.length > 1) add('osm_id_reused', 'mid', storeUsers[0], `osm way ${id} is shared by ${storeUsers.slice(1).join(', ')} — should this be a building?`)
  }
  for (const s of stores) {
    if (!s.osm_id) continue
    const el = osmById.get(s.osm_id)
    if (!el) {
      add('osm_id_not_in_extract', 'mid', `store ${s.id}`, `osm_id ${s.osm_id} is not in either cached Overpass extract — cannot be cross-checked (typo, or outside the query)`)
      continue
    }
    const names = [s.name.ja, s.name.en, s.name.ko, ...s.synonyms].map(normalizeName)
    const osmNames = [el.name, el['name:ja'], el['name:en'], el['brand'], el['brand:ja'], el['brand:en']]
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
      .map(normalizeName)
    const nameMatch = osmNames.some((o) => names.some((n) => n === o || (o.length >= 3 && n.includes(o)) || (n.length >= 3 && o.includes(n))))
    if (!nameMatch) {
      const isBuilding = typeof el['building'] === 'string' || s.osm_id.startsWith('way/')
      if (isBuilding) {
        const b = s.building_id ? buildingsById.get(s.building_id) : undefined
        if (b && b.osm_id === s.osm_id) add('osm_id_is_own_building', 'low', `store ${s.id}`, `osm_id ${s.osm_id} is the way of its own building ${b.id} — redundant on the tenant record`)
        else add('osm_id_is_building', 'low', `store ${s.id}`, `osm_id ${s.osm_id} is the building "${el.name}", not a node for the shop`)
      } else {
        add('osm_name_mismatch', 'high', `store ${s.id}`, `osm_id ${s.osm_id} is named "${el.name}" in OSM, which matches none of this record's names`)
      }
    }
    const point = s.location ?? (s.building_id ? buildingsById.get(s.building_id)?.location : undefined)
    if (point) {
      const d = metres(point, el)
      if (d > 60) add('osm_far', 'mid', `store ${s.id}`, `${d.toFixed(0)} m from its OSM element ${s.osm_id} ("${el.name}") — moved, or the wrong element`)
    }
  }
  for (const b of buildings) {
    if (!b.osm_id) continue
    const el = osmById.get(b.osm_id)
    if (!el) {
      add('osm_id_not_in_extract', 'low', `building ${b.id}`, `osm_id ${b.osm_id} is not in the cached extracts`)
      continue
    }
    const d = metres(b.location, el)
    if (d > 60) add('osm_far', 'mid', `building ${b.id}`, `${d.toFixed(0)} m from its OSM element ${b.osm_id} ("${el.name}")`)
  }

  // --- 3. address vs coordinates ------------------------------------------
  const byBlock = new Map<string, Store[]>()
  for (const s of standalone) {
    const block = addressBlock(s.address_ja)
    if (block === null) {
      add('address_unparsed', 'low', `store ${s.id}`, `address "${s.address_ja}" has no recognisable 丁目-番-号`)
      continue
    }
    if (block.split('-').length < 3) add('address_no_go', 'low', `store ${s.id}`, `address "${s.address_ja}" stops at the 番 (no 号) — too coarse to place a pin`)
    byBlock.set(block, [...(byBlock.get(block) ?? []), s])
  }
  for (const [block, list] of byBlock) {
    if (list.length < 2 || block.split('-').length < 3 || MULTI_BUILDING_BLOCKS.has(block)) continue
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const d = metres(list[i].location!, list[j].location!)
        if (d > 45) add('address_coords_spread', 'high', `store ${list[i].id}`, `shares address ${block} with ${list[j].id} but the pins are ${d.toFixed(0)} m apart — one address or pin is wrong`)
      }
    }
  }
  const buildingBlocks = new Map<string, Building>()
  for (const b of buildings) {
    const block = addressBlock(b.address_ja)
    if (block) buildingBlocks.set(block, b)
  }
  for (const s of standalone) {
    const block = addressBlock(s.address_ja)
    if (!block) continue
    const b = buildingBlocks.get(block)
    if (b && !MULTI_BUILDING_BLOCKS.has(block)) {
      const d = metres(s.location!, b.location)
      add('standalone_at_building_address', 'low', `store ${s.id}`, `address ${block} is building ${b.id}'s address (${d.toFixed(0)} m from its pin) but the store is standalone`)
    }
  }
  for (const s of stores) {
    if (s.building_id === null) continue
    const b = buildingsById.get(s.building_id)
    if (!b) continue
    const sb = addressBlock(s.address_ja)
    const bb = addressBlock(b.address_ja)
    if (sb && bb && sb !== bb) {
      add('tenant_address_mismatch', 'high', `store ${s.id}`, `filed in building ${b.id} (${bb}) but its own address says ${sb}`)
    }
  }

  // --- 4. floors -------------------------------------------------------------
  for (const s of stores) {
    const inAddress = floorsInAddress(s.address_ja)
    if (inAddress.length === 0) continue
    const missing = inAddress.filter((f) => !s.floors.includes(f))
    if (missing.length > 0 && s.floors.length > 0) {
      add('address_floor_mismatch', 'high', `store ${s.id}`, `address names floor ${missing.join('/')} but floors = [${s.floors.join(', ')}]`)
    }
    if (s.floors.length === 0) add('address_floor_missing', 'mid', `store ${s.id}`, `address names floor ${inAddress.join('/')} but floors is empty`)
  }
  for (const s of stores) {
    if (s.building_id === null) continue
    const b = buildingsById.get(s.building_id)
    if (!b) continue
    for (const f of s.floors) {
      const u = b.uncurated_floors.find((e) => e.floor === f)
      if (!u) continue
      const note = normalizeName(`${u.ko} ${u.en}`)
      const tokens = [s.name.ko, s.name.ja, s.name.en, ...s.synonyms]
        .flatMap((n) => n.split(/[\s　・·()（）「」]+/))
        .map(normalizeName)
        .filter((t) => t.length >= 2 && !GENERIC_TOKENS.has(t))
      if (!tokens.some((t) => note.includes(t))) {
        add('floor_double_booked', 'mid', `store ${s.id}`, `claims ${f} of ${b.id}, but the building's floor guide describes ${f} as "${u.ko.slice(0, 50)}" without naming this shop`)
      }
    }
  }
  for (const s of stores) {
    const tagR18 = s.tags.some((t) => R18_TAGS.has(t))
    const nameR18 = /MEN'?S|18禁|成人|アダルト|R-?18/i.test(`${s.name.ja} ${s.name.en}`)
    if ((tagR18 || nameR18) && s.adult_content.level === 'none') {
      add('adult_signal_unmarked', 'high', `store ${s.id}`, `${tagR18 ? 'tags' : 'name'} signal R-18 content but adult_content.level = none`)
    }
    const textR18 = /R-?18|成人向|18禁|아다루토|성인|adult/i.test(`${s.one_line.ko} ${s.one_line.en} ${s.floor_guide.map((f) => `${f.ko} ${f.en}`).join(' ')}`)
    if (textR18 && s.adult_content.level === 'none' && !tagR18 && !nameR18) {
      add('adult_signal_unmarked', 'mid', `store ${s.id}`, `one_line/floor_guide mention adult content but adult_content.level = none`)
    }
  }

  // --- 5. hours -------------------------------------------------------------
  for (const s of stores) {
    if (!s.hours) continue
    const subject = `store ${s.id}`
    const ruleRanges = new Set(s.hours.rules.map((r) => `${r.open}-${r.close}`))
    const ruleTimes = new Set(s.hours.rules.flatMap((r) => [r.open, r.close]))
    const unexplainedIn = (texts: (string | undefined)[]) =>
      [...new Set(timeRangesInText(texts.filter((t): t is string => typeof t === 'string').join('\n')))].filter(
        (r) => !ruleRanges.has(r) && !r.split('-').every((t) => ruleTimes.has(t)),
      )
    const inNote = unexplainedIn([s.hours.note?.ko, s.hours.note?.en])
    const inTips = unexplainedIn([...(s.tips?.ko ?? []), ...(s.tips?.en ?? []), s.one_line.ko, s.one_line.en])
    if (inNote.length > 0) add('hours_note_mismatch', 'low', subject, `hours.note mentions ${inNote.join(', ')} but the rules are ${[...ruleRanges].join(', ')}`)
    else if (inTips.length > 0) add('hours_prose_mismatch', 'low', subject, `tips mention ${inTips.join(', ')} but the rules are ${[...ruleRanges].join(', ')} (buyback desks and neighbours also get quoted)`)

    const days = new Set(s.hours.rules.flatMap((r) => r.days))
    const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
    const missingDays = weekdays.filter((d) => !days.has(d))
    const rh = `${s.hours.regular_holiday?.ko ?? ''} ${s.hours.regular_holiday?.en ?? ''}`
    const saysNoHoliday = /연중무휴|무휴|year-round|no regular|open daily|every day|年中無休|無休|없음/i.test(rh)
    if (saysNoHoliday && missingDays.length > 0) {
      add('hours_holiday_conflict', 'mid', subject, `regular_holiday says "${rh.trim()}" but the rules skip ${missingDays.join('/')}`)
    }
    const dayWords: Record<(typeof weekdays)[number], RegExp> = {
      mon: /월요일|Monday|Mondays|月曜/i,
      tue: /화요일|Tuesday|Tuesdays|火曜/i,
      wed: /수요일|Wednesday|Wednesdays|水曜/i,
      thu: /목요일|Thursday|Thursdays|木曜/i,
      fri: /금요일|Friday|Fridays|金曜/i,
      sat: /토요일|Saturday|Saturdays|土曜/i,
      sun: /일요일|Sunday|Sundays|日曜/i,
    }
    for (const [d, re] of Object.entries(dayWords) as [(typeof weekdays)[number], RegExp][]) {
      if (re.test(rh) && days.has(d) && !/제\s*\d|first|second|third|fourth|last|第\d|매월|monthly|불규칙|irregular|부정기|except|다음|대체|following|next|instead|振替|翌|공휴일이면|if .* holiday/i.test(rh)) {
        add('hours_holiday_conflict', 'mid', subject, `regular_holiday names ${d} ("${rh.trim().slice(0, 40)}") but the rules open on ${d}`)
      }
    }
    if (!days.has('hol') && days.size >= 6 && ruleRanges.size > 1) {
      add('hours_no_hol_rule', 'low', subject, `weekday and weekend hours differ but there is no "hol" rule — a public holiday falls through to the weekday hours`)
    }

    const h = host(s.hours.source_url)
    if (h && isDirectoryHost(h)) {
      const arch = archiveDate(s.hours.source_url)
      add('hours_source_secondhand', 'high', subject, arch ? `hours come from an archived page snapshot dated ${arch}` : `hours.source_url is ${h}, not the shop's own page (PLAN §7.4: official pages only)`)
    } else if (h && isSnsHost(h)) {
      add('hours_source_sns', 'low', subject, `hours come from ${h} — a dated post, and X cannot be read without logging in`)
    }
    if (!s.source_urls.includes(s.hours.source_url)) add('hours_source_not_listed', 'mid', subject, `hours.source_url is not in source_urls`)
  }
  for (const s of stores) {
    if (s.hours === null && s.priority <= 2) add('hours_missing_priority', 'low', `store ${s.id}`, `priority ${s.priority} store with hours: null`)
  }

  // --- 6. provenance ---------------------------------------------------------
  for (const s of stores) {
    const subject = `store ${s.id}`
    const all = [...s.source_urls, s.official_url ?? '', s.hours?.source_url ?? '', s.sns.x ?? '', s.sns.instagram ?? ''].filter(Boolean)
    for (const u of all) if (GOOGLE_MAPS.test(u)) add('source_google_maps', 'high', subject, `Google Maps link used as evidence: ${u}`)

    const hosts = s.source_urls.map(host).filter((x): x is string => x !== null)
    const firstParty = hosts.filter((x) => !isDirectoryHost(x))
    if (firstParty.length === 0) {
      add('source_secondhand_only', 'high', subject, `no first-party source at all — only ${[...new Set(hosts)].join(', ')}`)
    } else if (firstParty.every(isSnsHost)) {
      add('source_sns_only', 'mid', subject, `the only first-party evidence is social media (${[...new Set(firstParty)].join(', ')})`)
    }
    const archives = s.source_urls.map(archiveDate).filter((d): d is string => d !== null)
    if (archives.length > 0) {
      const newest = archives.sort().at(-1)!
      if (s.official_url === null) add('source_archived_official', 'high', subject, `official site only survives in web.archive.org (newest snapshot ${newest}) — is the shop still open?`)
      else if (newest < '2025-01-01') add('source_old_archive', 'mid', subject, `cites an archived snapshot from ${newest}`)
    }
    if (s.official_url) {
      const oh = host(s.official_url)
      if (oh && !hosts.includes(oh)) add('official_not_read', 'mid', subject, `official_url ${s.official_url} is not among source_urls — was it actually read?`)
    }
    if (s.tax_free === true) {
      const mentions = /免税|tax-?free|면세/i.test([...(s.tips?.ko ?? []), ...(s.tips?.en ?? []), s.one_line.ko, s.one_line.en].join(' '))
      if (!mentions) add('tax_free_unexplained', 'mid', subject, `tax_free = true but no tip or note mentions tax-free — the seed pass found unsourced tax-free claims`)
    }
  }

  // --- 7. closure signals in prose ---------------------------------------------
  for (const s of stores) {
    if (s.status.state !== 'open') continue
    const prose = [s.one_line.ko, s.one_line.en, s.how_to_find?.ko, s.how_to_find?.en, s.hours?.note?.ko, s.hours?.note?.en, ...(s.tips?.ko ?? []), ...(s.tips?.en ?? []), s.status.note?.ko, s.status.note?.en]
      .filter((t): t is string => typeof t === 'string')
    let hit: { code: string; severity: Severity; text: string; index: number; length: number } | null = null
    for (const t of prose) {
      const sentences = t.split(/(?<=[.。!?])\s+/)
      for (const sentence of sentences) {
        if (ABOUT_SOMEONE_ELSE.test(sentence)) continue
        const a = sentence.match(ANNOUNCED_CHANGE)
        if (a) {
          hit = { code: 'change_announced_while_open', severity: 'high', text: sentence, index: a.index ?? 0, length: a[0].length }
          break
        }
        const c = sentence.match(CURRENTLY_SHUT)
        if (c && !hit) hit = { code: 'possibly_shut_now', severity: 'mid', text: sentence, index: c.index ?? 0, length: c[0].length }
      }
      if (hit?.severity === 'high') break
    }
    if (hit) {
      const start = Math.max(0, hit.index - 40)
      add(hit.code, hit.severity, `store ${s.id}`, `status open, but prose says "…${hit.text.slice(start, hit.index + hit.length + 40)}…"`)
    }
  }

  // --- 8. duplicates by name ---------------------------------------------------
  const nameIndex = new Map<string, string[]>()
  const push = (key: string, id: string) => {
    if (key.length < 3) return
    const list = nameIndex.get(key) ?? []
    if (!list.includes(id)) list.push(id)
    nameIndex.set(key, list)
  }
  for (const s of stores) {
    push(normalizeName(s.name.ja), s.id)
    push(normalizeName(s.name.en), s.id)
    push(normalizeName(s.name.ko), s.id)
  }
  for (const s of stores) {
    for (const syn of s.synonyms) {
      const key = normalizeName(syn)
      const owners = nameIndex.get(key)
      if (owners && owners.some((o) => o !== s.id)) {
        add('synonym_is_another_store', 'mid', `store ${s.id}`, `synonym "${syn}" is the name of ${owners.filter((o) => o !== s.id).join(', ')}`)
      }
    }
  }
  for (const [key, ids] of nameIndex) {
    if (ids.length > 1) add('name_shared', 'mid', `store ${ids[0]}`, `name "${key}" is also the name of ${ids.slice(1).join(', ')}`)
  }
  const excludedKeys = new Map<string, string>()
  for (const e of excluded) {
    excludedKeys.set(normalizeName(e.name_ja), e.name_ja)
    if (e.name_en) excludedKeys.set(normalizeName(e.name_en), e.name_ja)
  }
  for (const s of stores) {
    for (const cand of [s.name.en, ...s.synonyms]) {
      const hit = excludedKeys.get(normalizeName(cand))
      if (hit) {
        add('excluded_name_in_synonyms', 'mid', `store ${s.id}`, `"${cand}" matches excluded.json entry "${hit}"`)
        break
      }
    }
  }

  // --- 9. status follow-ups -----------------------------------------------------
  for (const s of stores) {
    if (s.status.state === 'relocating' && s.status.effective_date) {
      add('relocating_pending', 'low', `store ${s.id}`, `relocating on ${s.status.effective_date}${s.status.successor_id ? ` → ${s.status.successor_id}` : ' with no successor record yet'}`)
      if (s.status.successor_id && !storesById.has(s.status.successor_id)) add('successor_missing', 'high', `store ${s.id}`, `successor ${s.status.successor_id} does not exist`)
    }
  }

  // --- 10. photos ---------------------------------------------------------------
  for (const s of stores) {
    if (s.photo?.taken_on && s.photo.taken_on.slice(0, 4) < '2016') add('photo_old', 'low', `store ${s.id}`, `photo taken ${s.photo.taken_on}`)
  }

  return findings.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.code.localeCompare(b.code) || a.subject.localeCompare(b.subject))
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function loadOsm(dataDir: string): OsmElement[] {
  const dir = join(dataDir, 'osm')
  if (!existsSync(dir)) return []
  const out: OsmElement[] = []
  for (const name of ['overpass-akihabara-wide-2026-09-04.json', 'overpass-akihabara-2026-09-04.json']) {
    const file = join(dir, name)
    if (!existsSync(file)) continue
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { elements: OsmElement[] }
    out.push(...parsed.elements)
  }
  return out
}

export function runAudit(argv: string[] = process.argv.slice(2), dataDir: string = DATA_DIR): AuditFinding[] {
  const json = argv.includes('--json')
  const codeArg = argv.indexOf('--code')
  const onlyCode = codeArg >= 0 ? argv[codeArg + 1] : null
  const minArg = argv.indexOf('--min')
  const minSeverity: Severity = minArg >= 0 ? (argv[minArg + 1] as Severity) : 'low'

  const ds = loadDataset(dataDir)
  const findings = audit({
    stores: ds.stores.map((s) => s.value),
    buildings: ds.buildings.map((b) => b.value),
    excluded: ds.excluded,
    osm: loadOsm(dataDir),
  }).filter((f) => SEVERITY_RANK[f.severity] >= SEVERITY_RANK[minSeverity] && (onlyCode === null || f.code === onlyCode))

  if (json) {
    console.log(JSON.stringify(findings, null, 1))
    return findings
  }

  const byCode = new Map<string, AuditFinding[]>()
  for (const f of findings) byCode.set(f.code, [...(byCode.get(f.code) ?? []), f])
  const mark: Record<Severity, string> = { high: '‼', mid: '!', low: '·' }
  for (const [code, list] of byCode) {
    console.log(`\n${mark[list[0].severity]} ${code} (${list.length})`)
    for (const f of list) console.log(`  ${f.subject}: ${f.message}`)
  }
  const subjects = new Set(findings.map((f) => f.subject))
  const bySeverity = (sev: Severity) => findings.filter((f) => f.severity === sev).length
  console.log(`\n${findings.length} findings (${bySeverity('high')} high · ${bySeverity('mid')} mid · ${bySeverity('low')} low) across ${subjects.size} records`)
  return findings
}

const isEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isEntrypoint) runAudit()
