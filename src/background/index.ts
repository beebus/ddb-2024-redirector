import { parseDdbUrl, resolveRedirect, mergeMappings } from '../shared/utils'
import { getSettings, getUserMappings } from '../shared/storage'

/**
 * Background service worker.
 *
 * Listens for completed navigations on dndbeyond.com and, if the user
 * landed on a 2014 (legacy) content page that has a known 2024 equivalent,
 * redirects the tab to the 2024 URL.
 *
 * This handles the "hard redirect" case — e.g. clicking a link from an
 * old adventure module or typing/pasting a legacy URL.
 */
chrome.webNavigation.onCompleted.addListener(
  async (details) => {
    // Only handle main frame navigations (not iframes)
    if (details.frameId !== 0) return

    const settings = await getSettings()
    if (!settings.enabled) return

    const url = new URL(details.url)
    const parsed = parseDdbUrl(url.pathname)
    if (!parsed) return

    // resolveRedirect only matches IDs present in the mapping table, so
    // 2024 pages (and anything unmapped) fall through without a redirect.
    const userMappings = await getUserMappings()
    const mappings = mergeMappings(userMappings)
    const redirectUrl = resolveRedirect(parsed, mappings, settings.enabledTypes)

    if (redirectUrl && redirectUrl !== details.url) {
      chrome.tabs.update(details.tabId, { url: redirectUrl })
    }
  },
  { url: [{ hostEquals: 'www.dndbeyond.com' }] }
)

// Listen for messages from popup/options to invalidate any cached state
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'SETTINGS_UPDATED') {
    // No-op for now — we fetch fresh settings on every navigation
    // Could add caching here later for performance
  }
})
