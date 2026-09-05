/**
 * Shared loader for data/**: reads every JSON file, parses it with the zod schemas and
 * reports per-file issues. Pure with respect to process state (no exit, no console).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { Building, ExcludedEntry, Glossary, Store } from '../../src/data/schema'

export type Excluded = z.infer<typeof ExcludedEntry>

export const ROOT = fileURLToPath(new URL('../../', import.meta.url))
export const DATA_DIR = join(ROOT, 'data')
export const GENERATED_DIR = join(ROOT, 'src', 'generated')

/** One line per inspected file. `issues` empty means the file is valid. */
export interface FileReport {
  file: string
  issues: string[]
}

export interface ParsedFile<T> {
  file: string
  value: T
}

export interface Dataset {
  stores: ParsedFile<Store>[]
  buildings: ParsedFile<Building>[]
  excluded: Excluded[]
  reports: FileReport[]
}

export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.length ? issue.path.join('.') : '(root)'}: ${issue.message}`)
}

export function rel(file: string): string {
  return relative(ROOT, file)
}

function listJsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => join(dir, name))
}

function readJson(file: string): { ok: true; data: unknown } | { ok: false; message: string } {
  try {
    return { ok: true, data: JSON.parse(readFileSync(file, 'utf8')) as unknown }
  } catch (error) {
    return { ok: false, message: `invalid JSON: ${(error as Error).message}` }
  }
}

/** Parse `dir/*.json` with `schema`. Records whose `id` differs from the filename are rejected (data/README.md). */
function parseDir<T extends { id: string }>(dir: string, schema: z.ZodType<T>, reports: FileReport[]): ParsedFile<T>[] {
  const out: ParsedFile<T>[] = []
  for (const file of listJsonFiles(dir)) {
    const read = readJson(file)
    if (!read.ok) {
      reports.push({ file: rel(file), issues: [read.message] })
      continue
    }
    const result = schema.safeParse(read.data)
    if (!result.success) {
      reports.push({ file: rel(file), issues: formatIssues(result.error) })
      continue
    }
    const stem = basename(file, '.json')
    const issues = result.data.id === stem ? [] : [`id "${result.data.id}" does not match filename "${stem}.json"`]
    reports.push({ file: rel(file), issues })
    if (issues.length === 0) out.push({ file: rel(file), value: result.data })
  }
  return out
}

/** excluded.json may be a bare array or `{ "entries": [...] }`. */
const ExcludedFile = z.union([z.array(ExcludedEntry), z.object({ entries: z.array(ExcludedEntry) })])

function parseOptionalFile<T>(file: string, schema: z.ZodType<T>, reports: FileReport[]): T | null {
  if (!existsSync(file)) return null
  const read = readJson(file)
  if (!read.ok) {
    reports.push({ file: rel(file), issues: [read.message] })
    return null
  }
  const result = schema.safeParse(read.data)
  reports.push({ file: rel(file), issues: result.success ? [] : formatIssues(result.error) })
  return result.success ? result.data : null
}

export function loadDataset(dataDir: string = DATA_DIR): Dataset {
  const reports: FileReport[] = []
  const stores = parseDir(join(dataDir, 'stores'), Store, reports)
  const buildings = parseDir(join(dataDir, 'buildings'), Building, reports)
  const excludedRaw = parseOptionalFile(join(dataDir, 'excluded.json'), ExcludedFile, reports)
  const excluded = excludedRaw === null ? [] : Array.isArray(excludedRaw) ? excludedRaw : excludedRaw.entries
  // glossary.json has a schema, so validate it when present; nothing downstream consumes it yet.
  parseOptionalFile(join(dataDir, 'glossary.json'), Glossary, reports)
  return { stores, buildings, excluded, reports }
}
