<script lang="ts">
  /**
   * The ⓘ sheet (PLAN §4.1): reference time, default exit, language, the freshness note, credits
   * and the version. Changing the reference time recalculates every open-state in the app, which is
   * what makes the "planning two weeks out on a laptop" scenario work (PLAN §2.3).
   */
  import credits from '../../public/photos/CREDITS.json'
  import type { AppState } from '@/lib/app-state.svelte'
  import { ANCHORS } from '@/lib/geo'
  import { BASEMAPS } from '@/lib/map-style'
  import { toTokyo } from '@/lib/hours'
  import { localizedHref } from '@/lib/url'
  import { APP_VERSION } from '@/lib/meta'
  import { LOCALES, LOCALE_NAMES, t } from '@/i18n'

  interface Props {
    app: AppState
    onclose: () => void
  }

  let { app, onclose }: Props = $props()

  const locale = $derived(app.locale)
  const tokyoNow = $derived(toTokyo(app.now))

  let date = $state('')
  let time = $state('')

  $effect(() => {
    // Seed the pickers with whatever the app is currently using as "now".
    const now = toTokyo(app.referenceTime ?? new Date())
    date = now.date
    time = `${String(Math.floor(now.minutes / 60)).padStart(2, '0')}:${String(now.minutes % 60).padStart(2, '0')}`
  })

  function applyCustomTime(): void {
    if (date === '' || time === '') return
    // Tokyo has no DST, so a fixed +09:00 offset is exact for every date.
    const parsed = new Date(`${date}T${time}:00+09:00`)
    if (!Number.isNaN(parsed.getTime())) app.referenceTime = parsed
  }

  /** Latest `verified_at` across the published dataset — the honest "data as of" date. */
  const dataAsOf = $derived(
    [...app.stores.map((s) => s.verified_at), ...app.buildings.map((b) => b.verified_at)].sort().at(-1) ?? '',
  )

  const photoCredits = Object.entries(credits as Record<string, { artist: string; license: string; title: string }>)
</script>

<div class="overlay" role="dialog" aria-modal="true" aria-label={t(locale, 'info.title')}>
  <header>
    <h2>{t(locale, 'info.title')}</h2>
    <button type="button" class="x" onclick={onclose} aria-label={t(locale, 'sheet.close')}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
        <path d="M5 5l14 14M19 5 5 19" />
      </svg>
    </button>
  </header>

  <div class="body">
    <section>
      <h3>{t(locale, 'info.reference_time')}</h3>
      <p class="hint">{t(locale, 'info.reference_note')}</p>
      <div class="row">
        <button
          type="button"
          class="pill"
          class:on={app.referenceTime === null}
          onclick={() => (app.referenceTime = null)}
        >
          {t(locale, 'info.now')}
        </button>
        <span class="mono"
          >{t(locale, 'info.tokyo_now', {
            time: `${tokyoNow.date} ${String(Math.floor(tokyoNow.minutes / 60)).padStart(2, '0')}:${String(tokyoNow.minutes % 60).padStart(2, '0')}`,
          })}</span
        >
      </div>
      <div class="row">
        <label class="field">
          <span class="visually-hidden">{t(locale, 'info.custom_time')}</span>
          <input type="date" bind:value={date} onchange={applyCustomTime} />
        </label>
        <label class="field">
          <span class="visually-hidden">{t(locale, 'info.custom_time')}</span>
          <input type="time" bind:value={time} onchange={applyCustomTime} step="900" />
        </label>
        {#if app.referenceTime !== null}
          <button type="button" class="pill" onclick={() => (app.referenceTime = null)}>
            {t(locale, 'info.reset_time')}
          </button>
        {/if}
      </div>
    </section>

    <section>
      <h3>{t(locale, 'info.basemap')}</h3>
      <p class="hint">{t(locale, 'info.basemap_note')}</p>
      <div class="row wrap">
        {#each BASEMAPS as key (key)}
          <button type="button" class="pill" class:on={app.basemap === key} onclick={() => app.setBasemap(key)}>
            {t(locale, `info.basemap_${key}`)}
          </button>
        {/each}
      </div>
    </section>

    <section>
      <h3>{t(locale, 'info.geo')}</h3>
      <p class="hint">{t(locale, 'info.geo_note')}</p>
      <div class="row wrap">
        <button type="button" class="pill" class:on={app.geoTracking} onclick={() => app.setGeoTracking(true)}>
          {t(locale, 'info.geo_on')}
        </button>
        <button type="button" class="pill" class:on={!app.geoTracking} onclick={() => app.setGeoTracking(false)}>
          {t(locale, 'info.geo_off')}
        </button>
      </div>
    </section>

    <section>
      <h3>{t(locale, 'info.default_anchor')}</h3>
      <div class="row wrap">
        {#each ANCHORS as anchor (anchor.key)}
          <button
            type="button"
            class="pill"
            class:on={app.anchorKey === anchor.key}
            onclick={() => app.setAnchor(anchor.key)}
          >
            {t(locale, anchor.labelKey)}
          </button>
        {/each}
      </div>
    </section>

    <section>
      <h3>{t(locale, 'info.language')}</h3>
      <div class="row">
        {#each LOCALES as code (code)}
          <a
            class="pill"
            class:on={code === locale}
            href={localizedHref(location.pathname, location.search, code)}
            hreflang={code}
          >
            {LOCALE_NAMES[code]}
          </a>
        {/each}
      </div>
    </section>

    <section>
      <h3>{t(locale, 'info.data_as_of', { date: dataAsOf })}</h3>
      <p class="hint">{t(locale, 'info.data_note')}</p>
    </section>

    <section>
      <h3>{t(locale, 'info.credits')}</h3>
      <p class="hint">{t(locale, 'info.tiles')}</p>
      <h4>{t(locale, 'info.photo_credits')}</h4>
      <ul class="credits">
        {#each photoCredits as [id, credit] (id)}
          <li><b>{id}</b> · {credit.artist} · {credit.license}</li>
        {/each}
      </ul>
    </section>

    <p class="version">{t(locale, 'info.version', { version: APP_VERSION })}</p>
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
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px 8px 18px;
    border-bottom: 1px solid var(--color-border);
  }
  h2 {
    font-size: 17px;
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
  .body {
    flex: 1;
    overflow-y: auto;
    padding: 4px 18px calc(28px + var(--safe-bottom));
  }
  section {
    padding: 16px 0;
    border-bottom: 1px solid var(--color-border);
  }
  h3 {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  h4 {
    margin: 14px 0 0;
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-text-tertiary);
  }
  .hint {
    margin-top: 6px;
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--color-text-secondary);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
  }
  .row.wrap {
    flex-wrap: wrap;
  }
  .pill {
    min-height: var(--tap-min);
    padding: 0 14px;
    border-radius: var(--radius-pill);
    border: 1px solid var(--color-border);
    font-size: 13.5px;
    font-weight: 500;
    display: inline-flex;
    align-items: center;
  }
  .pill.on {
    background: var(--color-text);
    color: var(--color-text-inverse);
    border-color: var(--color-text);
    font-weight: 600;
  }
  .field {
    display: block;
  }
  .field input {
    min-height: var(--tap-min);
    padding: 0 10px;
    border: 1px solid var(--color-border);
    border-radius: 10px;
    background: var(--color-surface);
    font-size: 14px;
  }
  .mono {
    font-size: 12.5px;
    color: var(--color-text-secondary);
    font-variant-numeric: tabular-nums;
  }
  .credits {
    margin-top: 8px;
    display: grid;
    gap: 4px;
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--color-text-secondary);
  }
  .credits b {
    color: var(--color-text);
    font-weight: 600;
  }
  .version {
    margin-top: 16px;
    font-size: 11.5px;
    color: var(--color-text-tertiary);
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
