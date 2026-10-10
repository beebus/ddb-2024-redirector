# DDB 2024 Redirector

A Chrome extension (Manifest V3) that sends you from D&D Beyond's 2014 (legacy) content pages to their 2024 equivalents.

D&D Beyond identifies content by a numeric ID in the URL. The slug stays the same between editions, but the ID changes:

```
2014: https://www.dndbeyond.com/monsters/17137-cambion
2024: https://www.dndbeyond.com/monsters/5194937-cambion
```

The extension keeps a table of 2014 → 2024 ID mappings and uses it in two ways.

## Features

- **Redirects legacy pages.** If you land on a 2014 page that has a known 2024 equivalent, the tab is redirected to the 2024 page. This covers clicked links, typed URLs and pasted URLs.
- **Rewrites links in place.** Links to 2014 content on dndbeyond.com are rewritten to point at the 2024 version, including links injected later by the page (tooltips, client-side rendering). Rewritten links get a `[DDB Redirector] → 2024 version` tooltip.
- **Per-type toggles.** Turn redirecting on or off for Spells, Monsters, Classes, Magic Items, Feats, Equipment, Species and Backgrounds, or pause the whole extension, from the toolbar popup.
- **Custom mappings.** Add your own 2014 → 2024 ID pairs on the options page. A custom entry with the same 2014 ID overrides a built-in one.

## Mapping coverage

The built-in table in [`src/shared/mappings.ts`](src/shared/mappings.ts) is generated from D&D Beyond's public listing pages by [`scripts/build-mappings.mjs`](scripts/build-mappings.mjs). It currently covers spells, monsters, magic items, feats, equipment, species and backgrounds. Classes have no built-in entries yet.

Coverage is partial on purpose. The script only pairs a 2014 entry with a 2024 entry when they share the same URL slug and the 2024 entry comes from a 2024 core book. Renamed, merged or removed content (for example the 2014 Goblin became the 2024 Goblin Warrior) isn't paired. A link or page with no mapping is left alone.

Species are the one type where several 2014 pages can share a 2024 page: Aasimar from Volo's Guide and from Monsters of the Multiverse both redirect to the 2024 Player's Handbook Aasimar. Species that have no 2024 version (Genasi, Half-Elf, Yuan-ti Pureblood and so on) are left alone.

To refresh the table:

```bash
npm run build:mappings                         # crawl everything (a few minutes), rewrite mappings.ts
node scripts/build-mappings.mjs --types spells # crawl only some types (spells, monsters, magic-items, feats, equipment, species, backgrounds)
node scripts/build-mappings.mjs --types equipment,feats # comma-separate to pick several; the rest of mappings.ts is kept
node scripts/build-mappings.mjs --use-cache    # rebuild from the last crawl, no requests
node scripts/build-mappings.mjs --dry-run      # print the summary, don't write mappings.ts
```

The script makes one request at a time with a short delay, and writes a report of unmatched and needs-review items to `scripts/.cache/report.json`. Don't edit `mappings.ts` by hand, since a re-run overwrites it.

To add a pair the script can't find, use the options page (**Manage mappings →** in the popup). To find a pair, open the same item in both editions on D&D Beyond and copy the numeric ID from each URL.

## Development

Requires Node.js and npm.

```bash
npm install
npm run build   # type-check with vue-tsc, then build to dist/ (use this to test the extension)
npm run dev     # optional: Vite dev server with hot reload; the extension only works while it's running
```

### Loading the extension in Chrome

1. Run `npm run build`. After code changes, rebuild and click the reload icon on the extension's card in `chrome://extensions`.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the `dist/` folder.

Load `dist/`, not the project root or `public/`. The manifest in `public/` points at TypeScript sources, and the build rewrites those paths.

### Linting before you push

GitHub runs the same checks on every push and on pull requests into `master` (see [`.github/workflows/ci.yml`](.github/workflows/ci.yml)). Run them locally first to catch failures early:

```bash
npm run lint    # ESLint over the whole project (TypeScript, Vue and the build script)
npm run build   # type-check with vue-tsc, then build; CI runs this too
```

`npm run lint` prints nothing when everything passes, and exits with an error if it finds any lint errors, which is what makes the CI check fail. The rules are in [`eslint.config.js`](eslint.config.js). To auto-fix what can be fixed safely, run `npx eslint . --fix`.

## Project layout

```
public/
  manifest.json        Extension manifest (MV3)
  icons/               Toolbar and store icons
src/
  background/          Service worker: redirects legacy pages after navigation
  content/             Content script: rewrites links on dndbeyond.com pages
  popup/               Toolbar popup (Vue): master toggle and per-type toggles
  options/             Options page (Vue): view and manage mappings
  shared/
    mappings.ts        Built-in 2014 → 2024 ID mappings
    types.ts           Shared types and default settings
    storage.ts         chrome.storage helpers
    utils.ts           URL parsing and redirect resolution
```

## Permissions

| Permission                    | Why                                                             |
|-------------------------------|-----------------------------------------------------------------|
| `https://www.dndbeyond.com/*` | Run the content script and watch navigations on D&D Beyond only |
| `webNavigation`               | Detect when a legacy page has finished loading                  |
| `tabs`                        | Update the tab's URL to the 2024 page                           |
| `storage`                     | Save your settings and custom mappings                          |

## Tech stack

Vue 3, TypeScript, Vite and [`@crxjs/vite-plugin`](https://crxjs.dev/).
