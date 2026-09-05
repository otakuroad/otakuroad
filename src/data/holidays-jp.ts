/**
 * Japanese public holidays (国民の祝日), used by the opening-hours engine for `hol` rules.
 *
 * MAINTENANCE — this list is hand-written and only covers 2026–2027. It MUST be extended before
 * 2028: the equinox holidays (春分の日 / 秋分の日) are fixed each February by the National
 * Astronomical Observatory of Japan, so they cannot be computed reliably far ahead, and the
 * Diet occasionally adds one-off holidays (as it did for the 2020/2021 Olympics). Outside the
 * covered range every `hol` rule silently stops applying, which makes a store look open on a
 * holiday when it may be running holiday hours.
 *
 * Substitute rules already baked into the dates below:
 *   振替休日  a holiday falling on a Sunday moves to the next day that is not itself a holiday
 *             (2026-05-03 Sun → 2026-05-06 Wed, because 5/4 and 5/5 are holidays;
 *              2027-03-21 Sun → 2027-03-22 Mon)
 *   国民の休日 a single weekday sandwiched between two holidays becomes one
 *             (2026-09-22 Tue, between 敬老の日 9/21 and 秋分の日 9/23)
 */

/** Range this table actually covers. Dates outside it are treated as non-holidays. */
export const HOLIDAY_RANGE = { from: '2026-01-01', to: '2027-12-31' } as const

/** `YYYY-MM-DD` → Japanese holiday name. Tokyo local dates. */
export const JP_HOLIDAY_NAMES: Readonly<Record<string, string>> = {
  // 2026
  '2026-01-01': '元日',
  '2026-01-12': '成人の日',
  '2026-02-11': '建国記念の日',
  '2026-02-23': '天皇誕生日',
  '2026-03-20': '春分の日',
  '2026-04-29': '昭和の日',
  '2026-05-03': '憲法記念日',
  '2026-05-04': 'みどりの日',
  '2026-05-05': 'こどもの日',
  '2026-05-06': '振替休日',
  '2026-07-20': '海の日',
  '2026-08-11': '山の日',
  '2026-09-21': '敬老の日',
  '2026-09-22': '国民の休日',
  '2026-09-23': '秋分の日',
  '2026-10-12': 'スポーツの日',
  '2026-11-03': '文化の日',
  '2026-11-23': '勤労感謝の日',
  // 2027
  '2027-01-01': '元日',
  '2027-01-11': '成人の日',
  '2027-02-11': '建国記念の日',
  '2027-02-23': '天皇誕生日',
  '2027-03-21': '春分の日',
  '2027-03-22': '振替休日',
  '2027-04-29': '昭和の日',
  '2027-05-03': '憲法記念日',
  '2027-05-04': 'みどりの日',
  '2027-05-05': 'こどもの日',
  '2027-07-19': '海の日',
  '2027-08-11': '山の日',
  '2027-09-20': '敬老の日',
  '2027-09-23': '秋分の日',
  '2027-10-11': 'スポーツの日',
  '2027-11-03': '文化の日',
  '2027-11-23': '勤労感謝の日',
}

/** The same dates as a lookup set — this is what `getOpenState` expects. */
export const JP_HOLIDAYS: ReadonlySet<string> = new Set(Object.keys(JP_HOLIDAY_NAMES))
