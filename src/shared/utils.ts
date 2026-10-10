import type { ContentType, MappingEntry, MappingTable } from './types'
import { BUILTIN_MAPPINGS } from './mappings'
import { ALL_CONTENT_TYPES } from './types'

const DDB_BASE = 'https://www.dndbeyond.com'

// Regex: captures content type and numeric ID from a DDB URL
// e.g. /spells/1992-alter-self  →  ['spells', '1992', 'alter-self']
const DDB_URL_PATTERN = /^\/?(spells|monsters|classes|magic-items|feats)\/(\d+)-(.+)$/

export interface ParsedDdbUrl {
  contentType: ContentType
  numericId: string
  slug: string
}

/**
 * Parse a D&D Beyond pathname into its components.
 * Returns null if the URL doesn't match a supported content pattern.
 */
export function parseDdbUrl(pathname: string): ParsedDdbUrl | null {
  const match = DDB_URL_PATTERN.exec(pathname)
  if (!match) return null
  return {
    contentType: match[1] as ContentType,
    numericId: match[2],
    slug: match[3],
  }
}

/**
 * Merge built-in mappings with any user-added mappings from storage.
 * User entries take precedence (placed first so they shadow builtins).
 */
export function mergeMappings(
  userMappings: Partial<MappingTable>
): MappingTable {
  const result = {} as MappingTable
  for (const type of ALL_CONTENT_TYPES) {
    const userEntries: MappingEntry[] = userMappings[type] ?? []
    const builtinEntries: MappingEntry[] = BUILTIN_MAPPINGS[type] ?? []
    // Deduplicate: user entries win over builtin entries with same id2014
    const seen = new Set(userEntries.map((e) => e.id2014))
    result[type] = [
      ...userEntries,
      ...builtinEntries.filter((e) => !seen.has(e.id2014)),
    ]
  }
  return result
}

/**
 * Given a parsed URL and the active mapping table + enabled types,
 * return the full redirect URL string, or null if no redirect applies.
 */
export function resolveRedirect(
  parsed: ParsedDdbUrl,
  mappings: MappingTable,
  enabledTypes: Record<ContentType, boolean>
): string | null {
  if (!enabledTypes[parsed.contentType]) return null

  const entries = mappings[parsed.contentType] ?? []
  const entry = entries.find((e) => e.id2014 === parsed.numericId)
  if (!entry) return null

  // Reconstruct the URL with the 2024 ID but keep the same slug
  return `${DDB_BASE}/${parsed.contentType}/${entry.id2024}-${parsed.slug}`
}
