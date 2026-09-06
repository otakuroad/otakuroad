// Build review prompts for the second pass over the Japanese text: an agent compares each Japanese
// field with the English (and Korean) it was translated from and sends back replacements only for
// fields that add, drop or misstate a fact, or read unnaturally. Apply with apply-ja.mjs --overwrite.
// usage: node scripts/i18n/make-ja-review-batches.mjs stores|buildings <batch-size> <out-dir> <results-dir>
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const [kind, sizeArg, outDir, resultsDir] = process.argv.slice(2)
if (!['stores', 'buildings'].includes(kind) || !sizeArg || !outDir || !resultsDir) {
  console.error('usage: make-ja-review-batches.mjs stores|buildings <batch-size> <out-dir> <results-dir>')
  process.exit(1)
}
const size = Number(sizeArg)
mkdirSync(outDir, { recursive: true })
mkdirSync(resultsDir, { recursive: true })

const load = (dir) =>
  readdirSync(join(ROOT, dir))
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(ROOT, dir, f), 'utf8')))
const stores = load('data/stores')
const buildings = load('data/buildings')
const buildingName = Object.fromEntries(buildings.map((b) => [b.id, b.name.ja]))
const tri = (v) => (v && v.ja ? { ko: v.ko, en: v.en, ja: v.ja } : undefined)

function storeItem(s) {
  const item = { id: s.id, name_ja: s.name.ja, name_en: s.name.en, category: s.category }
  if (s.building_id) item.building_ja = buildingName[s.building_id] ?? s.building_id
  if (s.floors.length > 0) item.floors = s.floors
  item.one_line = tri(s.one_line)
  item.how_to_find = tri(s.how_to_find)
  item.tips = tri(s.tips)
  const fg = s.floor_guide.filter((e) => e.ja)
  if (fg.length > 0) item.floor_guide = fg.map((e) => ({ floor: e.floor, ko: e.ko, en: e.en, ja: e.ja }))
  item.regular_holiday = tri(s.hours?.regular_holiday)
  item.hours_note = tri(s.hours?.note)
  item.status_note = tri(s.status?.note)
  return item.one_line ? item : null
}
function buildingItem(b) {
  const item = { id: b.id, name_ja: b.name.ja, name_en: b.name.en, floors: b.floors }
  item.hours_note = tri(b.hours_note)
  item.exit_hint = tri(b.exit_hint)
  const uf = b.uncurated_floors.filter((e) => e.ja)
  if (uf.length > 0) item.uncurated_floors = uf.map((e) => ({ floor: e.floor, ko: e.ko, en: e.en, ja: e.ja }))
  return item.hours_note || item.exit_hint || item.uncurated_floors ? item : null
}

const items = (kind === 'stores' ? stores.map(storeItem) : buildings.map(buildingItem)).filter(Boolean)
const pending = items.filter((it) => !existsSync(join(resultsDir, `${it.id}.json`)))

const RULES = `# otakuroad — review the Japanese text against its source

otakuroad is a map of Akihabara subculture shops. Each record below carries Korean and English descriptions written from primary sources, and a Japanese version that was machine-translated from the English by another agent. Every sentence a visitor reads must be backed by a source, so the Japanese must say **exactly what the English says — no more, no less**.

## What to check, field by field
1. **Added facts** — the most important. Anything in the Japanese that the English does not state: an extra floor number, a landmark, "階段かエレベーターで", "左手に", a product line, an opening time, an explanation of why. Translators add plausible details; here that is inventing a fact. Remove it.
2. **Dropped or changed facts** — a time, day, floor, price, count, name, condition (平日のみ, 祝日を除く, 要予約…) missing or altered.
3. **Wrong names** — the shop's own Japanese name is name_ja; other shops and buildings must use the exact names in the list at the end. Station exits: 電気街口 / 中央改札口 / 昭和通り口, 末広町駅, 中央通り, 昭和通り, 裏通り, ラジオ会館.
4. **Unnatural or wrong Japanese** — translationese, a wrong particle, a mistranslated idiom, English left untranslated, wrong register (one_line is a compact phrase without です; everything else is です・ます調).
Leave good text alone. Do not rephrase for taste.

## Output — one file per record at \`RESULTS_DIR/<id>.json\`
Include **only the fields you changed**, with the complete corrected Japanese for that field (for \`tips\` the whole list with the same number of entries in the same order; for \`floor_guide\` / \`uncurated_floors\` an object keyed by floor with only the floors you changed). Always include \`id\` and a short English \`notes\` saying what was wrong. A record with nothing to fix gets \`{ "id": "<id>", "notes": "ok" }\`.
\`\`\`json
{ "id": "<id>", "how_to_find": "…", "tips": ["…", "…", "…"], "floor_guide": { "5F": "…" }, "notes": "how_to_find added an elevator and a 1F landmark not in the source; tip 2 dropped 'weekdays only'" }
\`\`\`
When you finish, reply with one line per record: \`<id>: ok\` or \`<id>: fixed <fields>\`. Nothing else.

## Building names (id — Japanese — English)
${buildings.map((b) => `${b.id} — ${b.name.ja} — ${b.name.en}`).join('\n')}

## Store names (id — Japanese — English)
${stores.map((s) => `${s.id} — ${s.name.ja} — ${s.name.en}`).join('\n')}
`

let n = 0
for (let i = 0; i < pending.length; i += size) {
  n++
  const batch = pending.slice(i, i + size)
  const parts = [
    RULES.replace(/RESULTS_DIR/g, resultsDir),
    `\n---\n\n# Review batch ${String(n).padStart(2, '0')} — ${batch.length} ${kind}\n\nWrite results to \`${resultsDir}/<id>.json\`.\n`,
  ]
  for (const it of batch) parts.push(`\n## ${it.id}\n\`\`\`json\n${JSON.stringify(it, null, 1)}\n\`\`\`\n`)
  writeFileSync(join(outDir, `review-${String(n).padStart(2, '0')}.md`), parts.join('\n'))
}
console.log(`${items.length} ${kind} carry Japanese, ${pending.length} not yet reviewed → ${n} batches in ${outDir}`)
