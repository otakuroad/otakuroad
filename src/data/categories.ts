/** Category taxonomy. Keys are the only classification axis; sub-interests are tags. */
export const CATEGORY_KEYS = [
  'anime_goods',
  'doujin_manga',
  'figure_hobby',
  'retro_game',
  'trading_card',
  'arcade',
  'maid_cafe',
  'idol',
  'cosplay',
  'electronics',
] as const

export type CategoryKey = (typeof CATEGORY_KEYS)[number]

export interface CategoryMeta {
  key: CategoryKey
  label: { ko: string; en: string; ja: string }
  /** Marker fill color. Must keep ≥3:1 contrast against white for the ring/glyph. */
  color: string
  /**
   * Name of the Phosphor "fill" icon drawn on the marker, for reference only — the path itself is
   * vendored in src/lib/glyphs.ts and keyed by `key`, not by this string.
   */
  glyph: string
}

export const CATEGORIES: readonly CategoryMeta[] = [
  { key: 'anime_goods', label: { ko: '애니 굿즈·종합', en: 'Anime goods', ja: 'アニメグッズ' }, color: '#E5484D', glyph: 'tote-simple' },
  { key: 'doujin_manga', label: { ko: '동인지·만화', en: 'Doujinshi & manga', ja: '同人誌・漫画' }, color: '#D6409F', glyph: 'books' },
  { key: 'figure_hobby', label: { ko: '피규어·프라모델', en: 'Figures & hobby', ja: 'フィギュア・ホビー' }, color: '#8E4EC6', glyph: 'robot' },
  { key: 'retro_game', label: { ko: '레트로 게임', en: 'Retro games', ja: 'レトロゲーム' }, color: '#3E63DD', glyph: 'game-controller' },
  { key: 'trading_card', label: { ko: '트레카·보드게임', en: 'Trading cards & board games', ja: 'トレカ・ボードゲーム' }, color: '#30A46C', glyph: 'cards-three' },
  { key: 'arcade', label: { ko: '오락실', en: 'Arcades', ja: 'ゲームセンター' }, color: '#F76B15', glyph: 'joystick' },
  { key: 'maid_cafe', label: { ko: '메이드·컨셉 카페', en: 'Maid & concept cafés', ja: 'メイド・コンセプトカフェ' }, color: '#C77A00', glyph: 'coffee' },
  { key: 'idol', label: { ko: '아이돌 극장·라이브', en: 'Idol theaters & live', ja: 'アイドル劇場・ライブ' }, color: '#00A2C7', glyph: 'microphone-stage' },
  { key: 'cosplay', label: { ko: '코스프레·캐릭터 의류', en: 'Cosplay & apparel', ja: 'コスプレ・アパレル' }, color: '#A2845E', glyph: 't-shirt' },
  { key: 'electronics', label: { ko: '전자상가·호비층', en: 'Electronics (hobby floors)', ja: '電気街・ホビー階' }, color: '#687076', glyph: 'cpu' },
] as const

export const BUILDING_COLOR = '#1F2328'

export const CATEGORY_BY_KEY: Record<CategoryKey, CategoryMeta> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c]),
) as Record<CategoryKey, CategoryMeta>
