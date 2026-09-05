<script lang="ts">
  /**
   * The building directory (PLAN §4.1 / §6.4). The floor stack is rendered top floor → B1F, the
   * same order as the vertical signboard bolted to the outside of the building, so what you read on
   * the phone matches what you read on the street. Uncurated floors collapse to one grey line, and
   * a live filter dims non-matching rows instead of hiding them — a floor that vanishes would make
   * the stack lie about the building.
   */
  import type { Building, Store } from '@/data/schema'
  import type { AppState } from '@/lib/app-state.svelte'
  import { openStateShort, openStateTone, reportErrorUrl } from '@/lib/format'
  import { colorFor } from '@/lib/glyphs'
  import { t } from '@/i18n'
  import PhotoTile from './PhotoTile.svelte'

  interface Props {
    app: AppState
    building: Building
    onpeekheight: (px: number) => void
    onopenstore: (id: string) => void
    onclose: () => void
  }

  let { app, building, onpeekheight, onopenstore, onclose }: Props = $props()

  let peekH = $state(0)
  $effect(() => {
    onpeekheight(peekH)
  })

  const locale = $derived(app.locale)
  const tenants = $derived(app.tenantsByBuilding.get(building.id) ?? [])
  const matchCount = $derived(app.buildingMatchCounts.get(building.id) ?? 0)
  const openCount = $derived(
    tenants.filter((s) => {
      const st = app.openStateOf(s.id).state
      return st === 'open' || st === 'closing_soon'
    }).length,
  )

  /** B1F → -1, 1F → 1, RF → 100. Higher sorts first, so the stack reads like the signboard. */
  function floorRank(label: string): number {
    if (label === 'RF') return 100
    if (label.startsWith('B')) return -Number(label.slice(1, -1))
    return Number(label.slice(0, -1))
  }

  interface FloorRow {
    floor: string
    stores: Store[]
    note: string | null
  }

  const floorRows = $derived.by((): FloorRow[] =>
    [...building.floors]
      .sort((a, b) => floorRank(b) - floorRank(a))
      .map((floor) => ({
        floor,
        stores: tenants.filter((s) => s.floors.includes(floor)),
        note: building.uncurated_floors.find((u) => u.floor === floor)?.[locale] ?? null,
      })),
  )
</script>

<div class="peek" bind:clientHeight={peekH}>
  <button type="button" class="x" onclick={onclose} aria-label={t(locale, 'sheet.close')}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
      <path d="M5 5l14 14M19 5 5 19" />
    </svg>
  </button>

  <div class="bhead">
    <PhotoTile photo={building.photo} kind="building" size="md" />
    <div>
      <h3>{building.name[locale]}</h3>
      <p class="ja">{building.name.ja}</p>
    </div>
  </div>

  <div class="bmeta">
    <span>
      <b>{t(locale, 'building.tenants', { count: tenants.length })}</b>
      {#if app.filtersActive}
        · {t(locale, 'building.matching', { matched: matchCount, total: tenants.length })}
      {/if}
    </span>
    <span class="st" class:open={openCount > 0}>{t(locale, 'building.open_tenants', { count: openCount })}</span>
    {#if building.floor_guide_url}
      <a href={building.floor_guide_url} target="_blank" rel="noopener noreferrer">
        {t(locale, 'building.floor_guide')}
      </a>
    {/if}
  </div>
</div>

<!-- Floor stack: top floor first, exactly like the signboard outside. -->
<div class="stack">
  {#each floorRows as row (row.floor)}
    {#if row.stores.length > 0}
      {#each row.stores as store, i (store.id)}
        <span class="f" class:continued={i > 0}>{i === 0 ? row.floor : ''}</span>
        <button
          type="button"
          class="c"
          class:dim={app.filtersActive && !app.matchingStoreIds.has(store.id)}
          onclick={() => onopenstore(store.id)}
          onpointerenter={() => (app.hoveredId = store.id)}
          onpointerleave={() => {
            if (app.hoveredId === store.id) app.hoveredId = null
          }}
        >
          <i class="dot" style:background={colorFor(store.category)}></i>
          <span class="nm">{store.name[locale]}</span>
          {#if store.tax_free === true}<span class="mini">{t(locale, 'badge.tax_free')}</span>{/if}
          <span class="st {openStateTone(app.openStateOf(store.id))}">
            {openStateShort(app.openStateOf(store.id), locale)}
          </span>
        </button>
      {/each}
      {#if row.note !== null}
        <span class="f grey"></span>
        <span class="c grey" class:dim={app.filtersActive}>{row.note}</span>
      {/if}
    {:else}
      <span class="f grey">{row.floor}</span>
      <span class="c grey" class:dim={app.filtersActive}>{row.note ?? ''}</span>
    {/if}
  {/each}
</div>

{#if building.hours_note}
  <h4 class="sect">{t(locale, 'building.hours_note')}</h4>
  <p class="para">{building.hours_note[locale]}</p>
{/if}

{#if building.exit_hint}
  <h4 class="sect">{t(locale, 'building.exit_hint')}</h4>
  <p class="para">{building.exit_hint[locale]}</p>
{/if}

<h4 class="sect">{t(locale, 'section.address')}</h4>
<p class="para">{building.address_ja}</p>

{#if building.photo !== null}
  <p class="credit">{t(locale, 'section.photo_credit')}: {building.photo.credit}</p>
{/if}

<footer class="prov">
  <span>{t(locale, 'meta.verified_at', { date: building.verified_at })}</span>
  <ul class="sources">
    {#each building.source_urls.slice(0, 6) as url, i (url)}
      <li><a href={url} target="_blank" rel="noopener noreferrer">{t(locale, 'meta.source_n', { n: i + 1 })}</a></li>
    {/each}
  </ul>
  <a class="report" href={reportErrorUrl('building', building.id, locale)} target="_blank" rel="noopener noreferrer">
    {t(locale, 'meta.report_error')}
  </a>
</footer>

<style>
  .peek {
    position: relative;
    padding-bottom: 12px;
  }
  .x {
    position: absolute;
    top: -2px;
    right: -6px;
    width: var(--tap-min);
    height: var(--tap-min);
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: var(--color-text-secondary);
  }
  .x::before {
    content: '';
    position: absolute;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: #f1f3f5;
  }
  .x svg {
    position: relative;
  }

  .bhead {
    display: grid;
    grid-template-columns: 56px 1fr;
    gap: 12px;
    align-items: center;
    padding-right: 36px;
  }
  .bhead h3 {
    font-size: 18px;
    font-weight: 700;
    line-height: 1.2;
  }
  .ja {
    font-size: 12.5px;
    color: var(--color-text-tertiary);
    margin-top: 2px;
  }
  .bmeta {
    display: flex;
    gap: 8px 14px;
    flex-wrap: wrap;
    font-size: 12.5px;
    color: var(--color-text-secondary);
    margin-top: 10px;
    align-items: center;
  }
  .bmeta b {
    color: var(--color-text);
    font-weight: 600;
  }
  .bmeta a {
    text-decoration: underline;
    text-underline-offset: 2px;
    min-height: 32px;
    line-height: 32px;
  }

  .stack {
    margin-top: 12px;
    display: grid;
    /* minmax(0, 1fr): a plain `1fr` track takes its automatic minimum from the row's min-content
       width, so a long tenant name pushed the whole row past the right edge of the sheet. */
    grid-template-columns: 40px minmax(0, 1fr);
  }
  .f {
    font-weight: 700;
    font-size: 15px;
    letter-spacing: 0.04em;
    color: var(--color-text);
    border-top: 1px solid var(--color-border);
    padding: 9px 8px 9px 0;
    text-align: right;
    border-right: 2px solid var(--color-text);
    font-variant-numeric: tabular-nums;
  }
  .f.grey,
  .f.continued {
    color: var(--color-text-tertiary);
    border-right-color: #d0d7de;
  }
  .c {
    border-top: 1px solid var(--color-border);
    padding: 8px 0 8px 12px;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: var(--tap-min);
    width: 100%;
    text-align: left;
    font-size: 14px;
  }
  .c.grey {
    color: var(--color-text-tertiary);
    font-size: 13px;
    line-height: 1.45;
    display: block;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .c.dim {
    opacity: 0.38;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex: none;
  }
  .nm {
    font-weight: 600;
    flex: 1 1 auto;
    min-width: 0;
    /* One line, like a signboard: the row height must not depend on how long a name happens to be. */
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .st {
    font-size: 12.5px;
    white-space: nowrap;
    font-weight: 600;
    flex: none;
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
    padding: 1px 5px;
    border-radius: 4px;
    background: #f1f3f5;
    color: var(--color-text-secondary);
  }

  .sect {
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-text-tertiary);
    margin-top: 18px;
  }
  .para {
    margin-top: 8px;
    font-size: 13.5px;
    line-height: 1.6;
    color: var(--color-text-secondary);
  }
  .credit {
    margin-top: 12px;
    font-size: 11px;
    color: var(--color-text-tertiary);
    line-height: 1.5;
  }
  .prov {
    margin-top: 18px;
    padding-top: 12px;
    border-top: 1px solid var(--color-border);
    display: flex;
    flex-wrap: wrap;
    gap: 8px 12px;
    align-items: center;
    font-size: 12px;
    color: var(--color-text-tertiary);
  }
  .sources {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .sources a,
  .report {
    text-decoration: underline;
    text-underline-offset: 2px;
    display: inline-block;
    min-height: 32px;
    line-height: 32px;
  }
  .report {
    margin-left: auto;
    color: var(--color-text-secondary);
  }
</style>
