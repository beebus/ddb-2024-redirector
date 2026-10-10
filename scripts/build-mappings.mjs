#!/usr/bin/env node
/**
 * Builds src/shared/mappings.ts from D&D Beyond's public listing pages.
 *
 * Each listing (monsters, spells, magic items, feats, equipment, species, backgrounds) shows 2014 content with a
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
const CRAWLABLE = ['monsters', 'spells', 'magic-items', 'feats', 'equipment', 'species', 'backgrounds']
const ALL_TYPES = ['spells', 'monsters', 'classes', 'magic-items', 'feats', 'equipment', 'species', 'backgrounds']

// A non-legacy row only counts as 2024 if it passes its type's rule below. Other non-legacy
// rows with the same slug (e.g. Monsters of the Multiverse) are 2014-era rules or unclear,
// and go in the report's "slugMatchedButNot2024" list for manual review.
//
// - sources: the listing shows a source book, so match on its name.
//   Feats: the 2024 Player's Handbook, plus Eberron: Forge of the Artificer (which re-releases Aberrant Dragonmark).
//   Backgrounds: the 2024 Player's Handbook, plus Ravenloft: The Horrors Within (re-releases Haunted One and Investigator).
//   Species: the 2024 Player's Handbook, plus the two books that re-release 2014 species
//   (Ravenloft: The Horrors Within for Dhampir/Hexblood/Reborn; Eberron: Forge of the Artificer for Changeling/Kalashtar/Shifter/Warforged).
// - idRange: the spells, magic-items and equipment listings show no source, so we accept the ID block
//   where the 2024 Player's Handbook spells / 2024 Dungeon Master's Guide items were created.
//   Equipment: legacy IDs stop at 359, and non-legacy rows below that are items unchanged between editions.
//   This is a heuristic, checked against the crawl; revisit if new 2024 content lands elsewhere.
const RULES_2024 = {
  monsters: { sources: ['Monster Manual'] },
  feats: { sources: ["Player's Handbook", 'Eberron: Forge of the Artificer'] },
  spells: { idRange: [2610000, 2629999] },
  'magic-items': { idRange: [9220000, 9239999] },
  equipment: { idRange: [360, 999999] },
  species: { sources: ["Player's Handbook", 'Ravenloft: The Horrors Within', 'Eberron: Forge of the Artificer'] },
  backgrounds: { sources: ["Player's Handbook", 'Ravenloft: The Horrors Within'] },
}

// Types where several 2014 pages can share one 2024 page (e.g. Aasimar from Volo's and from
// Monsters of the Multiverse both go to the 2024 Aasimar). Elsewhere, a duplicate legacy slug is reported as ambiguous.
const MANY_TO_ONE = ['species']

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

// "&amp;" must be decoded last, or "&amp;lt;" would be decoded twice and come out as "<".
const decode = (s) =>
  s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Value of a string literal as written in mappings.ts. The generator always writes double-quoted
 * (JSON) strings, but single-quoted ones from older hand-edited versions are still accepted.
 */
function parseStringLiteral(literal) {
  if (literal.startsWith('"')) return JSON.parse(literal)
  return literal.slice(1, -1).replace(/\\(.)/g, '$1')
}

/**
 * Pull every row out of one listing page.
 * Rows are either <div class="info" ... data-slug> or <div class="list-row ..." data-slug>.
 */
function parseRows(html, type) {
  // The species listing is a single page of cards; each has the "id-slug" link, title, source and badge.
  if (type === 'species') {
    return html
      .split('<li class="j-collapsible__item listing-card')
      .slice(1)
      .flatMap((card) => {
        const idMatch = /<a href="\/species\/(\d+)-([^"#]+)"/.exec(card)
        if (!idMatch) return []
        return {
          id: idMatch[1],
          slug: idMatch[2],
          name: decode(/listing-card__title">([\s\S]*?)<\/h3>/.exec(card)?.[1] ?? idMatch[2]),
          legacy: card.includes('aria-label="legacy"'),
          source: decode(/listing-card__source">([\s\S]*?)<\/div>/.exec(card)?.[1] ?? ''),
        }
      })
  }
  // Equipment rows carry no data-type/data-slug; the "id-slug" lives in the row's CSS class instead.
  const rowStart =
    type === 'equipment'
      ? /<div class="list-row list-row-equipment list-row-equipment-(\d+-[^"\s]+)"/g
      : /<div class="(?:info|list-row)\b[^"]*"[^>]*?data-type="([^"]+)"[^>]*?data-slug="([^"]+)"/g
  const starts = [...html.matchAll(rowStart)]
    .map((m) => (type === 'equipment' ? Object.assign([m[0], type, m[1]], { index: m.index }) : m))
    .filter((m) => m[1] === type)
  const rows = []
  starts.forEach((m, i) => {
    const end = Math.min(starts[i + 1]?.index ?? html.length, m.index + 8000)
    const chunk = html.slice(m.index, end)
    const idMatch = /^(\d+)-(.+)$/.exec(m[2])
    if (!idMatch) return
    // Compare hrefs as plain strings instead of building a regex from scraped slug text.
    const rowHref = `/${type}/${m[2]}`
    const link = [...chunk.matchAll(/<a\b[^>]*?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].find((a) => a[1] === rowHref)
    const source =
      /<span class="source">([\s\S]*?)<\/span>/.exec(chunk)?.[1] ??
      /list-row-name-secondary-text">([\s\S]*?)<\/div>/.exec(chunk)?.[1] ??
      ''
    rows.push({
      id: idMatch[1],
      slug: idMatch[2],
      name: decode(link?.[2] ?? idMatch[2]),
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

// Equipment names often gain a qualifier in 2014 ("Acid (vial)", "Poison, Basic (vial)") that 2024 drops.
// For legacy rows with no slug match, fall back to the name minus any parenthetical suffix.
// Hand-verified pairs for legacy items the automatic rules can't resolve (renamed, or several 2024 candidates).
// Format: { legacyId: 2024Id }. Each target must appear in the crawl or the script stops.
const MANUAL_PAIRS = {
  backgrounds: {
    8: 406474, // Criminal / Spy -> Criminal
    15: 406476, // Guild Artisan / Guild Merchant -> Artisan (2024 splits it into Artisan and Merchant)
  },
  equipment: {
    65: 396, // Perfume (vial) -> Perfume (not 588, a Humblewood third-party item)
    68: 398, // Poison, Basic (vial) -> Basic Poison
    77: 415, // Rope, Hempen (50 feet) -> Rope
    87: 426, // Spikes, Iron (10) -> Iron Spikes
    139: 555, // Crawler Mucus (Contact) -> Carrion Crawler Mucus
    2: 516, // Blowgun Needles -> Needles
    3: 510, // Crossbow Bolts -> Bolts
    28: 476, // Bottle, Glass -> Glass Bottle
    32: 505, // Case, Crossbow Bolt -> Crossbow Bolt Case
    33: 518, // Case, Map or Scroll -> Map or Scroll Case
    39: 536, // Clothes, Costume -> Costume
    40: 539, // Clothes, Fine -> Fine Clothes
    41: 541, // Clothes, Traveler's -> Traveler's Clothes
    45: 519, // Flask or Tankard -> Flask
    53: 499, // Jug or Pitcher -> Jug
    56: 494, // Lantern, Bullseye -> Bullseye Lantern
    57: 493, // Lantern, Hooded -> Hooded Lantern
    62: 484, // Mirror, Steel -> Mirror
    70: 401, // Pot, Iron -> Iron Pot
    74: 408, // Ram, Portable -> Portable Ram
    76: 412, // Robes -> Robe
    89: 433, // Tent, Two-Person -> Tent
    121: 449, // Dice Set -> Dice
    122: 455, // Playing Card Set -> Playing Cards
    185: 462, // Saddle, Exotic -> Exotic Saddle
    186: 465, // Saddle, Military -> Military Saddle
    188: 466, // Saddle, Riding -> Riding Saddle
    189: 458, // Three-Dragon Ante Set -> Three-Dragon Ante
    190: 453, // Dragonchess Set -> Dragonchess
    201: 549, // Grenade, Fragmentation -> Fragmentation Grenade
    202: 550, // Grenade, Smoke -> Smoke Grenade
  },
}

// The 2024 URL slug can differ from the 2014 one ("grenade-smoke" -> "smoke-grenade"); record it only then.
const toPair = (old, target) => ({
  id2014: old.id,
  id2024: target.id,
  name: target.name,
  ...(target.slug !== old.slug && { slug2024: target.slug }),
})

const baseName =(s) => normalize(s).replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim().toLowerCase()

function pair(type, rows) {
  const legacy = new Map()
  const current = new Map()
  const push = (map, row) => map.set(row.slug, [...(map.get(row.slug) ?? []), row])
  rows.forEach((r) => push(r.legacy ? legacy : current, r))

  const pairs = []
  const ambiguous = []
  const unmatched = []
  const review = []
  const fuzzy = []

  const manual = MANUAL_PAIRS[type] ?? {}
  const byId = new Map(rows.map((r) => [r.id, r]))

  for (const [slug, legacyRows] of legacy) {
    if (legacyRows.length === 1 && manual[legacyRows[0].id]) {
      const target = byId.get(String(manual[legacyRows[0].id]))
      if (!target || target.legacy) throw new Error(`Manual pair ${legacyRows[0].id} -> ${manual[legacyRows[0].id]} not found in the ${type} crawl`)
      pairs.push(toPair(legacyRows[0], target))
      fuzzy.push(`${legacyRows[0].id} ${legacyRows[0].name} -> ${target.id} ${target.name} (manual)`)
      continue
    }
    const candidates = current.get(slug) ?? []
    let from2024 = candidates.filter((c) => is2024(type, c))
    // Equipment's "source" is its category; use it to break ties (e.g. Amber the gemstone vs Amber the trinket).
    if (type === 'equipment' && legacyRows.length === 1 && from2024.length > 1) {
      const sameCategory = from2024.filter((c) => c.source === legacyRows[0].source)
      if (sameCategory.length === 1) from2024 = sameCategory
    }
    for (const c of candidates) if (!is2024(type, c)) review.push(`${slug}: ${legacyRows.map((r) => r.id)} -> ${c.id} (${c.source || 'no source shown'})`)

    if (from2024.length === 0 && type === 'equipment' && legacyRows.length === 1) {
      const [old] = legacyRows
      const byName = rows.filter((c) => !c.legacy && is2024(type, c) && c.source === old.source && baseName(c.name) === baseName(old.name))
      if (baseName(old.name) !== normalize(old.name).toLowerCase() && byName.length === 1) {
        pairs.push(toPair(old, byName[0]))
        fuzzy.push(`${old.id} ${old.name} -> ${byName[0].id} ${byName[0].name}`)
        continue
      }
    }

    if (from2024.length === 0) unmatched.push({ slug, legacy: legacyRows.map((r) => `${r.id} (${r.source})`), other: candidates.map((c) => `${c.id} (${c.source})`) })
    else if (from2024.length === 1 && (legacyRows.length === 1 || MANY_TO_ONE.includes(type))) legacyRows.forEach((old) => pairs.push(toPair(old, from2024[0])))
    else ambiguous.push({ slug, legacy: legacyRows.map((r) => `${r.id} (${r.source})`), current: from2024.map((c) => `${c.id} (${c.source})`) })
  }

  const sourceTally = {}
  rows.filter((r) => !r.legacy).forEach((r) => (sourceTally[r.source] = (sourceTally[r.source] ?? 0) + 1))
  return { pairs, ambiguous, unmatched, review, fuzzy, sourceTally }
}

function loadExisting() {
  // Reuse pairs already in mappings.ts for types we're not rebuilding this run.
  const text = fs.readFileSync(OUTPUT_PATH, 'utf8')
  const out = {}
  for (const t of ALL_TYPES) {
    const key = t.includes('-') ? `'${t}'` : t
    const block = new RegExp(`\\n {2}${key}: \\[([\\s\\S]*?)\\n {2}],`).exec(text)?.[1] ?? ''
    out[t] = [...block.matchAll(/\{ id2014: '(\d+)', id2024: '(\d+)', name: ("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')(?:, slug2024: "([^"]*)")? }/g)].map((m) => ({
      id2014: m[1],
      id2024: m[2],
      name: parseStringLiteral(m[3]),
      ...(m[4] && { slug2024: m[4] }),
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
    const lines = entries.map((e) => `    { id2014: '${e.id2014}', id2024: '${e.id2024}', name: ${JSON.stringify(e.name)}${e.slug2024 ? `, slug2024: ${JSON.stringify(e.slug2024)}` : ''} },`)
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
 * The slug (e.g. "-cambion") usually stays the same across editions. When it doesn't
 * (2014 "grenade-smoke" → 2024 "smoke-grenade"), the entry carries a slug2024.
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
      pairedByNameOnly: result.fuzzy,
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
