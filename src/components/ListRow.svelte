<script lang="ts">
  /**
   * One row of the nearby list (PLAN §4.1): 44px photo thumb, name ko/en with the Japanese name
   * small, a category dot, the open state as text, the location line and the tax-free badge.
   * Shared by the nearby list, the saved list, the overlap mini-list and search results.
   */
  import { listWhere, nextOpenHint, openStateShort, openStateTone, storePhoto } from '@/lib/format'
  import { colorFor } from '@/lib/glyphs'
  import type { AppState, ListItem } from '@/lib/app-state.svelte'
  import { t } from '@/i18n'
  import PhotoTile from './PhotoTile.svelte'

  interface Props {
    app: AppState
    item: ListItem
    onselect: () => void
  }

  let { app, item, onselect }: Props = $props()

  const store = $derived(item.store)
  const building = $derived(item.building)
  const openState = $derived(store === null ? null : app.openStateOf(store.id))
  const shown = $derived(store === null ? null : storePhoto(store, app.buildingById))
  const where = $derived(
    store === null
      ? null
      : listWhere(store, app.buildingById, app.anchor, app.locale),
  )
  /**
   * The Japanese name is shown only when it fits in full.
   *
   * Shrinking it with flexbox does not work: flex distributes the width deficit in one pass, so a
   * huge shrink factor still leaves a ~30px stub ("あ…", "TAMAS…") that carries no information.
   * Instead the row compares intrinsic widths — the display name's natural width (`scrollWidth`,
   * which stays the full text width even while clipped) plus the Japanese name's own natural width
   * against the space available — and drops the Japanese name outright when it cannot fit. Measuring
   * intrinsic rather than rendered widths is what keeps this from oscillating.
   */
  const NAME_GAP_PX = 6
  let nameEl = $state<HTMLElement | null>(null)
  let koEl = $state<HTMLElement | null>(null)
  let jaEl = $state<HTMLElement | null>(null)
  let jaNaturalWidth = 0
  let showJa = $state(true)

  $effect(() => {
    const wrap = nameEl
    const ko = koEl
    if (wrap === null || ko === null) return
    if (jaNaturalWidth === 0 && jaEl !== null) jaNaturalWidth = jaEl.scrollWidth
    const measure = (): void => {
      showJa = ko.scrollWidth + NAME_GAP_PX + jaNaturalWidth <= wrap.clientWidth
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(wrap)
    return () => observer.disconnect()
  })

  const openTenants = $derived(
    item.tenants.filter((s) => {
      const st = app.openStateOf(s.id).state
      return st === 'open' || st === 'closing_soon'
    }).length,
  )
</script>

<button
  type="button"
  class="row"
  class:hovered={app.hoveredId === item.id}
  onclick={onselect}
  onpointerenter={() => (app.hoveredId = item.id)}
  onpointerleave={() => {
    if (app.hoveredId === item.id) app.hoveredId = null
  }}
  onfocus={() => (app.hoveredId = item.id)}
  onblur={() => {
    if (app.hoveredId === item.id) app.hoveredId = null
  }}
  data-row-id={item.id}
>
  <PhotoTile
    photo={shown?.photo ?? building?.photo ?? null}
    ofBuilding={shown?.fromBuilding?.name[app.locale] ?? null}
    kind={store === null ? 'building' : store.category}
    dim={store !== null && store.status.state !== 'open'}
  />

  <span class="mid">
    <span class="nm" bind:this={nameEl}>
      <span class="ko" bind:this={koEl}>{store?.name[app.locale] ?? building?.name[app.locale]}</span>
      <small class="ja" bind:this={jaEl} hidden={!showJa}>{store?.name.ja ?? building?.name.ja}</small>
    </span>
    <span class="sub2">
      <i class="dot" style:background={store === null ? colorFor('building') : colorFor(store.category)}></i>
      {#if store !== null && openState !== null}
        <span class="st {openStateTone(openState)}">{openStateShort(openState, app.locale)}</span>
        {#if (openState.state === 'open' || openState.state === 'before_open') && openState.nextChange}
          <span class="muted">· {openState.nextChange}</span>
        {:else if nextOpenHint(openState, app.locale)}
          <span class="muted">· {nextOpenHint(openState, app.locale)}</span>
        {/if}
        {#if store.tax_free === true}<span class="mini">{t(app.locale, 'badge.tax_free')}</span>{/if}
        {#if store.secondhand === 'used' || store.secondhand === 'both'}
          <span class="mini">{t(app.locale, 'badge.secondhand')}</span>
        {/if}
      {:else if building !== null}
        <span class="muted">{t(app.locale, 'building.tenants', { count: item.tenants.length })}</span>
        <span class="st" class:open={openTenants > 0}>
          {t(app.locale, 'building.open_tenants', { count: openTenants })}
        </span>
      {/if}
    </span>
  </span>

  <span class="where">
    <b>{item.minutes === null ? '—' : t(app.locale, 'walk.minutes', { minutes: item.minutes })}</b>
    <span class="sec">
      {where?.secondary ??
        (building === null ? '' : `${building.floors[0]}–${building.floors[building.floors.length - 1]}`)}
    </span>
  </span>
</button>

<style>
  .row {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) auto;
    column-gap: 12px;
    align-items: center;
    width: 100%;
    min-height: var(--tap-min);
    padding: 9px 8px;
    margin: 0 -8px;
    border-radius: 10px;
    border-top: 1px solid var(--color-border);
    text-align: left;
    background: none;
  }
  .row:first-child {
    border-top: none;
  }
  .row.hovered {
    background: #f4f6f8;
  }
  .mid {
    min-width: 0;
  }
  .nm {
    display: flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
    font-weight: 600;
    font-size: 14.5px;
    line-height: 1.3;
    color: var(--color-text);
  }
  .nm .ko {
    flex: 0 1 auto;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* Never shrinks: it is either shown in full or removed by the measurement above. */
  .nm .ja {
    flex: 0 0 auto;
    font-weight: 400;
    color: var(--color-text-tertiary);
    font-size: 12px;
    white-space: nowrap;
  }
  .sub2 {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-top: 2px;
    flex-wrap: wrap;
    font-size: 12.5px;
    color: var(--color-text-secondary);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: none;
  }
  .muted {
    color: var(--color-text-secondary);
  }
  .st {
    font-weight: 600;
    color: var(--color-text-secondary);
  }
  .st.open {
    color: var(--color-status-open);
  }
  .st.soon {
    color: var(--color-status-soon);
  }
  .st.closed,
  .st.unknown {
    color: var(--color-text-secondary);
  }
  .mini {
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
    padding: 1px 5px;
    border-radius: 4px;
    background: #f1f3f5;
    color: var(--color-text-secondary);
  }
  .where {
    font-size: 12.5px;
    color: var(--color-text-secondary);
    text-align: right;
    font-variant-numeric: tabular-nums;
    /* The walking time must never be the thing that gets truncated — it is half the answer to
       "어디?". So this column keeps a floor, and only the segment/floor line below it ellipsises. */
    min-width: 72px;
    max-width: 42%;
  }
  .where b {
    display: block;
    color: var(--color-text);
    font-weight: 600;
    font-size: 14px;
    white-space: nowrap;
  }
  .where .sec {
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  @media (prefers-reduced-motion: no-preference) {
    .row {
      transition: background 0.15s;
    }
  }
</style>
