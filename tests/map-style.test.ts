/**
 * The basemap is patched at runtime (src/lib/map-style.ts). These pin down the three patches: POI
 * symbols hidden, labels localized, and — after the 2026-09-06 tester feedback — extruded buildings
 * hidden unless 3D is asked for.
 */
import { describe, expect, it } from 'vitest'
import { extrusionLayerIds, patchStyle, type MapStyle } from '../src/lib/map-style'

const style: MapStyle = {
  version: 8,
  sources: {},
  layers: [
    { id: 'building', type: 'fill', 'source-layer': 'building' },
    { id: 'building-3d', type: 'fill-extrusion', 'source-layer': 'building', layout: {} },
    { id: 'poi-level-1', type: 'symbol', 'source-layer': 'poi', layout: { 'text-field': '{name}' } },
    { id: 'place-city', type: 'symbol', 'source-layer': 'place', layout: { 'text-field': ['get', 'name:latin'] } },
  ],
}

describe('patchStyle', () => {
  it('hides extruded buildings by default and keeps them when 3D is requested', () => {
    const flat = patchStyle(style, 'ko')
    expect(flat.layers.find((l) => l.id === 'building-3d')?.layout).toMatchObject({ visibility: 'none' })
    const threeD = patchStyle(style, 'ko', { threeD: true })
    expect(threeD.layers.find((l) => l.id === 'building-3d')?.layout).not.toMatchObject({ visibility: 'none' })
  })

  it('hides the basemap POI symbols and leaves fills alone', () => {
    const patched = patchStyle(style, 'en')
    expect(patched.layers.find((l) => l.id === 'poi-level-1')?.layout).toMatchObject({ visibility: 'none' })
    expect(patched.layers.find((l) => l.id === 'building')).toEqual(style.layers[0])
  })

  it('prefers the visitor language in labels without dropping the original', () => {
    const patched = patchStyle(style, 'ko')
    const field = patched.layers.find((l) => l.id === 'place-city')?.layout?.['text-field'] as unknown[]
    expect(field[0]).toBe('coalesce')
    expect(field).toContainEqual(['get', 'name:ko'])
    expect(field).toContainEqual(['get', 'name:latin'])
  })

  it('does not mutate the input style', () => {
    const before = JSON.stringify(style)
    patchStyle(style, 'ko')
    expect(JSON.stringify(style)).toBe(before)
  })
})

describe('extrusionLayerIds', () => {
  it('lists exactly the fill-extrusion layers', () => {
    expect(extrusionLayerIds(style)).toEqual(['building-3d'])
  })
})
