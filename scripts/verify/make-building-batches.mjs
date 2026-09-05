// Build one self-contained prompt file per batch of BUILDING records for the adversarial re-verification agents.
// usage: node make-building-batches.mjs <ids.json (array of building ids) | all> <batch-size> <out-dir> <results-dir>
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const [idsArg, sizeArg, outDir, resultsDir] = process.argv.slice(2)
const size = Number(sizeArg)
const ids = idsArg === 'all' ? readdirSync(join(ROOT, 'data/buildings')).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')) : JSON.parse(readFileSync(idsArg, 'utf8'))
mkdirSync(outDir, { recursive: true })
mkdirSync(resultsDir, { recursive: true })

const building = (id) => JSON.parse(readFileSync(join(ROOT, 'data/buildings', `${id}.json`), 'utf8'))
const stores = readdirSync(join(ROOT, 'data/stores'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(ROOT, 'data/stores', f), 'utf8')))

const RULES = `# otakuroad adversarial re-verification — BUILDING records

You are re-verifying BUILDING records for otakuroad, a map of Akihabara subculture shops. A building record is the pin for a multi-tenant building (Radio Kaikan, AKIBA Cultures Zone, atre…): the map draws one pin and opens a floor directory that lists the curated tenant shops on their floors plus short notes for the floors that have no curated shop. Today is **2026-09-06** (Asia/Tokyo).

**Assume every record below is WRONG until a primary source proves otherwise.** The 382 shop records that went through this process were corrected 59% of the time; the building records were never checked at all. The floor list, the per-floor notes and the walking directions are the fields most likely to be stale.

## What counts as evidence
- **PRIMARY**: the building's own site / floor guide (akihabara-radiokaikan.co.jp, akibacultureszone.com, atre.co.jp, yodobashi-akiba.com, donki.com, pasela.co.jp…), the landlord's or operator's tenant list, a tenant shop's own site/店舗ページ or chain store list stating the building name and floor, a tenant's own X/Instagram **only if you can actually read it** (x.com is 402 anonymously; use https://api.fxtwitter.com/<handle> for the bio, https://cdn.syndication.twimg.com/tweet-result?id=<id>&token=a for one post), press releases by the operator or tenant.
- **SECONDARY** (leads only, never evidence): directories (akihabara-cardmap, torecamap, akibatoreka, tabelog, con-cafe.jp), Yahoo/Google Maps, blogs, wikis, OpenStreetMap, real-estate listings (homes.co.jp is acceptable for the number of storeys only).
- Every change must carry the URL you fetched **and a verbatim quote** from that page. A script re-checks the quote on the page; paraphrases fail. No quote → no change.
- If WebSearch says its budget is exhausted, fetch https://search.yahoo.co.jp/search?p=<url-encoded query>&ei=UTF-8 with WebFetch (or curl if it 429s). WebFetch garbles Shift_JIS/EUC-JP pages — fetch raw and decode when a page matters.

## Procedure per building
1. Fetch \`official_url\`, \`floor_guide_url\` and the primary \`source_urls\`. Fetch each curated tenant's own page or chain list if the floor guide is missing or stale.
2. Check:
   (a) **Floors**: does the building really have exactly these floors (B?F … top)? Storey count from the official site, the operator, or a real-estate listing. Missing or extra floors are errors.
   (b) **Per-floor contents**: for every floor, what is there now according to the official floor guide? Compare with the curated tenants listed below and with \`uncurated_floors\`. An \`uncurated_floors\` entry should describe only floors that have NO curated tenant record; it must not repeat a curated tenant. Rewrite entries that are stale (tenant gone, replaced, renamed).
   (c) **Tenant leads**: for each curated tenant, is it still in this building on these floors per the floor guide? Report mismatches (different floor, gone, renamed) in \`tenant_leads\` — do not change store records yourself. Also report subculture shops on the guide that have no curated record (candidate new records).
   (d) \`hours_note\` (building-wide hours or "each floor differs") and \`exit_hint\` (walking directions from the JR Electric Town Exit): still accurate? Landmarks still exist?
   (e) \`address_ja\`, \`name\` (ja/en/ko), \`official_url\`, \`floor_guide_url\` (live? 404?).
3. Write **one result file per building** to \`RESULTS_DIR/<id>.json\` in the schema below, even when confirmed. Do not edit the repository.

## Value rules
- Floor labels: B1F, 1F … 10F, RF. \`floors\` is the full ordered list of the building's floors.
- \`uncurated_floors\`: array of \`{ floor, ko, en }\`; Korean in 서술체, English plain. Give the complete new array when you change it.
- Text fields \`hours_note\` and \`exit_hint\` are \`{ko, en}\` or null. Change prose only when it is wrong.
- **Never change**: \`id\`, \`verified_at\`, \`source_urls\` (use \`add_source_urls\`), \`photo\`, \`osm_id\`, \`location\`.

## Result schema
\`\`\`json
{
  "id": "<building id>",
  "verdict": "confirmed" | "corrected" | "unverifiable",
  "primary_read": ["<url>", "..."],
  "changes": [ { "path": "uncurated_floors", "to": [ { "floor": "3F", "ko": "...", "en": "..." } ], "evidence_url": "<url>", "quote": "<verbatim>" } ],
  "add_source_urls": ["<primary url you read that is not yet in source_urls>"],
  "tenant_leads": [ { "store_id": "<curated store id or null>", "name_ja": "<shop name>", "floor": "<floor per the guide>", "issue": "different_floor" | "gone" | "renamed" | "new_candidate", "evidence_url": "<url>", "quote": "<verbatim>", "note": "<one sentence>" } ],
  "closure": null,
  "confidence": "high" | "medium" | "low",
  "notes": "<one or two English sentences>"
}
\`\`\`
\`path\` is one of: \`floors\`, \`uncurated_floors\`, \`hours_note\`, \`exit_hint\`, \`address_ja\`, \`name\`, \`official_url\`, \`floor_guide_url\`. Arrays and objects are replaced whole.

When you finish, reply with one line per building: \`<id>: <verdict> — <10 words>\`. Nothing else.
`

let n = 0
for (let i = 0; i < ids.length; i += size) {
  n++
  const batch = ids.slice(i, i + size)
  const parts = [RULES.replace(/RESULTS_DIR/g, resultsDir), `\n---\n\n# Batch ${String(n).padStart(2, '0')} — ${batch.length} buildings\n\nWrite results to \`${resultsDir}/<id>.json\`.\n`]
  for (const id of batch) {
    const b = building(id)
    const tenants = stores
      .filter((s) => s.building_id === id)
      .map((s) => `- ${s.id} — ${s.name.ja} — floors ${s.floors.join(', ')} — ${s.category}${s.status.state !== 'open' ? ` — status ${s.status.state}` : ''}`)
    const { photo, ...rest } = b
    parts.push(`\n## ${id}\n`)
    parts.push(`Curated tenant records currently filed in this building (verified 2026-09-05/06 — do NOT edit them; report mismatches as tenant_leads):\n${tenants.length ? tenants.join('\n') : '- none'}\n`)
    parts.push(`Building record:\n\`\`\`json\n${JSON.stringify(rest, null, 1)}\n\`\`\`\n`)
  }
  writeFileSync(join(outDir, `batch-${String(n).padStart(2, '0')}.md`), parts.join('\n'))
}
console.log(`${ids.length} buildings → ${n} batches in ${outDir}`)
