<script lang="ts">
  /**
   * The horizontally scrolling chip row — one of only four pieces of chrome allowed over the map
   * (PLAN §6.2). Category chips are multi-select OR; "open now" and "tax-free" are ANDs. Active
   * chips carry a live count, and the reset chip only exists while something is filtered.
   */
  import { CATEGORIES } from '@/data/categories'
  import type { AppState } from '@/lib/app-state.svelte'
  import { categoryShortLabel } from '@/lib/format'
  import { t } from '@/i18n'

  interface Props {
    app: AppState
    desktop: boolean
  }

  let { app, desktop }: Props = $props()
</script>

<div class="chips" class:desktop role="group" aria-label={t(app.locale, 'filter.title')}>
  {#if app.filtersActive}
    <button type="button" class="chip reset" onclick={() => app.resetFilters()}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true">
        <path d="M5 5l14 14M19 5 5 19" />
      </svg>
      {t(app.locale, 'filter.reset')}
    </button>
  {/if}

  <button
    type="button"
    class="chip"
    class:on={app.openNow}
    aria-pressed={app.openNow}
    onclick={() => (app.openNow = !app.openNow)}
  >
    <i class="dot open"></i>{t(app.locale, 'filter.open_now')}
    {#if app.openNow}<span class="n">{app.openNowCount}</span>{/if}
  </button>

  <button
    type="button"
    class="chip"
    class:on={app.taxFree}
    aria-pressed={app.taxFree}
    onclick={() => (app.taxFree = !app.taxFree)}
  >
    {t(app.locale, 'filter.tax_free')}
    {#if app.taxFree}<span class="n">{app.taxFreeCount}</span>{/if}
  </button>

  {#each CATEGORIES as category (category.key)}
    {@const on = app.categories.includes(category.key)}
    <button
      type="button"
      class="chip"
      class:on
      aria-pressed={on}
      onclick={() => app.toggleCategory(category.key)}
    >
      <i class="dot" style:background={category.color}></i>{categoryShortLabel(category.key, app.locale)}
      {#if on}<span class="n">{app.categoryCounts.get(category.key) ?? 0}</span>{/if}
    </button>
  {/each}
</div>

<style>
  .chips {
    display: flex;
    gap: 8px;
    padding: 0 14px 4px;
    overflow-x: auto;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }
  .chips::-webkit-scrollbar {
    display: none;
  }
  .chips.desktop {
    flex-wrap: wrap;
    overflow: visible;
    padding: 0;
  }
  .chip {
    flex: none;
    min-height: 34px;
    padding: 0 12px;
    border-radius: 17px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text);
    box-shadow: 0 1px 2px rgba(31, 35, 40, 0.06);
    white-space: nowrap;
  }
  .chips.desktop .chip {
    min-height: 32px;
    font-size: 12.5px;
    box-shadow: none;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: none;
  }
  .dot.open {
    background: var(--color-status-open);
  }
  .chip.on {
    background: var(--color-text);
    color: var(--color-text-inverse);
    border-color: var(--color-text);
  }
  .chip.on .n {
    font-weight: 600;
    opacity: 0.8;
    font-variant-numeric: tabular-nums;
  }
  .chip.reset {
    padding: 0 10px;
    color: var(--color-text-secondary);
  }
</style>
