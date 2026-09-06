/**
 * The three UI string files must stay in step: a key missing from one locale would render as its
 * raw key, and a placeholder renamed in one file would print "{count}" verbatim.
 */
import { describe, expect, it } from 'vitest'
import en from '../src/i18n/en.json'
import ja from '../src/i18n/ja.json'
import ko from '../src/i18n/ko.json'
import { LOCALES, getLocaleFromUrl, pick, t } from '../src/i18n'
import { localizedHref } from '../src/lib/url'

const files: Record<string, Record<string, string>> = { ko, en, ja }
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('UI strings', () => {
  it('carry the same keys in every locale', () => {
    const reference = Object.keys(ko).sort()
    for (const locale of LOCALES) expect(Object.keys(files[locale]).sort(), locale).toEqual(reference)
  })

  it('have no empty values and the same placeholders per key', () => {
    for (const [key, value] of Object.entries(ko)) {
      for (const locale of LOCALES) {
        const text = files[locale][key]
        expect(text.trim().length, `${locale}:${key}`).toBeGreaterThan(0)
        expect(placeholders(text), `${locale}:${key}`).toEqual(placeholders(value))
      }
    }
  })

  it('interpolate in Japanese too', () => {
    expect(t('ja', 'walk.minutes', { minutes: 3 })).toBe('徒歩3分')
  })
})

describe('pick', () => {
  it('returns the Japanese text when a record has it and English until then', () => {
    expect(pick({ ko: '가', en: 'a', ja: 'あ' }, 'ja')).toBe('あ')
    expect(pick({ ko: '가', en: 'a' }, 'ja')).toBe('a')
    expect(pick({ ko: '가', en: 'a' }, 'ko')).toBe('가')
  })
})

describe('locale routing', () => {
  it('reads /ja/ from a URL', () => {
    expect(getLocaleFromUrl('/ja/s/super-potato-akihabara')).toBe('ja')
    expect(getLocaleFromUrl('/x/')).toBe('ko')
  })

  it('switches the prefix and keeps the rest', () => {
    expect(localizedHref('/ja/b/radio-kaikan', '?c=figure_hobby', 'en')).toBe('/en/b/radio-kaikan?c=figure_hobby')
    expect(localizedHref('/ko', '', 'ja')).toBe('/ja/')
  })
})
