import en from './en.json'
import ja from './ja.json'
import ko from './ko.json'

export type Locale = 'ko' | 'en' | 'ja'
export const LOCALES = ['ko', 'en', 'ja'] as const satisfies readonly Locale[]
export const DEFAULT_LOCALE: Locale = 'ko'

/** The language switch and the 404 page name each locale in its own script. */
export const LOCALE_NAMES: Record<Locale, string> = { ko: '한국어', en: 'English', ja: '日本語' }
/** BCP 47 / Open Graph tags. */
export const LOCALE_TAGS: Record<Locale, { bcp47: string; og: string }> = {
  ko: { bcp47: 'ko-KR', og: 'ko_KR' },
  en: { bcp47: 'en-US', og: 'en_US' },
  ja: { bcp47: 'ja-JP', og: 'ja_JP' },
}

/** Every UI string key. `ko.json` is the reference; `en.json` and `ja.json` must carry the same keys (checked by tsc). */
export type MessageKey = keyof typeof ko
type Messages = Record<MessageKey, string>

const MESSAGES: Record<Locale, Messages> = { ko, en, ja }

export type Params = Record<string, string | number>

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/** Look up a UI string and interpolate `{placeholder}` params. Unknown placeholders are left as-is. */
export function t(locale: Locale, key: MessageKey, params?: Params): string {
  const template = MESSAGES[locale][key] ?? MESSAGES[DEFAULT_LOCALE][key] ?? key
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  )
}

/**
 * Text from a record's `{ko, en, ja?}` object. Korean and English are required by the schema;
 * Japanese was added later (2026-09-06) and falls back to English until a record is translated.
 */
export function pick<T>(value: { ko: T; en: T; ja?: T }, locale: Locale): T {
  return value[locale] ?? value.en
}

/** `/ko/s/foo` → 'ko'. Falls back to the default locale for unprefixed paths. */
export function getLocaleFromUrl(url: URL | string): Locale {
  const pathname = typeof url === 'string' ? url : url.pathname
  const first = pathname.split('/')[1]
  return isLocale(first) ? first : DEFAULT_LOCALE
}
