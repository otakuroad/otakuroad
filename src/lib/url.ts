/**
 * Filter state ↔ URL query (PLAN §4.3: `?c=figure_hobby,trading_card&open=1`).
 *
 * `replaceState` rather than `pushState`: toggling a chip must not add a history entry, because the
 * back button is reserved for the sheet's breadcrumb (PLAN §6.3 "뒤로가기는 항상 한 단계").
 */
import { CATEGORY_KEYS, type CategoryKey } from '@/data/categories'

export interface FilterQuery {
  categories: CategoryKey[]
  openNow: boolean
  taxFree: boolean
}

const isCategory = (v: string): v is CategoryKey => (CATEGORY_KEYS as readonly string[]).includes(v)

export function readFilterQuery(search: string): FilterQuery {
  const params = new URLSearchParams(search)
  const categories = (params.get('c') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(isCategory)
  return {
    categories: [...new Set(categories)],
    openNow: params.get('open') === '1',
    taxFree: params.get('tf') === '1',
  }
}

/** The query string (without `?`) for a filter state. Empty when nothing is filtered. */
export function filterQueryString(filters: FilterQuery): string {
  const params = new URLSearchParams()
  if (filters.categories.length > 0) params.set('c', filters.categories.join(','))
  if (filters.openNow) params.set('open', '1')
  if (filters.taxFree) params.set('tf', '1')
  return params.toString()
}

/** Rewrite the address bar in place, preserving the history state object the sheet depends on. */
export function syncFilterQuery(filters: FilterQuery): void {
  if (typeof history === 'undefined') return
  const query = filterQueryString(filters)
  const url = `${location.pathname}${query ? `?${query}` : ''}${location.hash}`
  history.replaceState(history.state, '', url)
}

/**
 * The sheet a prerendered share page asked the map to open: `?s=<id>` or `?b=<id>` (PLAN §4.3,
 * "링크를 열면 같은 지도 위에 해당 시트가 열린 상태로 로드"). Consumed once on load and then dropped
 * from the address bar, because from that point the breadcrumb stack owns the sheet state.
 */
export function readDeepLink(search: string): { kind: 'store' | 'building'; id: string } | null {
  const params = new URLSearchParams(search)
  const store = params.get('s')
  if (store !== null && store.length > 0) return { kind: 'store', id: store }
  const building = params.get('b')
  if (building !== null && building.length > 0) return { kind: 'building', id: building }
  return null
}

/** `/ko/…?c=…` → `/en/…?c=…`. Used by the language switch in the info sheet. */
export function localizedHref(pathname: string, search: string, to: 'ko' | 'en'): string {
  const rest = pathname.replace(/^\/(ko|en)(?=\/|$)/, '')
  return `/${to}${rest || '/'}${search}`
}

/** `?basemap=positron|liberty` — a share link that forces a basemap, used to compare styles on a phone. */
export function readBasemapQuery(search: string): string | null {
  return new URLSearchParams(search).get('basemap')
}
