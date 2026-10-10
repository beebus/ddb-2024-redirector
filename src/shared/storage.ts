import type { ExtensionSettings, MappingTable } from './types'
import { DEFAULT_SETTINGS } from './types'

const SETTINGS_KEY = 'ddb_settings'
const USER_MAPPINGS_KEY = 'ddb_user_mappings'

export async function getSettings(): Promise<ExtensionSettings> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(SETTINGS_KEY, (result) => {
      resolve({ ...DEFAULT_SETTINGS, ...(result[SETTINGS_KEY] ?? {}) })
    })
  })
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [SETTINGS_KEY]: settings }, resolve)
  })
}

export async function getUserMappings(): Promise<Partial<MappingTable>> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(USER_MAPPINGS_KEY, (result) => {
      resolve(result[USER_MAPPINGS_KEY] ?? {})
    })
  })
}

export async function saveUserMappings(mappings: Partial<MappingTable>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [USER_MAPPINGS_KEY]: mappings }, resolve)
  })
}
