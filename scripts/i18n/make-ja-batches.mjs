// Build one self-contained prompt file per batch of records that still lack Japanese text, for the
// translation agents. Each agent writes one result file per record; apply-ja.mjs merges them.
// usage: node scripts/i18n/make-ja-batches.mjs stores|buildings <batch-size> <out-dir> <results-dir>
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const [kind, sizeArg, outDir, resultsDir] = process.argv.slice(2)
if (!['stores', 'buildings'].includes(kind) || !sizeArg || !outDir || !resultsDir) {
  console.error('usage: make-ja-batches.mjs stores|buildings <batch-size> <out-dir> <results-dir>')
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

/** Everything a store still needs in Japanese. Null when the record is complete. */
function storeItem(s) {
  const item = { id: s.id, name_ja: s.name.ja, name_en: s.name.en, category: s.category }
  if (s.building_id) item.building_ja = buildingName[s.building_id] ?? s.building_id
  if (s.floors.length > 0) item.floors = s.floors
  let missing = false
  if (!s.one_line.ja) (item.one_line = { ko: s.one_line.ko, en: s.one_line.en }), (missing = true)
  if (s.how_to_find && !s.how_to_find.ja) (item.how_to_find = { ko: s.how_to_find.ko, en: s.how_to_find.en }), (missing = true)
  if (s.tips && !s.tips.ja) (item.tips = { ko: s.tips.ko, en: s.tips.en }), (missing = true)
  const fg = s.floor_guide.filter((e) => !e.ja)
  if (fg.length > 0) (item.floor_guide = fg.map((e) => ({ floor: e.floor, ko: e.ko, en: e.en }))), (missing = true)
  if (s.hours?.regular_holiday && !s.hours.regular_holiday.ja)
    (item.regular_holiday = { ko: s.hours.regular_holiday.ko, en: s.hours.regular_holiday.en }), (missing = true)
  if (s.hours?.note && !s.hours.note.ja) (item.hours_note = { ko: s.hours.note.ko, en: s.hours.note.en }), (missing = true)
  if (s.status?.note && !s.status.note.ja) (item.status_note = { ko: s.status.note.ko, en: s.status.note.en }), (missing = true)
  return missing ? item : null
}

function buildingItem(b) {
  const item = { id: b.id, name_ja: b.name.ja, name_en: b.name.en, floors: b.floors }
  let missing = false
  if (b.hours_note && !b.hours_note.ja) (item.hours_note = { ko: b.hours_note.ko, en: b.hours_note.en }), (missing = true)
  if (b.exit_hint && !b.exit_hint.ja) (item.exit_hint = { ko: b.exit_hint.ko, en: b.exit_hint.en }), (missing = true)
  const uf = b.uncurated_floors.filter((e) => !e.ja)
  if (uf.length > 0) (item.uncurated_floors = uf.map((e) => ({ floor: e.floor, ko: e.ko, en: e.en }))), (missing = true)
  return missing ? item : null
}

const items = (kind === 'stores' ? stores.map(storeItem) : buildings.map(buildingItem)).filter(Boolean)
// Skip records that already have a result file waiting to be applied.
const pending = items.filter((it) => !existsSync(join(resultsDir, `${it.id}.json`)))

const nameList = [
  '## Building names (id — Japanese — English)',
  ...buildings.map((b) => `${b.id} — ${b.name.ja} — ${b.name.en}`),
  '',
  '## Store names (id — Japanese — English) — use these exact Japanese names when a text refers to another shop',
  ...stores.map((s) => `${s.id} — ${s.name.ja} — ${s.name.en}`),
].join('\n')

const RULES = `# otakuroad — Japanese text for the /ja pages

otakuroad is a map of Akihabara subculture shops (Korean and English UI; Japanese is being added). Every record below has Korean and English descriptions written from primary sources. Your job is to write the **Japanese** version of the fields listed for each record, for a Japanese reader using the map in Akihabara.

## Rules
- Translate the **meaning of the English text faithfully**; read the Korean for nuance when the English is ambiguous. Do not add facts, do not drop facts, do not soften or embellish. Times, floors (3F, B1F), prices, counts and proper nouns stay exactly as given.
- Use the shop's **own Japanese name** (given as name_ja) and the exact Japanese names from the name list below when a text mentions another shop or building. Never transliterate a name that is in the list. For a shop not in the list, use its commonly printed Japanese name if you know it for certain, otherwise keep the English name.
- Fixed terms: Electric Town Exit → 電気街口, Central Gate / Central Exit → 中央改札口, Showa-dori Exit → 昭和通り口, Suehirocho Station → 末広町駅, Chuo-dori → 中央通り, Showa-dori → 昭和通り, back streets → 裏通り, Radio Kaikan → ラジオ会館, Tsukuba Express → つくばエクスプレス, Hibiya line → 日比谷線, tax-free → 免税, buyback / sells to the shop → 買取, trading cards → トレカ, doujinshi → 同人誌, gacha → ガチャ, capsule toys → カプセルトイ, pre-owned / used → 中古, new → 新品, floor guide → フロアガイド, regular closing day → 定休日, public holidays → 祝日, weekdays → 平日, weekends → 土日.
- Style: \`one_line\` is a compact noun phrase or short plain sentence without です (like a map-app blurb, ≤ 60 characters, no trailing 。). Everything else (\`how_to_find\`, \`tips\`, notes, floor guide lines) is natural **です・ます調** prose, one to two sentences each, the way a Japanese guide or store page would put it. Full-width 、。 punctuation, ASCII digits and times (11:00), 「」 only for titles.
- Write Japanese, not translated English: no 「あなた」, no literal calques; reorder freely. Katakana loanwords as they are printed in Japan (フィギュア, プラモデル, ゲーセン is fine in tips, ゲームセンター in one_line).
- \`tips\` must have exactly as many entries as the English list, in the same order.
- \`floor_guide\` / \`uncurated_floors\`: one Japanese line per floor, keyed by the floor label given.
- Output plain strings; never leave a field empty, never copy the English through.

## Output — one file per record at \`RESULTS_DIR/<id>.json\`, containing only the fields that were requested for that record
\`\`\`json
{
  "id": "<id>",
  "one_line": "…",
  "how_to_find": "…",
  "tips": ["…", "…"],
  "floor_guide": { "3F": "…", "4F": "…" },
  "regular_holiday": "…",
  "hours_note": "…",
  "status_note": "…",
  "exit_hint": "…",
  "uncurated_floors": { "2F": "…" }
}
\`\`\`
When you finish, reply with one line per record: \`<id>: done\` (or \`<id>: skipped — <reason>\`). Nothing else.

${nameList}
`

let n = 0
for (let i = 0; i < pending.length; i += size) {
  n++
  const batch = pending.slice(i, i + size)
  const parts = [
    RULES.replace(/RESULTS_DIR/g, resultsDir),
    `\n---\n\n# Batch ${String(n).padStart(2, '0')} — ${batch.length} ${kind}\n\nWrite results to \`${resultsDir}/<id>.json\`.\n`,
  ]
  for (const it of batch) parts.push(`\n## ${it.id}\n\`\`\`json\n${JSON.stringify(it, null, 1)}\n\`\`\`\n`)
  writeFileSync(join(outDir, `batch-${String(n).padStart(2, '0')}.md`), parts.join('\n'))
}
console.log(`${items.length} ${kind} need Japanese, ${pending.length} without a result yet → ${n} batches in ${outDir}`)
