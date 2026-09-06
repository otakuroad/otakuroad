import { z } from 'zod'
import { CATEGORY_KEYS } from './categories'

/** Akihabara bounding box used for the map and for coordinate validation (slightly padded). */
export const AKIBA_BBOX = { south: 35.694, west: 139.765, north: 35.708, east: 139.78 } as const

export const LOCALES = ['ko', 'en', 'ja'] as const
export type Locale = (typeof LOCALES)[number]

export const STREET_SEGMENTS = ['chuo_dori', 'denkigai', 'ura_dori', 'showa_dori', 'suehirocho'] as const
export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun', 'hol'] as const

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'kebab-case slug')
const text = z.string().trim().min(1)

/**
 * Localized text. Korean and English are required from day one (decision 2026-09-04); Japanese was
 * added 2026-09-06 and stays optional so a new record can ship before it is translated — the UI
 * falls back to English (`pick()` in src/i18n).
 */
export const Localized = z.object({ ko: text, en: text, ja: text.optional() })
export type Localized = z.infer<typeof Localized>

export const LocalizedList = z.object({ ko: z.array(text), en: z.array(text), ja: z.array(text).optional() })

export const NameSet = z.object({ ko: text, en: text, ja: text })

/** Japanese floor label: B1F, 1F … 10F, RF. Never free text. */
export const FloorLabel = z.string().regex(/^(?:B[1-9]F|[1-9]\d?F|RF)$/, 'floor label like B1F, 1F, 10F')
export type FloorLabel = z.infer<typeof FloorLabel>

export const LatLng = z.object({
  lat: z.number().min(AKIBA_BBOX.south).max(AKIBA_BBOX.north),
  lng: z.number().min(AKIBA_BBOX.west).max(AKIBA_BBOX.east),
})

const HHMM = z.string().regex(/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/, 'HH:MM')

export const HoursRule = z.object({
  days: z.array(z.enum(DAY_KEYS)).min(1),
  open: HHMM,
  close: HHMM,
})

export const Hours = z.object({
  rules: z.array(HoursRule).min(1),
  regular_holiday: Localized.nullable().default(null),
  note: Localized.nullable().default(null),
  source_url: z.url(),
})
export type Hours = z.infer<typeof Hours>

export const Status = z.object({
  state: z.enum(['open', 'relocating', 'moved', 'closed']).default('open'),
  note: Localized.optional(),
  effective_date: z.iso.date().optional(),
  successor_id: slug.optional(),
})

export const Photo = z.object({
  /** Path under public/photos/ or an absolute URL. */
  url: text,
  /** "exterior" is what helps people recognize the store from the street. */
  kind: z.enum(['exterior', 'sign', 'interior', 'floor']).default('exterior'),
  /** Attribution shown in the card footer, e.g. "Chester (CC BY 2.0)". */
  credit: text,
  license: z.enum(['CC0', 'CC BY 2.0', 'CC BY 3.0', 'CC BY 4.0', 'CC BY-SA 2.0', 'CC BY-SA 3.0', 'CC BY-SA 4.0', 'own', 'permission']),
  /** Where it came from (Commons file page etc.). */
  source_url: z.url().nullable().default(null),
  /** When it was taken (YYYY or YYYY-MM-DD). Shown as "사진 2015" so an old storefront is not mistaken for current. */
  taken_on: z.string().regex(/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/).nullable().default(null),
})
export type Photo = z.infer<typeof Photo>

export const FloorGuideEntry = z.object({ floor: FloorLabel, ko: text, en: text, ja: text.optional() })

export const Store = z
  .object({
    id: slug,
    name: NameSet,
    synonyms: z.array(text).default([]),
    category: z.enum(CATEGORY_KEYS),
    tags: z.array(z.string().regex(/^[a-z0-9_]+$/)).default([]),
    one_line: Localized,
    building_id: slug.nullable().default(null),
    floors: z.array(FloorLabel).default([]),
    floor_guide: z.array(FloorGuideEntry).default([]),
    location: LatLng.nullable().default(null),
    street_segment: z.enum(STREET_SEGMENTS).nullable().default(null),
    address_ja: text,
    hours: Hours.nullable().default(null),
    tax_free: z.boolean().nullable().default(null),
    payment: z.enum(['cash_only', 'cards_ok', 'unknown']).default('unknown'),
    secondhand: z.enum(['new', 'used', 'both']).nullable().default(null),
    adult_content: z
      .object({ level: z.enum(['none', 'floor', 'store']), floors: z.array(FloorLabel).default([]) })
      .default({ level: 'none', floors: [] }),
    status: Status.default({ state: 'open' }),
    how_to_find: Localized.nullable().default(null),
    tips: LocalizedList.nullable().default(null),
    /** Primary photo (exterior/signboard preferred). null → category tile. Photos from v0 (decision 2026-09-04). */
    photo: Photo.nullable().default(null),
    /** Additional photos (interior, floors). Same rules as `photo`. */
    photos: z.array(Photo).default([]),
    official_url: z.url().nullable().default(null),
    sns: z.object({ x: z.url().optional(), instagram: z.url().optional() }).default({}),
    chain: slug.nullable().default(null),
    priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    confidence: z.enum(['high', 'medium', 'low']),
    verified_at: z.iso.date(),
    source_urls: z.array(z.url()).min(1),
    osm_id: z.string().regex(/^(?:node|way|relation)\/\d+$/).nullable().default(null),
  })
  .superRefine((s, ctx) => {
    if (s.building_id === null && s.location === null)
      ctx.addIssue({ code: 'custom', path: ['location'], message: 'standalone store needs a location' })
    if (s.building_id !== null && s.floors.length === 0)
      ctx.addIssue({ code: 'custom', path: ['floors'], message: 'tenant store needs at least one floor' })
    if (s.adult_content.level === 'floor' && s.adult_content.floors.length === 0)
      ctx.addIssue({ code: 'custom', path: ['adult_content', 'floors'], message: 'level=floor needs floors' })
    if (s.adult_content.level === 'store')
      ctx.addIssue({ code: 'custom', path: ['adult_content'], message: 'adult-only stores are not published (decision 2026-09-04)' })
    if ((s.status.state === 'relocating' || s.status.state === 'moved') && !s.status.note)
      ctx.addIssue({ code: 'custom', path: ['status', 'note'], message: 'relocating/moved needs a note' })
  })
export type Store = z.infer<typeof Store>
export type StoreInput = z.input<typeof Store>

export const Building = z.object({
  id: slug,
  name: NameSet,
  location: LatLng,
  address_ja: text,
  floors: z.array(FloorLabel).min(2),
  hours_note: Localized.nullable().default(null),
  exit_hint: Localized.nullable().default(null),
  floor_guide_url: z.url().nullable().default(null),
  official_url: z.url().nullable().default(null),
  uncurated_floors: z.array(FloorGuideEntry).default([]),
  photo: Photo.nullable().default(null),
  verified_at: z.iso.date(),
  source_urls: z.array(z.url()).min(1),
  osm_id: z.string().regex(/^(?:node|way|relation)\/\d+$/).nullable().default(null),
})
export type Building = z.infer<typeof Building>

/** Closed / moved-away venues that OSM seeding must never resurrect. */
export const ExcludedEntry = z.object({
  name_ja: text,
  name_en: text.optional(),
  reason: z.enum(['closed', 'moved_out_of_akiba', 'adult_only', 'merged']),
  date: z.iso.date().optional(),
  note: text.optional(),
  source_url: z.url().optional(),
})

export const Glossary = z.object({
  /** Japanese term or brand → preferred Korean / English rendering. */
  entries: z.array(z.object({ ja: text, ko: text, en: text, note: text.optional() })),
})
