<script lang="ts">
  /**
   * The store card (PLAN §4.1 / §5). Everything is rendered at once; the sheet's snap height is
   * what decides how much you see, so nothing pops in and the layout never shifts.
   *   peek  what shop · open now? · where · what to know · one action
   *   half  one_line · weekday hours · save/share/official/X · floor guide
   *   full  how to find · tips · same building · same chain · address · provenance
   */
  import type { Store } from '@/data/schema'
  import type { AppState } from '@/lib/app-state.svelte'
  import {
    badgesFor,
    categoryLabel,
    directionsUrl,
    hoursDayLabel,
    locationLine,
    reportErrorUrl,
    statusBanner,
  } from '@/lib/format'
  import { colorFor } from '@/lib/glyphs'
  import { hoursTable, todayRowIndex } from '@/lib/hours'
  import { JP_HOLIDAYS } from '@/data/holidays-jp'
  import { t, type MessageKey } from '@/i18n'
  import OpenPill from './OpenPill.svelte'
  import PhotoTile from './PhotoTile.svelte'

  interface Props {
    app: AppState
    store: Store
    onpeekheight: (px: number) => void
    onopenstore: (id: string) => void
    onclose: () => void
    onback: (() => void) | null
    breadcrumb: string | null
  }

  let { app, store, onpeekheight, onopenstore, onclose, onback, breadcrumb }: Props = $props()

  let peekH = $state(0)
  $effect(() => {
    onpeekheight(peekH)
  })

  const locale = $derived(app.locale)
  const openState = $derived(app.openStateOf(store.id))
  const banner = $derived(statusBanner(store, locale))
  const badges = $derived(badgesFor(store, locale))
  const where = $derived(locationLine(store, app.buildingById, app.anchor, locale))
  const rows = $derived(store.hours === null ? [] : hoursTable(store.hours))
  const todayIndex = $derived(store.hours === null ? -1 : todayRowIndex(rows, app.now, JP_HOLIDAYS))
  const sameBuilding = $derived(
    store.building_id === null
      ? []
      : (app.tenantsByBuilding.get(store.building_id) ?? []).filter((s) => s.id !== store.id),
  )
  const sameChain = $derived(
    store.chain === null ? [] : app.stores.filter((s) => s.chain === store.chain && s.id !== store.id),
  )
  const saved = $derived(app.isSaved(store.id))

  async function share(): Promise<void> {
    // /s/<id> is prerendered in M5; the link is stable now so a shared URL keeps working.
    const url = `${location.origin}/${locale}/s/${store.id}`
    const title = store.name[locale]
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url })
        return
      } catch {
        /* the visitor dismissed the share sheet — fall through to the clipboard */
      }
    }
    await copy(url, 'action.share_done')
  }

  async function copy(text: string, doneKey: MessageKey): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      app.showToast(t(locale, doneKey))
    } catch {
      app.showToast(t(locale, 'action.copy_failed'))
    }
  }
</script>

<div class="peek" bind:clientHeight={peekH}>
  {#if breadcrumb !== null}
    <nav class="crumb" aria-label={t(locale, 'sheet.back')}>
      <button type="button" onclick={() => onback?.()}>{breadcrumb}</button>
      <span aria-hidden="true">›</span>
      <b>{store.name[locale]} {store.floors.join('·')}</b>
    </nav>
  {/if}

  <button type="button" class="x" onclick={onclose} aria-label={t(locale, 'sheet.close')}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
      <path d="M5 5l14 14M19 5 5 19" />
    </svg>
  </button>

  {#if banner !== null}
    <p class="banner">
      {#if banner.date}<b>{t(locale, 'meta.effective_date', { date: banner.date })}</b>{/if}
      {banner.text}
    </p>
  {/if}

  <div class="card-head">
    <PhotoTile photo={store.photo} kind={store.category} size="lg" />
    <div>
      <h3>{store.name[locale]}</h3>
      <p class="ja">{store.name.ja}</p>
      <span class="cat">
        <i class="dot" style:background={colorFor(store.category)}></i>{categoryLabel(store.category, locale)}
      </span>
    </div>
  </div>

  <div class="pill-row"><OpenPill state={openState} {locale} /></div>

  <p class="where-line">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z" /><circle cx="12" cy="10" r="2.5" />
    </svg>
    <span>{where}</span>
  </p>

  {#if badges.length > 0}
    <div class="badges">
      {#each badges as badge (badge.key)}
        <span class="badge {badge.tone}">{badge.label}</span>
      {/each}
    </div>
  {/if}

  {#if store.location !== null}
    <a class="cta" href={directionsUrl(store.location)} target="_blank" rel="noopener noreferrer">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 11 21 3l-8 18-2-8-8-2Z" />
      </svg>
      {t(locale, 'action.directions')}
    </a>
  {/if}
</div>

<!-- half -->
<div class="divider"></div>
<p class="one-line">{store.one_line[locale]}</p>

{#if store.hours !== null}
  <h4 class="sect">{t(locale, 'section.hours')}</h4>
  <div class="hours">
    {#each rows as row, i (row.days.join(','))}
      <span class="d" class:today={i === todayIndex}>{hoursDayLabel(row.days, locale)}</span>
      <span class:today={i === todayIndex}>
        {row.windows.length === 0 ? t(locale, 'hours.closed') : row.windows.join(', ')}
        {#if i === todayIndex}<span class="mini">{t(locale, 'hours.today')}</span>{/if}
      </span>
    {/each}
    {#if store.hours.regular_holiday}
      <span class="d">{t(locale, 'hours.regular_holiday')}</span>
      <span>{store.hours.regular_holiday[locale]}</span>
    {/if}
    {#if store.hours.note}
      <span class="note">{store.hours.note[locale]}</span>
    {/if}
    <span class="note">{t(locale, 'hours.source')} · {t(locale, 'meta.verified_at', { date: store.verified_at })}</span>
  </div>
{/if}

<div class="actions">
  <button type="button" class="act" class:on={saved} onclick={() => app.toggleSaved(store.id)} aria-pressed={saved}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 20.5s-8-5.3-8-11A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5c0 5.7-8 11-8 11Z" />
    </svg>
    {t(locale, saved ? 'action.saved' : 'action.save')}
  </button>
  <button type="button" class="act" onclick={share}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 14v5h14v-5" />
    </svg>
    {t(locale, 'action.share')}
  </button>
  {#if store.official_url}
    <a class="act" href={store.official_url} target="_blank" rel="noopener noreferrer">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" />
      </svg>
      {t(locale, 'action.official_site')}
    </a>
  {/if}
  {#if store.sns.x}
    <a class="act" href={store.sns.x} target="_blank" rel="noopener noreferrer">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
        <path d="M5 5l14 14M19 5 5 19" />
      </svg>
      {t(locale, 'action.x')}
    </a>
  {/if}
</div>

{#if store.floor_guide.length > 0}
  <h4 class="sect">{t(locale, 'section.floor_guide')}</h4>
  <div class="fg">
    {#each store.floor_guide as entry (entry.floor)}
      <span class="fl" class:r18={store.adult_content.floors.includes(entry.floor)}>{entry.floor}</span>
      <span>{entry[locale]}</span>
    {/each}
  </div>
{/if}

<!-- full -->
{#if store.how_to_find}
  <h4 class="sect">{t(locale, 'section.how_to_find')}</h4>
  <p class="para">{store.how_to_find[locale]}</p>
{/if}

{#if store.tips && store.tips[locale].length > 0}
  <h4 class="sect">{t(locale, 'section.tips')}</h4>
  <ul class="tips">
    {#each store.tips[locale] as tip, i (i)}
      <li>{tip}</li>
    {/each}
  </ul>
{/if}

{#if sameBuilding.length > 0}
  <h4 class="sect">{t(locale, 'section.same_building')}</h4>
  <ul class="links">
    {#each sameBuilding as other (other.id)}
      <li>
        <button type="button" onclick={() => onopenstore(other.id)}>
          <i class="dot" style:background={colorFor(other.category)}></i>
          {other.name[locale]}<small>{other.floors.join('·')}</small>
        </button>
      </li>
    {/each}
  </ul>
{/if}

{#if sameChain.length > 0}
  <h4 class="sect">{t(locale, 'section.same_chain')}</h4>
  <ul class="links">
    {#each sameChain as other (other.id)}
      <li>
        <button type="button" onclick={() => onopenstore(other.id)}>
          <i class="dot" style:background={colorFor(other.category)}></i>
          {other.name[locale]}
        </button>
      </li>
    {/each}
  </ul>
{/if}

<h4 class="sect">{t(locale, 'section.address')}</h4>
<div class="address">
  <span>{store.address_ja}</span>
  <button type="button" class="ghost" onclick={() => copy(store.address_ja, 'action.copy_done')}>
    {t(locale, 'action.copy_address')}
  </button>
</div>

{#if store.photo !== null}
  <p class="credit">{t(locale, 'section.photo_credit')}: {store.photo.credit}</p>
{/if}

<footer class="prov">
  <span>{t(locale, 'meta.verified_at', { date: store.verified_at })}</span>
  <ul class="sources">
    {#each store.source_urls.slice(0, 6) as url, i (url)}
      <li><a href={url} target="_blank" rel="noopener noreferrer">{t(locale, 'meta.source_n', { n: i + 1 })}</a></li>
    {/each}
  </ul>
  <a class="report" href={reportErrorUrl('store', store.id, locale)} target="_blank" rel="noopener noreferrer">
    {t(locale, 'meta.report_error')}
  </a>
</footer>

<style>
  .peek {
    position: relative;
    padding-bottom: 14px;
  }
  .crumb {
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 12.5px;
    color: var(--color-text-tertiary);
    margin-bottom: 6px;
    padding-right: 36px;
  }
  .crumb button {
    color: var(--color-text-secondary);
    font-weight: 500;
    min-height: 32px;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .crumb b {
    color: var(--color-text-secondary);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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

  .banner {
    margin: 4px 0 10px;
    padding: 8px 10px;
    border-radius: 8px;
    background: #fff4c2;
    color: #7a4f00;
    font-size: 12.5px;
    line-height: 1.45;
  }
  .banner b {
    font-weight: 700;
  }

  .card-head {
    display: grid;
    grid-template-columns: 84px 1fr;
    gap: 14px;
    align-items: start;
    padding-right: 36px;
  }
  .card-head h3 {
    font-size: 19px;
    line-height: 1.2;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .ja {
    font-size: 12.5px;
    color: var(--color-text-tertiary);
    margin-top: 3px;
  }
  .cat {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    margin-top: 8px;
    padding: 3px 9px 3px 7px;
    border-radius: 12px;
    background: #f1f3f5;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: none;
  }

  .pill-row {
    margin-top: 12px;
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .where-line {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: var(--color-text-secondary);
    margin-top: 12px;
  }
  .where-line svg {
    flex: none;
  }
  .badges {
    display: flex;
    gap: 6px;
    margin-top: 10px;
    flex-wrap: wrap;
  }
  .badge {
    font-size: 12px;
    font-weight: 600;
    padding: 4px 8px;
    border-radius: 7px;
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
    background: #fff;
  }
  .badge.muted {
    color: #57606a;
    background: #eef0f2;
    border-color: transparent;
  }
  .badge.warn {
    color: #7a4f00;
    background: #fff4c2;
    border-color: transparent;
  }
  .cta {
    margin-top: 14px;
    min-height: 48px;
    border-radius: 14px;
    background: var(--color-text);
    color: var(--color-text-inverse);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-weight: 600;
    font-size: 15px;
  }

  .divider {
    height: 1px;
    background: var(--color-border);
    margin: 16px -18px 0;
  }
  .one-line {
    margin-top: 14px;
    font-size: 14.5px;
    line-height: 1.55;
  }
  .sect {
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-text-tertiary);
    margin-top: 18px;
  }
  .hours {
    margin-top: 8px;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 14px;
    font-size: 13.5px;
    font-variant-numeric: tabular-nums;
  }
  .hours .d {
    color: var(--color-text-secondary);
  }
  .hours .today {
    font-weight: 600;
    color: var(--color-text);
  }
  .hours .note {
    grid-column: 1 / -1;
    font-size: 12.5px;
    color: var(--color-text-tertiary);
    line-height: 1.45;
  }
  .mini {
    font-size: 10.5px;
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 4px;
    background: #f1f3f5;
    color: var(--color-text-secondary);
    margin-left: 4px;
  }

  .actions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(70px, 1fr));
    gap: 8px;
    margin-top: 16px;
  }
  .act {
    min-height: 56px;
    border-radius: 12px;
    border: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    font-size: 11.5px;
    font-weight: 500;
    color: var(--color-text-secondary);
  }
  .act.on {
    color: #b3261e;
    border-color: #f3c3c0;
    background: #fdf0ef;
  }

  .fg {
    margin-top: 8px;
    display: grid;
    grid-template-columns: 40px 1fr;
    row-gap: 8px;
    column-gap: 10px;
    font-size: 13.5px;
  }
  .fl {
    font-weight: 700;
    font-size: 14px;
    letter-spacing: 0.03em;
    color: var(--color-text);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .fl.r18 {
    color: var(--color-text-tertiary);
  }

  .para {
    margin-top: 8px;
    font-size: 13.5px;
    line-height: 1.6;
    color: var(--color-text-secondary);
  }
  .tips {
    margin-top: 8px;
    display: grid;
    gap: 8px;
  }
  .tips li {
    position: relative;
    padding-left: 14px;
    font-size: 13.5px;
    line-height: 1.55;
    color: var(--color-text-secondary);
  }
  .tips li::before {
    content: '';
    position: absolute;
    left: 2px;
    top: 8px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--color-text-tertiary);
  }

  .links {
    margin-top: 4px;
    display: grid;
  }
  .links button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: var(--tap-min);
    font-size: 14px;
    text-align: left;
    border-top: 1px solid var(--color-border);
  }
  .links small {
    color: var(--color-text-tertiary);
    font-size: 12px;
  }

  .address {
    margin-top: 8px;
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
    font-size: 13.5px;
    color: var(--color-text-secondary);
    flex-wrap: wrap;
  }
  .ghost {
    min-height: var(--tap-min);
    padding: 0 12px;
    border: 1px solid var(--color-border);
    border-radius: 10px;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text);
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
