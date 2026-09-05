/**
 * The opening-hours engine is the one place where a wrong answer is worse than no answer
 * (PLAN §6.7), so every branch that a real seed record exercises has a case here.
 *
 * All instants are written as UTC and asserted in Tokyo (+09:00), which is also the guard against
 * ever reading the host time zone by accident.
 */
import { describe, expect, it } from 'vitest'
import type { Hours } from '@/data/schema'
import { JP_HOLIDAYS } from '@/data/holidays-jp'
import { CLOSING_SOON_MINUTES, getOpenState, hoursTable, todayRowIndex, toTokyo } from '@/lib/hours'

const NO_HOLIDAYS = new Set<string>()

/** Tokyo wall-clock → Date. Tokyo has no DST, so +09:00 is exact. */
const tokyo = (iso: string): Date => new Date(`${iso}+09:00`)

const hours = (rules: Hours['rules']): Hours => ({
  rules,
  regular_holiday: null,
  note: null,
  source_url: 'https://example.com/',
})

/** Super Potato: one rule, every day, 11:00–20:00. */
const everyDay = hours([
  { days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun', 'hol'], open: '11:00', close: '20:00' },
])

/** K-BOOKS: weekdays open at 12:00, weekends and public holidays at 11:30. */
const weekdayWeekend = hours([
  { days: ['mon', 'tue', 'wed', 'thu', 'fri'], open: '12:00', close: '20:00' },
  { days: ['sat', 'sun', 'hol'], open: '11:30', close: '20:00' },
])

/** BEEP: closed Wednesdays; weekdays 12:00, Sat/Sun/holidays 11:00. */
const closedWednesday = hours([
  { days: ['mon', 'tue', 'thu', 'fri'], open: '12:00', close: '20:00' },
  { days: ['sat', 'sun', 'hol'], open: '11:00', close: '20:00' },
])

describe('toTokyo', () => {
  it('reads the instant in Tokyo, not the host time zone', () => {
    // 2026-09-04 23:30 UTC is already 2026-09-05 08:30 in Tokyo.
    const now = toTokyo(new Date('2026-09-04T23:30:00Z'))
    expect(now.date).toBe('2026-09-05')
    expect(now.minutes).toBe(8 * 60 + 30)
    expect(now.day).toBe('sat')
  })

  it('normalizes Tokyo midnight to minute 0 of the new day', () => {
    const now = toTokyo(new Date('2026-09-04T15:00:00Z'))
    expect(now.date).toBe('2026-09-05')
    expect(now.minutes).toBe(0)
  })
})

describe('getOpenState — weekdays and weekends', () => {
  it('is open mid-afternoon on a weekday', () => {
    // 2026-09-07 is a Monday.
    const state = getOpenState(weekdayWeekend, tokyo('2026-09-07T15:00:00'), NO_HOLIDAYS)
    expect(state.state).toBe('open')
    expect(state.nextChange).toBe('20:00')
    expect(state.minutesToClose).toBe(300)
  })

  it('is before open at 11:45 on a weekday but open at 11:45 on a Saturday', () => {
    expect(getOpenState(weekdayWeekend, tokyo('2026-09-07T11:45:00'), NO_HOLIDAYS)).toEqual({
      state: 'before_open',
      nextChange: '12:00',
    })
    // 2026-09-05 is a Saturday, when the store opens at 11:30.
    expect(getOpenState(weekdayWeekend, tokyo('2026-09-05T11:45:00'), NO_HOLIDAYS).state).toBe('open')
  })

  it('is closed today on the store’s regular closing day', () => {
    // 2026-09-09 is a Wednesday, and BEEP has no Wednesday rule at all.
    expect(getOpenState(closedWednesday, tokyo('2026-09-09T15:00:00'), NO_HOLIDAYS)).toEqual({
      state: 'closed_today',
    })
  })

  it('separates "already closed" from "closed all day"', () => {
    // Super Potato trades 11:00-20:00 every day. At 21:50 it is shut, but it was open all day, so
    // reporting "오늘 휴무" would tell the visitor they never had a chance.
    const shut = getOpenState(everyDay, tokyo('2026-09-04T21:50:00'), NO_HOLIDAYS)
    expect(shut.state).toBe('closed_for_today')
    expect(shut.nextChange).toBe('11:00')
    expect(shut.nextOpenInDays).toBe(1)
    expect(shut.nextOpenDay).toBe('sat')

    // BEEP has no Wednesday rule at all, so Wednesday really is a closing day.
    expect(getOpenState(closedWednesday, tokyo('2026-09-09T15:00:00'), NO_HOLIDAYS).state).toBe('closed_today')
  })

  it('names the next open day when it is not tomorrow', () => {
    // 2026-09-08 is a Tuesday; BEEP shuts on Wednesdays, so the next opening is Thursday.
    const state = getOpenState(closedWednesday, tokyo('2026-09-08T21:30:00'), NO_HOLIDAYS)
    expect(state.state).toBe('closed_for_today')
    expect(state.nextOpenInDays).toBe(2)
    expect(state.nextOpenDay).toBe('thu')
    expect(state.nextChange).toBe('12:00')
  })

  it('uses the holiday opening time when the next open day is a public holiday', () => {
    // 2026-09-20 is a Sunday; the next day, 敬老の日, is a holiday where the hol rule opens at 11:00
    // rather than the Monday weekday rule's 12:00.
    const state = getOpenState(closedWednesday, tokyo('2026-09-20T21:00:00'), JP_HOLIDAYS)
    expect(state.state).toBe('closed_for_today')
    expect(state.nextOpenInDays).toBe(1)
    expect(state.nextChange).toBe('11:00')
  })

  it('reports closed_for_today with no next opening when nothing is scheduled for a week', () => {
    const mondayOnly = hours([{ days: ['mon'], open: '11:00', close: '20:00' }])
    // A Monday evening: the only other opening is exactly 7 days out, which is still in range.
    const state = getOpenState(mondayOnly, tokyo('2026-09-07T21:00:00'), NO_HOLIDAYS)
    expect(state.state).toBe('closed_for_today')
    expect(state.nextOpenInDays).toBe(7)
    expect(state.nextOpenDay).toBe('mon')
  })
})

describe('getOpenState — public holidays', () => {
  it('applies the hol rule on a holiday that falls on a weekday', () => {
    // 2026-09-21 (敬老の日) is a Monday. The weekday rule opens at 12:00, the hol rule at 11:30.
    expect(JP_HOLIDAYS.has('2026-09-21')).toBe(true)
    const state = getOpenState(weekdayWeekend, tokyo('2026-09-21T11:45:00'), JP_HOLIDAYS)
    expect(state.state).toBe('open')
  })

  it('lets the hol rule override the weekday rule instead of stacking with it', () => {
    // Without holiday precedence BEEP would report both 11:00 and 12:00 windows on this Monday.
    const state = getOpenState(closedWednesday, tokyo('2026-09-21T11:10:00'), JP_HOLIDAYS)
    expect(state.state).toBe('open')
    expect(state.nextChange).toBe('20:00')
  })

  it('ignores holiday rules on the same weekday when it is not a holiday', () => {
    // 2026-09-28 is an ordinary Monday.
    expect(getOpenState(weekdayWeekend, tokyo('2026-09-28T11:45:00'), JP_HOLIDAYS).state).toBe('before_open')
  })

  it('covers the substitute holiday for a Sunday 憲法記念日', () => {
    // 2026-05-03 falls on a Sunday, so 2026-05-06 (Wed) is a 振替休日.
    expect(JP_HOLIDAYS.has('2026-05-06')).toBe(true)
    // BEEP is normally shut on Wednesdays; the hol rule makes it open on the substitute holiday.
    expect(getOpenState(closedWednesday, tokyo('2026-05-06T13:00:00'), JP_HOLIDAYS).state).toBe('open')
  })

  it('covers the 国民の休日 wedged into 2026 Silver Week', () => {
    expect(JP_HOLIDAYS.has('2026-09-22')).toBe(true)
  })
})

describe('getOpenState — closing soon', () => {
  const at = (iso: string) => getOpenState(everyDay, tokyo(iso), NO_HOLIDAYS)

  it('is still "open" one minute outside the threshold', () => {
    const state = at('2026-09-07T18:59:00')
    expect(state.minutesToClose).toBe(CLOSING_SOON_MINUTES + 1)
    expect(state.state).toBe('open')
  })

  it('flips exactly at the threshold', () => {
    const state = at('2026-09-07T19:00:00')
    expect(state.minutesToClose).toBe(CLOSING_SOON_MINUTES)
    expect(state.state).toBe('closing_soon')
  })

  it('stays "closing soon" right up to the last minute', () => {
    expect(at('2026-09-07T19:59:00')).toEqual({
      state: 'closing_soon',
      nextChange: '20:00',
      minutesToClose: 1,
    })
  })

  it('is closed the moment the shutter comes down', () => {
    expect(at('2026-09-07T20:00:00').state).toBe('closed_for_today')
  })
})

describe('getOpenState — windows crossing midnight', () => {
  const lateNight = hours([
    { days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun', 'hol'], open: '10:00', close: '23:55' },
  ])
  const pastMidnight = hours([
    { days: ['fri', 'sat'], open: '22:00', close: '02:00' },
  ])
  const untilTwentyFour = hours([
    { days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun', 'hol'], open: '11:00', close: '24:00' },
  ])

  it('treats a close of 24:00 as the end of the day, not the start', () => {
    const state = getOpenState(untilTwentyFour, tokyo('2026-09-07T23:50:00'), NO_HOLIDAYS)
    expect(state.state).toBe('closing_soon')
    expect(state.minutesToClose).toBe(10)
    expect(state.nextChange).toBe('00:00')
  })

  it('keeps a 22:00–02:00 window open after midnight, on the next calendar day', () => {
    // 2026-09-05 is a Saturday: the Friday window that opened at 22:00 is still running at 00:30.
    const state = getOpenState(pastMidnight, tokyo('2026-09-05T00:30:00'), NO_HOLIDAYS)
    expect(state.state).toBe('open')
    expect(state.minutesToClose).toBe(90)
  })

  it('stops carrying yesterday’s window once it has ended', () => {
    // At 02:30 Saturday the Friday window is over; Saturday's own window has yet to open at 22:00.
    expect(getOpenState(pastMidnight, tokyo('2026-09-05T02:30:00'), NO_HOLIDAYS)).toEqual({
      state: 'before_open',
      nextChange: '22:00',
    })
  })

  it('does not carry a window from a day the store is shut', () => {
    // Sunday 00:30: Saturday's 22:00–02:00 window is still running.
    expect(getOpenState(pastMidnight, tokyo('2026-09-06T00:30:00'), NO_HOLIDAYS).state).toBe('open')
    // Monday 00:30: Sunday has no rule at all, so nothing carries over and Monday is a closing day.
    expect(getOpenState(pastMidnight, tokyo('2026-09-07T00:30:00'), NO_HOLIDAYS).state).toBe('closed_today')
  })

  it('is closing soon a few minutes before a 23:55 close', () => {
    const state = getOpenState(lateNight, tokyo('2026-09-07T23:30:00'), NO_HOLIDAYS)
    expect(state.state).toBe('closing_soon')
    expect(state.minutesToClose).toBe(25)
  })
})

describe('getOpenState — unknown hours', () => {
  it('returns unknown for a record we never verified', () => {
    expect(getOpenState(null, tokyo('2026-09-07T15:00:00'), NO_HOLIDAYS)).toEqual({ state: 'unknown' })
  })

  it('returns unknown rather than guessing when the rule list is empty', () => {
    expect(getOpenState(hours([]), tokyo('2026-09-07T15:00:00'), NO_HOLIDAYS)).toEqual({ state: 'unknown' })
  })
})

describe('hoursTable', () => {
  it('collapses identical consecutive days into one row', () => {
    const rows = hoursTable(weekdayWeekend)
    expect(rows).toHaveLength(2)
    expect(rows[0]?.days).toEqual(['mon', 'tue', 'wed', 'thu', 'fri'])
    expect(rows[0]?.windows).toEqual(['12:00 – 20:00'])
    expect(rows[1]?.days).toEqual(['sat', 'sun', 'hol'])
  })

  it('keeps a closing day as its own row with no window', () => {
    const rows = hoursTable(closedWednesday)
    const wednesday = rows.find((r) => r.days.includes('wed'))
    expect(wednesday?.windows).toEqual([])
    expect(wednesday?.days).toEqual(['wed'])
  })

  it('highlights the holiday row on a holiday and the weekday row otherwise', () => {
    const rows = hoursTable(weekdayWeekend)
    // 2026-09-21 is a Monday and 敬老の日.
    expect(todayRowIndex(rows, tokyo('2026-09-21T12:00:00'), JP_HOLIDAYS)).toBe(1)
    expect(todayRowIndex(rows, tokyo('2026-09-28T12:00:00'), JP_HOLIDAYS)).toBe(0)
  })
})
