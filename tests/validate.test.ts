import { describe, expect, it } from 'vitest'
import { crossCheck, tokyoToday } from '../scripts/validate'
import type { Excluded } from '../scripts/lib/data'
import { Building, Store, type StoreInput } from '../src/data/schema'
import validStore from './fixtures/store.valid.json'

const TODAY = '2026-09-04'

const radioKaikan = Building.parse({
  id: 'radio-kaikan',
  name: { ko: '라디오회관', en: 'Radio Kaikan', ja: '秋葉原ラジオ会館' },
  location: { lat: 35.6985, lng: 139.7716 },
  address_ja: '東京都千代田区外神田1-15-16',
  floors: ['B1F', '1F', '2F', '3F', '4F', '5F', '6F', '7F', '8F', '9F', '10F'],
  verified_at: TODAY,
  source_urls: ['https://www.akihabara-radiokaikan.co.jp/'],
})

function store(overrides: Partial<StoreInput> & { id: string }): Store {
  return Store.parse({ ...validStore, ...overrides })
}

function tenant(overrides: Partial<StoreInput> & { id: string }): Store {
  return store({ building_id: 'radio-kaikan', location: null, floors: ['3F'], ...overrides })
}

const codes = (findings: { code: string }[]) => findings.map((f) => f.code)

describe('crossCheck', () => {
  it('passes a clean dataset with no errors or warnings', () => {
    const stores = [
      store({ id: 'a-store', chain: 'example-hobby' }),
      store({ id: 'b-store', chain: 'example-hobby' }),
      tenant({ id: 'k-books', chain: null }),
    ]
    expect(crossCheck(stores, [radioKaikan], [], { today: TODAY })).toEqual({ errors: [], warnings: [] })
  })

  it('handles empty inputs', () => {
    expect(crossCheck([], [], [], { today: TODAY })).toEqual({ errors: [], warnings: [] })
  })

  it('flags duplicate store ids', () => {
    const { errors } = crossCheck([store({ id: 'dup', chain: null }), store({ id: 'dup', chain: null })], [], [], { today: TODAY })
    expect(codes(errors)).toContain('duplicate_store_id')
  })

  it('flags duplicate building ids', () => {
    const { errors } = crossCheck([], [radioKaikan, radioKaikan], [], { today: TODAY })
    expect(codes(errors)).toContain('duplicate_building_id')
  })

  it('flags a building_id that does not exist', () => {
    const { errors } = crossCheck([tenant({ id: 'ghost', chain: null, building_id: 'nowhere' })], [radioKaikan], [], { today: TODAY })
    expect(errors).toContainEqual(expect.objectContaining({ code: 'building_missing', subject: 'store ghost' }))
  })

  it('flags tenant floors that the building does not have', () => {
    const { errors } = crossCheck([tenant({ id: 'high', chain: null, floors: ['3F', '12F'] })], [radioKaikan], [], { today: TODAY })
    const finding = errors.find((f) => f.code === 'floor_not_in_building')
    expect(finding?.message).toContain('[12F]')
  })

  it('flags a successor_id that does not exist', () => {
    const moved = store({
      id: 'old-shop',
      chain: null,
      status: { state: 'moved', note: { ko: '이전', en: 'Moved' }, effective_date: '2026-08-01', successor_id: 'new-shop' },
    })
    const { errors } = crossCheck([moved], [], [], { today: TODAY })
    expect(codes(errors)).toContain('successor_missing')
  })

  it('accepts a successor_id that exists', () => {
    const moved = store({
      id: 'old-shop',
      chain: null,
      status: { state: 'moved', note: { ko: '이전', en: 'Moved' }, effective_date: '2026-08-01', successor_id: 'new-shop' },
    })
    const { errors } = crossCheck([moved, store({ id: 'new-shop', chain: null })], [], [], { today: TODAY })
    expect(errors).toEqual([])
  })

  it('treats confidence=low as a warning, not an error', () => {
    const { errors, warnings } = crossCheck([store({ id: 'shaky', chain: null, confidence: 'low' })], [], [], { today: TODAY })
    expect(errors).toEqual([])
    expect(codes(warnings)).toContain('confidence_low')
  })

  it('warns about a chain with a single member', () => {
    const { warnings } = crossCheck([store({ id: 'lonely', chain: 'solo-chain' })], [], [], { today: TODAY })
    expect(codes(warnings)).toContain('chain_single_member')
  })

  it('flags a store whose name.ja is on the excluded list (whitespace-insensitive)', () => {
    const excluded: Excluded[] = [{ name_ja: 'サンプルホビーショップ　秋葉原店', reason: 'closed' }]
    const { errors } = crossCheck([store({ id: 'zombie', chain: null })], [], excluded, { today: TODAY })
    expect(codes(errors)).toContain('excluded_name_collision')
  })

  it('flags verified_at in the future and warns when stale', () => {
    const future = crossCheck([store({ id: 'future', chain: null, verified_at: '2026-09-05' })], [], [], { today: TODAY })
    expect(codes(future.errors)).toContain('verified_in_future')
    const stale = crossCheck([store({ id: 'stale', chain: null, verified_at: '2026-01-01' })], [], [], { today: TODAY })
    expect(codes(stale.warnings)).toContain('stale')
  })
})

describe('tokyoToday', () => {
  it('formats the date in Asia/Tokyo as YYYY-MM-DD', () => {
    // 2026-09-04T23:30Z is already 2026-09-05 in Tokyo.
    expect(tokyoToday(new Date('2026-09-04T23:30:00Z'))).toBe('2026-09-05')
  })
})
