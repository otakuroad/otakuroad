/**
 * Card and list-row text derivation: the location line and the badge row.
 *
 * Kept out of the components so the same strings can be asserted in tests and reused by the
 * prerendered share pages in M5.
 */
import type { Building, Photo, Store } from '@/data/schema'
import { CATEGORY_BY_KEY } from '@/data/categories'
import { t, type Locale, type MessageKey } from '@/i18n'
import { walkingMinutes, type Anchor } from './geo'
import { DAY_ORDER, type DayKey, type OpenState } from './hours'

export type BuildingIndex = ReadonlyMap<string, Building>

export function indexBuildings(buildings: readonly Building[]): BuildingIndex {
  return new Map(buildings.map((b) => [b.id, b]))
}

/** "B1F, 1F, 2F" → "B1F–2F" when the store occupies the whole run, else "3F·5F". */
export function formatFloors(floors: readonly string[]): string {
  if (floors.length === 0) return ''
  if (floors.length === 1) return floors[0] as string
  return `${floors[0]}–${floors[floors.length - 1]}`
}

/**
 * The "어디?" line (PLAN §5).
 * Tenant  → "아키하바라 라디오회관 3F"
 * Standalone → "주오도리 · 도보 4분"
 */
export function locationLine(
  store: Store,
  buildings: BuildingIndex,
  anchor: Anchor,
  locale: Locale,
): string {
  if (store.building_id !== null) {
    const building = buildings.get(store.building_id)
    const name = building ? building.name[locale] : store.building_id
    return t(locale, 'floor.at', { building: name, floor: formatFloors(store.floors) })
  }
  const parts: string[] = []
  if (store.street_segment !== null) parts.push(t(locale, `segment.${store.street_segment}` as MessageKey))
  if (store.location !== null) parts.push(t(locale, 'walk.minutes', { minutes: walkingMinutes(anchor, store.location) }))
  return parts.join(' · ')
}

/** The short right-hand column of a list row: "도보 4분" over the segment or floor range. */
export function listWhere(
  store: Store,
  buildings: BuildingIndex,
  anchor: Anchor,
  locale: Locale,
): { primary: string; secondary: string } {
  const primary =
    store.location === null ? '—' : t(locale, 'walk.minutes', { minutes: walkingMinutes(anchor, store.location) })
  if (store.building_id !== null) {
    const building = buildings.get(store.building_id)
    const name = building ? building.name[locale] : store.building_id
    return { primary, secondary: `${name} ${formatFloors(store.floors)}` }
  }
  const secondary =
    store.street_segment !== null
      ? t(locale, `segment.${store.street_segment}` as MessageKey)
      : formatFloors(store.floors)
  return { primary, secondary }
}

export type BadgeTone = 'neutral' | 'muted' | 'warn'

export interface Badge {
  key: string
  label: string
  tone: BadgeTone
}

/** "알아야 할 것" (PLAN §5): tax-free, cash-only, secondhand, R-18 floors, relocation status. */
export function badgesFor(store: Store, locale: Locale): Badge[] {
  const badges: Badge[] = []
  if (store.tax_free === true) badges.push({ key: 'tax_free', label: t(locale, 'badge.tax_free'), tone: 'neutral' })
  if (store.payment === 'cash_only')
    badges.push({ key: 'cash_only', label: t(locale, 'badge.cash_only'), tone: 'neutral' })
  if (store.secondhand === 'used' || store.secondhand === 'both')
    badges.push({ key: 'secondhand', label: t(locale, 'badge.secondhand'), tone: 'neutral' })
  if (store.adult_content.level === 'floor')
    badges.push({
      key: 'r18',
      label: `${t(locale, 'badge.r18_floor')} ${store.adult_content.floors.join('·')}`.trim(),
      tone: 'muted',
    })
  if (store.status.state !== 'open')
    badges.push({ key: 'status', label: t(locale, `badge.${store.status.state}`), tone: 'warn' })
  return badges
}

/** The dated banner at the top of a card. Also shown for `open` stores that carry a status note. */
export function statusBanner(store: Store, locale: Locale): { date: string | null; text: string } | null {
  const note = store.status.note
  const state = store.status.state
  if (state === 'open' && !note) return null
  const text = note ? note[locale] : state === 'open' ? '' : t(locale, `badge.${state}`)
  return { date: store.status.effective_date ?? null, text }
}

/**
 * "영업 종료 · 내일 11:00 오픈", or the weekday by name when the next opening is not tomorrow
 * (BEEP shuts on Wednesdays, so a Tuesday-night answer has to say "목요일 12:00 오픈").
 */
function closedForTodayText(state: OpenState, locale: Locale): string {
  if (state.nextChange === undefined || state.nextOpenInDays === undefined) {
    return t(locale, 'status.closed_for_today')
  }
  if (state.nextOpenInDays === 1) {
    return t(locale, 'status.closed_for_today_tomorrow', { open: state.nextChange })
  }
  const day = state.nextOpenDay === undefined ? '' : t(locale, `weekday.${state.nextOpenDay}` as MessageKey)
  return t(locale, 'status.closed_for_today_day', { day, open: state.nextChange })
}

/** Open-state text. Always paired with a colour, never replaced by one (PLAN §6.5). */
export function openStateText(state: OpenState, locale: Locale): string {
  switch (state.state) {
    case 'open':
      return t(locale, 'status.open', { close: state.nextChange ?? '' })
    case 'closing_soon':
      return t(locale, 'status.closing_soon', { minutes: state.minutesToClose ?? 0 })
    case 'before_open':
      return t(locale, 'status.before_open', { open: state.nextChange ?? '' })
    case 'closed_for_today':
      return closedForTodayText(state, locale)
    case 'closed_today':
      return t(locale, 'status.closed_today')
    default:
      return t(locale, 'status.unknown_hours')
  }
}

/** Short form for list rows and floor-stack rows, where the closing time already has its own column. */
export function openStateShort(state: OpenState, locale: Locale): string {
  switch (state.state) {
    case 'open':
      return t(locale, 'status.short_open')
    case 'closing_soon':
      return t(locale, 'status.closing_soon', { minutes: state.minutesToClose ?? 0 })
    case 'before_open':
      return t(locale, 'status.short_before_open')
    case 'closed_for_today':
      return t(locale, 'status.closed_for_today')
    case 'closed_today':
      return t(locale, 'status.closed_today')
    default:
      return t(locale, 'status.unknown_hours')
  }
}

/**
 * Compact "when does it open again" hint for a list row: "내일 11:00" / "목요일 12:00".
 * `null` when there is nothing useful to add.
 */
export function nextOpenHint(state: OpenState, locale: Locale): string | null {
  if (state.state !== 'closed_for_today' || state.nextChange === undefined) return null
  if (state.nextOpenInDays === 1) return `${t(locale, 'time.tomorrow')} ${state.nextChange}`
  if (state.nextOpenDay === undefined) return null
  return `${t(locale, `weekday.${state.nextOpenDay}` as MessageKey)} ${state.nextChange}`
}

/**
 * Row label for the hours table: "월–금", "토·일·공휴일", or "매일" when a single rule covers the
 * whole week including holidays. Without the last case a 연중무휴 store reads "월–공휴일", which is
 * the kind of phrase that makes a reader stop and re-parse.
 */
export function hoursDayLabel(days: readonly DayKey[], locale: Locale): string {
  if (days.length === DAY_ORDER.length) return t(locale, 'day.every')
  if (days.length === 1) return t(locale, `day.${days[0]}` as MessageKey)
  const contiguous = days.every(
    (d, i) => i === 0 || DAY_ORDER.indexOf(d) === DAY_ORDER.indexOf(days[i - 1] as DayKey) + 1,
  )
  if (contiguous && days.length > 2) {
    return `${t(locale, `day.${days[0]}` as MessageKey)}–${t(locale, `day.${days[days.length - 1]}` as MessageKey)}`
  }
  return days.map((d) => t(locale, `day.${d}` as MessageKey)).join('·')
}

/** Colour bucket for the open-state pill; `unknown` shares the closed bucket but drops the dot. */
export function openStateTone(state: OpenState): 'open' | 'soon' | 'closed' | 'unknown' {
  if (state.state === 'open') return 'open'
  if (state.state === 'closing_soon' || state.state === 'before_open') return 'soon'
  if (state.state === 'unknown') return 'unknown'
  return 'closed'
}

export function categoryColor(key: Store['category']): string {
  return CATEGORY_BY_KEY[key].color
}

export function categoryLabel(key: Store['category'], locale: Locale): string {
  return CATEGORY_BY_KEY[key].label[locale]
}

/** Chip-length label — "애니 굿즈" instead of "애니 굿즈·종합" (mock feedback item 4). */
export function categoryShortLabel(key: Store['category'], locale: Locale): string {
  return t(locale, `category.short.${key}` as MessageKey)
}

/** `/photos/foo.jpg` → `/photos/foo-thumb.jpg` (240px square). Absolute URLs are left alone. */
export function thumbUrl(photo: Photo): string {
  if (!photo.url.startsWith('/photos/') || !photo.url.endsWith('.jpg')) return photo.url
  return `${photo.url.slice(0, -'.jpg'.length)}-thumb.jpg`
}

/** "2015" from a `taken_on` of `2015`, `2015-04` or `2015-04-13`. */
export function photoYear(photo: Photo): string | null {
  return photo.taken_on === null ? null : photo.taken_on.slice(0, 4)
}

/** Google Maps walking deep link (PLAN §8: no Places API, deep links only). */
export function directionsUrl(location: { lat: number; lng: number }): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}&travelmode=walking`
}

/**
 * "오류 신고" — a GitHub issue with the record id prefilled (PLAN §8).
 * TODO: the repository has no remote yet, so `REPORT_REPO` is a placeholder. Point it at the real
 * `owner/name` (and add an issue template with a `record` field) before launch.
 */
export const REPORT_REPO = 'otakuroad/otakuroad'

export function reportErrorUrl(kind: 'store' | 'building', id: string, locale: Locale): string {
  const title = encodeURIComponent(`[data] ${kind}/${id}`)
  const body = encodeURIComponent(
    [`id: ${id}`, `kind: ${kind}`, `locale: ${locale}`, '', '<!-- what is wrong? -->'].join('\n'),
  )
  return `https://github.com/${REPORT_REPO}/issues/new?title=${title}&body=${body}&labels=data`
}
