#!/usr/bin/env node
/**
 * Builds src/shared/mappings.ts from D&D Beyond's public listing pages.
 *
 * Each listing (monsters, spells, magic items, feats) shows 2014 content with a
 * "Legacy" badge and 2024 content without one. The URL slug is the same in both
 * editions, so we pair a legacy row with a non-legacy row from a 2024 source book
 * that shares its slug. Slugs that don't pair up one-to-one are reported, not guessed.
 *
 * Usage:
 *   node scripts/build-mappings.mjs                    crawl all types, then write mappings.ts
 *   node scripts/build-mappings.mjs --types spells     only crawl/rebuild some types
 *   node scripts/build-mappings.mjs --use-cache        skip the crawl, rebuild from scripts/.cache
 *   node scripts/build-mappings.mjs --dry-run          print the report, don't write mappings.ts
 *
 * Crawl politely: one request at a time with a delay between pages.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CACHE_DIR = path.join(ROOT, 'scripts', '.cache')
const REPORT_PATH = path.join(ROOT, 'scripts', '.cache', 'report.json')
const OUTPUT_PATH = path.join(ROOT, 'src', 'shared', 'mappings.ts')

const BASE = 'https://www.dndbeyond.com'
const DELAY_MS = 500
const USER_AGENT = 'ddb-2024-redirector mapping builder (personal use)'

// Content types this script can build. Classes use slugs rather than IDs, so they're not here.
const CRAWLABLE = ['monsters', 'spells', 'magic-items', 'feats']
const ALL_TYPES = ['spells', 'monsters', 'classes', 'magic-items', 'feats']

// A non-legacy row only counts as 2024 if it passes its type's rule below. Other non-legacy
// rows with the same slug (e.g. Monsters of the Multiverse) are 2014-era rules or unclear,
// and go in the report's "slugMatchedButNot2024" list for manual review.
//
// - sources: the listing shows a source book, so match on its name.
// - idRange: the spells and magic-items listings show no source, so we accept the ID block
//   where the 2024 Player's Handbook spells / 2024 Dungeon Master's Guide items were created.
//   This is a heuristic, checked against the crawl; revisit if new 2024 content lands elsewhere.
const RULES_2024 = {
  monsters: { sources: ['Monster Manual'] },
  feats: { sources: ["Player's Handbook"] },
  spells: { idRange: [2610000, 2629999] },
  'magic-items': { idRange: [9220000, 9239999] },
}

// The site mixes straight and curly apostrophes in book titles.
const normalize = (s) => s.replace(/[’‘]/g, "'")

function is2024(type, row) {
  const rule = RULES_2024[type]
  if (rule.sources) return rule.sources.map(normalize).includes(normalize(row.source))
  const id = Number(row.id)
  return id >= rule.idRange[0] && id <= rule.idRange[1]
}

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const option = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? null : args[i + 1]
}

const types = option('--types') ? option('--types').split(',') : CRAWLABLE
for (const t of types) {
  if (!CRAWLABLE.includes(t)) throw new Error(`Unsupported type "${t}". Choose from: ${CRAWLABLE.join(', ')}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchPage(url) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } })
    if (res.ok) return res.text()
    if (res.status === 429 || res.status >= 500) {
      await sleep(5000 * attempt)
      continue
    }
    throw new Error(`${url} -> HTTP ${res.status}`)
  }
  throw new Error(`${url} -> gave up after retries`)
}

const decode = (s) =>
  s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Pull every row out of one listing page.
 * Rows are either <div class="info" ... data-slug> or <div class="list-row ..." data-slug>.
 */
function parseRows(html, type) {
  const rowStart = /<div class="(?:info|list-row)\b[^"]*"[^>]*?data-type="([^"]+)"[^>]*?data-slug="([^"]+)"/g
  const starts = [...html.matchAll(rowStart)].filter((m) => m[1] === type)
  const rows = []
  starts.forEach((m, i) => {
    const end = Math.min(starts[i + 1]?.index ?? html.length, m.index + 8000)
    const chunk = html.slice(m.index, end)
    const idMatch = /^(\d+)-(.+)$/.exec(m[2])
    if (!idMatch) return
    const link = new RegExp(`<a[^>]*href="/${type}/${m[2]}"[^>]*>([\\s\\S]*?)</a>`).exec(chunk)
    const source =
      /<span class="source">([\s\S]*?)<\/span>/.exec(chunk)?.[1] ??
      /list-row-name-secondary-text">([\s\S]*?)<\/div>/.exec(chunk)?.[1] ??
      ''
    rows.push({
      id: idMatch[1],
      slug: idMatch[2],
      name: decode(link?.[1] ?? idMatch[2]),
      legacy: chunk.includes('aria-label="legacy"'),
      source: decode(source),
    })
  })
  return rows
}

async function crawl(type) {
  const first = await fetchPage(`${BASE}/${type}?page=1`)
  const lastPage = Math.max(1, ...[...first.matchAll(/[?&]page=(\d+)/g)].map((m) => Number(m[1])))
  const bySlug = new Map()
  const add = (rows) => rows.forEach((r) => bySlug.set(`${r.id}-${r.slug}`, r))

  add(parseRows(first, type))
  for (let page = 2; page <= lastPage; page++) {
    await sleep(DELAY_MS)
    add(parseRows(await fetchPage(`${BASE}/${type}?page=${page}`), type))
    if (page % 10 === 0 || page === lastPage) console.log(`  ${type}: page ${page}/${lastPage}`)
  }
  return [...bySlug.values()]
}

function pair(type, rows) {
  const legacy = new Map()
  const current = new Map()
  const push = (map, row) => map.set(row.slug, [...(map.get(row.slug) ?? []), row])
  rows.forEach((r) => push(r.legacy ? legacy : current, r))

  const pairs = []
  const ambiguous = []
  const unmatched = []
  const review = []

  for (const [slug, legacyRows] of legacy) {
    const candidates = current.get(slug) ?? []
    const from2024 = candidates.filter((c) => is2024(type, c))
    for (const c of candidates) if (!is2024(type, c)) review.push(`${slug}: ${legacyRows.map((r) => r.id)} -> ${c.id} (${c.source || 'no source shown'})`)

    if (from2024.length === 0) unmatched.push({ slug, legacy: legacyRows.map((r) => `${r.id} (${r.source})`), other: candidates.map((c) => `${c.id} (${c.source})`) })
    else if (legacyRows.length === 1 && from2024.length === 1) pairs.push({ id2014: legacyRows[0].id, id2024: from2024[0].id, name: from2024[0].name })
    else ambiguous.push({ slug, legacy: legacyRows.map((r) => `${r.id} (${r.source})`), current: from2024.map((c) => `${c.id} (${c.source})`) })
  }

  const sourceTally = {}
  rows.filter((r) => !r.legacy).forEach((r) => (sourceTally[r.source] = (sourceTally[r.source] ?? 0) + 1))
  return { pairs, ambiguous, unmatched, review, sourceTally }
}

function loadExisting() {
  // Reuse pairs already in mappings.ts for types we're not rebuilding this run.
  const text = fs.readFileSync(OUTPUT_PATH, 'utf8')
  const out = {}
  for (const t of ALL_TYPES) {
    const key = t.includes('-') ? `'${t}'` : t
    const block = new RegExp(`\\n {2}${key}: \\[([\\s\\S]*?)\\n {2}],`).exec(text)?.[1] ?? ''
    out[t] = [...block.matchAll(/\{ id2014: '(\d+)', id2024: '(\d+)', name: ("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*') }/g)].map((m) => ({
      id2014: m[1],
      id2024: m[2],
      name: JSON.parse(m[3].startsWith('"') ? m[3] : `"${m[3].slice(1, -1).replace(/"/g, '\\"')}"`),
    }))
  }
  return out
}

const EMPTY_NOTES = {
  classes: '// Class pages use slugs, not numeric IDs — add as discovered',
}

function renderFile(mappings, stamp) {
  const section = (type) => {
    const key = type.includes('-') ? `'${type}'` : type
    const entries = mappings[type] ?? []
    if (entries.length === 0) return `  ${key}: [\n    ${EMPTY_NOTES[type] ?? '// None found'}\n  ],`
    const lines = entries.map((e) => `    { id2014: '${e.id2014}', id2024: '${e.id2024}', name: ${JSON.stringify(e.name)} },`)
    return `  ${key}: [\n${lines.join('\n')}\n  ],`
  }
  return `import type { MappingTable } from './types'

/**
 * Maps 2014 (legacy) numeric IDs to their 2024 equivalents on D&D Beyond.
 *
 * URL pattern:
 *   2014 → https://www.dndbeyond.com/monsters/17137-cambion
 *   2024 → https://www.dndbeyond.com/monsters/5194937-cambion
 *
 * The slug (e.g. "-cambion") remains the same across editions.
 *
 * GENERATED by scripts/build-mappings.mjs (last run ${stamp}). Re-run the script
 * to refresh instead of editing by hand. The options page lets you add entries
 * at runtime for anything the script can't pair (renamed or merged content).
 */
export const BUILTIN_MAPPINGS: MappingTable = {
${ALL_TYPES.map(section).join('\n\n')}
}
`
}

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true })
  const existing = loadExisting()
  const mappings = { ...existing }
  const report = {}

  for (const type of types) {
    const cachePath = path.join(CACHE_DIR, `${type}.json`)
    let rows
    if (flag('--use-cache') && fs.existsSync(cachePath)) {
      rows = JSON.parse(fs.readFileSync(cachePath, 'utf8'))
    } else {
      console.log(`Crawling ${type}...`)
      rows = await crawl(type)
      fs.writeFileSync(cachePath, JSON.stringify(rows))
    }

    const result = pair(type, rows)
    mappings[type] = result.pairs.sort((a, b) => a.name.localeCompare(b.name))
    report[type] = {
      total: rows.length,
      legacy: rows.filter((r) => r.legacy).length,
      paired: result.pairs.length,
      ambiguous: result.ambiguous,
      unmatched: result.unmatched,
      slugMatchedButNot2024: result.review,
      nonLegacySources: result.sourceTally,
    }
    console.log(
      `${type}: ${rows.length} rows, ${report[type].legacy} legacy -> ${result.pairs.length} paired, ` +
        `${result.ambiguous.length} ambiguous, ${result.unmatched.length} unmatched`
    )
  }

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2))
  console.log(`Report written to ${path.relative(ROOT, REPORT_PATH)}`)

  if (flag('--dry-run')) return console.log('Dry run: mappings.ts not changed.')
  fs.writeFileSync(OUTPUT_PATH, renderFile(mappings, new Date().toISOString().slice(0, 10)))
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_PATH)}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
