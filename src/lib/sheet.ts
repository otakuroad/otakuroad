/**
 * Bottom-sheet geometry, shared by the sheet itself and by the map (which needs to know how much of
 * the viewport is covered so a selected pin can be panned above it). Keeping the arithmetic in one
 * place is the only way the two stay in agreement.
 */
import type { Snap } from './app-state.svelte'

/** Half and full are fixed fractions of the viewport (PLAN §4.1). Peek is content-driven. */
export const SNAP_FRACTION: Record<Exclude<Snap, 'peek'>, number> = { half: 0.5, full: 0.92 }

/** The sheet element is always full height; the snap only changes how far it is translated down. */
export const SHEET_FRACTION = SNAP_FRACTION.full

/**
 * The drag grip, which sits above the scrolling body and so is not part of the measured peek block.
 * Nothing else is added: any slack here shows up as the top few pixels of whatever follows the peek
 * block (the 전체/저장됨 segment), so each content component owns its own bottom padding instead.
 */
export const GRIP_PX = 30

/**
 * Floor for the peek snap, so the sheet is always grabbable.
 *
 * There is deliberately no percentage floor here. PLAN §4.1 describes the idle peek as one line
 * ("근처 20곳 · 전기가 출구 기준 ▾"), and a flat 18% of a phone is tall enough to also drag the
 * 전체/저장됨 segment and the sort caption above the fold — about 90px of map lost for two controls
 * that belong to the expanded list. Letting the content decide keeps peek to its one row.
 */
export const MIN_PEEK_PX = 88

/** Visible height of the sheet at `snap`. `peekPx` is the measured height of the peek block. */
export function snapHeight(snap: Snap, viewportH: number, peekPx: number): number {
  if (snap !== 'peek') return viewportH * SNAP_FRACTION[snap]
  const wanted = peekPx === 0 ? MIN_PEEK_PX : peekPx + GRIP_PX
  return Math.min(viewportH * SNAP_FRACTION.half, Math.max(MIN_PEEK_PX, wanted))
}
