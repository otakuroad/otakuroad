import { describe, expect, it } from 'vitest'
import { Store } from '../src/data/schema'
import validStore from './fixtures/store.valid.json'

/** Paths of all issues, e.g. ['floors', 'hours.rules.0.open']. */
function issuePaths(input: unknown): string[] {
  const result = Store.safeParse(input)
  if (result.success) return []
  return result.error.issues.map((issue) => issue.path.join('.'))
}

describe('Store schema', () => {
  it('parses the complete valid fixture', () => {
    const store = Store.parse(validStore)
    expect(store.id).toBe('example-store')
    expect(store.category).toBe('figure_hobby')
    expect(store.location).toEqual({ lat: 35.7005, lng: 139.7715 })
    expect(store.status).toEqual({ state: 'open' })
    expect(store.hours?.rules).toHaveLength(2)
    expect(store.hours?.regular_holiday).toBeNull()
  })

  it('applies defaults for omitted optional fields', () => {
    const { synonyms, tags, sns, status, adult_content, ...minimal } = validStore
    const store = Store.parse(minimal)
    expect(store.synonyms).toEqual([])
    expect(store.tags).toEqual([])
    expect(store.sns).toEqual({})
    expect(store.status).toEqual({ state: 'open' })
    expect(store.adult_content).toEqual({ level: 'none', floors: [] })
  })

  it('rejects a tenant without floors', () => {
    const paths = issuePaths({ ...validStore, building_id: 'radio-kaikan', location: null, floors: [] })
    expect(paths).toContain('floors')
  })

  it('rejects a standalone store without a location', () => {
    const paths = issuePaths({ ...validStore, building_id: null, location: null })
    expect(paths).toContain('location')
  })

  it('rejects adult_content.level "store"', () => {
    const paths = issuePaths({ ...validStore, adult_content: { level: 'store', floors: [] } })
    expect(paths).toContain('adult_content')
  })

  it('rejects the floor label "3階"', () => {
    const paths = issuePaths({ ...validStore, floors: ['3階'] })
    expect(paths).toContain('floors.0')
  })

  it('rejects the time "25:00"', () => {
    const broken = structuredClone(validStore)
    broken.hours.rules[0]!.open = '25:00'
    expect(issuePaths(broken)).toContain('hours.rules.0.open')
  })

  it('rejects coordinates outside the Akihabara bbox', () => {
    const paths = issuePaths({ ...validStore, location: { lat: 35.6595, lng: 139.7005 } })
    expect(paths).toEqual(expect.arrayContaining(['location.lat', 'location.lng']))
  })
})
