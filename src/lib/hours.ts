/**
 * Opening-hours engine (PLAN §9: "직접 작성 (Intl Asia/Tokyo + 일본 공휴일 목록) + vitest").
 *
 * Everything is evaluated in Asia/Tokyo, never in the host time zone: a Korean visitor planning
 * from Seoul and a phone already in Akihabara must see the same answer for the same instant.
 * A wrong "open now" is worse than no answer at all (PLAN §6.7), so anything we cannot derive
 * with confidence degrades to `unknown` rather than guessing.
 */
// Type-only import: pulling a value out of schema.ts would drag zod into the map island bundle.
import type { Hours } from '@/data/schema'

type HoursRule = Hours['rules'][number]

/** Mirrors `DAY_KEYS` in `src/data/schema.ts`; kept as a literal so the island never imports zod. */
export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun', 'hol'] as const

export type DayKey = (typeof DAY_KEYS)[number]
/** Weekday keys only — `hol` is an overlay, not a day of the week. */
export type WeekdayKey = Exclude<DayKey, 'hol'>

/**
 * `closed_today` and `closed_for_today` are deliberately different facts, because conflating them
 * misinforms the visitor:
 *   closed_today      no rule matches today at all — a regular closing day ("오늘 휴무")
 *   closed_for_today  the store was open today and has already shut ("영업 종료 · 내일 11:00 오픈")
 * Super Potato at 21:50 on a Friday is the second, never the first: it traded all day and closed
 * 1h50m ago, and telling someone it is "closed today" implies they never had a chance.
 */
export type OpenStateKind =
  | 'open'
  | 'closing_soon'
  | 'before_open'
  | 'closed_for_today'
  | 'closed_today'
  | 'unknown'

export interface OpenState {
  state: OpenStateKind
  /** `HH:MM` of the next transition: the closing time when open, the opening time otherwise. */
  nextChange?: string
  /** Minutes left until close. Only set for `open` and `closing_soon`. */
  minutesToClose?: number
  /** Days ahead of the next opening (1 = tomorrow). Only set for `closed_for_today`. */
  nextOpenInDays?: number
  /** Weekday of that next opening, so the label can name it when it is not tomorrow. */
  nextOpenDay?: WeekdayKey
}

/** ≤ this many minutes before closing counts as "closing soon" (PLAN §5). */
export const CLOSING_SOON_MINUTES = 60

const MINUTES_PER_DAY = 24 * 60

/** Sunday-first, matching `Date#getDay` order, so an index maps straight to a rule day key. */
const WEEKDAY_BY_INDEX: readonly WeekdayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

const EN_WEEKDAY_TO_INDEX: Readonly<Record<string, number>> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

/** Cached because a list of 20+ cards re-derives Tokyo time on every reference-time change. */
const tokyoParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
  hour12: false,
})

/** The moment `at` expressed as Tokyo wall-clock time. */
export interface TokyoNow {
  /** `YYYY-MM-DD` in Tokyo. */
  date: string
  /** Minutes since Tokyo midnight. */
  minutes: number
  /** 0 = Sunday. */
  dayIndex: number
  day: WeekdayKey
}

/** Convert an instant to Tokyo wall-clock time. Tokyo has no DST, so this is a pure +09:00 shift. */
export function toTokyo(at: Date): TokyoNow {
  const parts = tokyoParts.formatToParts(at)
  const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? ''
  const year = get('year')
  const month = get('month')
  const day = get('day')
  // Intl renders midnight as "24" in the h23-adjacent en-US hourCycle; normalize it back to 0.
  const hour = Number(get('hour')) % 24
  const minute = Number(get('minute'))
  const dayIndex = EN_WEEKDAY_TO_INDEX[get('weekday')] ?? 0
  return {
    date: `${year}-${month}-${day}`,
    minutes: hour * 60 + minute,
    dayIndex,
    day: WEEKDAY_BY_INDEX[dayIndex] as WeekdayKey,
  }
}

/** Shift a `YYYY-MM-DD` calendar date by whole days without touching time zones. */
export function shiftDate(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`)
  at.setUTCDate(at.getUTCDate() + days)
  return at.toISOString().slice(0, 10)
}

/** `"09:30"` → 570. `"24:00"` → 1440. */
export function parseHHMM(value: string): number {
  const [h, m] = value.split(':')
  return Number(h) * 60 + Number(m)
}

/** 570 → `"09:30"`. Minutes past midnight wrap, so a rule ending at 26:00 reads as "02:00". */
export function formatHHMM(minutes: number): string {
  const wrapped = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  const h = Math.floor(wrapped / 60)
  const m = wrapped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** One rule resolved to an absolute minute window relative to the start of the day it opens on. */
interface Window {
  open: number
  /** Always > `open`; a rule that closes at or before it opens is read as crossing midnight. */
  close: number
  rule: HoursRule
}

function toWindow(rule: HoursRule): Window {
  const open = parseHHMM(rule.open)
  let close = parseHHMM(rule.close)
  // "24:00" and any close earlier than the open (e.g. 22:00–02:00) run into the next day.
  if (close <= open) close += MINUTES_PER_DAY
  return { open, close, rule }
}

/**
 * Rules in effect on one calendar day.
 *
 * Holiday precedence: when the date is a public holiday and the store has any `hol` rule, only the
 * `hol` rules apply. Otherwise a store like BEEP (`mon,tue,thu,fri` 12:00 / `sat,sun,hol` 11:00)
 * would report both windows on a holiday Monday and open an hour early.
 */
export function rulesForDate(hours: Hours, day: WeekdayKey, isHoliday: boolean): HoursRule[] {
  if (isHoliday) {
    const holidayRules = hours.rules.filter((r) => r.days.includes('hol'))
    if (holidayRules.length > 0) return holidayRules
  }
  return hours.rules.filter((r) => r.days.includes(day))
}

function isHolidayDate(date: string, holidays: ReadonlySet<string> | Set<string>): boolean {
  return holidays.has(date)
}

/** How far ahead we look for the next opening. Beyond a week the answer is not worth stating. */
const NEXT_OPEN_LOOKAHEAD_DAYS = 7

/**
 * The first opening at or after `from + 1 day`.
 *
 * It is not always tomorrow: BEEP closes on Wednesdays, so on a Tuesday night the honest answer is
 * "opens Thursday 12:00", not "opens tomorrow". Holiday precedence applies to each future day too,
 * so a `hol` rule can shift the opening time of the day we land on.
 */
function nextOpening(
  hours: Hours,
  now: TokyoNow,
  holidays: ReadonlySet<string> | Set<string>,
): { at: string; inDays: number; day: WeekdayKey } | null {
  for (let ahead = 1; ahead <= NEXT_OPEN_LOOKAHEAD_DAYS; ahead += 1) {
    const date = shiftDate(now.date, ahead)
    const day = WEEKDAY_BY_INDEX[(now.dayIndex + ahead) % 7] as WeekdayKey
    const opens = rulesForDate(hours, day, isHolidayDate(date, holidays)).map((r) => parseHHMM(r.open))
    if (opens.length === 0) continue
    return { at: formatHHMM(Math.min(...opens)), inDays: ahead, day }
  }
  return null
}

/**
 * Is the store open at `at`, and what changes next?
 *
 * @param hours    the store's structured hours, or `null` when we never verified them
 * @param at       the reference instant (live "now", or a date the visitor picked in the info sheet)
 * @param holidays `YYYY-MM-DD` Tokyo dates that are Japanese public holidays — see `data/holidays-jp.ts`
 */
export function getOpenState(
  hours: Hours | null,
  at: Date,
  holidays: ReadonlySet<string> | Set<string>,
): OpenState {
  if (hours === null || hours.rules.length === 0) return { state: 'unknown' }

  const now = toTokyo(at)

  // A window opened yesterday may still be running (22:00–02:00, or a close of "24:00" that a
  // visitor at 23:50 should still see as open).
  const yesterday = shiftDate(now.date, -1)
  const yesterdayDay = WEEKDAY_BY_INDEX[(now.dayIndex + 6) % 7] as WeekdayKey
  for (const rule of rulesForDate(hours, yesterdayDay, isHolidayDate(yesterday, holidays))) {
    const w = toWindow(rule)
    if (w.close <= MINUTES_PER_DAY) continue // did not cross midnight
    const minutesToClose = w.close - MINUTES_PER_DAY - now.minutes
    if (minutesToClose > 0) {
      return {
        state: minutesToClose <= CLOSING_SOON_MINUTES ? 'closing_soon' : 'open',
        nextChange: formatHHMM(w.close),
        minutesToClose,
      }
    }
  }

  const today = rulesForDate(hours, now.day, isHolidayDate(now.date, holidays)).map(toWindow)
  // Nothing matched today: this is a regular closing day.
  if (today.length === 0) return { state: 'closed_today' }

  // Open right now wins over anything else; with overlapping windows keep the latest close.
  const current = today
    .filter((w) => w.open <= now.minutes && now.minutes < w.close)
    .sort((a, b) => b.close - a.close)[0]
  if (current) {
    const minutesToClose = current.close - now.minutes
    return {
      state: minutesToClose <= CLOSING_SOON_MINUTES ? 'closing_soon' : 'open',
      nextChange: formatHHMM(current.close),
      minutesToClose,
    }
  }

  const upcoming = today.filter((w) => w.open > now.minutes).sort((a, b) => a.open - b.open)[0]
  if (upcoming) return { state: 'before_open', nextChange: formatHHMM(upcoming.open) }

  // The store traded today and has already shut — a different fact from being closed all day.
  const next = nextOpening(hours, now, holidays)
  if (next === null) return { state: 'closed_for_today' }
  return { state: 'closed_for_today', nextChange: next.at, nextOpenInDays: next.inDays, nextOpenDay: next.day }
}

/** Weekday rows for the card's hours table, in Mon→Sun order with the holiday row last. */
export const DAY_ORDER: readonly DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun', 'hol']

export interface HoursRow {
  /** The days this row covers, already collapsed into runs (`mon`…`fri`). */
  days: DayKey[]
  /** `11:00 – 20:00`, or `null` when the store is closed on those days. */
  windows: string[]
}

/**
 * Collapse `hours.rules` into consecutive day runs so the card shows "월–금 / 토·일·공휴일"
 * instead of eight nearly identical lines. Days with no rule become a "closed" row.
 */
export function hoursTable(hours: Hours): HoursRow[] {
  const byDay = new Map<DayKey, string[]>()
  for (const day of DAY_ORDER) {
    const windows = hours.rules
      .filter((r) => r.days.includes(day))
      .map((r) => `${r.open} – ${r.close}`)
      .sort()
    byDay.set(day, windows)
  }
  const rows: HoursRow[] = []
  for (const day of DAY_ORDER) {
    const windows = byDay.get(day) ?? []
    const last = rows[rows.length - 1]
    if (last && last.windows.join('|') === windows.join('|')) last.days.push(day)
    else rows.push({ days: [day], windows })
  }
  return rows
}

/** Which collapsed row applies at `at` — the card highlights it as "today". */
export function todayRowIndex(rows: HoursRow[], at: Date, holidays: ReadonlySet<string> | Set<string>): number {
  const now = toTokyo(at)
  const holiday = isHolidayDate(now.date, holidays)
  if (holiday) {
    const holRow = rows.findIndex((r) => r.days.includes('hol'))
    if (holRow >= 0) return holRow
  }
  return rows.findIndex((r) => r.days.includes(now.day))
}
