import en from './en.json'
import ko from './ko.json'

export type Locale = 'ko' | 'en'
export const LOCALES = ['ko', 'en'] as const satisfies readonly Locale[]
export const DEFAULT_LOCALE: Locale = 'ko'

/** Every UI string key. `ko.json` is the reference; `en.json` must carry the same keys (checked by tsc). */
export type MessageKey = keyof typeof ko
type Messages = Record<MessageKey, string>

const MESSAGES: Record<Locale, Messages> = { ko, en }

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

/** `/ko/s/foo` → 'ko'. Falls back to the default locale for unprefixed paths. */
export function getLocaleFromUrl(url: URL | string): Locale {
  const pathname = typeof url === 'string' ? url : url.pathname
  const first = pathname.split('/')[1]
  return isLocale(first) ? first : DEFAULT_LOCALE
}
