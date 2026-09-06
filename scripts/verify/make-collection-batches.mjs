// Build one self-contained prompt file per batch of BACKLOG LEADS for the collection agents: each agent
// writes a complete store record from primary sources, with evidence quotes for the risk fields.
// usage: node make-collection-batches.mjs <lead-id-prefix | ids.json> <batch-size> <out-dir> <results-dir>
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const [selector, sizeArg, outDir, resultsDir] = process.argv.slice(2)
const size = Number(sizeArg)
mkdirSync(outDir, { recursive: true })
mkdirSync(resultsDir, { recursive: true })

const backlog = JSON.parse(readFileSync(join(ROOT, 'data/backlog.json'), 'utf8'))
const leads = selector.endsWith('.json')
  ? JSON.parse(readFileSync(selector, 'utf8')).map((id) => backlog.remaining.find((e) => e.id === id)).filter(Boolean)
  : backlog.remaining.filter((e) => e.id.startsWith(selector))
const building = (id) => (id && existsSync(join(ROOT, 'data/buildings', `${id}.json`)) ? JSON.parse(readFileSync(join(ROOT, 'data/buildings', `${id}.json`), 'utf8')) : null)
const stores = readdirSync(join(ROOT, 'data/stores'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(ROOT, 'data/stores', f), 'utf8')))

// Tag vocabulary in use, so new records reuse existing tags instead of inventing near-duplicates.
const tagCounts = {}
for (const s of stores) for (const t of s.tags) tagCounts[t] = (tagCounts[t] || 0) + 1
const tagVocab = Object.entries(tagCounts)
  .filter(([, n]) => n >= 3)
  .sort((a, b) => b[1] - a[1])
  .map(([t, n]) => `${t}(${n})`)
  .join(', ')
const chains = [...new Set(stores.map((s) => s.chain).filter(Boolean))].sort().join(', ')
const schemaText = readFileSync(join(ROOT, 'src/data/schema.ts'), 'utf8')
const example = stores.find((s) => s.id === 'havikoro-toy-radio-kaikan') ?? stores.find((s) => s.building_id)
const { photo, photos, ...exampleRest } = example
const glossary = JSON.parse(readFileSync(join(ROOT, 'data/glossary.json'), 'utf8'))

const RULES = `# otakuroad — collect new store records from primary sources

You are writing NEW store records for otakuroad, a map of Akihabara subculture shops. Each lead below was seen on a building's official floor guide or on the shop's own X/Instagram during the 2026-09-06 building re-verification, but has no record yet. Today is **2026-09-06** (Asia/Tokyo).

Every field you write must come from a source you actually read. The dataset's rule is "no source, no publish": a guessed opening time sends someone to a closed shutter, so \`hours: null\` ("hours unconfirmed") beats a wrong schedule.

## Evidence
- **PRIMARY** (the only basis for facts): the shop's own site / 店舗ページ / 特定商取引法 page, the chain's official store list, the building's official floor guide, the shop's own X or Instagram **when you can actually read it** (x.com is 402 anonymously: use https://api.fxtwitter.com/<handle> for the bio, https://cdn.syndication.twimg.com/tweet-result?id=<id>&token=a for one post; Instagram bios are readable with WebFetch), press releases by the operator (prtimes.jp by that company), the official Pokémon / Bushiroad / Bandai dealer lists for card shops.
- **SECONDARY** (leads only, never a fact): directories (akihabara-cardmap, torecamap, akibatoreka, tabelog, con-cafe.jp), Yahoo/Google Maps, blogs, wikis, OpenStreetMap.
- If WebSearch says its budget is exhausted, fetch https://search.yahoo.co.jp/search?p=<url-encoded query>&ei=UTF-8 with WebFetch (or curl if it 429s). WebFetch garbles Shift_JIS/EUC-JP pages — fetch raw and decode when a page matters.
- For the risk fields — \`hours\`, \`floors\`, \`address_ja\`, \`tax_free\`, \`payment\`, \`adult_content\`, and the fact that the shop is open now — record an \`evidence\` entry with the URL you fetched and a **verbatim quote**; a script re-checks each quote on the page, paraphrases fail. A field with no primary evidence stays at its null/unknown default.
- If you cannot read any primary source for a lead, set \`"publish": false\` and explain in \`notes\`; do not invent a record.

## Record rules (schema below; read it)
- \`id\`: kebab-case slug, ASCII, ending in \`-akihabara\` or the branch name as the existing records do (e.g. \`toreca-monka-akihabara\`). Must not collide with an existing id.
- All leads are TENANTS: set \`building_id\` to the given building, \`floors\` to the floor(s) the primary source states, \`location: null\`, \`street_segment: null\`, \`address_ja\` = the building's address + building name + floor (see the example).
- \`name\`: ko / en / ja. Korean follows the glossary below (katakana brands get the established Korean rendering; otherwise a sensible transliteration). \`synonyms\`: 6–12 search aliases in ko/en/ja (spacing variants, romanizations, the building nickname).
- \`category\`: one of the 10 keys. Sub-interests are \`tags\` (snake_case, prefer the vocabulary below).
- \`one_line\`: what the shop is, in one sentence, ko and en. \`how_to_find\`: from the JR Electric Town Exit / the building entrance to the floor, ko and en. \`tips\`: 2–4 practical, sourced tips (ko list and en list of equal length).
- \`hours\`: rules by day (\`hol\` when the source states 祝日), \`regular_holiday\`/\`note\` as \`{ko,en}\` or null, \`source_url\` = the primary page. Null when no primary page states hours.
- Adult-only shops are not published (\`publish: false\`, say why). An R-18 corner inside a general shop → \`adult_content: { level: "floor", floors: [...] }\`.
- \`priority\`: 3. \`confidence\`: high if a primary page states name+floor+hours; medium if only SNS; low if you had to leave hours and address unconfirmed. \`verified_at\`: "2026-09-06". \`source_urls\`: every primary page you read (≥1). \`osm_id\`: null. \`photo\`: omit.
- Korean prose in 서술체 (no 존댓말), like the example. Do not copy the example's facts.

## Output — one file per lead at \`RESULTS_DIR/<lead id>.json\`
\`\`\`json
{
  "lead_id": "<lead id from the batch>",
  "publish": true,
  "record": { "...": "a complete Store object per the schema, photo omitted" },
  "evidence": [ { "path": "hours", "evidence_url": "<url>", "quote": "<verbatim>" }, { "path": "floors", "...": "..." } ],
  "notes": "<what you read, what stayed unconfirmed, English>"
}
\`\`\`
When you finish, reply with one line per lead: \`<lead id> → <record id>: publish|skip — <10 words>\`. Nothing else.

## Korean naming glossary (ja → ko / en)
${glossary.entries.map((e) => `- ${e.ja} → ${e.ko} / ${e.en}${e.note ? ` (${e.note})` : ''}`).join('\n')}

## Tag vocabulary in use (tag(count))
${tagVocab}

## Chain slugs in use
${chains}

## Schema (src/data/schema.ts)
\`\`\`ts
${schemaText}
\`\`\`

## Example of a verified tenant record (style reference only)
\`\`\`json
${JSON.stringify(exampleRest, null, 1)}
\`\`\`
`

// Group by building so one agent reads a floor guide once.
leads.sort((a, b) => `${a.building_id}|${a.id}`.localeCompare(`${b.building_id}|${b.id}`))
let n = 0
for (let i = 0; i < leads.length; i += size) {
  n++
  const batch = leads.slice(i, i + size)
  const parts = [RULES.replace(/RESULTS_DIR/g, resultsDir), `\n---\n\n# Batch ${String(n).padStart(2, '0')} — ${batch.length} leads\n\nWrite results to \`${resultsDir}/<lead id>.json\`.\n`]
  for (const l of batch) {
    const b = building(l.building_id)
    const tenants = stores.filter((s) => s.building_id === l.building_id).map((s) => `${s.id} (${s.name.ja}, ${s.floors.join('/')})`)
    parts.push(`\n## ${l.id}\n`)
    parts.push(`- name_ja: ${l.name_ja}\n- category guess: ${l.category}\n- floor: ${l.floors}\n- building: ${l.building_id} — ${b ? `${b.name.ja} / ${b.name.ko} / ${b.name.en}, ${b.address_ja}, floors ${b.floors.join(',')}` : 'unknown'}\n- lead note: ${l.note}\n- existing tenant records in this building (do not duplicate): ${tenants.join('; ') || 'none'}\n`)
    if (b) parts.push(`- building sources: ${b.source_urls.slice(0, 4).join(' | ')}\n`)
  }
  writeFileSync(join(outDir, `batch-${String(n).padStart(2, '0')}.md`), parts.join('\n'))
}
console.log(`${leads.length} leads → ${n} batches in ${outDir}`)
