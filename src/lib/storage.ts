/**
 * localStorage helpers. No accounts in the MVP (PLAN §1), so saved stores, recent searches and the
 * preferred exit all live in the browser. Every read is defensive: private mode, a cleared profile
 * and a browser that blocks site data must all degrade to "nothing saved" instead of throwing.
 */

const PREFIX = 'otakuroad.'

export const KEYS = {
  saved: `${PREFIX}saved`,
  recent: `${PREFIX}recent`,
  anchor: `${PREFIX}anchor`,
  map3d: `${PREFIX}map3d`,
  basemap: `${PREFIX}basemap`,
} as const

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* quota, private mode, or site data blocked — the feature is a convenience, never a requirement */
  }
}

function readStringList(key: string): string[] {
  const raw = read(key)
  if (raw === null) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

export function loadSaved(): string[] {
  return readStringList(KEYS.saved)
}

export function storeSaved(ids: readonly string[]): void {
  write(KEYS.saved, JSON.stringify(ids))
}

const MAX_RECENT = 6

export function loadRecent(): string[] {
  return readStringList(KEYS.recent).slice(0, MAX_RECENT)
}

export function pushRecent(query: string): string[] {
  const trimmed = query.trim()
  if (trimmed.length === 0) return loadRecent()
  const next = [trimmed, ...loadRecent().filter((q) => q !== trimmed)].slice(0, MAX_RECENT)
  write(KEYS.recent, JSON.stringify(next))
  return next
}

export function clearRecent(): void {
  write(KEYS.recent, '[]')
}

export function loadAnchorKey(): string | null {
  return read(KEYS.anchor)
}

export function storeAnchorKey(key: string): void {
  write(KEYS.anchor, key)
}

/** Whether the visitor switched the map to 3D last time. Flat is the default (tester feedback 2026-09-06). */
export function loadMap3d(): boolean {
  return read(KEYS.map3d) === '1'
}

export function storeMap3d(on: boolean): void {
  write(KEYS.map3d, on ? '1' : '0')
}

/** The basemap the visitor picked in settings, or null for the default. Validated by the caller. */
export function loadBasemap(): string | null {
  return read(KEYS.basemap)
}

export function storeBasemap(key: string): void {
  write(KEYS.basemap, key)
}
