<script lang="ts">
  /**
   * MapLibre GL with DOM markers (PLAN §9: "DOM 마커로 접근성").
   *
   * Markers are real `<button>`s rendered by Svelte and then handed to `maplibregl.Marker`, which
   * moves them into the map container. That keeps them focusable, labelled and reactive — a symbol
   * layer would be none of those — while every marker state stays plain CSS.
   *
   * No clustering and no spiderfy anywhere in the product (PLAN §3.1). Density is handled instead by
   * folding pins that would overlap into their most notable neighbour (`computeThinning`); tapping
   * the survivor shows a small "이 자리에 N곳" list instead of silently picking one.
   */
  // Type-only: the library and its stylesheet are loaded lazily below so the shell, the chip row
  // and the nearby list paint before ~1.2 MB of map engine is on the wire (PLAN §11 "셸 먼저").
  import type { GeoJSONSource, Map as MapLibreMap, Marker, StyleSpecification } from 'maplibre-gl'
  import type { AppState } from '@/lib/app-state.svelte'
  import { categoryLabel, openStateShort } from '@/lib/format'
  import { colorFor, type GlyphKey } from '@/lib/glyphs'
  import {
    MAP_DEFAULT,
    MAP_MAX_BOUNDS,
    MAP_MIN_ZOOM,
    GPS_WARN_ACCURACY_M,
    haversineMeters,
  } from '@/lib/geo'
  import { ATTRIBUTION, LOCAL_IDEOGRAPH_FONT_FAMILY, loadStyle, extrusionLayerIds, type BasemapKey, type MapStyle } from '@/lib/map-style'
  import { t } from '@/i18n'
  import Glyph from './Glyph.svelte'

  interface Props {
    app: AppState
    /** Pixels of the viewport hidden by the sheet, so a selected pin is panned above it. */
    obstructBottom: number
    onselectstore: (id: string) => void
    onselectbuilding: (id: string) => void
    onselectcluster: (ids: string[]) => void
    onemptytap: () => void
    /** Start in 3D (tilted camera, extruded buildings). Read once at map creation; use `setThreeD` after. */
    threeD?: boolean
    /** Fired after every style load with whether the style has extruded buildings (i.e. can show 3D). */
    onextrusions?: (has: boolean) => void
  }

  let { app, obstructBottom, onselectstore, onselectbuilding, onselectcluster, onemptytap, threeD = false, onextrusions }: Props = $props()

  /** The 3D state as last set; `threeD` is only the initial value. */
  let threeDNow = threeD
  /** Basemap the map is currently showing; changes to `app.basemap` are applied by `setBasemap`. */
  let currentBasemap: BasemapKey | null = null

  /** Camera tilt used by the 3D view. Steep enough for buildings to read as blocks, shallow enough that
   * pins near the top of the screen stay tappable. */
  const THREE_D_PITCH = 55

  interface Pin {
    id: string
    kind: 'store' | 'building'
    glyph: GlyphKey
    lat: number
    lng: number
    name: string
    priority: number
    inactive: boolean
  }

  /** Pins never change at runtime — the dataset is baked at build time — so this is computed once. */
  const pins: Pin[] = [
    ...app.standalone.map((s) => ({
      id: s.id,
      kind: 'store' as const,
      glyph: s.category as GlyphKey,
      lat: s.location?.lat ?? 0,
      lng: s.location?.lng ?? 0,
      name: s.name[app.locale],
      priority: s.priority,
      inactive: s.status.state !== 'open',
    })),
    ...app.buildings.map((b) => ({
      id: b.id,
      kind: 'building' as const,
      glyph: 'building' as GlyphKey,
      lat: b.location.lat,
      lng: b.location.lng,
      name: b.name[app.locale],
      priority: 1,
      inactive: false,
    })),
  ]

  let container = $state<HTMLDivElement | null>(null)
  let map: MapLibreMap | null = null
  let meMarker: Marker | null = null
  /** The lazily imported module, kept so `locate()` can build the blue-dot marker later. */
  let maplibreMod: typeof import('maplibre-gl') | null = null
  const markerEls: Record<string, HTMLButtonElement | null> = $state({})
  /** Ids whose label survived the collision pass; see `computeLabels`. */
  let placedLabelIds = $state<string[]>([])
  /** Ids folded into a nearby pin because they would otherwise overlap it; see `computeThinning`. */
  let thinnedIds = $state<Set<string>>(new Set())
  /** Kept pin id → the ids it now stands for, itself first. Drives the "이 자리에 N곳" list. */
  let groupByRep = $state<Map<string, string[]>>(new Map())
  /** Ids whose label had to be flipped to the left of the pin to stay on screen. */
  let leftLabelIds = $state<string[]>([])
  const flipped = $derived(new Set(leftLabelIds))
  /**
   * The pin that stands for the current selection: a standalone shop's own pin, or for a tenant
   * (which has no coordinate) the pin of its building. Before this, picking a tenant in the list
   * moved nothing on the map (tester feedback 2026-09-06).
   */
  function mapPinIdFor(id: string): string | null {
    if (pins.some((p) => p.id === id)) return id
    return app.storeById.get(id)?.building_id ?? null
  }
  const focusedPinId = $derived(app.selectedId === null ? null : mapPinIdFor(app.selectedId))
  const labelled = $derived(
    new Set([...placedLabelIds, focusedPinId, app.hoveredId].filter((id): id is string => id !== null)),
  )

  const ACCURACY_SOURCE = 'me-accuracy'
  const MAP_CSS_ID = 'maplibre-gl-css'

  /** MapLibre's own stylesheet, added once the map starts rather than in the critical head. */
  function injectMapCss(css: string): void {
    if (document.getElementById(MAP_CSS_ID) !== null) return
    const style = document.createElement('style')
    style.id = MAP_CSS_ID
    style.textContent = css
    document.head.appendChild(style)
  }

  // ---- lifecycle -----------------------------------------------------------

  $effect(() => {
    const el = container
    if (el === null) return
    let disposed = false
    const abort = new AbortController()

    void (async () => {
      const [maplibre, workerUrl, mapCss, style] = await Promise.all([
        import('maplibre-gl'),
        import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'),
        import('maplibre-gl/dist/maplibre-gl.css?inline'),
        loadStyle(app.locale, abort.signal, { threeD, basemap: app.basemap }),
      ])
      currentBasemap = app.basemap
      if (disposed) return
      // See src/vite-env.d.ts: without this MapLibre looks for a worker file the bundler never
      // emitted, and the basemap renders as an empty background colour.
      maplibre.setWorkerUrl(new URL(workerUrl.default, location.href).href)
      injectMapCss(mapCss.default)
      const m = new maplibre.Map({
        container: el,
        style,
        center: MAP_DEFAULT.center,
        zoom: MAP_DEFAULT.zoom,
        minZoom: MAP_MIN_ZOOM,
        maxBounds: MAP_MAX_BOUNDS,
        attributionControl: false,
        // Keeps CJK label glyphs local instead of asking the glyph server for ranges it lacks.
        localIdeographFontFamily: LOCAL_IDEOGRAPH_FONT_FAMILY,
        dragRotate: false,
        pitchWithRotate: false,
        // The map is flat unless the visitor asks for 3D: an accidental two-finger drag used to tilt
        // it and raise the buildings over the pins (tester feedback 2026-09-06).
        touchPitch: threeD,
        pitch: threeD ? THREE_D_PITCH : 0,
        maxPitch: 60,
        fadeDuration: 120,
      })
      map = m
      maplibreMod = maplibre
      m.touchZoomRotate.disableRotation()
      m.keyboard.disableRotation()
      m.addControl(
        new maplibre.AttributionControl({ compact: true, customAttribution: ATTRIBUTION }),
        'bottom-right',
      )
      m.on('zoom', scheduleLabels)
      m.on('move', scheduleLabels)
      m.on('idle', scheduleLabels)
      // Marker clicks never reach the canvas, so a map click is by definition empty space.
      m.on('click', () => onemptytap())
      m.on('error', (e) => console.warn('[map]', e.error?.message ?? e))
      m.on('load', () => {
        if (disposed) return
        afterStyleLoad(m)
      })

      for (const pin of pins) {
        const markerEl = markerEls[pin.id]
        if (!markerEl) continue
        new maplibre.Marker({ element: markerEl, anchor: 'center' })
          .setLngLat([pin.lng, pin.lat])
          .addTo(m)
      }
      lastVisibleKey = visiblePins()
        .map((p) => p.id)
        .join(',')
      if (focusedPinId !== null) focusPin(focusedPinId, 0)
      else fitToVisible(0)
      if (app.geoTracking) startTracking()
      fittedOnce = true
      scheduleLabels()
    })()

    return () => {
      disposed = true
      abort.abort()
      if (watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) navigator.geolocation.clearWatch(watchId)
      watchId = null
      meMarker?.remove()
      meMarker = null
      maplibreMod = null
      map?.remove()
      map = null
    }
  })

  // ---- camera ---------------------------------------------------------------

  /**
   * The opening camera frames the shops, not the station.
   *
   * A fixed centre on the Electric Town exit at z16.5 fills the lower half of a phone with the
   * Kanda river and the rail yard and pushes about half the pins off the north-west edge. So the
   * camera fits the pins that are actually visible, padded for the chrome above and the sheet
   * below. The exit stays the distance anchor (PLAN §6.6) — this is only about the framing.
   */
  const CHROME_TOP_PX = 118
  const EDGE_PX = 44
  /** Stops a single matching pin from zooming to street level. */
  const FIT_MAX_ZOOM = 17.2
  /**
   * Floor for the fitted zoom. Below roughly this the dense Chuo-dori stretch collapses into one
   * unreadable clump of overlapping markers, which is a worse opening view than a couple of pins
   * starting just off-screen — those are one pan away and sit at the top of the nearby list anyway.
   */
  const FIT_MIN_ZOOM = 16.4
  /** Quartiles are meaningless on a handful of points, so small sets are never trimmed. */
  const MIN_PINS_TO_TRIM = 6

  function fitPadding(): { top: number; bottom: number; left: number; right: number } {
    const canvas = map?.getCanvas()
    const width = canvas?.clientWidth ?? 390
    const height = canvas?.clientHeight ?? 800
    // MapLibre cannot fit into a box with no room left, so cap the padding well short of the canvas.
    const top = Math.min(CHROME_TOP_PX, height * 0.22)
    const bottom = Math.min(obstructBottom + 28, height * 0.45)
    const side = Math.min(EDGE_PX, width * 0.15)
    return { top, bottom, left: side, right: side }
  }

  function visiblePins(): Pin[] {
    return pins.filter((p) => !isHidden(p))
  }

  /** Linear-interpolated quantile of an already-sortable list of numbers. */
  function quantile(sorted: readonly number[], p: number): number {
    const i = (sorted.length - 1) * p
    const lo = Math.floor(i)
    const hi = Math.ceil(i)
    return (sorted[lo] as number) + ((sorted[hi] as number) - (sorted[lo] as number)) * (i - lo)
  }

  /** Tukey fence: anything beyond 1.5 interquartile ranges outside the quartiles is an outlier. */
  function tukeyFence(values: number[]): [number, number] {
    const sorted = [...values].sort((a, b) => a - b)
    const q1 = quantile(sorted, 0.25)
    const q3 = quantile(sorted, 0.75)
    const iqr = q3 - q1
    return [q1 - 1.5 * iqr, q3 + 1.5 * iqr]
  }

  /**
   * The visible pins minus geographic outliers.
   *
   * Framing every last pin means reaching Yodobashi in the east and the Suehirocho shops in the
   * north, which drags the opening zoom below the point where the Chuo-dori cluster is legible. The
   * camera therefore frames the core of the set — outliers are one pan away, and the nearby list is
   * sorted by walking distance, so they stay one tap away too.
   */
  function corePins(): Pin[] {
    const shown = visiblePins()
    if (shown.length < MIN_PINS_TO_TRIM) return shown
    const [latLo, latHi] = tukeyFence(shown.map((p) => p.lat))
    const [lngLo, lngHi] = tukeyFence(shown.map((p) => p.lng))
    const core = shown.filter((p) => p.lat >= latLo && p.lat <= latHi && p.lng >= lngLo && p.lng <= lngHi)
    // If the trim would leave almost nothing the spread is genuinely even, so keep everything.
    return core.length >= 3 ? core : shown
  }

  function fitToVisible(duration: number): void {
    const m = map
    if (m === null) return
    const core = corePins()
    if (core.length === 0) return
    let west = Number.POSITIVE_INFINITY
    let south = Number.POSITIVE_INFINITY
    let east = Number.NEGATIVE_INFINITY
    let north = Number.NEGATIVE_INFINITY
    for (const p of core) {
      west = Math.min(west, p.lng)
      east = Math.max(east, p.lng)
      south = Math.min(south, p.lat)
      north = Math.max(north, p.lat)
    }
    const bounds: [[number, number], [number, number]] = [
      [west, south],
      [east, north],
    ]
    const padding = fitPadding()
    // fitBounds has no minimum-zoom option, so the camera is computed first and then clamped.
    const camera = m.cameraForBounds(bounds, { padding, maxZoom: FIT_MAX_ZOOM })
    if (camera === undefined || camera.center === undefined) {
      m.fitBounds(bounds, { padding, maxZoom: FIT_MAX_ZOOM, duration })
      return
    }
    const zoom = Math.min(FIT_MAX_ZOOM, Math.max(FIT_MIN_ZOOM, camera.zoom ?? FIT_MIN_ZOOM))
    m.easeTo({ center: camera.center, zoom, duration })
  }

  /**
   * Centre one pin in the strip of map the chrome and sheet leave visible. Used when a prerendered
   * share page hands the island a `?s=` / `?b=` deep link: fitting all the pins would bury the one
   * the visitor actually followed the link for.
   */
  export function focusPin(id: string, duration = 600): void {
    const m = map
    const pin = pins.find((p) => p.id === id)
    if (m === null || pin === undefined) return
    const pad = fitPadding()
    m.easeTo({
      center: [pin.lng, pin.lat],
      zoom: Math.max(m.getZoom(), 17),
      offset: [0, (pad.top - pad.bottom) / 2],
      duration,
    })
  }

  /**
   * Is the core of the visible set already inside the strip of map the chrome and sheet leave
   * clear? Tested against the same trimmed set the camera frames — otherwise a permanent outlier
   * like Yodobashi would report "out of frame" forever and refit on every filter change.
   */
  function corePinsInFrame(): boolean {
    const m = map
    if (m === null) return true
    const canvas = m.getCanvas()
    const pad = fitPadding()
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    return corePins().every((p) => {
      const pt = m.project([p.lng, p.lat])
      return pt.x >= pad.left && pt.x <= width - pad.right && pt.y >= pad.top && pt.y <= height - pad.bottom
    })
  }

  /**
   * Refit when a filter changes the visible set and some of it fell outside the frame — with
   * `?c=retro_game` only one of the four matching pins used to be on screen.
   */
  let lastVisibleKey = ''
  let fittedOnce = false

  $effect(() => {
    const key = visiblePins()
      .map((p) => p.id)
      .join(',')
    if (map === null) {
      lastVisibleKey = key
      return
    }
    if (!fittedOnce) return
    if (key === lastVisibleKey) return
    lastVisibleKey = key
    if (!corePinsInFrame()) fitToVisible(520)
  })

  // ---- label placement ------------------------------------------------------

  /**
   * Labels are DOM, so nothing places them for us. PLAN §4.1 asks for `priority: 1` landmarks from
   * z16 and everything from z18; in a district this dense that alone stacks four names on top of
   * each other. So the eligible set goes through a greedy pass — landmarks first, then whatever is
   * closest to the centre of the map — and a label that would collide with an already-placed label
   * or with any pin body is simply dropped. The pin itself never disappears, only its name.
   *
   * The collision pass, not the zoom, is what actually keeps the map readable, so the landmark gate
   * sits at the product's own `minZoom` rather than at z16. A hard z16 gate was fine while the
   * camera was pinned at z16.5, but the opening view now fits the visible pins: as the dataset grew
   * past the station the fit dropped just under 16 and every label vanished at once. Everything
   * still waits for z18, which is where the long tail becomes legible.
   */
  const LABEL_ZOOM_LANDMARK = MAP_MIN_ZOOM
  const LABEL_ZOOM_ALL = 18
  let labelFrame = 0

  /**
   * Label widths depend on the font that is actually in use, so the first pass can under-measure
   * while a webfont is still loading. One more pass once `document.fonts` settles fixes that.
   */
  $effect(() => {
    if (typeof document === 'undefined' || document.fonts === undefined) return
    let cancelled = false
    void document.fonts.ready.then(() => {
      if (!cancelled) scheduleLabels()
    })
    return () => {
      cancelled = true
    }
  })

  function scheduleLabels(): void {
    if (labelFrame !== 0) return
    labelFrame = requestAnimationFrame(() => {
      labelFrame = 0
      computeThinning()
      computeLabels()
    })
  }

  /**
   * Minimum gap between two drawn pin centres. The marker body is 28px, so 30 is the point where
   * pins merely stop touching; 38 leaves enough clear ground between them for names to place as
   * well. At 300+ shops that difference is what keeps the opening view legible — measured on a
   * 390px phone it drops the drawn pins from 113 to 92 and brings the labels back from 3 to 5.
   */
  const SEPARATION_PX = 38

  /**
   * Akihabara puts dozens of shops on one block, and at the opening zoom ~90 standalone pins
   * collapse into an unreadable field. Rather than the numeric clusters PLAN §4.1 rules out, keep
   * the most notable pin in each crowded spot and fold its neighbours into it: the survivor's tap
   * opens "이 자리에 N곳" listing all of them, and zooming in spreads the points apart so the folded
   * pins reappear on their own. Buildings are never folded — they are what absorbs density here.
   */
  function computeThinning(): void {
    const m = map
    if (m === null) return
    const projected = pins
      .filter((p) => !isHidden(p))
      .map((p) => ({ pin: p, pt: m.project([p.lng, p.lat]) }))
      .sort((a, b) => rank(a.pin) - rank(b.pin) || a.pt.x - b.pt.x)

    const kept: { id: string; x: number; y: number }[] = []
    const groups = new Map<string, string[]>()
    const folded = new Set<string>()

    for (const { pin, pt } of projected) {
      const near =
        pin.kind === 'building'
          ? undefined
          : kept.find((k) => Math.hypot(k.x - pt.x, k.y - pt.y) < SEPARATION_PX)
      if (near === undefined) {
        kept.push({ id: pin.id, x: pt.x, y: pt.y })
        groups.set(pin.id, [pin.id])
      } else {
        folded.add(pin.id)
        groups.get(near.id)?.push(pin.id)
      }
    }
    thinnedIds = folded
    groupByRep = groups
  }

  /** Draw order for thinning: buildings, then the pin the user is touching, then by priority. */
  function rank(pin: Pin): number {
    if (pin.kind === 'building') return -2
    if (pin.id === focusedPinId || pin.id === app.hoveredId) return -1
    return pin.priority
  }

  interface Box {
    x1: number
    y1: number
    x2: number
    y2: number
    /** Pin this obstacle belongs to, so a label is not blocked by its own marker. */
    owner?: string
  }

  const overlaps = (a: Box, b: Box): boolean => !(a.x2 < b.x1 || a.x1 > b.x2 || a.y2 < b.y1 || a.y1 > b.y2)

  /** A label must keep this much clear of the viewport edge to count as fitting. */
  const EDGE_MARGIN_PX = 8
  /** `.mk-label` is offset this far from the marker element's own left edge (see the CSS below). */
  const LABEL_OFFSET_PX = 36
  /** Half the 44px marker box: the distance from the pin's anchor point to that left edge. */
  const MARKER_HALF_PX = 22
  /** The white text-shadow halo spreads past the text box and must clear the edge as well. */
  const LABEL_HALO_PX = 4

  function computeLabels(): void {
    const m = map
    if (m === null) return
    const z = m.getZoom()
    const canvas = m.getCanvas()
    const width = canvas.clientWidth
    const height = canvas.clientHeight

    // Folded pins are not drawn, so they neither get a label nor block anyone else's.
    const visible = pins
      .filter((p) => !isHidden(p) && !thinnedIds.has(p.id))
      .map((p) => ({ pin: p, pt: m.project([p.lng, p.lat]) }))
    // Pin bodies are obstacles: a name must never sit on top of another shop's glyph. A pin's own
    // body is tagged so it cannot block its own label, which starts just inside the 44px hit area.
    const taken: Box[] = visible.map(({ pin, pt }) => ({
      x1: pt.x - 18,
      y1: pt.y - 18,
      x2: pt.x + 18,
      y2: pt.y + 18,
      owner: pin.id,
    }))

    const eligible = visible
      .filter(({ pin, pt }) => {
        if (z < LABEL_ZOOM_LANDMARK) return false
        if (z < LABEL_ZOOM_ALL && pin.priority !== 1) return false
        return pt.x > -60 && pt.y > -40 && pt.x < width + 60 && pt.y < height + 40
      })
      .sort(
        (a, b) =>
          a.pin.priority - b.pin.priority ||
          Math.hypot(a.pt.x - width / 2, a.pt.y - height / 2) - Math.hypot(b.pt.x - width / 2, b.pt.y - height / 2),
      )

    const out: string[] = []
    const left: string[] = []
    for (const { pin, pt } of eligible) {
      const label = markerEls[pin.id]?.querySelector('.mk-label') as HTMLElement | null
      // getBoundingClientRect, not offsetWidth: offsetWidth rounds to whole pixels, and after a
      // webfont swaps in the rounded value can under-measure enough to let a label touch the edge.
      const labelWidth = label === null ? 90 : label.getBoundingClientRect().width
      // Mirrors the CSS exactly: the label starts LABEL_OFFSET_PX from the marker element's left
      // edge, which itself sits MARKER_HALF_PX left of the anchor point.
      const inset = LABEL_OFFSET_PX - MARKER_HALF_PX
      const span = labelWidth + LABEL_HALO_PX
      const rightBox: Box = { x1: pt.x + inset, y1: pt.y - 9, x2: pt.x + inset + span, y2: pt.y + 9 }
      const leftBox: Box = { x1: pt.x - inset - span, y1: pt.y - 9, x2: pt.x - inset, y2: pt.y + 9 }
      const fits = (box: Box): boolean =>
        box.x1 >= EDGE_MARGIN_PX &&
        box.x2 <= width - EDGE_MARGIN_PX &&
        !taken.some((t) => t.owner !== pin.id && overlaps(box, t))
      // A pin in the right-hand part of the viewport gets its name on the left first, so a long
      // name is never sliced by the screen edge; if neither side fits, the label is dropped.
      const preferLeft = pt.x > width * 0.6
      const first = preferLeft ? leftBox : rightBox
      const second = preferLeft ? rightBox : leftBox
      const chosen = fits(first) ? first : fits(second) ? second : null
      if (chosen === null) continue
      taken.push(chosen)
      out.push(pin.id)
      if (chosen === leftBox) left.push(pin.id)
    }
    placedLabelIds = out
    leftLabelIds = left
  }

  // Filters change which pins exist, and selecting or hovering promotes a pin past the thinning
  // pass, so both need the placement recomputed.
  $effect(() => {
    void app.matchingStoreIds
    void app.selectedId
    void app.hoveredId
    scheduleLabels()
  })

  // ---- selection ------------------------------------------------------------

  // A selection — from the list, the search, a marker tap or a deep link — centres the map on its
  // pin in the strip the sheet leaves clear and zooms in enough to see the block (tester feedback
  // 2026-09-06: "clicking in the list should centre and highlight the shop").
  $effect(() => {
    const id = focusedPinId
    if (id === null || map === null) return
    focusPin(id)
  })

  /** Pan the minimum amount that puts the pin in the strip of map the sheet is not covering. */
  function panIntoView(lng: number, lat: number): void {
    const m = map
    if (m === null) return
    const point = m.project([lng, lat])
    const canvas = m.getCanvas()
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    const pad = 56
    const top = pad + 96 // search pill + chip row
    const bottom = height - obstructBottom - pad
    let dx = 0
    let dy = 0
    if (point.x < pad) dx = point.x - pad
    else if (point.x > width - pad) dx = point.x - (width - pad)
    if (point.y < top) dy = point.y - top
    else if (point.y > bottom) dy = point.y - Math.max(top, bottom)
    if (dx === 0 && dy === 0) return
    m.panBy([dx, dy], { duration: 380 })
  }

  // ---- overlap ("이 자리에 N곳") --------------------------------------------

  /**
   * The shops a tap on this pin should offer. Exactly the group the thinning pass built, so what
   * the list shows always matches what the map folded away — no shop can become unreachable.
   */
  function overlapping(id: string): string[] {
    const group = groupByRep.get(id)
    return group === undefined || group.length === 0 ? [id] : group
  }

  function tapPin(pin: Pin): void {
    if (pin.kind === 'building') {
      onselectbuilding(pin.id)
      return
    }
    const group = overlapping(pin.id)
    if (group.length > 1) onselectcluster(group)
    else onselectstore(pin.id)
  }

  // ---- my location ----------------------------------------------------------

  function emptyCollection(): GeoJSON.FeatureCollection {
    return { type: 'FeatureCollection', features: [] }
  }

  /** A 64-gon in metres, so the accuracy ring scales with zoom like real ground truth. */
  function accuracyCircle(lng: number, lat: number, radiusM: number): GeoJSON.FeatureCollection {
    const coords: [number, number][] = []
    const latRad = (lat * Math.PI) / 180
    const dLat = (radiusM / 111_320)
    const dLng = radiusM / (111_320 * Math.cos(latRad))
    for (let i = 0; i <= 64; i += 1) {
      const angle = (i / 64) * Math.PI * 2
      coords.push([lng + dLng * Math.cos(angle), lat + dLat * Math.sin(angle)])
    }
    return {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } }],
    }
  }

  /**
   * One-shot location. No follow mode anywhere in the product (PLAN §6.6) — the map opens at the
   * exit, not on the blue dot, and it never recentres on its own.
   */
  /** Our own layers are not part of the fetched style, so they are re-added after every style load. */
  function afterStyleLoad(m: MapLibreMap): void {
    if (!m.getSource(ACCURACY_SOURCE)) m.addSource(ACCURACY_SOURCE, { type: 'geojson', data: emptyCollection() })
    if (!m.getLayer(`${ACCURACY_SOURCE}-fill`)) {
      m.addLayer({
        id: `${ACCURACY_SOURCE}-fill`,
        type: 'fill',
        source: ACCURACY_SOURCE,
        paint: { 'fill-color': '#3E63DD', 'fill-opacity': 0.12 },
      })
    }
    onextrusions?.(extrusionLayerIds(m.getStyle() as MapStyle).length > 0)
    const fix = app.myLocation
    if (fix !== null) (m.getSource(ACCURACY_SOURCE) as GeoJSONSource | undefined)?.setData(accuracyCircle(fix.lng, fix.lat, fix.accuracy))
  }

  /**
   * Swap the basemap in place. Markers are DOM elements, so they survive; our own layers come back
   * through `afterStyleLoad`. The camera is untouched.
   */
  export async function setBasemap(key: BasemapKey): Promise<void> {
    const m = map
    if (m === null || key === currentBasemap) return
    currentBasemap = key
    const style = await loadStyle(app.locale, undefined, { threeD: threeDNow, basemap: key })
    if (map !== m || currentBasemap !== key) return
    m.once('style.load', () => afterStyleLoad(m))
    m.setStyle(style as unknown as StyleSpecification | string)
  }

  // Settings change `app.basemap`; the map follows once it exists.
  $effect(() => {
    const key = app.basemap
    if (map !== null && currentBasemap !== null && key !== currentBasemap) void setBasemap(key)
  })

  /**
   * Switch between the flat map and the tilted 3D view. Shows or hides Liberty's extruded-building
   * layers, tilts the camera, and only allows the two-finger tilt gesture while 3D is on, so the
   * flat view cannot be tilted by accident.
   */
  export function setThreeD(on: boolean): void {
    threeDNow = on
    const m = map
    if (m === null) return
    const apply = () => {
      for (const id of extrusionLayerIds(m.getStyle() as MapStyle)) {
        if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none')
      }
    }
    if (m.isStyleLoaded()) apply()
    else m.once('style.load', apply)
    if (on) m.touchPitch.enable()
    else m.touchPitch.disable()
    m.easeTo({ pitch: on ? THREE_D_PITCH : 0, duration: 500 })
  }

  /** Put or move the blue dot and its accuracy ring; the camera is not touched here. */
  function showFix(coords: GeolocationCoordinates): void {
    const m = map
    if (m === null) return
    const { latitude, longitude, accuracy } = coords
    app.myLocation = { lat: latitude, lng: longitude, accuracy }
    if (meMarker === null) {
      const el = document.createElement('div')
      el.className = 'me-dot'
      meMarker = maplibreMod === null ? null : new maplibreMod.Marker({ element: el, anchor: 'center' }).setLngLat([longitude, latitude]).addTo(m)
    } else {
      meMarker.setLngLat([longitude, latitude])
    }
    const source = m.getSource(ACCURACY_SOURCE) as GeoJSONSource | undefined
    source?.setData(accuracyCircle(longitude, latitude, accuracy))
  }

  function clearFix(): void {
    meMarker?.remove()
    meMarker = null
    const source = map?.getSource(ACCURACY_SOURCE) as GeoJSONSource | undefined
    source?.setData(emptyCollection())
  }

  let watchId: number | null = null

  /**
   * Keep the blue dot live with `watchPosition`. The camera never follows it — a visitor comparing
   * the map to the street must not have it yanked away under their thumb. A denied permission
   * switches the preference off again so the banner does not come back every visit.
   */
  export function startTracking(): void {
    if (watchId !== null || typeof navigator === 'undefined' || !navigator.geolocation) return
    watchId = navigator.geolocation.watchPosition(
      (position) => showFix(position.coords),
      (error) => {
        stopTracking()
        app.setGeoTracking(false)
        app.showToast(t(app.locale, error.code === error.PERMISSION_DENIED ? 'map.gps_denied' : 'map.gps_unavailable'))
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 },
    )
  }

  export function stopTracking(): void {
    if (watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) navigator.geolocation.clearWatch(watchId)
    watchId = null
    clearFix()
  }

  // Settings and the consent banner flip `app.geoTracking`; the map follows once it exists.
  $effect(() => {
    const on = app.geoTracking
    if (map === null) return
    if (on) startTracking()
    else stopTracking()
  })

  /** The locate button: centre on the fix once, and keep the dot alive from then on. */
  export function locate(): void {
    const m = map
    if (m === null || typeof navigator === 'undefined' || !navigator.geolocation) {
      app.showToast(t(app.locale, 'map.gps_unavailable'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords
        showFix(position.coords)
        if (!app.geoTracking) app.setGeoTracking(true)
        // Outside the bbox the pan would be clamped anyway; centre only when the fix is in Akihabara.
        if (haversineMeters({ lat: latitude, lng: longitude }, { lat: MAP_DEFAULT.center[1], lng: MAP_DEFAULT.center[0] }) < 1500) {
          m.easeTo({ center: [longitude, latitude], duration: 500 })
        }
        if (accuracy > GPS_WARN_ACCURACY_M) {
          app.showToast(t(app.locale, 'map.gps_inaccurate', { meters: Math.round(accuracy) }))
        }
      },
      (error) => {
        app.showToast(
          t(app.locale, error.code === error.PERMISSION_DENIED ? 'map.gps_denied' : 'map.gps_unavailable'),
        )
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    )
  }

  // ---- marker state ---------------------------------------------------------

  function isHidden(pin: Pin): boolean {
    // Buildings always keep their pin — the badge carries the "3/14" count instead (PLAN §4.1).
    if (pin.kind === 'building') return false
    return !app.matchingStoreIds.has(pin.id)
  }

  function badgeFor(id: string): string {
    const total = (app.tenantsByBuilding.get(id) ?? []).length
    if (!app.filtersActive) return String(total)
    return `${app.buildingMatchCounts.get(id) ?? 0}/${total}`
  }

  function ariaLabel(pin: Pin): string {
    if (pin.kind === 'building') {
      return t(app.locale, 'map.marker_building', {
        name: pin.name,
        count: (app.tenantsByBuilding.get(pin.id) ?? []).length,
      })
    }
    const store = app.storeById.get(pin.id)
    return t(app.locale, 'map.marker_store', {
      name: pin.name,
      category: store ? categoryLabel(store.category, app.locale) : '',
      status: openStateShort(app.openStateOf(pin.id), app.locale),
    })
  }
</script>

<div class="map-wrap">
  <div class="map-root" bind:this={container} aria-label={t(app.locale, 'map.label')} role="region"></div>

  <!--
    Markers live here only until MapLibre moves them into the map container. The wrapper collapses
    to nothing so they never flash as a stack of buttons while the style is still downloading.
  -->
  <div class="marker-src">
  {#each pins as pin (pin.id)}
    <button
      type="button"
      bind:this={markerEls[pin.id]}
      class="mk"
      class:building={pin.kind === 'building'}
      class:selected={focusedPinId === pin.id}
      class:hovered={app.hoveredId === pin.id}
      class:visited={app.visitedIds.includes(pin.id) && focusedPinId !== pin.id}
      class:inactive={pin.inactive}
      class:hidden={isHidden(pin) || thinnedIds.has(pin.id)}
      class:labelled={labelled.has(pin.id)}
      class:label-left={flipped.has(pin.id)}
      style:--mk-color={colorFor(pin.glyph)}
      aria-label={ariaLabel(pin)}
      aria-pressed={focusedPinId === pin.id}
      onclick={(e) => {
        e.stopPropagation()
        tapPin(pin)
      }}
      onpointerenter={() => (app.hoveredId = pin.id)}
      onpointerleave={() => {
        if (app.hoveredId === pin.id) app.hoveredId = null
      }}
    >
      {#if focusedPinId === pin.id}
        <span class="mk-halo" aria-hidden="true"></span>
      {/if}
      <span class="mk-body">
        <Glyph kind={pin.glyph} size={pin.kind === 'building' ? 16 : 14} />
      </span>
      {#if pin.kind === 'building'}
        <span class="mk-badge">{badgeFor(pin.id)}</span>
      {/if}
      <span class="mk-label">{pin.name}</span>
    </button>
  {/each}
  </div>
</div>

<style>
  .map-wrap {
    position: absolute;
    inset: 0;
    z-index: var(--z-map);
  }
  .map-root {
    position: absolute;
    inset: 0;
  }
  .marker-src {
    position: absolute;
    width: 0;
    height: 0;
    overflow: hidden;
  }

  /* ---- markers ---- */
  .mk {
    /* 44px transparent hit area around a 28px glyph (PLAN §4.1 / §6.5). */
    position: relative;
    width: var(--tap-min);
    height: var(--tap-min);
    display: grid;
    place-items: center;
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
  }
  /* Selected: a pulsing ring in the category colour under the teardrop, so the eye finds it. */
  .mk-halo {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 30px;
    height: 30px;
    margin: -15px 0 0 -15px;
    border-radius: 50%;
    background: var(--mk-color);
    opacity: 0.35;
    pointer-events: none;
  }
  @media (prefers-reduced-motion: no-preference) {
    .mk-halo {
      animation: mk-pulse 1.8s ease-out infinite;
    }
  }
  @keyframes mk-pulse {
    0% {
      transform: scale(0.6);
      opacity: 0.5;
    }
    100% {
      transform: scale(2.4);
      opacity: 0;
    }
  }
  .mk.hidden {
    display: none;
  }
  .mk.visited {
    opacity: 0.6;
  }
  .mk.selected {
    z-index: 5;
  }
  .mk.hovered {
    z-index: 4;
  }

  .mk-body {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--mk-color);
    border: 2px solid #fff;
    box-shadow: 0 1px 3px rgba(31, 35, 40, 0.32);
    display: grid;
    place-items: center;
  }
  @media (prefers-reduced-motion: no-preference) {
    .mk-body {
      transition:
        width 0.14s ease,
        height 0.14s ease,
        border-radius 0.14s ease,
        transform 0.14s ease;
    }
  }
  .mk.building .mk-body {
    width: 32px;
    height: 32px;
    border-radius: 9px;
    background: var(--mk-color);
  }
  .mk.hovered:not(.selected) .mk-body {
    width: 34px;
    height: 34px;
  }
  /* Relocating / moved / closed: grey ring, never hidden (PLAN §4.1). */
  .mk.inactive .mk-body {
    background: #d0d5da;
    border-color: #8b949e;
  }

  /* Selected: 40px teardrop whose tip sits on the coordinate, above everything else. */
  .mk.selected .mk-body {
    width: 40px;
    height: 40px;
    border-radius: 50% 50% 50% 0;
    border-width: 2.5px;
    transform: translateY(-28px) rotate(-45deg);
    box-shadow: 0 4px 10px rgba(31, 35, 40, 0.28);
  }
  .mk.selected .mk-body :global(svg) {
    transform: rotate(45deg);
  }
  .mk.building.selected .mk-body {
    border-radius: 10px 10px 10px 0;
  }

  .mk-badge {
    position: absolute;
    left: 30px;
    top: 2px;
    min-width: 20px;
    height: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: #fff;
    border: 1.5px solid var(--mk-color);
    color: #1f2328;
    font-size: 10.5px;
    font-weight: 700;
    line-height: 1;
    display: grid;
    place-items: center;
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }

  .mk-label {
    position: absolute;
    left: 36px;
    top: 50%;
    transform: translateY(-50%);
    white-space: nowrap;
    font-size: 11.5px;
    font-weight: 600;
    color: #1f2328;
    text-shadow:
      0 0 3px #fff,
      0 0 3px #fff,
      0 0 3px #fff,
      0 0 4px #fff;
    pointer-events: none;
    opacity: 0;
  }
  .mk.labelled .mk-label {
    opacity: 1;
  }
  .mk.selected .mk-label {
    top: calc(50% - 28px);
    left: 40px;
    font-size: 12.5px;
    font-weight: 700;
  }
  .mk.label-left .mk-label {
    left: auto;
    right: 36px;
    text-align: right;
  }
  .mk.label-left.selected .mk-label {
    right: 40px;
  }
  .mk.hidden .mk-label {
    opacity: 0;
  }

  /* The blue dot is created imperatively by `locate()`, so it needs a global selector. */
  :global(.me-dot) {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #3e63dd;
    border: 2.5px solid #fff;
    box-shadow: 0 1px 4px rgba(31, 35, 40, 0.4);
  }
  :global(.maplibregl-ctrl-attrib) {
    font-size: 11px;
  }
</style>
