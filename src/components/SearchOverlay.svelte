<script lang="ts">
  /**
   * Full-screen fuzzy search (PLAN §4.1). Results are grouped store / building / category; the empty
   * state offers six shortcut chips and whatever the visitor searched for last.
   */
  import type { CategoryKey } from '@/data/categories'
  import type { AppState } from '@/lib/app-state.svelte'
  import { colorFor } from '@/lib/glyphs'
  import { createSearchIndex, SEARCH_SHORTCUTS, type SearchDoc } from '@/lib/search'
  import { clearRecent, loadRecent, pushRecent } from '@/lib/storage'
  import { t, type MessageKey } from '@/i18n'

  interface Props {
    app: AppState
    onclose: () => void
    onstore: (id: string) => void
    onbuilding: (id: string) => void
    oncategory: (key: CategoryKey) => void
  }

  let { app, onclose, onstore, onbuilding, oncategory }: Props = $props()

  const index = createSearchIndex(app.stores, app.buildings, app.locale)

  let query = $state('')
  let recent = $state<string[]>([])
  let inputEl = $state<HTMLInputElement | null>(null)
  let active = $state(-1)

  $effect(() => {
    recent = loadRecent()
    inputEl?.focus()
  })

  const groups = $derived(index.search(query))
  const flat = $derived(groups.flatMap((g) => g.hits))

  function choose(doc: SearchDoc): void {
    pushRecent(query)
    if (doc.kind === 'store') onstore(doc.id)
    else if (doc.kind === 'building') onbuilding(doc.id)
    else oncategory(doc.id as CategoryKey)
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      onclose()
      return
    }
    if (flat.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      active = (active + 1) % flat.length
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      active = active <= 0 ? flat.length - 1 : active - 1
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const doc = flat[active >= 0 ? active : 0]
      if (doc) choose(doc)
    }
  }

  function runShortcut(shortcut: (typeof SEARCH_SHORTCUTS)[number]): void {
    const action = shortcut.action
    if (action.type === 'building') onbuilding(action.id)
    else if (action.type === 'category') oncategory(action.id as CategoryKey)
    else {
      app.openNow = true
      onclose()
    }
  }
</script>

<div class="overlay" role="dialog" aria-modal="true" aria-label={t(app.locale, 'search.title')}>
  <div class="bar">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
    </svg>
    <!-- svelte-ignore a11y_autofocus -->
    <input
      bind:this={inputEl}
      bind:value={query}
      onkeydown={onKeydown}
      type="search"
      autocomplete="off"
      placeholder={t(app.locale, 'search.placeholder')}
      aria-label={t(app.locale, 'search.placeholder')}
    />
    <button type="button" class="cancel" onclick={onclose}>{t(app.locale, 'search.cancel')}</button>
  </div>

  <div class="results">
    {#if query.trim().length === 0}
      <h3 class="sect">{t(app.locale, 'search.shortcuts')}</h3>
      <div class="shortcuts">
        {#each SEARCH_SHORTCUTS as shortcut (shortcut.key)}
          <button type="button" class="chip" onclick={() => runShortcut(shortcut)}>
            {t(app.locale, `shortcut.${shortcut.key}` as MessageKey)}
          </button>
        {/each}
      </div>
      {#if recent.length > 0}
        <h3 class="sect">
          {t(app.locale, 'search.recent')}
          <button
            type="button"
            class="link"
            onclick={() => {
              clearRecent()
              recent = []
            }}>{t(app.locale, 'search.recent_clear')}</button
          >
        </h3>
        <ul class="recent">
          {#each recent as item (item)}
            <li><button type="button" onclick={() => (query = item)}>{item}</button></li>
          {/each}
        </ul>
      {/if}
    {:else if flat.length === 0}
      <p class="empty">{t(app.locale, 'search.no_results', { query })}</p>
    {:else}
      {#each groups as group (group.kind)}
        <h3 class="sect">{t(app.locale, `search.group.${group.kind}` as MessageKey)}</h3>
        <ul class="hits">
          {#each group.hits as doc (doc.kind + doc.id)}
            <li>
              <button
                type="button"
                class:active={flat[active]?.id === doc.id && flat[active]?.kind === doc.kind}
                onclick={() => choose(doc)}
              >
                <i class="dot" style:background={colorFor(doc.category ?? 'building')}></i>
                <span class="nm">{doc.name}<small>{doc.ja}</small></span>
              </button>
            </li>
          {/each}
        </ul>
      {/each}
    {/if}
  </div>
</div>

<style>
  .overlay {
    position: absolute;
    inset: 0;
    z-index: var(--z-overlay);
    background: var(--color-surface);
    display: flex;
    flex-direction: column;
    padding-top: var(--safe-top);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--color-border);
    color: var(--color-text-tertiary);
  }
  .bar input {
    flex: 1;
    min-width: 0;
    min-height: var(--tap-min);
    border: 0;
    background: none;
    font-size: 16px;
    outline: none;
  }
  .cancel {
    min-height: var(--tap-min);
    padding: 0 8px;
    font-size: 14px;
    color: var(--color-text);
    font-weight: 500;
  }

  .results {
    flex: 1;
    overflow-y: auto;
    padding: 8px 16px calc(24px + var(--safe-bottom));
  }
  .sect {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-text-tertiary);
    margin-top: 16px;
  }
  .link {
    font-size: 11.5px;
    color: var(--color-text-secondary);
    text-decoration: underline;
    text-underline-offset: 2px;
    min-height: 32px;
    letter-spacing: 0;
    text-transform: none;
  }
  .shortcuts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }
  .chip {
    min-height: 36px;
    padding: 0 14px;
    border-radius: 18px;
    border: 1px solid var(--color-border);
    font-size: 13.5px;
    font-weight: 500;
  }
  .recent {
    margin-top: 4px;
  }
  .recent button,
  .hits button {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: var(--tap-min);
    padding: 8px 6px;
    margin: 0 -6px;
    border-radius: 8px;
    text-align: left;
    font-size: 15px;
  }
  .hits button.active {
    background: #f1f3f5;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex: none;
  }
  .nm {
    font-weight: 600;
    font-size: 15px;
  }
  .nm small {
    font-weight: 400;
    color: var(--color-text-tertiary);
    font-size: 12px;
    margin-left: 6px;
  }
  .empty {
    margin-top: 32px;
    color: var(--color-text-secondary);
  }
</style>
