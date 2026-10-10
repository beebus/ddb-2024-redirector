import { parseDdbUrl, resolveRedirect, mergeMappings } from '../shared/utils'
import { getSettings, getUserMappings } from '../shared/storage'
import type { MappingTable, ExtensionSettings } from '../shared/types'

/**
 * Content script — runs on every dndbeyond.com page.
 *
 * Two jobs:
 *  1. Rewrite all existing 2014 <a> hrefs to their 2024 equivalents on load.
 *  2. Observe DOM mutations so dynamically injected links also get rewritten
 *     (DDB uses a lot of client-side rendering / tooltip injection).
 */

let settings: ExtensionSettings | null = null
let mappings: MappingTable | null = null

async function init() {
  settings = await getSettings()
  const userMappings = await getUserMappings()
  mappings = mergeMappings(userMappings)

  if (!settings.enabled) return

  rewriteLinks(document.body)
  observeMutations()
}

/**
 * Rewrite all <a> tags within `root` that point to 2014 content.
 * Adds a data attribute so we don't process the same link twice.
 */
function rewriteLinks(root: Element | Document) {
  if (!settings?.enabled || !mappings) return

  const anchors = (root instanceof Document ? root : root).querySelectorAll<HTMLAnchorElement>(
    'a[href*="dndbeyond.com/spells/"], ' +
    'a[href*="dndbeyond.com/monsters/"], ' +
    'a[href*="dndbeyond.com/classes/"], ' +
    'a[href*="dndbeyond.com/magic-items/"], ' +
    'a[href*="dndbeyond.com/feats/"], ' +
    'a[href*="dndbeyond.com/equipment/"], ' +
    'a[href*="dndbeyond.com/species/"], ' +
    // Also catch relative links
    'a[href^="/spells/"], ' +
    'a[href^="/monsters/"], ' +
    'a[href^="/classes/"], ' +
    'a[href^="/magic-items/"], ' +
    'a[href^="/feats/"], ' +
    'a[href^="/equipment/"], ' +
    'a[href^="/species/"]'
  )

  for (const anchor of anchors) {
    if (anchor.dataset.ddbRewritten) continue

    try {
      // Handle both absolute and relative hrefs
      const href = anchor.href // .href is always absolute in browsers
      const url = new URL(href)
      if (url.hostname !== 'www.dndbeyond.com') continue

      const parsed = parseDdbUrl(url.pathname)
      if (!parsed) continue

      const redirectUrl = resolveRedirect(parsed, mappings!, settings!.enabledTypes)
      if (redirectUrl) {
        anchor.href = redirectUrl
        anchor.dataset.ddbRewritten = '2024'
        anchor.title = `[DDB Redirector] → 2024 version`
      }
    } catch {
      // Malformed href — skip silently
    }
  }
}

/**
 * Watch for DOM changes (tooltips, dynamically loaded content) and
 * rewrite any new links that appear.
 */
function observeMutations() {
  const observer = new MutationObserver((mutations) => {
    if (!settings?.enabled) return
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) {
          rewriteLinks(node)
        }
      }
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })
}

// Re-initialize when settings change (e.g. user toggles the popup)
chrome.storage.onChanged.addListener(async () => {
  settings = await getSettings()
  const userMappings = await getUserMappings()
  mappings = mergeMappings(userMappings)

  if (settings.enabled) {
    rewriteLinks(document.body)
  }
})

init()
