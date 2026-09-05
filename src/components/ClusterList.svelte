<script lang="ts">
  /**
   * "이 자리에 2곳" — the mini list shown when standalone pins overlap on screen. This is the whole
   * of the product's answer to overlapping coordinates: no clusters, no spiderfy (PLAN §3.1).
   */
  import type { AppState, ListItem } from '@/lib/app-state.svelte'
  import { walkingMinutes } from '@/lib/geo'
  import { t } from '@/i18n'
  import ListRow from './ListRow.svelte'

  interface Props {
    app: AppState
    ids: string[]
    onpeekheight: (px: number) => void
    onopenstore: (id: string) => void
    onclose: () => void
  }

  let { app, ids, onpeekheight, onopenstore, onclose }: Props = $props()

  let peekH = $state(0)
  $effect(() => {
    onpeekheight(peekH)
  })

  const items = $derived.by((): ListItem[] =>
    ids
      .map((id) => app.storeById.get(id))
      .filter((s): s is NonNullable<typeof s> => s !== undefined)
      .map((store) => ({
        kind: 'store' as const,
        id: store.id,
        store,
        building: null,
        minutes: store.location === null ? null : walkingMinutes(app.anchor, store.location),
        matchingTenants: [],
        tenants: [],
      })),
  )
</script>

<div class="peek" bind:clientHeight={peekH}>
  <div class="head">
    <h3>{t(app.locale, 'map.cluster_title', { count: items.length })}</h3>
    <button type="button" class="x" onclick={onclose} aria-label={t(app.locale, 'sheet.close')}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
        <path d="M5 5l14 14M19 5 5 19" />
      </svg>
    </button>
  </div>
  <div class="list">
    {#each items as item (item.id)}
      <ListRow {app} {item} onselect={() => onopenstore(item.id)} />
    {/each}
  </div>
</div>

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: var(--tap-min);
  }
  h3 {
    font-size: 15px;
    font-weight: 700;
  }
  .x {
    width: var(--tap-min);
    height: var(--tap-min);
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--color-text-secondary);
  }
  .list {
    display: flex;
    flex-direction: column;
  }
</style>
