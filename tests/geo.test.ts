/**
 * Walking-minute maths. The numbers here decide whether "도보 4분" on a card is trustworthy, which
 * is the whole reason distances are measured from a station exit rather than from GPS (PLAN §6.6).
 */
import { describe, expect, it } from 'vitest'
import {
  ANCHORS,
  DEFAULT_ANCHOR,
  DETOUR_FACTOR,
  MAP_MAX_BOUNDS,
  WALK_METERS_PER_MINUTE,
  haversineMeters,
  walkingMinutes,
} from '@/lib/geo'
import { AKIBA_BBOX } from '@/data/schema'

const ELECTRIC_TOWN = { lat: 35.69855, lng: 139.77245 }

describe('haversineMeters', () => {
  it('is zero for the same point', () => {
    expect(haversineMeters(ELECTRIC_TOWN, ELECTRIC_TOWN)).toBe(0)
  })

  it('is symmetric', () => {
    const a = ELECTRIC_TOWN
    const b = { lat: 35.699371, lng: 139.770741 }
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 9)
  })

  it('matches a known one-degree-of-latitude scale', () => {
    // 0.001° of latitude is ~111.2 m anywhere on Earth.
    const meters = haversineMeters({ lat: 35.698, lng: 139.772 }, { lat: 35.699, lng: 139.772 })
    expect(meters).toBeGreaterThan(110)
    expect(meters).toBeLessThan(113)
  })

  it('puts Radio Kaikan a short walk from the Electric Town exit', () => {
    // Radio Kaikan is the building directly across the plaza from the exit.
    const meters = haversineMeters(ELECTRIC_TOWN, { lat: 35.697882, lng: 139.77195 })
    expect(meters).toBeGreaterThan(50)
    expect(meters).toBeLessThan(150)
  })
})

describe('walkingMinutes', () => {
  it('never reports zero minutes', () => {
    expect(walkingMinutes(ELECTRIC_TOWN, ELECTRIC_TOWN)).toBe(1)
    expect(walkingMinutes(ELECTRIC_TOWN, { lat: 35.69856, lng: 139.77246 })).toBe(1)
  })

  it('rounds up and applies the grid detour factor', () => {
    const target = { lat: 35.699371, lng: 139.770741 } // Super Potato
    const straight = haversineMeters(ELECTRIC_TOWN, target)
    const expected = Math.max(1, Math.ceil((straight * DETOUR_FACTOR) / WALK_METERS_PER_MINUTE))
    expect(walkingMinutes(ELECTRIC_TOWN, target)).toBe(expected)
  })

  it('gives Super Potato the 3–5 minute walk the plan describes', () => {
    expect(walkingMinutes(ELECTRIC_TOWN, { lat: 35.699371, lng: 139.770741 })).toBeGreaterThanOrEqual(3)
    expect(walkingMinutes(ELECTRIC_TOWN, { lat: 35.699371, lng: 139.770741 })).toBeLessThanOrEqual(5)
  })

  it('is symmetric and monotonic in distance', () => {
    const near = { lat: 35.698311, lng: 139.771682 } // Gamers
    const far = { lat: 35.70235, lng: 139.77135 } // Suehirocho
    expect(walkingMinutes(ELECTRIC_TOWN, near)).toBe(walkingMinutes(near, ELECTRIC_TOWN))
    expect(walkingMinutes(ELECTRIC_TOWN, far)).toBeGreaterThan(walkingMinutes(ELECTRIC_TOWN, near))
  })
})

describe('anchors', () => {
  it('has the three exits the plan names, all inside the map bounds', () => {
    expect(ANCHORS.map((a) => a.key)).toEqual(['electric_town_exit', 'showa_dori_exit', 'suehirocho'])
    for (const anchor of ANCHORS) {
      expect(anchor.lat).toBeGreaterThan(AKIBA_BBOX.south)
      expect(anchor.lat).toBeLessThan(AKIBA_BBOX.north)
      expect(anchor.lng).toBeGreaterThan(AKIBA_BBOX.west)
      expect(anchor.lng).toBeLessThan(AKIBA_BBOX.east)
    }
  })

  it('defaults to the Electric Town exit, which is where the map opens', () => {
    expect(DEFAULT_ANCHOR.key).toBe('electric_town_exit')
  })

  it('places the Showa-dori exit east of the Electric Town exit across the tracks', () => {
    const [electric, showa] = ANCHORS
    expect(showa!.lng).toBeGreaterThan(electric!.lng)
    expect(haversineMeters(electric!, showa!)).toBeGreaterThan(100)
  })

  it('keeps every anchor inside the map’s maxBounds', () => {
    const [[west, south], [east, north]] = MAP_MAX_BOUNDS
    for (const anchor of ANCHORS) {
      expect(anchor.lng).toBeGreaterThan(west)
      expect(anchor.lng).toBeLessThan(east)
      expect(anchor.lat).toBeGreaterThan(south)
      expect(anchor.lat).toBeLessThan(north)
    }
  })
})
