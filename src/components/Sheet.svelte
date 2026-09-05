<script lang="ts">
  /**
   * The one sheet (PLAN §6.3 "시트는 하나, 겹치지 않는다"). Hand-written with pointer events and
   * `transform: translate3d`, three snaps, a drag handle and a visible ✕. There is no scrim: the
   * sheet is never "closed", it returns to the nearby list, so a background tap can never lose it.
   *
   * touch-action zones keep the three gestures apart: the grip owns vertical drags outright
   * (`touch-action: none`), the body scrolls natively (`pan-y`) and only hands a drag to the sheet
   * when it is already at the top, and the map keeps everything above the sheet.
   *
   * On desktop (≥900px) the same markup becomes the static 420px left panel — no transform, no
   * drag, body always scrollable.
   */
  import type { Snippet } from 'svelte'
  import type { AppState, Snap } from '@/lib/app-state.svelte'
  import { SHEET_FRACTION, snapHeight } from '@/lib/sheet'
  import { t } from '@/i18n'

  interface Props {
    app: AppState
    desktop: boolean
    /** Height of the always-visible peek block, measured by the current content component. */
    peekPx: number
    children: Snippet
  }

  let { app, desktop, peekPx, children }: Props = $props()

  let viewportH = $state(800)
  let dragging = $state(false)
  let dragY = $state(0)
  let bodyEl = $state<HTMLDivElement | null>(null)
  let listAnchorEl = $state<HTMLDivElement | null>(null)

  const sheetH = $derived(viewportH * SHEET_FRACTION)

  /**
   * A store card's peek must show the four two-second answers plus the directions button, which is
   * taller than 18% of a phone. So the peek snap is the larger of the plan's 18% and what the
   * card's own peek block measures — never more than the half snap.
   */
  function heightFor(snap: Snap): number {
    return snapHeight(snap, viewportH, peekPx)
  }

  /** translateY that leaves `height` of the sheet on screen. */
  function offsetFor(snap: Snap): number {
    return Math.max(0, sheetH - heightFor(snap))
  }

  const restingOffset = $derived(offsetFor(app.snap))
  const offset = $derived(dragging ? Math.max(0, Math.min(offsetFor('peek'), restingOffset + dragY)) : restingOffset)

  // ---- drag ----------------------------------------------------------------

  let pointerId: number | null = null
  let startY = 0
  let startTime = 0
  let lastY = 0
  let armed = false

  function beginDrag(event: PointerEvent, viaBody: boolean): void {
    if (desktop || pointerId !== null) return
    pointerId = event.pointerId
    startY = event.clientY
    lastY = event.clientY
    startTime = event.timeStamp
    // A drag started on the grip is a sheet drag immediately; from the body we wait to see whether
    // the finger is scrolling content or pulling the sheet.
    armed = !viaBody
    if (armed) {
      dragging = true
      dragY = 0
      ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    }
  }

  function moveDrag(event: PointerEvent): void {
    if (pointerId !== event.pointerId) return
    const dy = event.clientY - startY
    lastY = event.clientY
    if (!armed) {
      const atTop = (bodyEl?.scrollTop ?? 0) <= 0
      // Pulling down from the top of the body, or any drag while the body cannot scroll.
      if ((dy > 6 && atTop) || (dy < -6 && app.snap !== 'full')) {
        armed = true
        dragging = true
        dragY = 0
        startY = event.clientY
        ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
        return
      }
      return
    }
    dragY = dy
  }

  function endDrag(event: PointerEvent): void {
    if (pointerId !== event.pointerId) return
    const wasArmed = armed
    pointerId = null
    armed = false
    if (!wasArmed) {
      dragging = false
      return
    }
    const elapsed = Math.max(1, event.timeStamp - startTime)
    const velocity = (lastY - startY) / elapsed // px per ms, positive = downwards
    const currentHeight = sheetH - Math.max(0, Math.min(offsetFor('peek'), restingOffset + dragY))
    dragging = false
    dragY = 0
    app.snap = pickSnap(currentHeight, velocity)
  }

  const ORDER: Snap[] = ['peek', 'half', 'full']

  function pickSnap(height: number, velocity: number): Snap {
    const index = ORDER.indexOf(app.snap)
    // A decisive flick moves exactly one snap, which is far more predictable than nearest-snap.
    if (velocity < -0.55) return ORDER[Math.min(ORDER.length - 1, index + 1)] as Snap
    if (velocity > 0.55) return ORDER[Math.max(0, index - 1)] as Snap
    let best: Snap = 'peek'
    let bestDelta = Number.POSITIVE_INFINITY
    for (const snap of ORDER) {
      const delta = Math.abs(heightFor(snap) - height)
      if (delta < bestDelta) {
        bestDelta = delta
        best = snap
      }
    }
    return best
  }

  function cycleSnap(): void {
    const index = ORDER.indexOf(app.snap)
    app.snap = ORDER[(index + 1) % ORDER.length] as Snap
  }

  // ---- scroll memory -------------------------------------------------------

  $effect(() => {
    // Depth changes: restore the offset we remembered for this depth (a floor stack keeps its place).
    const depth = app.stack.length
    const el = bodyEl
    if (!el) return
    const remembered = app.scrollMemory.get(depth) ?? 0
    requestAnimationFrame(() => {
      el.scrollTop = remembered
    })
  })

  function rememberScroll(): void {
    if (bodyEl) app.scrollMemory.set(app.stack.length, bodyEl.scrollTop)
  }

  export function focusList(): void {
    listAnchorEl?.focus()
  }
</script>

<svelte:window bind:innerHeight={viewportH} />

<section
  class="sheet"
  class:desktop
  class:dragging
  style:--sheet-h="{sheetH}px"
  style:transform={desktop ? 'none' : `translate3d(0, ${offset}px, 0)`}
  aria-label={t(app.locale, 'app.title')}
>
  {#if !desktop}
    <div
      class="grip"
      role="separator"
      aria-orientation="horizontal"
      aria-label={t(app.locale, 'sheet.handle')}
      onpointerdown={(e) => beginDrag(e, false)}
      onpointermove={moveDrag}
      onpointerup={endDrag}
      onpointercancel={endDrag}
    >
      <button
        type="button"
        class="handle-btn"
        aria-label={t(app.locale, 'sheet.expand')}
        onclick={cycleSnap}
      >
        <span class="handle"></span>
      </button>
    </div>
  {/if}

  <div
    class="body"
    class:scrollable={desktop || app.snap === 'full'}
    bind:this={bodyEl}
    onscroll={rememberScroll}
    onpointerdown={(e) => beginDrag(e, true)}
    onpointermove={moveDrag}
    onpointerup={endDrag}
    onpointercancel={endDrag}
  >
    <div class="list-anchor" tabindex="-1" bind:this={listAnchorEl}></div>
    {@render children()}
  </div>
</section>

<style>
  .sheet {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: var(--sheet-h);
    display: flex;
    flex-direction: column;
    background: var(--color-surface);
    border-radius: 22px 22px 0 0;
    box-shadow: var(--shadow-sheet);
    z-index: var(--z-sheet);
    will-change: transform;
    overscroll-behavior: contain;
  }
  @media (prefers-reduced-motion: no-preference) {
    .sheet {
      transition: transform 0.26s cubic-bezier(0.32, 0.72, 0, 1);
    }
  }
  .sheet.dragging {
    transition: none;
  }

  .grip {
    flex: none;
    touch-action: none;
    padding-top: 2px;
  }
  .handle-btn {
    display: block;
    width: 100%;
    height: 28px;
    display: grid;
    place-items: center;
  }
  .handle {
    display: block;
    width: 40px;
    height: 5px;
    border-radius: 3px;
    background: #d0d7de;
  }

  .body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    touch-action: pan-y;
    overscroll-behavior: contain;
    padding: 0 18px calc(24px + var(--safe-bottom));
  }
  .body.scrollable {
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .list-anchor {
    outline: none;
    height: 0;
  }

  /* Desktop: the same component becomes the static left panel (PLAN §4.2). */
  .sheet.desktop {
    position: static;
    height: 100%;
    border-radius: 0;
    box-shadow: none;
    transition: none;
  }
  .sheet.desktop .body {
    padding: 0 16px 16px;
  }
</style>
