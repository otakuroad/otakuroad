/**
 * Slippy-map tile maths for warming the offline cache.
 *
 * OpenFreeMap serves vector tiles up to zoom 14 and MapLibre overzooms them from there, so the whole
 * of Akihabara at every zoom the app allows is a handful of z12–z14 tiles. Fetching those once while
 * online is enough for the service worker to serve the map with no connection (PLAN §9 M6).
 */

export interface TileCoord {
  z: number
  x: number
  y: number
}

/** Web-Mercator tile column/row containing a lng/lat at zoom z. */
export function lngLatToTile(lng: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z
  const x = Math.floor(((lng + 180) / 360) * n)
  const latRad = (lat * Math.PI) / 180
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n)
  return { x: Math.min(n - 1, Math.max(0, x)), y: Math.min(n - 1, Math.max(0, y)) }
}

/** Every tile covering a bounding box for each zoom in [minZoom, maxZoom]. */
export function tilesCovering(
  bounds: { west: number; south: number; east: number; north: number },
  minZoom: number,
  maxZoom: number,
): TileCoord[] {
  const out: TileCoord[] = []
  for (let z = minZoom; z <= maxZoom; z++) {
    const a = lngLatToTile(bounds.west, bounds.north, z)
    const b = lngLatToTile(bounds.east, bounds.south, z)
    for (let x = a.x; x <= b.x; x++) for (let y = a.y; y <= b.y; y++) out.push({ z, x, y })
  }
  return out
}

/** Expand a `{z}/{x}/{y}` template. */
export function tileUrl(template: string, tile: TileCoord): string {
  return template.replace('{z}', String(tile.z)).replace('{x}', String(tile.x)).replace('{y}', String(tile.y))
}
