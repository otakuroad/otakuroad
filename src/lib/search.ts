/**
 * Fuzzy search over stores, buildings and categories (PLAN §4.1 검색 오버레이).
 *
 * Korean visitors type "건프라" or "포켓몬 카드" and expect Volks and Card Labo; Japanese and
 * romaji spellings have to hit too, which is what `synonyms` and the Japanese name are for.
 */
import Fuse, { type IFuseOptions } from 'fuse.js'
import type { Building, Store } from '@/data/schema'
import { CATEGORIES, type CategoryKey } from '@/data/categories'
import type { Locale } from '@/i18n'

export type SearchKind = 'store' | 'building' | 'category'

export interface SearchDoc {
  kind: SearchKind
  id: string
  /** Display name in the active locale. */
  name: string
  /** Japanese name, shown small under the result. */
  ja: string
  category: CategoryKey | null
  /** Landmark rank; used to break fuzzy ties so "애니메이트" beats an obscure tenant. */
  priority: number
  ko: string
  en: string
  synonyms: string[]
  tags: string[]
  categoryLabel: string
}

export interface SearchGroup {
  kind: SearchKind
  hits: SearchDoc[]
}

/**
 * Weights: the display name and the Japanese name are what people actually type or copy from a
 * signboard; synonyms exist for spelling drift; tags are the long tail ("건프라" → gunpla).
 */
const FUSE_OPTIONS: IFuseOptions<SearchDoc> = {
  includeScore: true,
  ignoreLocation: true,
  threshold: 0.38,
  minMatchCharLength: 1,
  keys: [
    { name: 'ko', weight: 1 },
    { name: 'en', weight: 1 },
    { name: 'ja', weight: 0.9 },
    { name: 'synonyms', weight: 0.7 },
    { name: 'tags', weight: 0.45 },
    { name: 'categoryLabel', weight: 0.35 },
  ],
}

export function buildDocs(
  stores: readonly Store[],
  buildings: readonly Building[],
  locale: Locale,
): SearchDoc[] {
  const docs: SearchDoc[] = []
  for (const s of stores) {
    docs.push({
      kind: 'store',
      id: s.id,
      name: s.name[locale],
      ja: s.name.ja,
      category: s.category,
      priority: s.priority,
      ko: s.name.ko,
      en: s.name.en,
      synonyms: s.synonyms,
      tags: s.tags,
      categoryLabel: CATEGORIES.find((c) => c.key === s.category)?.label[locale] ?? '',
    })
  }
  for (const b of buildings) {
    docs.push({
      kind: 'building',
      id: b.id,
      name: b.name[locale],
      ja: b.name.ja,
      category: null,
      priority: 1,
      ko: b.name.ko,
      en: b.name.en,
      synonyms: [],
      tags: [],
      categoryLabel: '',
    })
  }
  for (const c of CATEGORIES) {
    docs.push({
      kind: 'category',
      id: c.key,
      name: c.label[locale],
      ja: c.label.ja,
      category: c.key,
      priority: 2,
      ko: c.label.ko,
      en: c.label.en,
      synonyms: [],
      tags: [],
      categoryLabel: c.label[locale],
    })
  }
  return docs
}

export interface SearchIndex {
  search(query: string, limit?: number): SearchGroup[]
}

export function createSearchIndex(
  stores: readonly Store[],
  buildings: readonly Building[],
  locale: Locale,
): SearchIndex {
  const docs = buildDocs(stores, buildings, locale)
  const fuse = new Fuse(docs, FUSE_OPTIONS)
  return {
    search(query, limit = 24) {
      const trimmed = query.trim()
      if (trimmed.length === 0) return []
      const results = fuse
        .search(trimmed, { limit: limit * 2 })
        // Equal-ish scores are broken by landmark priority, so the obvious answer stays on top.
        .sort((a, b) => (a.score ?? 1) - (b.score ?? 1) || a.item.priority - b.item.priority)
        .slice(0, limit)
        .map((r) => r.item)
      const groups: SearchGroup[] = []
      for (const kind of ['store', 'building', 'category'] as const) {
        const hits = results.filter((d) => d.kind === kind)
        if (hits.length > 0) groups.push({ kind, hits })
      }
      return groups
    },
  }
}

/** The 6 empty-state shortcut chips (PLAN §4.1). `first` is the M6 curated route, disabled for now. */
export const SEARCH_SHORTCUTS = [
  { key: 'radio_kaikan', action: { type: 'building', id: 'radio-kaikan' } },
  { key: 'open_now', action: { type: 'filter_open' } },
  { key: 'retro_game', action: { type: 'category', id: 'retro_game' } },
  { key: 'maid_cafe', action: { type: 'category', id: 'maid_cafe' } },
  { key: 'trading_card', action: { type: 'category', id: 'trading_card' } },
  { key: 'figure_hobby', action: { type: 'category', id: 'figure_hobby' } },
] as const

export type SearchShortcut = (typeof SEARCH_SHORTCUTS)[number]
