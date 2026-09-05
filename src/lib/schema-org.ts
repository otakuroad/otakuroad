/**
 * JSON-LD for the prerendered share pages (PLAN §4.3).
 *
 * Only facts we actually hold are emitted — no invented ratings, price ranges or phone numbers.
 * The `hol` rule day has no schema.org equivalent, so holiday-only rules are left out rather than
 * mislabelled as a weekday.
 */
import type { Building, Store } from '@/data/schema'
import { CATEGORY_BY_KEY, type CategoryKey } from '@/data/categories'
import type { Locale } from '@/i18n'
import type { DayKey } from './hours'

type Json = Record<string, unknown>

/**
 * The most specific schema.org type each category honestly fits. Everything here is a
 * `LocalBusiness` subtype, so consumers that only understand `LocalBusiness` still work.
 */
const SCHEMA_TYPE: Record<CategoryKey, string> = {
  anime_goods: 'Store',
  doujin_manga: 'BookStore',
  figure_hobby: 'Store',
  retro_game: 'Store',
  trading_card: 'Store',
  arcade: 'EntertainmentBusiness',
  maid_cafe: 'CafeOrCoffeeShop',
  idol: 'TouristAttraction',
  cosplay: 'ClothingStore',
  electronics: 'ElectronicsStore',
}

const SCHEMA_DAY: Record<Exclude<DayKey, 'hol'>, string> = {
  mon: 'https://schema.org/Monday',
  tue: 'https://schema.org/Tuesday',
  wed: 'https://schema.org/Wednesday',
  thu: 'https://schema.org/Thursday',
  fri: 'https://schema.org/Friday',
  sat: 'https://schema.org/Saturday',
  sun: 'https://schema.org/Sunday',
}

function openingHours(store: Store): Json[] {
  if (store.hours === null) return []
  const specs: Json[] = []
  for (const rule of store.hours.rules) {
    const days = rule.days.filter((d): d is Exclude<DayKey, 'hol'> => d !== 'hol').map((d) => SCHEMA_DAY[d])
    if (days.length === 0) continue
    specs.push({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: days,
      opens: rule.open,
      // schema.org has no 24:00; the end of the day is 23:59.
      closes: rule.close === '24:00' ? '23:59' : rule.close,
    })
  }
  return specs
}

function postalAddress(addressJa: string): Json {
  return {
    '@type': 'PostalAddress',
    streetAddress: addressJa,
    addressLocality: '千代田区',
    addressRegion: '東京都',
    addressCountry: 'JP',
  }
}

function absolute(path: string | null, site: URL): string | undefined {
  return path === null ? undefined : new URL(path, site).href
}

/** Drop undefined values so the serialized JSON-LD has no empty keys. */
function compact(value: Json): Json {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== null))
}

export function storeJsonLd(store: Store, buildings: readonly Building[], locale: Locale, pageUrl: URL, site: URL): Json {
  const building = store.building_id === null ? null : buildings.find((b) => b.id === store.building_id)
  const location = store.location ?? building?.location ?? null
  const sameAs = [store.official_url, store.sns.x, store.sns.instagram].filter((v): v is string => Boolean(v))
  const hours = openingHours(store)
  return compact({
    '@context': 'https://schema.org',
    '@type': SCHEMA_TYPE[store.category],
    '@id': pageUrl.href,
    url: pageUrl.href,
    name: store.name[locale],
    alternateName: [store.name.ja, store.name.en].filter((v) => v !== store.name[locale]),
    description: store.one_line[locale],
    image: absolute(store.photo?.url ?? null, site),
    address: postalAddress(store.address_ja),
    geo:
      location === null
        ? undefined
        : { '@type': 'GeoCoordinates', latitude: location.lat, longitude: location.lng },
    openingHoursSpecification: hours.length > 0 ? hours : undefined,
    containedInPlace:
      building === null || building === undefined
        ? undefined
        : { '@type': 'ShoppingCenter', name: building.name[locale], address: postalAddress(building.address_ja) },
    sameAs: sameAs.length > 0 ? sameAs : undefined,
    isAccessibleForFree: store.category === 'arcade' ? true : undefined,
  })
}

export function buildingJsonLd(
  building: Building,
  tenants: readonly Store[],
  locale: Locale,
  pageUrl: URL,
  site: URL,
): Json {
  return compact({
    '@context': 'https://schema.org',
    '@type': 'ShoppingCenter',
    '@id': pageUrl.href,
    url: pageUrl.href,
    name: building.name[locale],
    alternateName: [building.name.ja, building.name.en].filter((v) => v !== building.name[locale]),
    image: absolute(building.photo?.url ?? null, site),
    address: postalAddress(building.address_ja),
    geo: { '@type': 'GeoCoordinates', latitude: building.location.lat, longitude: building.location.lng },
    sameAs: building.official_url === null ? undefined : [building.official_url],
    containsPlace: tenants.map((s) => ({
      '@type': SCHEMA_TYPE[s.category],
      name: s.name[locale],
      url: new URL(`/${locale}/s/${s.id}`, site).href,
    })),
  })
}

export function categoryJsonLd(
  category: CategoryKey,
  stores: readonly Store[],
  locale: Locale,
  pageUrl: URL,
  site: URL,
  heading: string,
): Json {
  return compact({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': pageUrl.href,
    url: pageUrl.href,
    name: heading,
    about: CATEGORY_BY_KEY[category].label[locale],
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: stores.length,
      itemListElement: stores.map((s, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: new URL(`/${locale}/s/${s.id}`, site).href,
        name: s.name[locale],
      })),
    },
  })
}
