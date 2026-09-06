// Merge the translation agents' result files into data/stores or data/buildings as `ja` fields.
// Every result is checked before anything is written: a field must have been requested (the record
// lacked it), strings must be non-empty and actually Japanese, tips must keep the English count,
// floor keys must match. Held results are listed and left untouched for a re-run.
// usage: node scripts/i18n/apply-ja.mjs stores|buildings <results-dir> [--dry]
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const [kind, resultsDir, ...rest] = process.argv.slice(2)
const dry = rest.includes('--dry')
if (!['stores', 'buildings'].includes(kind) || !resultsDir) {
  console.error('usage: apply-ja.mjs stores|buildings <results-dir> [--dry]')
  process.exit(1)
}
const dir = join(ROOT, 'data', kind)

/** Rough "is this Japanese" test: at least a third of the letters are kana or kanji. */
function looksJapanese(text) {
  const letters = [...text].filter((ch) => /[\p{L}\p{N}]/u.test(ch))
  const jp = letters.filter((ch) => /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー]/u.test(ch))
  return letters.length > 0 && jp.length / letters.length >= 0.34
}
/** Insert `ja` after `en` so the file reads ko / en / ja like `name` does. */
function withJa(obj, ja) {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'ja') continue
    out[k] = v
    if (k === 'en') out.ja = ja
  }
  if (!('ja' in out)) out.ja = ja
  return out
}

const written = []
const held = []
const problems = (r, record) => {
  const list = []
  const str = (key, en) => {
    const v = r[key]
    if (v === undefined) return list.push(`${key}: missing`)
    if (typeof v !== 'string' || v.trim().length === 0) return list.push(`${key}: empty`)
    if (v.trim() === en.trim()) return list.push(`${key}: identical to English`)
    if (!looksJapanese(v)) return list.push(`${key}: does not look Japanese — "${v.slice(0, 40)}"`)
  }
  const floors = (key, entries) => {
    const v = r[key]
    if (v === undefined || typeof v !== 'object') return list.push(`${key}: missing`)
    for (const e of entries) {
      if (typeof v[e.floor] !== 'string' || v[e.floor].trim().length === 0) list.push(`${key}.${e.floor}: missing`)
      else if (!looksJapanese(v[e.floor])) list.push(`${key}.${e.floor}: does not look Japanese`)
    }
  }
  if (kind === 'stores') {
    if (!record.one_line.ja) str('one_line', record.one_line.en)
    if (record.how_to_find && !record.how_to_find.ja) str('how_to_find', record.how_to_find.en)
    if (record.tips && !record.tips.ja) {
      const v = r.tips
      if (!Array.isArray(v)) list.push('tips: missing')
      else if (v.length !== record.tips.en.length) list.push(`tips: ${v.length} entries, English has ${record.tips.en.length}`)
      else v.forEach((tip, i) => {
        if (typeof tip !== 'string' || tip.trim().length === 0) list.push(`tips[${i}]: empty`)
        else if (!looksJapanese(tip)) list.push(`tips[${i}]: does not look Japanese`)
      })
    }
    const fg = record.floor_guide.filter((e) => !e.ja)
    if (fg.length > 0) floors('floor_guide', fg)
    if (record.hours?.regular_holiday && !record.hours.regular_holiday.ja) str('regular_holiday', record.hours.regular_holiday.en)
    if (record.hours?.note && !record.hours.note.ja) str('hours_note', record.hours.note.en)
    if (record.status?.note && !record.status.note.ja) str('status_note', record.status.note.en)
  } else {
    if (record.hours_note && !record.hours_note.ja) str('hours_note', record.hours_note.en)
    if (record.exit_hint && !record.exit_hint.ja) str('exit_hint', record.exit_hint.en)
    const uf = record.uncurated_floors.filter((e) => !e.ja)
    if (uf.length > 0) floors('uncurated_floors', uf)
  }
  return list
}

for (const file of readdirSync(resultsDir).filter((f) => f.endsWith('.json')).sort()) {
  const id = file.replace(/\.json$/, '')
  const target = join(dir, `${id}.json`)
  if (!existsSync(target)) {
    held.push(`${id}: no such ${kind.slice(0, -1)} record`)
    continue
  }
  let r
  try {
    r = JSON.parse(readFileSync(join(resultsDir, file), 'utf8'))
  } catch (error) {
    held.push(`${id}: unreadable JSON — ${error.message}`)
    continue
  }
  const record = JSON.parse(readFileSync(target, 'utf8'))
  const issues = problems(r, record)
  if (issues.length > 0) {
    held.push(`${id}: ${issues.join('; ')}`)
    continue
  }
  const trim = (s) => s.trim()
  if (kind === 'stores') {
    if (!record.one_line.ja) record.one_line = withJa(record.one_line, trim(r.one_line))
    if (record.how_to_find && !record.how_to_find.ja) record.how_to_find = withJa(record.how_to_find, trim(r.how_to_find))
    if (record.tips && !record.tips.ja) record.tips = withJa(record.tips, r.tips.map(trim))
    record.floor_guide = record.floor_guide.map((e) => (e.ja ? e : withJa(e, trim(r.floor_guide[e.floor]))))
    if (record.hours?.regular_holiday && !record.hours.regular_holiday.ja)
      record.hours.regular_holiday = withJa(record.hours.regular_holiday, trim(r.regular_holiday))
    if (record.hours?.note && !record.hours.note.ja) record.hours.note = withJa(record.hours.note, trim(r.hours_note))
    if (record.status?.note && !record.status.note.ja) record.status.note = withJa(record.status.note, trim(r.status_note))
  } else {
    if (record.hours_note && !record.hours_note.ja) record.hours_note = withJa(record.hours_note, trim(r.hours_note))
    if (record.exit_hint && !record.exit_hint.ja) record.exit_hint = withJa(record.exit_hint, trim(r.exit_hint))
    record.uncurated_floors = record.uncurated_floors.map((e) => (e.ja ? e : withJa(e, trim(r.uncurated_floors[e.floor]))))
  }
  if (!dry) writeFileSync(target, JSON.stringify(record, null, 1) + '\n')
  written.push(id)
}

console.log(`written ${written.length}${dry ? ' (dry run)' : ''}`)
if (held.length > 0) {
  console.log(`\nheld (${held.length})`)
  for (const line of held) console.log(`  ${line}`)
}
