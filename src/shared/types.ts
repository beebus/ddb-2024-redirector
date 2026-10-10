// The content types we support redirecting
export type ContentType = 'spells' | 'monsters' | 'classes' | 'magic-items' | 'feats' | 'equipment' | 'species' | 'backgrounds'

// A single mapping entry: 2014 numeric ID → 2024 numeric ID
export interface MappingEntry {
  id2014: string
  id2024: string
  name: string // human-readable name, for display in options page
  slug2024?: string // 2024 URL slug, only when it differs from the 2014 slug (e.g. 'smoke-grenade')
}

// The full mapping table, keyed by content type
export type MappingTable = Record<ContentType, MappingEntry[]>

// Extension settings stored in chrome.storage.sync
export interface ExtensionSettings {
  enabled: boolean
  enabledTypes: Record<ContentType, boolean>
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  enabledTypes: {
    spells: true,
    monsters: true,
    classes: true,
    'magic-items': true,
    feats: true,
    equipment: true,
    species: true,
    backgrounds: true,
  },
}

export const ALL_CONTENT_TYPES: ContentType[] = [
  'spells',
  'monsters',
  'classes',
  'magic-items',
  'feats',
  'equipment',
  'species',
  'backgrounds',
]

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  spells: 'Spells',
  monsters: 'Monsters',
  classes: 'Classes',
  'magic-items': 'Magic Items',
  feats: 'Feats',
  equipment: 'Equipment',
  species: 'Species',
  backgrounds: 'Backgrounds',
}
