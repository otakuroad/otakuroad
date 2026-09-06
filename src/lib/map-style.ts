/**
 * OpenFreeMap Liberty, patched at runtime (PLAN §9 "OpenFreeMap Liberty 포크").
 *
 * Three changes:
 *  1. Labels prefer `name:ko` / `name:en` so a Korean visitor reads 秋葉原 as 아키하바라.
 *  2. The basemap's own shop and POI symbols are hidden, so the only shop marks on the map are ours
 *     (PLAN §4.1 "베이스맵의 상점 라벨은 bbox 안에서 억제"). MapLibre filter expressions cannot test
 *     a feature's coordinates, so there is no way to scope this to the bbox from inside the style —
 *     but `maxBounds` already pins the viewport inside Akihabara, so hiding those layers outright
 *     has exactly the effect the plan asks for.
 *
 *  3. Liberty's extruded 3D buildings (`fill-extrusion` layers) start hidden. Tester feedback
 *     (2026-09-06): a two-finger drag tilted the map, the buildings rose up and the pins became hard
 *     to read. The map is flat by default and 3D is an explicit toggle (see MapCanvas.setThreeD).
 *
 * When M6 swaps in self-hosted PMTiles this is the one file that changes.
 */
import type { Locale } from '@/i18n'

export const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

/** Keeps CJK glyphs off the network — the sprite/glyph server has no Korean or Japanese coverage. */
export const LOCAL_IDEOGRAPH_FONT_FAMILY =
  "'Pretendard Variable', 'Noto Sans CJK KR', 'Noto Sans KR', 'Apple SD Gothic Neo', 'Hiragino Sans', sans-serif"

export const ATTRIBUTION = '© OpenStreetMap contributors'

/** Minimal structural view of a MapLibre style — enough to patch it without importing the full types. */
interface StyleLayer {
  id: string
  type: string
  'source-layer'?: string
  layout?: Record<string, unknown>
  [key: string]: unknown
}

export interface MapStyle {
  layers: StyleLayer[]
  sources?: Record<string, unknown>
  [key: string]: unknown
}

/** Source layers that carry shop/POI symbols in the OpenMapTiles schema Liberty is built on. */
const POI_SOURCE_LAYERS = new Set(['poi'])

/** Layer ids Liberty uses for POI icons and labels, in case the source-layer test misses one. */
const POI_LAYER_ID = /(^|[-_])poi([-_]|$)/i

function isPoiLayer(layer: StyleLayer): boolean {
  const sourceLayer = layer['source-layer']
  if (typeof sourceLayer === 'string' && POI_SOURCE_LAYERS.has(sourceLayer)) return true
  return POI_LAYER_ID.test(layer.id)
}

/**
 * Replace a `text-field` with a locale-preferring `coalesce`.
 *
 * Liberty's text fields come in several shapes (`["get","name:latin"]`, a `concat` of latin and
 * nonlatin, a legacy `"{name}"` token). Rather than parse each, we prepend the localized names to
 * whatever was there, so an untranslated feature still shows its original label.
 */
function localizedTextField(existing: unknown, locale: Locale): unknown {
  const preferred: unknown[] =
    locale === 'ko'
      ? [['get', 'name:ko'], ['get', 'name:en'], ['get', 'name:latin']]
      : [['get', 'name:en'], ['get', 'name:latin']]
  const fallback = existing === undefined || existing === null ? ['get', 'name'] : existing
  return ['coalesce', ...preferred, fallback, ['get', 'name']]
}

export interface PatchOptions {
  /** Show the extruded buildings. Off by default — see note 3 above. */
  threeD?: boolean
}

/** Ids of the layers that draw extruded buildings; the 3D toggle shows and hides exactly these. */
export function extrusionLayerIds(style: MapStyle): string[] {
  return style.layers.filter((layer) => layer.type === 'fill-extrusion').map((layer) => layer.id)
}

/**
 * Apply the patches. Mutates nothing: returns a shallow-cloned style with cloned layers.
 */
export function patchStyle(style: MapStyle, locale: Locale, options: PatchOptions = {}): MapStyle {
  const layers = style.layers.map((layer) => {
    if (layer.type === 'fill-extrusion' && !options.threeD) {
      return { ...layer, layout: { ...(layer.layout ?? {}), visibility: 'none' } }
    }
    if (layer.type !== 'symbol') return layer
    if (isPoiLayer(layer)) {
      return { ...layer, layout: { ...(layer.layout ?? {}), visibility: 'none' } }
    }
    const layout = layer.layout ?? {}
    if (!('text-field' in layout)) return layer
    return { ...layer, layout: { ...layout, 'text-field': localizedTextField(layout['text-field'], locale) } }
  })
  return { ...style, layers }
}

/**
 * Fetch and patch the style. On any network failure we hand back the plain URL: an unlocalized
 * basemap with a few extra shop labels is far better than a blank map.
 */
export async function loadStyle(locale: Locale, signal?: AbortSignal, options: PatchOptions = {}): Promise<MapStyle | string> {
  try {
    const res = await fetch(STYLE_URL, { signal })
    if (!res.ok) return STYLE_URL
    const style = (await res.json()) as MapStyle
    if (!Array.isArray(style.layers)) return STYLE_URL
    return patchStyle(style, locale, options)
  } catch {
    return STYLE_URL
  }
}

/** Old Androids without WebGL2 get the list-only fallback instead of a blank canvas (PLAN §9). */
export function hasWebGL2(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return canvas.getContext('webgl2') !== null
  } catch {
    return false
  }
}
