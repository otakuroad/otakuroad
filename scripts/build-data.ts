/**
 * `npm run build:data` — turns data/** into the JSON the app bundles:
 *   src/generated/stores.json       zod-parsed stores (defaults applied), confidence=low dropped,
 *                                   tenant locations resolved from their building
 *   src/generated/buildings.json    zod-parsed buildings
 *   src/generated/stores.geojson    Point features for the map island
 *   src/generated/buildings.geojson
 * Fails on any file error or cross-check error so `dev`/`build` never run on broken data.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Building, Store } from '../src/data/schema'
import { GENERATED_DIR, ROOT, loadDataset } from './lib/data'
import { crossCheck } from './validate'

interface PointFeature<P> {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: P
}

interface FeatureCollection<P> {
  type: 'FeatureCollection'
  features: PointFeature<P>[]
}

interface StoreProps {
  id: string
  category: Store['category']
  name: Store['name']
  priority: Store['priority']
  building_id: string | null
  status_state: Store['status']['state']
}

interface BuildingProps {
  id: string
  name: Building['name']
  tenant_count: number
}

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

function toStoreFeature(s: Store): PointFeature<StoreProps> {
  if (s.location === null) throw new Error(`store ${s.id} has no location after resolution`)
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [s.location.lng, s.location.lat] },
    properties: {
      id: s.id,
      category: s.category,
      name: s.name,
      priority: s.priority,
      building_id: s.building_id,
      status_state: s.status.state,
    },
  }
}

function toBuildingFeature(b: Building, tenantCount: number): PointFeature<BuildingProps> {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [b.location.lng, b.location.lat] },
    properties: { id: b.id, name: b.name, tenant_count: tenantCount },
  }
}

function writeJson(file: string, value: unknown): void {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
  console.log(`  wrote ${relative(ROOT, file)}`)
}

export function runBuildData(): number {
  const ds = loadDataset()

  const badFiles = ds.reports.filter((r) => r.issues.length > 0)
  if (badFiles.length > 0) {
    for (const r of badFiles) {
      console.error(`✗ ${r.file}`)
      for (const issue of r.issues) console.error(`    ${issue}`)
    }
    console.error(`build-data: ${badFiles.length} invalid file(s) — run \`npm run validate\``)
    return 1
  }

  const allStores = ds.stores.map((s) => s.value)
  const buildings = ds.buildings.map((b) => b.value).sort(byId)
  const { errors, warnings } = crossCheck(allStores, buildings, ds.excluded)
  for (const w of warnings) console.warn(`⚠ ${w.subject}: ${w.message}`)
  if (errors.length > 0) {
    for (const e of errors) console.error(`✗ ${e.subject}: ${e.message}`)
    console.error(`build-data: ${errors.length} cross-check error(s) — run \`npm run validate\``)
    return 1
  }

  const buildingById = new Map(buildings.map((b) => [b.id, b]))
  const published = allStores.filter((s) => s.confidence !== 'low')
  const publishedIds = new Set(published.map((s) => s.id))
  const dropped = allStores.length - published.length

  const stores: Store[] = published
    .map((s) => {
      const out: Store = { ...s }
      if (s.building_id !== null) {
        const building = buildingById.get(s.building_id)
        if (!building) throw new Error(`store ${s.id}: building ${s.building_id} missing after cross-check`)
        out.location = { ...building.location }
      }
      const successor = s.status.successor_id
      if (successor !== undefined && !publishedIds.has(successor)) {
        console.warn(`⚠ store ${s.id}: successor_id "${successor}" is not published (confidence=low) — link dropped`)
        const { successor_id: _dropped, ...rest } = s.status
        out.status = rest
      }
      return out
    })
    .sort(byId)

  const tenantCount = new Map<string, number>()
  for (const s of stores) {
    if (s.building_id !== null) tenantCount.set(s.building_id, (tenantCount.get(s.building_id) ?? 0) + 1)
  }

  const storesGeo: FeatureCollection<StoreProps> = { type: 'FeatureCollection', features: stores.map(toStoreFeature) }
  const buildingsGeo: FeatureCollection<BuildingProps> = {
    type: 'FeatureCollection',
    features: buildings.map((b) => toBuildingFeature(b, tenantCount.get(b.id) ?? 0)),
  }

  mkdirSync(GENERATED_DIR, { recursive: true })
  console.log('otakuroad build-data')
  writeJson(join(GENERATED_DIR, 'stores.json'), stores)
  writeJson(join(GENERATED_DIR, 'buildings.json'), buildings)
  writeJson(join(GENERATED_DIR, 'stores.geojson'), storesGeo)
  writeJson(join(GENERATED_DIR, 'buildings.geojson'), buildingsGeo)
  console.log(`  ${stores.length} stores (${dropped} low-confidence dropped), ${buildings.length} buildings`)
  return 0
}

process.exitCode = runBuildData()
