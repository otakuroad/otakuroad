/**
 * The single source of truth for the map island: filters, the sheet's breadcrumb stack, the
 * reference time and the anchor. Everything the map, the chip row and the sheet render is derived
 * from here, so "the map, list and building badges all react" is structural rather than wired up
 * by hand in each component.
 */
import type { Building, Store } from '@/data/schema'
import type { CategoryKey } from '@/data/categories'
import { JP_HOLIDAYS } from '@/data/holidays-jp'
import type { Locale } from '@/i18n'
import {
  ANCHORS,
  DEFAULT_ANCHOR,
  GPS_ANCHOR_MAX_ACCURACY_M,
  walkingMinutes,
  type Anchor,
  type AnchorKey,
} from './geo'
import { getOpenState, type OpenState } from './hours'
import { loadAnchorKey, loadSaved, storeAnchorKey, storeSaved } from './storage'

/** One entry in the sheet's breadcrumb stack. The list is always the bottom of the stack. */
export type View =
  | { kind: 'list' }
  | { kind: 'store'; id: string }
  | { kind: 'building'; id: string }
  /** Two or more standalone stores whose pins overlap on screen (PLAN §3.1: no clustering). */
  | { kind: 'cluster'; ids: string[] }

export type Snap = 'peek' | 'half' | 'full'

export interface ListItem {
  kind: 'store' | 'building'
  id: string
  store: Store | null
  building: Building | null
  /** Walking minutes from the active anchor; `null` when the record has no coordinates. */
  minutes: number | null
  /** Tenants of this building that pass the current filter (buildings only). */
  matchingTenants: Store[]
  tenants: Store[]
}

/** Live time advances in whole minutes — a closing countdown that ticks every second is noise. */
const LIVE_TICK_MS = 30_000

export class AppState {
  readonly locale: Locale
  readonly stores: readonly Store[]
  readonly buildings: readonly Building[]
  readonly storeById: ReadonlyMap<string, Store>
  readonly buildingById: ReadonlyMap<string, Building>
  readonly tenantsByBuilding: ReadonlyMap<string, Store[]>
  /** Stores that own a pin: everything not inside a curated building (PLAN §3.1). */
  readonly standalone: readonly Store[]

  // ---- filters -------------------------------------------------------------
  categories = $state<CategoryKey[]>([])
  openNow = $state(false)
  taxFree = $state(false)

  // ---- reference time ------------------------------------------------------
  /** `null` = live Tokyo time. Otherwise the instant the visitor picked in the info sheet. */
  referenceTime = $state<Date | null>(null)
  private liveNow = $state(new Date())
  private timer: ReturnType<typeof setInterval> | null = null

  // ---- anchor / location ---------------------------------------------------
  anchorKey = $state<AnchorKey>(DEFAULT_ANCHOR.key)
  myLocation = $state<{ lat: number; lng: number; accuracy: number } | null>(null)

  // ---- sheet ---------------------------------------------------------------
  stack = $state<View[]>([{ kind: 'list' }])
  snap = $state<Snap>('peek')
  listMode = $state<'all' | 'saved'>('all')
  searchOpen = $state(false)
  infoOpen = $state(false)
  /** Scroll offsets per stack depth, so going back to a floor stack lands where you left it. */
  scrollMemory = new Map<number, number>()

  // ---- session / persisted -------------------------------------------------
  savedIds = $state<string[]>([])
  /** Pins dimmed to 60% because they were opened in this session (PLAN §4.1). Not persisted. */
  visitedIds = $state<string[]>([])
  hoveredId = $state<string | null>(null)
  toast = $state<string | null>(null)
  private toastTimer: ReturnType<typeof setTimeout> | null = null

  constructor(locale: Locale, stores: readonly Store[], buildings: readonly Building[]) {
    this.locale = locale
    this.stores = stores
    this.buildings = buildings
    this.storeById = new Map(stores.map((s) => [s.id, s]))
    this.buildingById = new Map(buildings.map((b) => [b.id, b]))
    const tenants = new Map<string, Store[]>()
    for (const b of buildings) tenants.set(b.id, [])
    for (const s of stores) {
      if (s.building_id !== null) tenants.get(s.building_id)?.push(s)
    }
    this.tenantsByBuilding = tenants
    this.standalone = stores.filter((s) => s.building_id === null && s.location !== null)
  }

  /** Browser-only setup: restores localStorage, starts the live clock. */
  start(): () => void {
    this.savedIds = loadSaved()
    const anchor = loadAnchorKey()
    if (anchor !== null && ANCHORS.some((a) => a.key === anchor)) this.anchorKey = anchor as AnchorKey
    this.timer = setInterval(() => {
      this.liveNow = new Date()
    }, LIVE_TICK_MS)
    return () => {
      if (this.timer !== null) clearInterval(this.timer)
      this.timer = null
    }
  }

  // ---- derived -------------------------------------------------------------

  /** The instant every open-state in the app is evaluated against. */
  now = $derived(this.referenceTime ?? this.liveNow)

  anchor = $derived.by((): Anchor => {
    if (this.anchorKey === 'my_location' && this.myLocation !== null) {
      return {
        key: 'my_location',
        labelKey: 'anchor.my_location',
        lat: this.myLocation.lat,
        lng: this.myLocation.lng,
      }
    }
    return ANCHORS.find((a) => a.key === this.anchorKey) ?? DEFAULT_ANCHOR
  })

  /** True only when a GPS fix is good enough to measure distances from (PLAN §4.1). */
  canUseGpsAnchor = $derived(this.myLocation !== null && this.myLocation.accuracy <= GPS_ANCHOR_MAX_ACCURACY_M)

  /** Open state for every store, recomputed whenever the reference time moves. */
  openStates = $derived.by((): ReadonlyMap<string, OpenState> => {
    const at = this.now
    return new Map(this.stores.map((s) => [s.id, getOpenState(s.hours, at, JP_HOLIDAYS)]))
  })

  openStateOf(id: string): OpenState {
    return this.openStates.get(id) ?? { state: 'unknown' }
  }

  filtersActive = $derived(this.categories.length > 0 || this.openNow || this.taxFree)

  /** Category OR, then "open now" and "tax-free" as ANDs (PLAN §4.4). */
  matches(store: Store): boolean {
    if (this.categories.length > 0 && !this.categories.includes(store.category)) return false
    if (this.taxFree && store.tax_free !== true) return false
    if (this.openNow) {
      const state = this.openStateOf(store.id).state
      if (state !== 'open' && state !== 'closing_soon') return false
    }
    return true
  }

  matchingStoreIds = $derived.by((): ReadonlySet<string> => {
    const ids = new Set<string>()
    for (const s of this.stores) if (this.matches(s)) ids.add(s.id)
    return ids
  })

  /** Live counts on the chips: how many stores each category would leave visible. */
  categoryCounts = $derived.by((): ReadonlyMap<CategoryKey, number> => {
    const counts = new Map<CategoryKey, number>()
    for (const s of this.stores) {
      // Count against the non-category filters only, so a chip shows what turning it on would give.
      if (this.taxFree && s.tax_free !== true) continue
      if (this.openNow) {
        const state = this.openStateOf(s.id).state
        if (state !== 'open' && state !== 'closing_soon') continue
      }
      counts.set(s.category, (counts.get(s.category) ?? 0) + 1)
    }
    return counts
  })

  openNowCount = $derived.by((): number => {
    let n = 0
    for (const s of this.stores) {
      if (this.categories.length > 0 && !this.categories.includes(s.category)) continue
      if (this.taxFree && s.tax_free !== true) continue
      const state = this.openStateOf(s.id).state
      if (state === 'open' || state === 'closing_soon') n += 1
    }
    return n
  })

  taxFreeCount = $derived.by((): number => {
    let n = 0
    for (const s of this.stores) {
      if (this.categories.length > 0 && !this.categories.includes(s.category)) continue
      if (this.openNow) {
        const state = this.openStateOf(s.id).state
        if (state !== 'open' && state !== 'closing_soon') continue
      }
      if (s.tax_free === true) n += 1
    }
    return n
  })

  /** Matching-tenant count per building — the "3/14" pin badge. */
  buildingMatchCounts = $derived.by((): ReadonlyMap<string, number> => {
    const counts = new Map<string, number>()
    for (const b of this.buildings) {
      const tenants = this.tenantsByBuilding.get(b.id) ?? []
      counts.set(b.id, tenants.filter((s) => this.matchingStoreIds.has(s.id)).length)
    }
    return counts
  })

  /** The nearby list: standalone stores plus buildings, nearest first from the active anchor. */
  nearby = $derived.by((): ListItem[] => {
    const anchor = this.anchor
    const items: ListItem[] = []
    for (const s of this.standalone) {
      if (!this.matchingStoreIds.has(s.id)) continue
      items.push({
        kind: 'store',
        id: s.id,
        store: s,
        building: null,
        minutes: s.location === null ? null : walkingMinutes(anchor, s.location),
        matchingTenants: [],
        tenants: [],
      })
    }
    for (const b of this.buildings) {
      const tenants = this.tenantsByBuilding.get(b.id) ?? []
      const matching = tenants.filter((s) => this.matchingStoreIds.has(s.id))
      if (this.filtersActive && matching.length === 0) continue
      items.push({
        kind: 'building',
        id: b.id,
        store: null,
        building: b,
        minutes: walkingMinutes(anchor, b.location),
        matchingTenants: matching,
        tenants,
      })
    }
    return items.sort((a, b) => (a.minutes ?? 9999) - (b.minutes ?? 9999))
  })

  savedItems = $derived.by((): ListItem[] => {
    const saved = new Set(this.savedIds)
    const anchor = this.anchor
    const items: ListItem[] = []
    for (const id of this.savedIds) {
      const store = this.storeById.get(id)
      if (store) {
        items.push({
          kind: 'store',
          id,
          store,
          building: null,
          minutes: store.location === null ? null : walkingMinutes(anchor, store.location),
          matchingTenants: [],
          tenants: [],
        })
        continue
      }
      const building = this.buildingById.get(id)
      if (building) {
        const tenants = this.tenantsByBuilding.get(id) ?? []
        items.push({
          kind: 'building',
          id,
          store: null,
          building,
          minutes: walkingMinutes(anchor, building.location),
          matchingTenants: tenants.filter((s) => this.matchingStoreIds.has(s.id)),
          tenants,
        })
      }
    }
    return items.filter((i) => saved.has(i.id))
  })

  listItems = $derived(this.listMode === 'saved' ? this.savedItems : this.nearby)

  view = $derived(this.stack[this.stack.length - 1] as View)

  selectedId = $derived.by((): string | null => {
    const v = this.view
    return v.kind === 'store' || v.kind === 'building' ? v.id : null
  })

  // ---- filter actions ------------------------------------------------------

  toggleCategory(key: CategoryKey): void {
    this.categories = this.categories.includes(key)
      ? this.categories.filter((k) => k !== key)
      : [...this.categories, key]
  }

  resetFilters(): void {
    this.categories = []
    this.openNow = false
    this.taxFree = false
  }

  setAnchor(key: AnchorKey): void {
    this.anchorKey = key
    storeAnchorKey(key)
  }

  // ---- sheet navigation ----------------------------------------------------

  /**
   * Push a view onto the breadcrumb stack. Each push is one history entry, so the browser's back
   * button always goes exactly one step (PLAN §6.3).
   */
  push(view: View, snap: Snap = 'peek'): void {
    if (view.kind === 'store' || view.kind === 'building') {
      if (!this.visitedIds.includes(view.id)) this.visitedIds = [...this.visitedIds, view.id]
    }
    this.stack = [...this.stack, view]
    this.snap = snap
    if (typeof history !== 'undefined') history.pushState({ or: this.stack.length }, '')
  }

  /** Replace the top of the stack (a floor-stack row swaps in a store card at the same depth). */
  replaceTop(view: View, snap: Snap = 'peek'): void {
    if (this.stack.length === 1) {
      this.push(view, snap)
      return
    }
    this.stack = [...this.stack.slice(0, -1), view]
    this.snap = snap
  }

  /** Ask the browser to go back; the popstate handler does the actual truncation. */
  back(): void {
    if (this.stack.length <= 1) return
    if (typeof history !== 'undefined') history.back()
    else this.truncate(this.stack.length - 1)
  }

  closeAll(): void {
    const steps = this.stack.length - 1
    if (steps <= 0) return
    if (typeof history !== 'undefined') history.go(-steps)
    else this.truncate(1)
  }

  /** Called from `popstate`: the state object carries the stack depth that entry represents. */
  truncate(depth: number): void {
    const next = Math.max(1, Math.min(depth, this.stack.length))
    if (next === this.stack.length) return
    for (let d = this.stack.length; d > next; d -= 1) this.scrollMemory.delete(d)
    this.stack = this.stack.slice(0, next)
    if (this.stack.length === 1) this.snap = 'peek'
  }

  // ---- saved / toast -------------------------------------------------------

  isSaved(id: string): boolean {
    return this.savedIds.includes(id)
  }

  toggleSaved(id: string): void {
    this.savedIds = this.isSaved(id) ? this.savedIds.filter((s) => s !== id) : [...this.savedIds, id]
    storeSaved(this.savedIds)
  }

  showToast(message: string, ms = 3500): void {
    this.toast = message
    if (this.toastTimer !== null) clearTimeout(this.toastTimer)
    this.toastTimer = setTimeout(() => {
      this.toast = null
    }, ms)
  }
}
