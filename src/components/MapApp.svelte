<script lang="ts">
  /**
   * The map island — the only top-level screen (PLAN §4.1).
   *
   * Chrome over the map is capped at four things (PLAN §6.2): the search pill (with ⓘ at its right
   * end), the chip row, the my-location button and the sheet. Everything else — store card, building
   * directory, nearby list, overlap list — lives inside that one sheet, reached through a breadcrumb
   * stack, so two sheets can never stack up.
   *
   * At ≥900px the identical components move into a 420px left panel and the map takes the rest of
   * the viewport; the map is never inside a scrolling page (PLAN §4.2).
   */
  import { buildings, stores } from '@/data/generated'
  import { loadMap3d, storeMap3d } from '@/lib/storage'
  import type { CategoryKey } from '@/data/categories'
  import { AppState, type ListItem, type View } from '@/lib/app-state.svelte'
  import { hasWebGL2 } from '@/lib/map-style'
  import { snapHeight } from '@/lib/sheet'
  import { readDeepLink, readFilterQuery, syncFilterQuery } from '@/lib/url'
  import { t, type Locale } from '@/i18n'
  import BuildingDirectory from './BuildingDirectory.svelte'
  import ChipRow from './ChipRow.svelte'
  import ClusterList from './ClusterList.svelte'
  import InfoSheet from './InfoSheet.svelte'
  import MapCanvas from './MapCanvas.svelte'
  import NearbyList from './NearbyList.svelte'
  import SearchOverlay from './SearchOverlay.svelte'
  import Sheet from './Sheet.svelte'
  import StoreCard from './StoreCard.svelte'

  let { lang }: { lang: Locale } = $props()

  const app = new AppState(lang, stores, buildings)

  /** Flat map by default; 3D is an explicit choice that is remembered per browser. */
  let threeD = $state(loadMap3d())
  function toggleThreeD(): void {
    threeD = !threeD
    storeMap3d(threeD)
    mapCanvas?.setThreeD(threeD)
  }

  // Deep-linked filters (`?c=…&open=1`) are applied before the first render so the map, the chips
  // and the list all agree on frame one.
  const initialFilters = readFilterQuery(typeof location === 'undefined' ? '' : location.search)
  app.categories = initialFilters.categories
  app.openNow = initialFilters.openNow
  app.taxFree = initialFilters.taxFree

  // A share page linked straight at a store or building: open that sheet on the first frame, so the
  // map never flashes the idle list before swapping. The id is validated against the dataset, so a
  // stale link to a record that has since been removed simply lands on the map.
  const deepLink = readDeepLink(typeof location === 'undefined' ? '' : location.search)
  if (deepLink !== null) {
    const exists =
      deepLink.kind === 'store' ? app.storeById.has(deepLink.id) : app.buildingById.has(deepLink.id)
    if (exists) app.stack = [{ kind: 'list' }, { kind: deepLink.kind, id: deepLink.id }]
  }

  const webgl = hasWebGL2()

  // Old Androids without WebGL2 get the list at full height instead of an empty canvas (PLAN §9).
  if (!webgl) app.snap = 'full'
  // Arriving from a share page, open at half: the visitor already read the peek content on that page.
  else if (deepLink !== null && app.stack.length > 1) app.snap = 'half'

  let desktop = $state(false)
  let viewportH = $state(800)
  let peekPx = $state(180)
  let sheet = $state<ReturnType<typeof Sheet> | null>(null)
  let mapCanvas = $state<ReturnType<typeof MapCanvas> | null>(null)
  let keyIndex = $state(-1)

  const view = $derived(app.view)

  /** "라디오회관" when the card was reached from a floor stack, otherwise no breadcrumb. */
  const breadcrumb = $derived.by((): string | null => {
    const parent = app.stack[app.stack.length - 2]
    if (parent === undefined) return null
    if (parent.kind === 'building') return app.buildingById.get(parent.id)?.name[app.locale] ?? null
    if (parent.kind === 'cluster') return t(app.locale, 'map.cluster_title', { count: parent.ids.length })
    return null
  })

  /** How much of the viewport the sheet covers — the map pans selected pins above this. */
  const sheetCover = $derived(desktop ? 0 : snapHeight(app.snap, viewportH, peekPx))

  // ---- lifecycle -----------------------------------------------------------

  $effect(() => app.start())

  $effect(() => {
    const mq = window.matchMedia('(min-width: 900px)')
    const update = (): void => {
      desktop = mq.matches
    }
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  })

  $effect(() => {
    // A fresh load always starts at the nearby list with no overlay, so stamp the entry we are on
    // with that shape — a stale depth left in the tab's history would make the first back press
    // jump the wrong number of steps. A deep-linked sheet then gets its own entry on top, so back
    // returns to the map instead of leaving the site.
    history.replaceState({ or: 1 }, '')
    if (app.stack.length > 1) history.pushState({ or: app.stack.length }, '')
    const onPop = (event: PopStateEvent): void => {
      const state = event.state as { or?: number; ov?: string } | null
      app.searchOpen = state?.ov === 'search'
      app.infoOpen = state?.ov === 'info'
      app.truncate(state?.or ?? 1)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  })

  // Filters live in the URL so a filtered view is shareable, but never as a history entry.
  $effect(() => {
    syncFilterQuery({ categories: app.categories, openNow: app.openNow, taxFree: app.taxFree })
  })

  // ---- navigation ----------------------------------------------------------

  function openStore(id: string): void {
    app.push({ kind: 'store', id }, 'peek')
  }

  function openBuilding(id: string): void {
    app.push({ kind: 'building', id }, 'half')
  }

  function openCluster(ids: string[]): void {
    app.push({ kind: 'cluster', ids }, 'peek')
  }

  function openItem(item: ListItem): void {
    if (item.kind === 'building') openBuilding(item.id)
    else openStore(item.id)
  }

  function openOverlay(kind: 'search' | 'info'): void {
    if (kind === 'search') app.searchOpen = true
    else app.infoOpen = true
    history.pushState({ or: app.stack.length, ov: kind }, '')
  }

  function closeOverlay(): void {
    history.back()
  }

  function selectCategory(key: CategoryKey): void {
    app.categories = [key]
    closeOverlay()
  }

  // ---- desktop keyboard navigation ----------------------------------------

  function onWindowKeydown(event: KeyboardEvent): void {
    if (app.searchOpen || app.infoOpen) return
    const target = event.target as HTMLElement | null
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
    if (event.key === 'Escape') {
      event.preventDefault()
      app.back()
      return
    }
    if (view.kind !== 'list') return
    const items = app.listItems
    if (items.length === 0) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      keyIndex =
        event.key === 'ArrowDown'
          ? (keyIndex + 1) % items.length
          : keyIndex <= 0
            ? items.length - 1
            : keyIndex - 1
      const item = items[keyIndex]
      if (item) {
        app.hoveredId = item.id
        document.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(item.id)}"]`)?.focus()
      }
    } else if (event.key === 'Enter' && keyIndex >= 0) {
      const item = items[keyIndex]
      if (item) {
        event.preventDefault()
        openItem(item)
      }
    }
  }

  function currentStore(v: View): ReturnType<typeof app.storeById.get> {
    return v.kind === 'store' ? app.storeById.get(v.id) : undefined
  }
</script>

<svelte:window bind:innerHeight={viewportH} onkeydown={onWindowKeydown} />

<div class="app" class:desktop>
  <button
    type="button"
    class="skip"
    onclick={() => {
      app.snap = 'full'
      sheet?.focusList()
    }}
  >
    {t(app.locale, 'sheet.skip_to_list')}
  </button>

  <div class="map-area">
    {#if webgl}
      <MapCanvas
        bind:this={mapCanvas}
        {app}
        obstructBottom={sheetCover}
        onselectstore={openStore}
        onselectbuilding={openBuilding}
        onselectcluster={openCluster}
        onemptytap={() => app.closeAll()}
        {threeD}
      />
    {/if}
    {#if webgl && (desktop || app.snap !== 'full')}
      <button
        type="button"
        class="three-d"
        class:on={threeD}
        style:bottom={desktop ? undefined : `calc(${Math.round(sheetCover)}px + 16px + var(--tap-min) + 10px)`}
        onclick={toggleThreeD}
        aria-pressed={threeD}
        aria-label={t(app.locale, 'action.three_d')}
        title={t(app.locale, 'action.three_d')}
      >3D</button>
    {/if}
  </div>

  <div class="chrome">
    <div class="search-pill">
      <button type="button" class="search-btn" onclick={() => openOverlay('search')}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
        </svg>
        <span>{t(app.locale, 'search.placeholder')}</span>
      </button>
      <button type="button" class="info-btn" onclick={() => openOverlay('info')} aria-label={t(app.locale, 'action.info')}>
        <span aria-hidden="true">i</span>
      </button>
    </div>
    <ChipRow {app} {desktop} />
  </div>

  <!-- At the full snap there is barely any map left, so the locate button steps out of the way. -->
  {#if webgl && !desktop && app.snap !== 'full'}
    <button
      type="button"
      class="locate"
      style:bottom="calc({Math.round(sheetCover)}px + 16px)"
      onclick={() => mapCanvas?.locate()}
      aria-label={t(app.locale, 'action.locate')}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1F2328" stroke-width="2" aria-hidden="true">
        <circle cx="12" cy="12" r="6" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke-linecap="round" />
      </svg>
    </button>
  {/if}

  <div class="panel">
    <Sheet bind:this={sheet} {app} {desktop} {peekPx}>
      {#if !webgl}
        <!-- The reason the map is missing has to be inside the sheet: the sheet covers the map. -->
        <p class="no-map" role="status">{t(app.locale, 'map.no_webgl')}</p>
      {/if}
      {#if view.kind === 'list'}
        <NearbyList {app} onpeekheight={(px) => (peekPx = px)} onselect={openItem} />
      {:else if view.kind === 'store'}
        {@const store = currentStore(view)}
        {#if store}
          <StoreCard
            {app}
            {store}
            {breadcrumb}
            onpeekheight={(px) => (peekPx = px)}
            onopenstore={openStore}
            onclose={() => app.closeAll()}
            onback={() => app.back()}
          />
        {/if}
      {:else if view.kind === 'building'}
        {@const building = app.buildingById.get(view.id)}
        {#if building}
          <BuildingDirectory
            {app}
            {building}
            onpeekheight={(px) => (peekPx = px)}
            onopenstore={openStore}
            onclose={() => app.closeAll()}
          />
        {/if}
      {:else if view.kind === 'cluster'}
        <ClusterList
          {app}
          ids={view.ids}
          onpeekheight={(px) => (peekPx = px)}
          onopenstore={openStore}
          onclose={() => app.closeAll()}
        />
      {/if}
    </Sheet>
  </div>

  {#if app.searchOpen}
    <SearchOverlay
      {app}
      onclose={closeOverlay}
      onstore={(id) => {
        closeOverlay()
        openStore(id)
      }}
      onbuilding={(id) => {
        closeOverlay()
        openBuilding(id)
      }}
      oncategory={selectCategory}
    />
  {/if}

  {#if app.infoOpen}
    <InfoSheet {app} onclose={closeOverlay} />
  {/if}

  {#if app.toast !== null}
    <p class="toast" role="status" aria-live="polite">{app.toast}</p>
  {/if}
</div>

<style>
  .app {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .skip {
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: calc(var(--z-overlay) + 1);
    transform: translateY(-200%);
    background: var(--color-text);
    color: var(--color-text-inverse);
    padding: 10px 14px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
  }
  .skip:focus-visible {
    transform: none;
  }

  .map-area {
    position: absolute;
    inset: 0;
    z-index: var(--z-map);
    background: var(--color-surface-muted);
  }
  .no-map {
    margin: 8px 0 4px;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--color-surface-muted);
    color: var(--color-text-secondary);
    font-size: 13px;
    line-height: 1.55;
  }

  .chrome {
    position: absolute;
    top: calc(var(--safe-top) + 10px);
    left: 0;
    right: 0;
    z-index: var(--z-chrome);
    display: flex;
    flex-direction: column;
    gap: 10px;
    pointer-events: none;
  }
  .chrome > :global(*) {
    pointer-events: auto;
  }
  .search-pill {
    margin: 0 14px;
    min-height: 46px;
    background: var(--color-surface);
    border-radius: 23px;
    display: flex;
    align-items: center;
    padding: 0 6px 0 6px;
    box-shadow:
      0 1px 2px rgba(31, 35, 40, 0.08),
      0 6px 20px rgba(31, 35, 40, 0.1);
  }
  .search-btn {
    flex: 1;
    min-width: 0;
    min-height: var(--tap-min);
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 10px;
    color: var(--color-text-tertiary);
    font-size: 14.5px;
    text-align: left;
  }
  .search-btn span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .info-btn {
    flex: none;
    width: var(--tap-min);
    height: var(--tap-min);
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: var(--color-text-secondary);
    font-weight: 700;
    font-size: 15px;
  }
  .info-btn span {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 1px solid var(--color-border);
  }

  .locate {
    position: absolute;
    right: 14px;
    z-index: var(--z-chrome);
    width: var(--tap-min);
    height: var(--tap-min);
    border-radius: 50%;
    background: var(--color-surface);
    box-shadow:
      0 1px 2px rgba(31, 35, 40, 0.08),
      0 6px 20px rgba(31, 35, 40, 0.12);
    display: grid;
    place-items: center;
  }

  .three-d {
    position: absolute;
    right: 14px;
    z-index: var(--z-chrome);
    width: var(--tap-min);
    height: var(--tap-min);
    border-radius: 50%;
    background: var(--color-surface);
    color: var(--color-text);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.02em;
    box-shadow:
      0 1px 2px rgba(31, 35, 40, 0.08),
      0 6px 20px rgba(31, 35, 40, 0.12);
    display: grid;
    place-items: center;
  }
  .three-d.on {
    background: var(--color-text);
    color: var(--color-text-inverse);
  }
  .app.desktop .three-d {
    bottom: 24px;
  }

  .panel {
    position: absolute;
    inset: 0;
    z-index: var(--z-sheet);
    pointer-events: none;
  }
  .panel > :global(*) {
    pointer-events: auto;
  }

  .toast {
    position: absolute;
    left: 50%;
    bottom: calc(var(--safe-bottom) + 24px);
    transform: translateX(-50%);
    z-index: calc(var(--z-overlay) + 1);
    max-width: min(92vw, 420px);
    padding: 10px 16px;
    border-radius: 12px;
    background: rgba(31, 35, 40, 0.94);
    color: var(--color-text-inverse);
    font-size: 13.5px;
    line-height: 1.45;
    text-align: center;
    box-shadow: var(--shadow-md);
  }

  /* ---- desktop (≥900px): 420px panel, map fills the rest of 100dvh ---- */
  .app.desktop {
    display: grid;
    grid-template-columns: 420px 1fr;
    grid-template-rows: auto 1fr;
  }
  .app.desktop .map-area {
    position: relative;
    inset: auto;
    grid-column: 2;
    grid-row: 1 / 3;
  }
  .app.desktop .chrome {
    position: relative;
    top: auto;
    grid-column: 1;
    grid-row: 1;
    padding: 12px 16px;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface);
    border-right: 1px solid var(--color-border);
  }
  .app.desktop .search-pill {
    margin: 0;
    min-height: 40px;
    border-radius: 10px;
    border: 1px solid var(--color-border);
    box-shadow: none;
  }
  .app.desktop .panel {
    position: relative;
    inset: auto;
    grid-column: 1;
    grid-row: 2;
    min-height: 0;
    pointer-events: auto;
    border-right: 1px solid var(--color-border);
    background: var(--color-surface);
    overflow: hidden;
  }
</style>
