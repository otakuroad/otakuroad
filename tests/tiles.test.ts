/**
 * The offline warm-up depends on these being right: a wrong tile row and the service worker
 * caches a piece of Tokyo Bay instead of Akihabara.
 */
import { describe, expect, it } from 'vitest'
import { AKIBA_BBOX } from '../src/data/schema'
import { lngLatToTile, tilesCovering, tileUrl } from '../src/lib/tiles'

describe('lngLatToTile', () => {
  it('puts the Electric Town exit in the known z14 tile', () => {
    // 139.7715 E, 35.6985 N → tile 14/14553/6448 by the slippy-map formula (n = 16384).
    expect(lngLatToTile(139.7715, 35.6985, 14)).toEqual({ x: 14553, y: 6448 })
  })

  it('clamps at the poles and the antimeridian', () => {
    expect(lngLatToTile(180, 85.1, 1)).toEqual({ x: 1, y: 0 })
    expect(lngLatToTile(-180, -85.1, 1)).toEqual({ x: 0, y: 1 })
  })
})

describe('tilesCovering', () => {
  it('needs only a few tiles for all of Akihabara up to OpenFreeMap’s maxzoom', () => {
    const tiles = tilesCovering(AKIBA_BBOX, 12, 14)
    expect(tiles.length).toBeGreaterThan(0)
    expect(tiles.length).toBeLessThanOrEqual(16)
    expect(tiles.every((t) => t.z >= 12 && t.z <= 14)).toBe(true)
  })

  it('covers both corners of the box at the top zoom', () => {
    const tiles = tilesCovering(AKIBA_BBOX, 14, 14)
    const nw = lngLatToTile(AKIBA_BBOX.west, AKIBA_BBOX.north, 14)
    const se = lngLatToTile(AKIBA_BBOX.east, AKIBA_BBOX.south, 14)
    expect(tiles).toContainEqual({ z: 14, ...nw })
    expect(tiles).toContainEqual({ z: 14, ...se })
  })
})

describe('tileUrl', () => {
  it('fills the template', () => {
    expect(tileUrl('https://t/{z}/{x}/{y}.pbf', { z: 14, x: 1, y: 2 })).toBe('https://t/14/1/2.pbf')
  })
})
