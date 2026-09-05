// Build one self-contained prompt file per batch of stores for the adversarial re-verification agents.
// usage: node make-batches.mjs <ids.json (array of store ids)> <batch-size> <out-dir> <results-dir> [audit.json from `npm run audit -- --json`]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const [idsFile, sizeArg, outDir, resultsDir, auditFile] = process.argv.slice(2)
const size = Number(sizeArg)
const ids = JSON.parse(readFileSync(idsFile, 'utf8'))
const audit = auditFile && existsSync(auditFile) ? JSON.parse(readFileSync(auditFile, 'utf8')) : []
mkdirSync(outDir, { recursive: true })
mkdirSync(resultsDir, { recursive: true })

const store = (id) => JSON.parse(readFileSync(join(ROOT, 'data/stores', `${id}.json`), 'utf8'))
const building = (id) => (existsSync(join(ROOT, 'data/buildings', `${id}.json`)) ? JSON.parse(readFileSync(join(ROOT, 'data/buildings', `${id}.json`), 'utf8')) : null)

// Group tenants of the same building / branches of the same chain so one agent reads the floor guide once.
const records = ids.map(store)
records.sort((a, b) => `${a.building_id ?? '~'}|${a.chain ?? '~'}|${a.id}`.localeCompare(`${b.building_id ?? '~'}|${b.chain ?? '~'}|${b.id}`))

const RULES = `# otakuroad adversarial re-verification

You are re-verifying store records for otakuroad, a map of Akihabara subculture shops (anime goods, doujinshi, figures, retro games, trading cards, arcades, maid cafes, idol venues, cosplay). Today is **2026-09-05** (Asia/Tokyo).

**Assume every record below is WRONG until a primary source proves otherwise.** The first 30 records that went through this process were *all* corrected: missing R-18 floors, tax-free claims with no source, hours copied from the wrong page, coordinates from before a move, a six-year-old address. Your job is to find what is wrong in these, with proof — and to say "confirmed" only when you have actually read the proof.

## What counts as evidence
- **PRIMARY**: the shop's own website / 店舗ページ; the chain's official store list; the building's official floor guide (Radio Kaikan akihabara-radiokaikan.co.jp, AKIBA Cultures Zone akibacultureszone.com, atre, Yodobashi, Don Quijote, Pasela, Gamers, Sofmap…); the shop's own X / Instagram **only if you can actually read the page** (X cannot be fetched anonymously — never infer from a search snippet); press releases issued by the company itself (prtimes.jp by that company).
- **SECONDARY** (leads only, never evidence for a change): akihabara-cardmap.com, torecamap.co.jp, akibatoreka.com, akihabara-cardshop.com, con-cafe.jp, tabelog, Yahoo/Google Maps, blogs, wikis, OpenStreetMap. News sites (akiba-souken.com, akiba-pc.watch.impress.co.jp) count as evidence **only** for closures/openings/moves, not for hours.
- Every change must carry the URL you fetched **and a verbatim quote** (Japanese is fine) from that page that supports the new value. The quote will be checked against the page by a script — paraphrases fail. No quote → no change.
- If you cannot read any primary source for a store, report \`unverifiable\` and change nothing — with one exception: hours that were sourced from a SECONDARY site must be set to null (see below).

## Procedure per store
1. Fetch \`official_url\` and every \`source_urls\` entry that is primary. Fetch the chain's store list and/or the building's floor guide.
2. WebSearch: \`"<name.ja>" 閉店\`, \`"<name.ja>" 移転\`, \`"<name.ja>" 秋葉原\` (look at 2025–2026 results). Open anything from the shop/chain itself or from Akiba news sites about a closure, move, rename, or relocation.
3. Check in this order:
   (a) **Still open at this address and floor?** closed / moved / renamed / relocating-with-date.
   (b) **Building and floors.** Is it inside one of the buildings listed in the record's context? Floors exactly as the floor guide says.
   (c) **Hours.** Rules by day, regular holiday, 祝日 handling — compare against the page verbatim. Opening times are the most frequently wrong field.
   (d) \`tax_free\`, \`payment\`, \`secondhand\`.
   (e) **Adult content.** An R-18 floor or corner inside a general store must be \`adult_content.level = "floor"\` with the floors listed. Adult-only stores are not published (report as closure with state "adult_only" in notes).
   (f) \`category\`, \`one_line\`, \`tags\` accuracy. (g) \`address_ja\` exact string (number, building name, floor).
4. Write **one result file per store** to \`RESULTS_DIR/<id>.json\` in the schema below. Write it even when confirmed. Do not edit the repository files yourself.

## Value rules
- \`hours\`: \`{ rules: [{ days: [...], open: "HH:MM", close: "HH:MM" }], regular_holiday: {ko,en}|null, note: {ko,en}|null, source_url: "<primary url>" }\`. days ∈ mon,tue,wed,thu,fri,sat,sun,hol. \`hol\` = Japanese public holidays — include it when the page states 祝日/祝 hours (usually the same as Sat/Sun). Times are HH:MM, max "24:00": a 25:00 close becomes "24:00" plus a note. Each day may appear in only one rule.
- If the record's \`hours.source_url\` is a secondary site and you find no primary page stating hours → change \`hours\` to \`null\` (the app then shows "hours unconfirmed", which beats wrong hours). Cite the secondary URL as evidence_url with quote "no primary source".
- Floors are Japanese: 1F is street level, B1F basement. Labels: B1F, 1F … 10F, RF.
- Text fields are \`{ko, en}\`. Match the existing record's Korean style (서술체, no 존댓말). Change prose only when it is wrong — do not restyle.
- **Never change**: \`id\`, \`verified_at\`, \`source_urls\` (use \`add_source_urls\`), \`photo\`, \`photos\`, \`osm_id\`, \`location\` (report a wrong pin in \`notes\` with the correct address; do not invent coordinates).
- A tenant store (\`building_id\` set) must have the building's address; report mismatches as a change to \`address_ja\` or \`building_id\`.
- \`status\`: \`{ state: "open"|"relocating"|"moved"|"closed", note?: {ko,en}, effective_date?: "YYYY-MM-DD" }\` — use \`relocating\` when a move is announced with a date in the future, \`closure\` (below) when it has already closed or left Akihabara.

## Result schema (write exactly this JSON)
\`\`\`json
{
  "id": "<store id>",
  "verdict": "confirmed" | "corrected" | "closed" | "moved" | "unverifiable",
  "primary_read": ["<url>", "..."],
  "changes": [
    { "path": "hours", "to": { "...": "..." }, "evidence_url": "<url>", "quote": "<verbatim text from that page>" }
  ],
  "add_source_urls": ["<primary url you read that is not yet in source_urls>"],
  "closure": null | { "state": "closed" | "moved_out_of_akiba" | "merged", "date": "YYYY-MM-DD" | null, "evidence_url": "<url>", "quote": "<verbatim>", "successor_note": "<where it went / what replaced it, or null>" },
  "confidence": "high" | "medium" | "low",
  "notes": "<one or two English sentences: what you checked, what you could not check>"
}
\`\`\`
\`path\` is a dotted path into the record: \`hours\`, \`hours.regular_holiday\`, \`hours.note\`, \`tax_free\`, \`payment\`, \`secondhand\`, \`adult_content\`, \`floors\`, \`floor_guide\`, \`address_ja\`, \`status\`, \`one_line\`, \`tips\`, \`how_to_find\`, \`category\`, \`tags\`, \`name\`, \`synonyms\`, \`official_url\`, \`sns\`, \`building_id\`, \`chain\`, \`street_segment\`. Arrays and objects are replaced whole, so give the complete new value.
\`confidence\`: high = a primary page was read and agrees with the (corrected) record; medium = only SNS or indirect confirmation; low = nothing found.

When you finish, reply with one line per store: \`<id>: <verdict> — <10 words>\`. Nothing else.
`

function compactBuilding(b) {
  if (!b) return null
  return { id: b.id, name: b.name, address_ja: b.address_ja, floors: b.floors, floor_guide_url: b.floor_guide_url, official_url: b.official_url, uncurated_floors: b.uncurated_floors, source_urls: b.source_urls }
}

let n = 0
for (let i = 0; i < records.length; i += size) {
  n++
  const batch = records.slice(i, i + size)
  const parts = [RULES.replace(/RESULTS_DIR/g, resultsDir), `\n---\n\n# Batch ${String(n).padStart(2, '0')} — ${batch.length} stores\n\nWrite results to \`${resultsDir}/<id>.json\`.\n`]
  for (const s of batch) {
    const findings = audit.filter((f) => f.subject === `store ${s.id}`).map((f) => `- [${f.severity}] ${f.code}: ${f.message}`)
    const b = s.building_id ? compactBuilding(building(s.building_id)) : null
    parts.push(`\n## ${s.id}\n`)
    parts.push(`Audit leads (mechanical heuristics — check them, they are not proof):\n${findings.length ? findings.join('\n') : '- none'}\n`)
    if (b) parts.push(`Building record (the store is a tenant):\n\`\`\`json\n${JSON.stringify(b, null, 1)}\n\`\`\`\n`)
    const { photo, photos, ...rest } = s
    parts.push(`Store record:\n\`\`\`json\n${JSON.stringify(rest, null, 1)}\n\`\`\`\n`)
  }
  writeFileSync(join(outDir, `batch-${String(n).padStart(2, '0')}.md`), parts.join('\n'))
}
console.log(`${records.length} stores → ${n} batches in ${outDir}`)
