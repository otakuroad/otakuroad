/**
 * The address bar is the only place filter state and a shared saved list live, so a wrong parse
 * here either loses a friend's list or opens the map with the wrong chips lit.
 */
import { describe, expect, it } from 'vitest'
import { filterQueryString, mergeSaved, readFilterQuery, readSavedQuery, savedListUrl } from '../src/lib/url'

describe('filter query', () => {
  it('round-trips categories and flags and drops unknown categories', () => {
    const q = readFilterQuery('?c=figure_hobby,bogus,trading_card&open=1')
    expect(q).toEqual({ categories: ['figure_hobby', 'trading_card'], openNow: true, taxFree: false })
    expect(filterQueryString(q)).toBe('c=figure_hobby%2Ctrading_card&open=1')
  })
})

describe('shared saved list', () => {
  it('reads ids, trimming, deduplicating and ignoring empties', () => {
    expect(readSavedQuery('?saved=super-potato-akihabara,%20radio-kaikan,,super-potato-akihabara')).toEqual([
      'super-potato-akihabara',
      'radio-kaikan',
    ])
    expect(readSavedQuery('?c=figure_hobby')).toEqual([])
  })

  it('builds the link on the map page of the same locale', () => {
    expect(savedListUrl('https://otakuroad.pages.dev', 'ja', ['a', 'b'])).toBe('https://otakuroad.pages.dev/ja/?saved=a,b')
    expect(savedListUrl('https://otakuroad.pages.dev', 'ko', [])).toBe('https://otakuroad.pages.dev/ko/')
  })

  it('merges without duplicates and keeps the visitor’s own order first', () => {
    expect(mergeSaved(['b', 'a'], ['a', 'c', 'c', 'd'])).toEqual(['b', 'a', 'c', 'd'])
    expect(mergeSaved([], ['x'])).toEqual(['x'])
  })
})
