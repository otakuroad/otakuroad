<script lang="ts">
  /**
   * The sheet's idle state (PLAN §4.1): one peek line with the anchor switcher, and — once pulled
   * up — the same filtered, sorted set the map is showing. There is no separate list screen.
   */
  import type { AppState, ListItem } from '@/lib/app-state.svelte'
  import { ANCHORS, GPS_ANCHOR_MAX_ACCURACY_M } from '@/lib/geo'
  import { t } from '@/i18n'
  import ListRow from './ListRow.svelte'

  interface Props {
    app: AppState
    onpeekheight: (px: number) => void
    onselect: (item: ListItem) => void
  }

  let { app, onpeekheight, onselect }: Props = $props()

  let peekH = $state(0)
  let anchorMenuOpen = $state(false)

  $effect(() => {
    onpeekheight(peekH)
  })

  const anchorLabel = $derived(t(app.locale, app.anchor.labelKey))
</script>

<div class="peek" bind:clientHeight={peekH}>
  <div class="peek-row">
    <span class="t">{t(app.locale, 'sheet.nearby', { count: app.listItems.length, anchor: anchorLabel })}</span>
    <button
      type="button"
      class="anchor"
      aria-expanded={anchorMenuOpen}
      aria-haspopup="listbox"
      onclick={() => (anchorMenuOpen = !anchorMenuOpen)}
    >
      {anchorLabel}<span aria-hidden="true">▾</span>
    </button>
  </div>

  {#if anchorMenuOpen}
    <ul class="anchor-menu" role="listbox" aria-label={t(app.locale, 'anchor.title')}>
      {#each ANCHORS as a (a.key)}
        <li>
          <button
            type="button"
            role="option"
            aria-selected={app.anchorKey === a.key}
            class:on={app.anchorKey === a.key}
            onclick={() => {
              app.setAnchor(a.key)
              anchorMenuOpen = false
            }}
          >
            {t(app.locale, a.labelKey)}
          </button>
        </li>
      {/each}
      <li>
        <button
          type="button"
          role="option"
          aria-selected={app.anchorKey === 'my_location'}
          class:on={app.anchorKey === 'my_location'}
          disabled={!app.canUseGpsAnchor}
          onclick={() => {
            app.setAnchor('my_location')
            anchorMenuOpen = false
          }}
        >
          {t(app.locale, 'anchor.my_location')}
          {#if !app.canUseGpsAnchor}
            <small>{t(app.locale, 'anchor.gps_needed', { meters: GPS_ANCHOR_MAX_ACCURACY_M })}</small>
          {/if}
        </button>
      </li>
    </ul>
  {/if}
</div>

<div class="seg" role="tablist" aria-label={t(app.locale, 'filter.title')}>
  <button
    type="button"
    role="tab"
    aria-selected={app.listMode === 'all'}
    class:on={app.listMode === 'all'}
    onclick={() => (app.listMode = 'all')}
  >
    {t(app.locale, 'list.all')} {app.nearby.length}
  </button>
  <button
    type="button"
    role="tab"
    aria-selected={app.listMode === 'saved'}
    class:on={app.listMode === 'saved'}
    onclick={() => (app.listMode = 'saved')}
  >
    {t(app.locale, 'list.saved')} {app.savedItems.length}
  </button>
</div>

<p class="sorted">{t(app.locale, 'list.sorted_by_anchor', { anchor: anchorLabel })}</p>

{#if app.listItems.length === 0}
  <p class="empty">{t(app.locale, app.listMode === 'saved' ? 'list.saved_empty' : 'list.empty')}</p>
{:else}
  <div class="list">
    {#each app.listItems as item (item.id)}
      <ListRow {app} {item} onselect={() => onselect(item)} />
    {/each}
  </div>
{/if}

<style>
  .peek {
    /* Owns the gap between the peek row and whatever the sheet reveals next, so the peek snap can
       be exactly grip + this block and nothing else surfaces above the fold. */
    padding-bottom: 10px;
  }
  .peek-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: var(--tap-min);
  }
  .peek-row .t {
    font-weight: 600;
    font-size: 15px;
  }
  .anchor {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: var(--tap-min);
    font-size: 13px;
    color: var(--color-text-secondary);
    background: #f1f3f5;
    padding: 6px 10px 6px 12px;
    border-radius: var(--radius-pill);
    white-space: nowrap;
  }
  .anchor-menu {
    display: grid;
    gap: 2px;
    margin: 4px 0 8px;
    padding: 4px;
    background: #f6f8fa;
    border-radius: var(--radius-md);
  }
  .anchor-menu button {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    width: 100%;
    min-height: var(--tap-min);
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 14px;
    text-align: left;
  }
  .anchor-menu button.on {
    background: var(--color-text);
    color: var(--color-text-inverse);
    font-weight: 600;
  }
  .anchor-menu button[disabled] {
    color: var(--color-text-tertiary);
    cursor: default;
  }
  .anchor-menu small {
    font-size: 11.5px;
    opacity: 0.85;
  }

  .seg {
    display: flex;
    margin: 8px 0 0;
    background: #f1f3f5;
    border-radius: 9px;
    padding: 3px;
    font-size: 12.5px;
    font-weight: 600;
  }
  .seg button {
    flex: 1;
    min-height: 36px;
    border-radius: 7px;
    color: var(--color-text-secondary);
  }
  .seg button.on {
    background: #fff;
    color: var(--color-text);
    box-shadow: 0 1px 2px rgba(31, 35, 40, 0.1);
  }

  .sorted {
    margin: 10px 0 2px;
    font-size: 12px;
    color: var(--color-text-tertiary);
  }
  .empty {
    margin: 24px 0;
    color: var(--color-text-secondary);
    font-size: 14px;
  }
  .list {
    display: flex;
    flex-direction: column;
  }
</style>
