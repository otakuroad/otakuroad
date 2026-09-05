/**
 * Walking distance from a station exit (PLAN §6.6 "출구 기준 방향감").
 *
 * In the Akihabara building canyon a phone's GPS is routinely 30 m off, which points at the wrong
 * building. So distances are measured from a fixed exit the visitor can actually see, not from the
 * blue dot, and the map opens at the Electric Town exit rather than recentring on the user.
 */

export interface LatLng {
  lat: number
  lng: number
}

export type AnchorKey = 'electric_town_exit' | 'showa_dori_exit' | 'suehirocho' | 'my_location'

export interface Anchor extends LatLng {
  key: AnchorKey
  /** i18n key for the display name (`anchor.*`). */
  labelKey: `anchor.${AnchorKey}`
}

/**
 * The three fixed anchors.
 *
 * These are hand-placed on the basemap at the street-level mouth of each exit. The cached Overpass
 * extract (`data/osm/overpass-akihabara-2026-09-04.json`) cannot refine them: its query is
 * `nwr shop / amenity cafe|theatre|restaurant / leisure amusement_arcade / building[name]`, so it
 * contains no `railway=subway_entrance` or station-entrance nodes at all. The nearest confirming
 * node is みどりの窓口 (node/7202136554, 35.698381 / 139.772518), the JR ticket office just inside
 * the Electric Town exit, which sits ~20 m from the value used here.
 */
export const ANCHORS: readonly Anchor[] = [
  // JR 秋葉原駅 電気街口 — the plaza in front of Radio Kaikan.
  { key: 'electric_town_exit', labelKey: 'anchor.electric_town_exit', lat: 35.69855, lng: 139.77245 },
  // JR 秋葉原駅 昭和通り口 — the east side of the station, towards Yodobashi.
  { key: 'showa_dori_exit', labelKey: 'anchor.showa_dori_exit', lat: 35.69835, lng: 139.77405 },
  // 末広町駅 (Tokyo Metro Ginza Line) — the northern end of the Chuo-dori strip.
  { key: 'suehirocho', labelKey: 'anchor.suehirocho', lat: 35.70235, lng: 139.77135 },
] as const

export const DEFAULT_ANCHOR: Anchor = ANCHORS[0] as Anchor

/** Map default view: the Electric Town exit, at the zoom where Radio Kaikan and Chuo-dori both fit. */
export const MAP_DEFAULT = { center: [139.77245, 35.69855] as [number, number], zoom: 16.5 }

/** Hard bounds so the map can never be panned out of Akihabara (PLAN §4.1). */
export const MAP_MAX_BOUNDS: [[number, number], [number, number]] = [
  [139.765, 35.694],
  [139.78, 35.708],
]

export const MAP_MIN_ZOOM = 15

const EARTH_RADIUS_M = 6371008.8

const toRad = (deg: number): number => (deg * Math.PI) / 180

/** Great-circle distance in metres. */
export function haversineMeters(from: LatLng, to: LatLng): number {
  const dLat = toRad(to.lat - from.lat)
  const dLng = toRad(to.lng - from.lng)
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Akihabara's grid means you rarely walk the straight line; 1.3 is the usual grid detour factor. */
export const DETOUR_FACTOR = 1.3
/** 80 m/min ≈ 4.8 km/h, the figure Japanese property listings use for 徒歩◯分. */
export const WALK_METERS_PER_MINUTE = 80

/** Walking minutes between two points, rounded up, never below 1 ("도보 0분" reads as broken). */
export function walkingMinutes(from: LatLng, to: LatLng): number {
  const meters = haversineMeters(from, to) * DETOUR_FACTOR
  return Math.max(1, Math.ceil(meters / WALK_METERS_PER_MINUTE))
}

/** GPS fixes worse than this are not trustworthy enough to use as a distance anchor (PLAN §4.1). */
export const GPS_ANCHOR_MAX_ACCURACY_M = 40
/** Above this we still show the blue dot but warn the visitor with a toast (PLAN §4.4). */
export const GPS_WARN_ACCURACY_M = 50
